// netlify/functions/webhook.js
// Webhook PIX - Recebe confirmações de pagamento dos gateways

const https = require('https');
const crypto = require('crypto');
const storage = require('./storage');

function telegramRequest(method, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return reject(new Error('TELEGRAM_BOT_TOKEN não definido'));

    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => {
        raw += c;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          resolve({ ok: false });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}

async function grantVipAccess(userId, days) {
  const now = new Date();
  const expiration = days
    ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await storage.set('users', String(userId), {
    vip_status: true,
    vip_expiration: expiration,
    vip_granted_at: now.toISOString(),
  });

  return expiration;
}

async function confirmPayment(transactionId, gatewayData = {}) {
  const payments = await storage.listArray('payments', (p) => p.id === transactionId);
  const payment = payments[0];

  if (!payment) {
    return { success: false, error: 'Transação não encontrada' };
  }

  if (payment.status === 'paid') {
    return { success: true, already_paid: true };
  }

  await storage.updateInArray('payments', transactionId, {
    status: 'paid',
    paid_at: new Date().toISOString(),
    gateway_data: gatewayData,
  });

  const expiration = await grantVipAccess(payment.user_id, payment.days || 30);
  const config = await storage.getConfig();

  try {
    const expirationText = expiration
      ? `Validade: ${new Date(expiration).toLocaleDateString('pt-BR')}`
      : 'Acesso permanente! 🎉';

    const message =
      config.payment_confirmed +
      `\n\n📦 *Plano:* ${payment.plan_name}\n` +
      `⏰ *${expirationText}*\n\n` +
      `[⭐ Acessar Área VIP](${config.vip_content_link})`;

    await sendMessage(payment.user_id, message, {
      reply_markup: {
        inline_keyboard: [[{ text: '⭐ Acessar Área VIP', url: config.vip_content_link }]],
      },
    });
  } catch (e) {
    console.error('[Webhook] Erro ao notificar usuário:', e.message);
  }

  return { success: true, user_id: payment.user_id, plan: payment.plan_id };
}

function parseEfiBank(body) {
  if (!body.pix) return null;
  const pix = body.pix[0];
  if (!pix) return null;
  return {
    transactionId: pix.txid,
    amount: Math.round(parseFloat(pix.valor) * 100),
    status: 'paid',
    gateway: 'efibank',
  };
}

function parseMercadoPago(body) {
  if (body.type !== 'payment') return null;
  if (body.action !== 'payment.updated') return null;
  return {
    transactionId: body.data?.id?.toString(),
    status: body.data?.status === 'approved' ? 'paid' : 'pending',
    gateway: 'mercadopago',
    raw_id: body.data?.id,
  };
}

function parseAsaas(body) {
  if (body.event !== 'PAYMENT_RECEIVED' && body.event !== 'PAYMENT_CONFIRMED') return null;
  return {
    transactionId: body.payment?.externalReference,
    amount: Math.round(body.payment?.value * 100),
    status: 'paid',
    gateway: 'asaas',
  };
}

function parsePagBank(body) {
  if (!body.charges) return null;
  const charge = body.charges[0];
  if (!charge || charge.status !== 'PAID') return null;
  return {
    transactionId: charge.reference_id,
    amount: charge.amount?.value,
    status: 'paid',
    gateway: 'pagbank',
  };
}

function parseMock(body) {
  if (!body.transaction_id && !body.txid) return null;
  return {
    transactionId: body.transaction_id || body.txid,
    status: body.status || 'paid',
    gateway: 'mock',
  };
}

function detectGateway(body) {
  return (
    parseEfiBank(body) ||
    parseMercadoPago(body) ||
    parseAsaas(body) ||
    parsePagBank(body) ||
    parseMock(body) ||
    null
  );
}

function validateSignature(body, headers) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = headers['x-signature'] || headers['x-webhook-signature'] || '';
  if (!signature) return true;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex');

  return signature === expected || signature === `sha256=${expected}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!validateSignature(event.body, event.headers || {})) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  const parsed = detectGateway(body);
  if (!parsed) {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, processed: false }),
    };
  }

  if (parsed.status !== 'paid') {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, processed: false, status: parsed.status }),
    };
  }

  const result = await confirmPayment(parsed.transactionId, { ...parsed, raw: body });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true, ...result }),
  };
};

module.exports = {
  confirmPayment,
  grantVipAccess,
};
