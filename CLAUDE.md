# TH Mourão Barbearia & Spa — CLAUDE.md

## Supabase — Autorização e Acesso

- **Claude tem autorização explícita para fazer alterações no Supabase** (criar policies, editar tabelas, inserir dados, etc.)
- A service role key está em `.env` como `SUPABASE_SERVICE_ROLE_KEY` — usar para queries admin via REST
- Para executar SQL diretamente: usar `supabase db query --linked` (requer projeto linkado) ou REST API com service role
- A CLI `supabase link` requer token pessoal (`supabase login`) — se não estiver logado, usar a REST API ou o Dashboard
- **Método confiável para DDL/DML:** `psql` com connection string do Dashboard → Settings → Database (se disponível)

## Projeto

Landing page estática (HTML/CSS/JS puro) para barbearia. Sem framework, sem bundler.
Página de assinaturas em `/assinaturas.html` com backend em `/api/subscribe.js` (Vercel Serverless Function — Node.js). O `api/server.js` existe apenas para rodar localmente na porta 3001.

## Estrutura

```
/index.html          ← homepage
/assinaturas.html    ← planos de assinatura (noindex — acesso só por URL direta)
/blog.html
/blog-post.html
/store.html
/booking.html
/minha-conta.html
/admin.html
/_redirects          ← Netlify clean URLs (rewrite 200)
/assets/             ← imagens, logo, design-system.css
/api/
  subscribe.js       ← Vercel Serverless Function (produção — /api/subscribe)
  server.js          ← Express API (apenas local, porta 3001)
  package.json
/.env                ← credenciais reais (nunca commitar)
/.env.example        ← template
```

## URLs Limpas (Vercel)

O deploy é feito via **Vercel**. As rotas limpas estão configuradas em `vercel.json` como rewrites:

```
/minha-conta  →  /minha-conta.html
/booking      →  /booking.html
/store        →  /store.html
/blog         →  /blog.html
/admin        →  /admin.html
/blog-post    →  /blog-post.html
/assinaturas  →  /assinaturas.html
```

O arquivo `_redirects` na raiz é ignorado pelo Vercel (era para Netlify) — não remover para não quebrar histórico, mas a configuração ativa é o `vercel.json`.

**Premissa obrigatória:** Todos os links internos entre páginas devem usar o caminho limpo (sem `.html`):
- ✅ `href="/minha-conta"`, `href="/booking"`, `href="/store"`, `href="/blog"`
- ❌ `href="minha-conta.html"`, `href="booking.html"`

Exceção: `index.html` pode ser referenciado como `index.html` quando usado com âncoras (`index.html#secao`) ou como `href="/"` para a homepage.

## Scripts externos e carregamento

- CDNs usados por scripts inline (ex: Supabase, Stripe) devem ser carregados no `<head>` como scripts bloqueantes — nunca no fim do `<body>` junto com o script que os usa
- Scripts inline que dependem de bibliotecas CDN devem envolver o init em `DOMContentLoaded` + guard (`if (!window.lib) { ... }`)
- Nunca chamar `lib.createClient()` ou similar no topo do script — sempre dentro do `DOMContentLoaded`

## Rodar localmente

```bash
# Frontend: abrir assinaturas.html via Live Server (porta 5500) ou:
cd api && node server.js   # API na porta 3001
```

## Design System

- Verde: `#4A5A3A` | Creme: `#F5F0E8` | Escuro: `#1C1C1A`
- Fontes: Playfair Display (títulos), Bebas Neue (display), Inter (corpo)
- Bordas: sharp (2–4px radius)
- Animações: fade-up com IntersectionObserver
- **Regra:** elementos acima do fold (hero, primeira seção) NUNCA devem ter `class="fade-up"` — o IntersectionObserver pode não disparar e o elemento fica invisível. `fade-up` é só para seções abaixo do fold.

## Integração Asaas

### Fluxo
`POST /api/subscribe` → cria customer → cria subscription com cartão

### Campos obrigatórios no creditCardHolderInfo
`name`, `cpfCnpj`, `email`, `postalCode`, `addressNumber`, `phone`

> **Atenção:** `postalCode` e `addressNumber` são obrigatórios mesmo que não estejam documentados claramente. A ausência causa erro genérico sobre CPF.

