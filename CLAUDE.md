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
/assets/             ← imagens, logo, design-system.css
/api/
  server.js          ← Express API (porta 3001)
  package.json
/.env                ← credenciais reais (nunca commitar)
/.env.example        ← template
```

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
