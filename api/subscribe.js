const axios = require('axios');

const ASAAS_API_KEY  = process.env.ASAAS_API_KEY;
const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_WALLET_ID = process.env.ASAAS_WALLET_ID;

const PLANOS = {
  'corte':       { valor: 89.00,  descricao: 'Plano Corte Mensal — TH Mourão Barbearia & Spa' },
  'corte-barba': { valor: 139.00, descricao: 'Plano Corte + Barba — TH Mourão Barbearia & Spa' }
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
  const { nome, cpf, email, plano, cep, numero, cartao } = body;

  if (!nome || nome.trim().split(/\s+/).length < 2) erros.push('Nome completo obrigatório.');
  if (!cpf || !validarCpf(cpf)) erros.push('CPF inválido.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push('E-mail inválido.');
  if (!plano || !PLANOS[plano]) erros.push('Plano inválido.');
  if (!cep || cep.replace(/\D/g, '').length !== 8) erros.push('CEP inválido.');
  if (!numero || !numero.trim()) erros.push('Número do endereço obrigatório.');

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

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.thmourao.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método não permitido.' });

  if (!ASAAS_API_KEY) {
    return res.status(500).json({ success: false, message: 'Configuração do servidor incompleta.' });
  }

  const erros = validarPayload(req.body);
  if (erros.length > 0) {
    return res.status(400).json({ success: false, message: erros.join(' ') });
  }

  const { nome, cpf, email, whatsapp, cep, numero, plano, cartao } = req.body;
  const planoInfo = PLANOS[plano];
  const cpfLimpo = cpf.replace(/\D/g, '');

  const asaas = axios.create({
    baseURL: ASAAS_BASE_URL,
    headers: {
      'access_token': ASAAS_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'TH-Mourao-Barbearia/1.0'
    },
    timeout: 15000
  });

  let customerId;

  try {
    const customerResp = await asaas.post('/customers', {
      name: nome.trim(),
      cpfCnpj: cpfLimpo,
      email: email.trim().toLowerCase(),
      ...(whatsapp && whatsapp.replace(/\D/g, '').length >= 10 && {
        mobilePhone: whatsapp.replace(/\D/g, '')
      })
    });
    customerId = customerResp.data.id;

    if (!customerResp.data.cpfCnpj) {
      await asaas.put(`/customers/${customerId}`, { cpfCnpj: cpfLimpo });
    }
  } catch (err) {
    const msg = extrairMensagemAsaas(err);
    return res.status(422).json({ success: false, message: msg });
  }

  const nextDueDate = new Date().toISOString().split('T')[0];

  const subscPayload = {
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
      cpfCnpj: cpfLimpo,
      email: email.trim().toLowerCase(),
      postalCode: cep.replace(/\D/g, ''),
      addressNumber: numero,
      ...(whatsapp && whatsapp.replace(/\D/g, '').length >= 10 && {
        phone: whatsapp.replace(/\D/g, '')
      })
    },
    ...(ASAAS_WALLET_ID && { walletId: ASAAS_WALLET_ID })
  };

  try {
    const subscResp = await asaas.post('/subscriptions', subscPayload);
    return res.status(201).json({
      success: true,
      subscriptionId: subscResp.data.id,
      message: 'Assinatura criada com sucesso.'
    });
  } catch (err) {
    const msg = extrairMensagemAsaas(err);
    return res.status(422).json({ success: false, message: msg });
  }
}