### Erro enganoso: "Necessário preenchimento do CPF/CNPJ no cadastro"
Este erro **não** se refere ao cliente nem ao `creditCardHolderInfo`. Refere-se aos **dados comerciais da conta Asaas** (o titular da API key).

**Fix:** Sandbox → Minha Conta → Informações → Dados Comerciais → preencher 100%.

### Cartão de teste oficial Asaas
- Sucesso: `4444 4444 4444 4444` | CVV: qualquer 3 dígitos | Validade: qualquer futura
- Falha: `5184019740373151` ou `4916561358240741`

### Ambientes
- Sandbox: `https://sandbox.asaas.com/api/v3`
- Produção: `https://api.asaas.com/v3`

## Supabase Auth — Padrões e Armadilhas

### Comportamento esperado do `onAuthStateChange`
- Dispara **imediatamente** ao carregar a página se há sessão ativa no `localStorage` — isso é correto, não é bug
- Para testar como usuário novo: sempre usar aba anônima/privada
- Não confundir "página carrega logada" com bug — só é bug se o logout não funcionar

### Saudação com nome do usuário
- `user.user_metadata.full_name` só existe se o usuário cadastrou via OAuth (Google) ou se foi salvo via `updateUser`
- Usuários que se cadastraram com email/senha geralmente têm `user_metadata` vazio → fallback para `email.split('@')[0]` mostra o email
- **Padrão correto:** mostrar metadata como fallback inicial, depois atualizar com `clients.name` após `loadClientProfile()` terminar
  ```js
  const metaName = session.user.user_metadata?.full_name || '';
  document.getElementById('greeting-name').textContent = `Olá, ${metaName.split(' ')[0] || 'Você'}!`;
  await loadClientProfile(session.user); // carrega clients.name
  const realName = currentClient?.name || metaName;
  if (realName) document.getElementById('greeting-name').textContent = `Olá, ${realName.split(' ')[0]}!`;
  ```

### RLS silenciosa em `user_roles`
- Se a policy SELECT não permite que o usuário leia seu próprio registro, `maybeSingle()` retorna `data: null` sem erro — o `catch` nunca é atingido
- **Diagnóstico:** verificar no Supabase Dashboard → Table Editor → `user_roles` → se a linha existe, o problema é RLS
- **Fix de RLS:** `CREATE POLICY "user reads own role" ON user_roles FOR SELECT USING (auth.uid() = user_id);`
- Isolar a query de `user_roles` em `try/catch` separado do `Promise.all` principal — se falhar não quebra o restante

### Logout robusto (multi-browser, Safari)
- `signOut()` sozinho não garante limpeza no Safari — storage pode persistir
- Padrão completo:
  ```js
  await sb.auth.signOut({ scope: 'local' });
  ['localStorage', 'sessionStorage'].forEach(store => {
    try { Object.keys(window[store]).forEach(k => { if (k.startsWith('sb-')) window[store].removeItem(k); }); } catch(e) {}
  });
  localStorage.setItem('th_open_tabs', '0');
  setTimeout(() => { window.location.href = '/minha-conta'; }, 150);
  ```

### Sessão multi-aba com expiração ao fechar (Opção C)
Padrão implementado: sessão persiste entre abas abertas, expira quando **todas** as abas são fechadas.

> **ATENÇÃO crítica — dois anti-padrões a evitar:**
> 1. **NUNCA limpar `sb-*` no `beforeunload`** — `beforeunload` dispara tanto ao fechar a aba quanto ao navegar para outra página. Limpar ali destrói a sessão ao navegar entre páginas (ex: minha-conta → admin). Browsers modernos também podem não commitar operações de `localStorage` no `beforeunload` ao navegar para outra origem.
> 2. **NUNCA limpar `sb-*` incondicionalmente no init (count=0)** — ao chegar via navegação interna, o contador pode estar zerado mas a sessão é válida. Usar o flag `th_nav_ts` para distinguir.

**Padrão correto:** limpeza de `sb-*` acontece no **init**, não no `beforeunload`, protegida pelo flag `th_nav_ts`:

