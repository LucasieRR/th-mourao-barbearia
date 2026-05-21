const { createClient } = require('@supabase/supabase-js');

const WEBHOOK_TOKEN   = process.env.ASAAS_WEBHOOK_TOKEN;
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_SVCKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PLAN_NAMES = {
  'Plano Corte Mensal — TH Mourão Barbearia & Spa':    'Corte Mensal',
  'Plano Corte + Barba — TH Mourão Barbearia & Spa':   'Corte + Barba',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers['asaas-access-token'];
  if (!token || token !== WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond 200 immediately — Asaas retries on anything else
  res.status(200).json({ received: true });

  const { id: eventId, event, payment, subscription } = req.body || {};
  if (!eventId || !event) return;

  const sb = createClient(SUPABASE_URL, SUPABASE_SVCKEY);

  // Idempotency: unique constraint on event_id will reject duplicates
  const { error: dupErr } = await sb
    .from('webhook_events')
    .insert({ event_id: eventId });
  if (dupErr) return; // already processed

  const now = new Date().toISOString();

  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      if (payment?.subscription) {
        await sb.from('subscriptions')
          .update({ status: 'ACTIVE', updated_at: now })
          .eq('asaas_id', payment.subscription);
      }
      break;

    case 'PAYMENT_OVERDUE':
      if (payment?.subscription) {
        await sb.from('subscriptions')
          .update({ status: 'OVERDUE', updated_at: now })
          .eq('asaas_id', payment.subscription);
      }
      break;

    case 'PAYMENT_REFUNDED':
      if (payment?.subscription) {
        await sb.from('subscriptions')
          .update({ status: 'INACTIVE', updated_at: now })
          .eq('asaas_id', payment.subscription);
      }
      break;

    case 'SUBSCRIPTION_UPDATED':
      if (subscription?.id) {
        const updates = { updated_at: now };
        if (subscription.nextDueDate) updates.next_due_date = subscription.nextDueDate;
        if (subscription.value)       updates.value         = subscription.value;
        if (subscription.status)      updates.status        = subscription.status;
        await sb.from('subscriptions').update(updates).eq('asaas_id', subscription.id);
      }
      break;

    case 'SUBSCRIPTION_INACTIVATED':
    case 'SUBSCRIPTION_DELETED':
      if (subscription?.id) {
        await sb.from('subscriptions')
          .update({ status: 'INACTIVE', updated_at: now })
          .eq('asaas_id', subscription.id);
      }
      break;

    case 'SUBSCRIPTION_CREATED':
      // Fallback if /api/subscribe didn't persist the row
      if (subscription?.id && subscription?.customer) {
        const planName = PLAN_NAMES[subscription.description] || subscription.description || 'Assinatura';
        await sb.from('subscriptions').upsert({
          asaas_id:       subscription.id,
          asaas_customer: subscription.customer,
          plan_name:      planName,
          status:         subscription.status || 'ACTIVE',
          value:          subscription.value,
          cycle:          subscription.cycle || 'MONTHLY',
          next_due_date:  subscription.nextDueDate || null,
          updated_at:     now,
        }, { onConflict: 'asaas_id', ignoreDuplicates: true });
      }
      break;
  }
};
