'use strict';
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET  = process.env.CRON_SECRET;
const PROPERTY_ID  = process.env.GA4_PROPERTY_ID; // numérico (Admin → Detalhes da propriedade), não o G-XXXX

// Janela padrão: 14 dias — cobre a semana + reprocessa dias que o GA4 ainda revisava (~72h).
const DEFAULT_DAYS = 14;
const MAX_DAYS     = 730;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// OAuth via service account (JWT bearer) — sem dependência do googleapis
async function getGoogleToken() {
  const sa = JSON.parse(process.env.GA4_SERVICE_ACCOUNT_JSON || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('GA4_SERVICE_ACCOUNT_JSON inválido');

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim  = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key);
  const jwt = `${header}.${claim}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google OAuth: ${data.error_description || data.error}`);
  return data.access_token;
}

async function runReport(token, { startDate, endDate, dimensions, metrics }) {
  const rows = [];
  const limit = 100000;
  for (let offset = 0; ; offset += limit) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map(name => ({ name })),
        metrics: metrics.map(name => ({ name })),
        limit,
        offset,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`GA4 runReport: ${data.error?.message || res.status}`);

    for (const r of data.rows || []) {
      const row = {};
      dimensions.forEach((d, i) => { row[d] = r.dimensionValues[i].value; });
      metrics.forEach((m, i) => { row[m] = Number(r.metricValues[i].value); });
      rows.push(row);
    }
    if (offset + limit >= (data.rowCount || 0)) break;
  }
  return rows;
}

// GA4 devolve date como "20261028"
const isoDate = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

async function upsert(table, onConflict, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) throw new Error(`Supabase ${table}: ${await res.text()}`);
  }
  return rows.length;
}

const REPORTS = [
  {
    table: 'ga4_daily',
    onConflict: 'date',
    dimensions: ['date'],
    metrics: ['sessions', 'totalUsers', 'newUsers', 'activeUsers', 'screenPageViews',
              'engagedSessions', 'averageSessionDuration', 'bounceRate', 'eventCount'],
    map: r => ({
      date: isoDate(r.date),
      sessions: r.sessions,
      total_users: r.totalUsers,
      new_users: r.newUsers,
      active_users: r.activeUsers,
      page_views: r.screenPageViews,
      engaged_sessions: r.engagedSessions,
      avg_session_duration: r.averageSessionDuration,
      bounce_rate: r.bounceRate,
      event_count: r.eventCount,
    }),
  },
  {
    table: 'ga4_daily_pages',
    onConflict: 'date,page_path',
    dimensions: ['date', 'pagePath'],
    metrics: ['screenPageViews', 'activeUsers'],
    map: r => ({ date: isoDate(r.date), page_path: r.pagePath, page_views: r.screenPageViews, active_users: r.activeUsers }),
  },
  {
    table: 'ga4_daily_traffic',
    onConflict: 'date,source,medium',
    dimensions: ['date', 'sessionSource', 'sessionMedium'],
    metrics: ['sessions', 'totalUsers', 'engagedSessions'],
    map: r => ({
      date: isoDate(r.date),
      source: r.sessionSource,
      medium: r.sessionMedium,
      sessions: r.sessions,
      total_users: r.totalUsers,
      engaged_sessions: r.engagedSessions,
    }),
  },
  {
    table: 'ga4_daily_events',
    onConflict: 'date,event_name',
    dimensions: ['date', 'eventName'],
    metrics: ['eventCount', 'totalUsers'],
    map: r => ({ date: isoDate(r.date), event_name: r.eventName, event_count: r.eventCount, total_users: r.totalUsers }),
  },
];

module.exports = async function handler(req, res) {
  if (CRON_SECRET && req.headers['authorization'] !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!PROPERTY_ID) return res.status(500).json({ error: 'GA4_PROPERTY_ID não configurado' });

  // ?days=N para backfill manual (ex: ?days=400 na primeira execução)
  const days = Math.min(MAX_DAYS, Math.max(1, parseInt(req.query?.days, 10) || DEFAULT_DAYS));
  const startDate = `${days}daysAgo`;
  const endDate   = 'yesterday';
  const synced_at = new Date().toISOString();
  const results = { days, tables: {} };

  try {
    const token = await getGoogleToken();
    for (const rep of REPORTS) {
      const rows = await runReport(token, { startDate, endDate, dimensions: rep.dimensions, metrics: rep.metrics });
      results.tables[rep.table] = await upsert(rep.table, rep.onConflict, rows.map(r => ({ ...rep.map(r), synced_at })));
    }
    console.log('[sync-ga4] concluído:', JSON.stringify(results));
    res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[sync-ga4] fatal:', err.message);
    res.status(500).json({ error: err.message, ...results });
  }
};