```js
// No init do script (minha-conta.html e admin.html):
(function initTabSession() {
  const TAB_KEY = 'th_open_tabs';
  const TAB_ID  = 'th_tab_' + Math.random().toString(36).slice(2);

  // Se não há abas abertas E não chegamos via navegação interna,
  // limpa sessão stale (todas as abas foram fechadas anteriormente)
  const count = parseInt(localStorage.getItem(TAB_KEY) || '0', 10);
  const navTs = parseInt(localStorage.getItem('th_nav_ts') || '0', 10);
  const isInternalNav = (Date.now() - navTs) < 2000;
  if (count === 0 && !isInternalNav) {
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
  }
  localStorage.removeItem('th_nav_ts'); // limpa o flag sempre

  sessionStorage.setItem(TAB_ID, '1');
  localStorage.setItem(TAB_KEY, count + 1);

  // beforeunload: apenas decrementa contador, NUNCA limpa sb-*
  window.addEventListener('beforeunload', () => {
    sessionStorage.removeItem(TAB_ID);
    const remaining = Math.max(0, parseInt(localStorage.getItem(TAB_KEY) || '1', 10) - 1);
    if (remaining === 0) { localStorage.removeItem(TAB_KEY); } else { localStorage.setItem(TAB_KEY, remaining); }
  });
})();
```

**Navegação interna** (ex: botão "Painel Admin"):
```js
adminBtn.onclick = () => { localStorage.setItem('th_nav_ts', Date.now()); window.location.href = '/admin'; };
```
O `th_nav_ts` é lido no `initTabSession` da página de destino. Se tiver menos de 2 segundos, a sessão é preservada mesmo com `count=0`.

### Logout robusto — limpeza seletiva (nunca `localStorage.clear()`)
```js
async function doLogout() {
  try { await sb.auth.signOut({ scope: 'local' }); } catch(e) {}
  try { Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-') || k === 'th_open_tabs') localStorage.removeItem(k); }); } catch(e) {}
  try { Object.keys(sessionStorage).forEach(k => { if (k.startsWith('sb-') || k.startsWith('th_tab_')) sessionStorage.removeItem(k); }); } catch(e) {}
  window.location.href = '/minha-conta';
}
```
> **Nunca usar `localStorage.clear()`** — apaga tudo incluindo estado da aplicação. Usar remoção seletiva de `sb-*` e `th_open_tabs`.

### Páginas protegidas (admin) — `onAuthStateChange`, nunca `getSession()`
O Supabase restaura o token do `localStorage` de forma **assíncrona** após carregar a página. Chamar `getSession()` imediatamente após `DOMContentLoaded` pode retornar `null` antes da restauração completar — causando redirect para login mesmo com sessão válida.

**Padrão correto para qualquer página protegida navegada via link:**
```js
let _booted = false;
sb.auth.onAuthStateChange(async (event, session) => {
  if (_booted) return;
  if (event === 'SIGNED_OUT') { window.location.href = '/minha-conta'; return; }
  if (!session) return; // aguarda INITIAL_SESSION
  _booted = true;
  const ok = await checkAuthAndAdmin(session); // recebe session como parâmetro
  if (!ok) return;
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('appRoot').style.display  = 'block';
  await loadData();
});
```
- O evento `INITIAL_SESSION` dispara quando o Supabase termina de restaurar o token do localStorage
- `_booted` previne dupla execução se outros eventos dispararem depois
- `checkAuthAndAdmin(session)` recebe a sessão como parâmetro — não chama `getSession()` internamente
- **Nunca usar** `getSession()` como entry point em páginas que são destino de navegação

---

## Deploy — Vercel vs Netlify

- **Este projeto usa Vercel** — `_redirects` (Netlify) é ignorado; rotas ficam em `vercel.json`
- Ao adicionar nova página: sempre adicionar rota em `vercel.json` antes de usar URL limpa
- `_redirects` mantido no repo por histórico mas inativo
- **Checklist para nova página:**
  1. Criar `pagina.html`
  2. Adicionar `{ "src": "/pagina", "dest": "/pagina.html" }` em `vercel.json`
  3. Usar `href="/pagina"` em todos os links internos (nunca `href="pagina.html"`)

---

## Lições aprendidas (implementação de pagamentos)

### O que custou tempo e como evitar da próxima vez

1. **Consultar a doc de pré-requisitos da conta ANTES de implementar**
   - O erro de CPF era account-level, não request-level. A doc de "Dúvidas Frequentes — Cobranças" esclarece isso em 2 linhas.
   - **Próxima vez:** antes de qualquer integração de pagamento com Asaas, verificar `GET /myAccount` ou checar o dashboard para confirmar que a conta está 100% aprovada para o método de pagamento desejado.

