require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3';

if (!ASAAS_API_KEY) {
  console.error('ERRO: ASAAS_API_KEY não configurada no .env');
  process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500').split(',');

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origem não permitida pelo CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: false
}));

app.use(express.json({ limit: '10kb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const asaas = axios.create({
  baseURL: ASAAS_BASE_URL,
  headers: {
    'access_token': ASAAS_API_KEY,
    'Content-Type': 'application/json',
    'User-Agent': 'TH-Mourao-Barbearia/1.0'
  },
  timeout: 15000
});

const PLANOS = {
  'corte': {
    valor: 89.00,
    descricao: 'Plano Corte Mensal — TH Mourão Barbearia & Spa'
  },
  'corte-barba': {
    valor: 139.00,
    descricao: 'Plano Corte + Barba — TH Mourão Barbearia & Spa'
  }
};

function validarCpf(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let r = 11 - (soma % 11); const d1 = r > 9 ? 0 : r;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  r = 11 - (soma % 11); const d2 = r > 9 ? 0 : r;
  return d1 === parseInt(cpf[9]) && d2 === parseInt(cpf[10]);
}

function validarPayload(body) {
  const erros = [];
  const { nome, cpf, email, plano, cartao } = body;

  if (!nome || nome.trim().split(/\s+/).length < 2) erros.push('Nome completo obrigatório.');
  if (!cpf || !validarCpf(cpf)) erros.push('CPF inválido.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push('E-mail inválido.');
  if (!plano || !PLANOS[plano]) erros.push('Plano inválido.');

  if (!cartao) {
    erros.push('Dados do cartão obrigatórios.');
  } else {
    if (!cartao.nomeTitular || cartao.nomeTitular.trim().length < 3) erros.push('Nome do titular inválido.');
    if (!cartao.numero || !/^\d{13,19}$/.test(cartao.numero.replace(/\s/g, ''))) erros.push('Número do cartão inválido.');
    if (!cartao.mesValidade || !/^\d{2}$/.test(cartao.mesValidade)) erros.push('Mês de validade inválido.');
    if (!cartao.anoValidade || !/^\d{4}$/.test(cartao.anoValidade)) erros.push('Ano de validade inválido.');
    if (!cartao.cvv || !/^\d{3,4}$/.test(cartao.cvv)) erros.push('CVV inválido.');
  }

  return erros;
}

function extrairMensagemAsaas(err) {
  const data = err?.response?.data;
  if (!data) return 'Erro ao processar pagamento. Tente novamente.';
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map(e => e.description || e.code).join(' ');
  }
  return data.description || data.message || 'Erro ao processar pagamento.';
}

/* GET /api/health */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.ASAAS_BASE_URL?.includes('sandbox') ? 'sandbox' : 'production' });
});

/* POST /api/subscribe */
app.post('/api/subscribe', limiter, async (req, res) => {
  const erros = validarPayload(req.body);
  if (erros.length > 0) {
    return res.status(400).json({ success: false, message: erros.join(' ') });
  }

  const { nome, cpf, email, whatsapp, plano, cartao } = req.body;
  const planoInfo = PLANOS[plano];

  let customerId;

  try {
    const customerResp = await asaas.post('/customers', {
      name: nome.trim(),
      cpfCnpj: cpf.replace(/\D/g, ''),
      email: email.trim().toLowerCase(),
      ...(whatsapp && whatsapp.replace(/\D/g,'').length >= 10 && {
        mobilePhone: whatsapp.replace(/\D/g, '')
      })
    });
    customerId = customerResp.data.id;
  } catch (err) {
    console.error('[Asaas] Erro ao criar cliente:', err?.response?.data || err.message);
    const msg = extrairMensagemAsaas(err);
    return res.status(422).json({ success: false, message: msg });
  }

  const hoje = new Date();
  const nextDueDate = hoje.toISOString().split('T')[0];

  try {
    const subscResp = await asaas.post('/subscriptions', {
      customer: customerId,
      billingType: 'CREDIT_CARD',
      cycle: 'MONTHLY',
      value: planoInfo.valor,
      nextDueDate,
      description: planoInfo.descricao,
      creditCard: {
        holderName: cartao.nomeTitular.trim(),
        number: cartao.numero.replace(/\s/g, ''),
        expiryMonth: cartao.mesValidade,
        expiryYear: cartao.anoValidade,
        ccv: cartao.cvv
      },
      creditCardHolderInfo: {
        name: nome.trim(),
        cpfCnpj: cpf.replace(/\D/g, ''),
        email: email.trim().toLowerCase(),
        ...(whatsapp && whatsapp.replace(/\D/g,'').length >= 10 && {
          phone: whatsapp.replace(/\D/g, '')
        })
      }
    });

    return res.status(201).json({
      success: true,
      subscriptionId: subscResp.data.id,
      message: 'Assinatura criada com sucesso.'
    });
  } catch (err) {
    console.error('[Asaas] Erro ao criar assinatura:', err?.response?.data || err.message);
    const msg = extrairMensagemAsaas(err);
    return res.status(422).json({ success: false, message: msg });
  }
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint não encontrado.' }));

app.use((err, req, res, next) => {
  console.error('[Server] Erro inesperado:', err.message);
  res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`TH Mourão API rodando na porta ${PORT}`);
  console.log(`Ambiente Asaas: ${ASAAS_BASE_URL}`);
});
