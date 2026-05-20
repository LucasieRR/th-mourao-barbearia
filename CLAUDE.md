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

## URLs Limpas (Netlify)

O arquivo `_redirects` na raiz configura rewrites silenciosos via Netlify:

```
/minha-conta  →  /minha-conta.html  (200)
/booking      →  /booking.html      (200)
/store        →  /store.html        (200)
/blog         →  /blog.html         (200)
/admin        →  /admin.html        (200)
/blog-post    →  /blog-post.html    (200)
/assinaturas  →  /assinaturas.html  (200)
```

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