2. **Testar o endpoint mínimo primeiro (cobrança avulsa antes de assinatura)**
   - Começar com `POST /payments` (mais simples) antes de `POST /subscriptions`. Isola se o problema é no flow ou na conta.

3. **Logar o payload completo desde o início**
   - O debug log foi adicionado tarde. Tê-lo desde o primeiro deploy teria acelerado o diagnóstico.

4. **`creditCardHolderInfo` exige CEP e número**
   - Não estava na doc principal — só na referência de tokenização. Sempre incluir esses campos no formulário.

5. **Mensagens de erro do Asaas são frequentemente genéricas/enganosas**
   - Não tratar a mensagem como verdade literal. Ir na doc de dúvidas frequentes do endpoint específico.

6. **`creditCardHolderInfo` exige `phone` obrigatoriamente**
   - O Asaas retorna "Informe o número de contato com DDD do titular do cartão" se `phone` estiver ausente. O campo `whatsapp` do formulário deve sempre ser mapeado para `phone` no payload — não é opcional.

---

## Lições aprendidas (deploy Vercel — API serverless)

### O que custou tempo e como evitar da próxima vez

1. **`api/server.js` não é deployado pelo Vercel automaticamente**
   - O Vercel com `@vercel/static` serve apenas arquivos estáticos. O Express local nunca foi ao ar em produção — o frontend chamava `localhost:3001` que não existia no navegador do usuário.
   - **Solução:** converter para Vercel Serverless Function (`api/subscribe.js` com `module.exports = async function handler(req, res)`), adicionar build `@vercel/node` no `vercel.json` e rota `/api/subscribe` antes das rotas estáticas.

2. **Dependências da serverless function devem estar no `package.json` da raiz**
   - O `axios` estava só em `api/package.json`. O Vercel instala dependências a partir do `package.json` da raiz — adicionar lá também.

3. **Padrões de `source` em `headers` do `vercel.json` não aceitam grupos de captura `(.*)`**
   - Usar `:path*` para paths genéricos e `:file.(ext1|ext2)` para extensões. Grupos `(.*)` causam erro de build "invalid source pattern".

4. **`git push` não dispara deploy automático se o projeto não estiver conectado ao GitHub via Vercel Dashboard**
   - Verificar sempre se o último deploy no Vercel corresponde ao commit atual. Se não, rodar `npx vercel --prod` manualmente.

5. **Sempre testar o endpoint em produção via `curl` antes de fechar a tarefa**
   - Um `NOT_FOUND` indica rota não registrada ou deploy desatualizado. Um erro do Asaas (ex: celular inválido) confirma que a função está rodando.

---

## Assinaturas — Arquitetura e Padrões

### Tabelas Supabase

- `subscriptions` — assinaturas ativas. Colunas: `user_id`, `asaas_id` (UNIQUE), `asaas_customer`, `plan_name`, `status`, `value`, `cycle`, `next_due_date`
- `webhook_events` — idempotência do webhook. `event_id` como PRIMARY KEY — insert duplicado é rejeitado e o handler retorna silenciosamente.
- RLS: usuário lê apenas a própria assinatura (`auth.uid() = user_id`). Service role escreve sem restrição.

### Webhook Asaas (`/api/webhook-asaas.js`)

