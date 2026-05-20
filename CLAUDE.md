# TH Mourão Barbearia & Spa — CLAUDE.md

## Projeto

Landing page estática (HTML/CSS/JS puro) para barbearia. Sem framework, sem bundler.
Página de assinaturas em `/assinaturas.html` com backend Node.js/Express em `/api/server.js`.

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
  server.js          ← Express API (porta 3001)
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
```js
// No init do script:
const TAB_ID = 'th_tab_' + Math.random().toString(36).slice(2);
sessionStorage.setItem(TAB_ID, '1');
const count = parseInt(localStorage.getItem('th_open_tabs') || '0', 10);
localStorage.setItem('th_open_tabs', count + 1);
// Se contador estava zerado, limpa sessão stale
if (count === 0) { Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); }); }

window.addEventListener('beforeunload', () => {
  sessionStorage.removeItem(TAB_ID);
  const remaining = Math.max(0, parseInt(localStorage.getItem('th_open_tabs') || '1', 10) - 1);
  localStorage.setItem('th_open_tabs', remaining);
  if (remaining === 0) {
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
    localStorage.removeItem('th_open_tabs');
  }
});
```

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