- Autenticação: header `asaas-access-token` comparado com `ASAAS_WEBHOOK_TOKEN` (env var)
- **Responder 200 imediatamente** antes de qualquer operação — Asaas faz retry em qualquer outro status
- Idempotência via `webhook_events`: tentativa de insert com `event_id` — se falhar (duplicate), retorna sem reprocessar
- Eventos tratados: `PAYMENT_CONFIRMED/RECEIVED` → ACTIVE, `PAYMENT_OVERDUE` → OVERDUE, `PAYMENT_REFUNDED` → INACTIVE, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED/DELETED` → INACTIVE, `SUBSCRIPTION_CREATED` (fallback upsert)

### `user_id` em assinaturas criadas via `/api/subscribe`

- A página `/assinaturas` não tem sessão Supabase — nunca passar `userId` pelo body do frontend
- **Solução:** resolver `user_id` server-side consultando `clients.user_id` por email após criação no Asaas
- Se o usuário ainda não tem conta (`user_id = null`), a linha é inserida sem `user_id` — linkagem ocorre no login via `loadClientProfile()`

### Aba "Minha Assinatura" em `minha-conta.html`

- `loadSubscription(userId)` chamada em `onLoggedIn()` sem `await` (não bloqueia o resto do portal)
- Query: `subscriptions` filtrado por `user_id` + `status IN ('ACTIVE','OVERDUE')`, ordem por `updated_at DESC`, `limit 1`
- Estado ativo: card com badge, plano, valor e próximo vencimento
- Estado vazio: CTA com cards dos dois planos + botão "Assinar agora →" para `/assinaturas`
- Badge OVERDUE recebe classe `.overdue` (cor laranja) via JS

### Variáveis de ambiente necessárias

| Variável | Uso |
|---|---|
| `ASAAS_WEBHOOK_TOKEN` | `webhook-asaas.js` — validação do header `asaas-access-token` |
| `SUPABASE_URL` | `subscribe.js` e `webhook-asaas.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Ambos os serverless — nunca usar anon key no backend |

### Teste local do webhook

Adicionar rota no `api/server.js`:
```js
const webhookHandler = require('./webhook-asaas');
app.post('/api/webhook-asaas', (req, res) => webhookHandler(req, res));
```
`@supabase/supabase-js` deve estar instalado em `api/` (`npm install` dentro de `api/`).

### Cartão de teste Asaas (sandbox)
- Sucesso: `4444 4444 4444 4444` | CVV: `123` | Validade: qualquer futura (ex: `02/2029`)

---

## Lições aprendidas (debug de auth/sessão — minha-conta + admin)

### O que custou tempo e como evitar da próxima vez

1. **"Preserve log" no DevTools é obrigatório para debug de navegação entre páginas**
   - O console é limpo a cada navegação por padrão. Sem "Preserve log" ativo, logs de `onAuthStateChange` e `initTabSession` desaparecem ao navegar minha-conta → admin.
   - **Como ativar:** Chrome: DevTools → Console → ⚙ → Preserve log. Safari: Web Inspector → Console → Preserve Log.
   - **Próxima vez:** pedir ao Lucas para ativar "Preserve log" **antes** de qualquer debug que envolva navegação entre páginas — isso teria economizado 3-4 ciclos de deploy/teste.

2. **`defer` no CDN do Supabase quebra `createClient` em scripts inline no `<body>`**
   - Scripts inline no `<body>` executam imediatamente ao serem parseados, antes dos scripts `defer` do `<head>` terminarem. O `supabase.createClient()` falha silenciosamente com `TypeError: Cannot read properties of undefined`.
   - **Regra:** CDN do Supabase (e qualquer biblioteca usada por scripts inline) deve ser carregado **sem** `defer` e **sem** `async`.

3. **Diagnosticar problemas de auth via Node.js direto é mais rápido que Puppeteer**
   - Puppeteer headless não carrega CDNs externos e tem limitações com `sessionStorage`/`localStorage` cross-origin.
   - **Padrão correto:** usar `@supabase/supabase-js` direto no Node (`npm install` em `/tmp/sb-test`) para testar login, queries RLS e `user_roles` em segundos — sem precisar de browser ou servidor local.
   - Isso teria confirmado em 30s que o banco estava correto e eliminado horas de debug de RLS.

4. **Quando `onAuthStateChange` não dispara log nenhum, o script quebrou antes — não é RLS**
   - Se os primeiros logs do `onAuthStateChange` não aparecem, o problema é carga do script (CDN falhou, `defer`, erro síncrono no topo). RLS só entra em jogo depois que o Supabase já inicializou.
   - **Ordem de diagnóstico:** (1) CDN carregou? (2) `createClient` sem erro? (3) `onAuthStateChange` disparou? (4) query retornou? — não pular etapas.

5. **`clients.name` não popula a saudação se a query retorna `null` e `user_metadata` é vazio**
   - Usuários cadastrados via email/senha têm `user_metadata = {email_verified: true}` — sem `full_name`. Se `clients` row existir, o nome vem de lá. Se não existir, usar `email.split('@')[0]` como fallback último.
   - **Padrão correto:** `currentClient?.name || metaName || session.user.email?.split('@')[0] || 'Você'`
