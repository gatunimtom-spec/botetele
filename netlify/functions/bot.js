// netlify/functions/bot.js
// Bot Telegram - Webhook Handler Principal

const https = require('https');
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
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          resolve({ ok: false, raw });
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

async function sendInlineMenu(chatId, text, buttons) {
  return sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
}

async function answerCallback(callbackQueryId, text = '') {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  });
}

async function upsertUser(from) {
  const userId = String(from.id);
  const existing = await storage.get('users', userId);
  const now = new Date().toISOString();

  const userData = {
    id: userId,
    username: from.username || '',
    first_name: from.first_name || '',
    last_name: from.last_name || '',
    first_seen: existing ? existing.first_seen : now,
    last_interaction: now,
    vip_status: existing ? existing.vip_status : false,
    vip_expiration: existing ? existing.vip_expiration : null,
    vip_granted_at: existing ? existing.vip_granted_at : null,
  };

  await storage.set('users', userId, userData);
  return userData;
}

function isVipActive(user) {
  if (!user?.vip_status) return false;
  if (!user.vip_expiration) return true;
  return new Date(user.vip_expiration) > new Date();
}

async function logMessage(userId, text, type = 'text') {
  await storage.push('messages', {
    id: `MSG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: String(userId),
    message: text,
    type,
    timestamp: new Date().toISOString(),
    direction: 'inbound',
  });
}

function generateTransactionId() {
  return `PAY_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function generatePixCharge(userId, amount, planId, transactionId) {
  const mockPixKey = `00020126580014BR.GOV.BCB.PIX0136${transactionId}5204000053039865406${amount}5802BR5925BOT VIP CONTEUDO6009SAO PAULO62070503***6304ABCD`;

  return {
    qrcode_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(mockPixKey)}`,
    copia_cola: mockPixKey,
    transaction_id: transactionId,
    amount,
    status: 'pending',
  };
}

async function handleStart(chatId, user) {
  const config = await storage.getConfig();
  const vipActive = isVipActive(user);

  const buttons = [
    [{ text: '👑 Planos VIP', callback_data: 'menu_vip' }],
    [{ text: '🔥 Conteúdo Grátis', callback_data: 'menu_free' }],
    [{ text: '🆘 Suporte', callback_data: 'menu_support' }],
  ];

  if (vipActive) {
    buttons.unshift([{ text: '⭐ Acessar Área VIP', url: config.vip_content_link }]);
  }

  await sendInlineMenu(chatId, config.welcome_message, buttons);
}

async function handleVip(chatId, user) {
  const config = await storage.getConfig();

  if (isVipActive(user)) {
    return sendInlineMenu(chatId, config.already_vip, [
      [{ text: '⭐ Acessar Conteúdo VIP', url: config.vip_content_link }],
      [{ text: '↩️ Menu Principal', callback_data: 'menu_main' }],
    ]);
  }

  const buttons = config.plans.map((plan) => [
    {
      text: `${plan.name} - R$ ${(plan.price / 100).toFixed(2).replace('.', ',')}`,
      callback_data: `buy_${plan.id}`,
    },
  ]);

  buttons.push([{ text: '↩️ Voltar', callback_data: 'menu_main' }]);

  await sendInlineMenu(chatId, config.vip_message, buttons);
}

async function handleBuy(chatId, user, planId) {
  const config = await storage.getConfig();
  const plan = config.plans.find((p) => p.id === planId);

  if (!plan) {
    return sendMessage(chatId, '❌ Plano não encontrado.');
  }

  if (isVipActive(user)) {
    return sendInlineMenu(chatId, config.already_vip, [
      [{ text: '⭐ Acessar VIP', url: config.vip_content_link }],
    ]);
  }

  const transactionId = generateTransactionId();

  await storage.push('payments', {
    id: transactionId,
    user_id: String(user.id),
    plan_id: planId,
    plan_name: plan.name,
    amount: plan.price,
    status: 'pending',
    created_at: new Date().toISOString(),
    paid_at: null,
    days: plan.days,
  });

  const pix = await generatePixCharge(user.id, plan.price, planId, transactionId);
  const amountFormatted = `R$ ${(plan.price / 100).toFixed(2).replace('.', ',')}`;

  const pixMessage =
    `💳 *Pagamento PIX - ${plan.name}*\n\n` +
    `💰 Valor: *${amountFormatted}*\n` +
    `🆔 Transação: \`${transactionId}\`\n\n` +
    `*Pix Copia e Cola:*\n` +
    `\`${pix.copia_cola.substring(0, 100)}...\`\n\n` +
    `⏰ QR Code válido por 30 minutos\n\n` +
    `Após o pagamento, você receberá acesso VIP automaticamente! 🔥`;

  const buttons = [
    [{ text: '📋 Ver QR Code', callback_data: `qr_${transactionId}` }],
    [{ text: '✅ Já Paguei', callback_data: `check_${transactionId}` }],
    [{ text: '↩️ Voltar aos Planos', callback_data: 'menu_vip' }],
  ];

  await sendInlineMenu(chatId, pixMessage, buttons);
}

async function handleShowQR(chatId, transactionId) {
  const payments = await storage.listArray('payments', (p) => p.id === transactionId);
  const payment = payments[0];

  if (!payment) {
    return sendMessage(chatId, '❌ Transação não encontrada.');
  }

  const pix = await generatePixCharge(payment.user_id, payment.amount, payment.plan_id, transactionId);

  await telegramRequest('sendPhoto', {
    chat_id: chatId,
    photo: pix.qrcode_url,
    caption: `🔳 *QR Code PIX*\n\nEscaneie com seu app bancário\n\nTransação: \`${transactionId}\``,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Já Paguei', callback_data: `check_${transactionId}` }]],
    },
  });
}

async function handleCheckPayment(chatId, userId, transactionId) {
  const payments = await storage.listArray('payments', (p) => p.id === transactionId);
  const payment = payments[0];

  if (!payment) {
    return sendMessage(chatId, '❌ Transação não encontrada.');
  }

  if (payment.status === 'paid') {
    return sendMessage(chatId, '✅ Seu pagamento já foi confirmado! Você tem acesso VIP.');
  }

  return sendInlineMenu(
    chatId,
    `⏳ *Aguardando Confirmação*\n\nAinda não identificamos seu pagamento.\n\nTransação: \`${transactionId}\``,
    [
      [{ text: '🔄 Verificar Novamente', callback_data: `check_${transactionId}` }],
      [{ text: '🆘 Falar com Suporte', callback_data: 'menu_support' }],
    ]
  );
}

async function handleSupport(chatId) {
  const config = await storage.getConfig();
  return sendInlineMenu(chatId, config.support_message, [
    [{ text: '💬 Falar no Telegram', url: `https://t.me/${config.support_username.replace('@', '')}` }],
    [{ text: '↩️ Menu Principal', callback_data: 'menu_main' }],
  ]);
}

async function processCommand(message, user) {
  const chatId = message.chat.id;
  const text = message.text || '';

  await logMessage(user.id, text, text.startsWith('/') ? 'command' : 'message');

  if (text.startsWith('/start')) return handleStart(chatId, user);
  if (text.startsWith('/vip') || text.startsWith('/planos') || text.startsWith('/comprar')) return handleVip(chatId, user);
  if (text.startsWith('/suporte')) return handleSupport(chatId);

  if (!text.startsWith('/')) {
    return sendInlineMenu(
      chatId,
      '💬 Recebi sua mensagem!\n\nPara atendimento personalizado, entre em contato com nosso suporte. 😊',
      [
        [{ text: '👑 Ver Planos VIP', callback_data: 'menu_vip' }],
        [{ text: '🆘 Suporte', callback_data: 'menu_support' }],
      ]
    );
  }

  return null;
}

async function processCallback(callbackQuery, user) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  await answerCallback(callbackQuery.id);
  await logMessage(user.id, `[CALLBACK] ${data}`, 'callback');

  if (data === 'menu_main') return handleStart(chatId, user);
  if (data === 'menu_vip') return handleVip(chatId, user);
  if (data === 'menu_support') return handleSupport(chatId);

  if (data === 'menu_free') {
    return sendInlineMenu(
      chatId,
      '🔥 *Conteúdo Gratuito*\n\nEsta é apenas uma amostra do que temos!\n\nPara acesso completo, assine o VIP. 😈',
      [
        [{ text: '👑 Quero VIP', callback_data: 'menu_vip' }],
        [{ text: '↩️ Voltar', callback_data: 'menu_main' }],
      ]
    );
  }

  if (data.startsWith('buy_')) return handleBuy(chatId, user, data.replace('buy_', ''));
  if (data.startsWith('qr_')) return handleShowQR(chatId, data.replace('qr_', ''));
  if (data.startsWith('check_')) return handleCheckPayment(chatId, user.id, data.replace('check_', ''));

  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret =
    event.headers['x-telegram-bot-api-secret-token'] ||
    event.headers['X-Telegram-Bot-Api-Secret-Token'];

  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: 'Bad Request' };
  }

  try {
    const message = update.message;
    const callbackQuery = update.callback_query;
    const from = message?.from || callbackQuery?.from;

    if (!from || from.is_bot) {
      return { statusCode: 200, body: 'OK' };
    }

    const user = await upsertUser(from);

    if (message) {
      await processCommand(message, user);
    } else if (callbackQuery) {
      await processCallback(callbackQuery, user);
    }
  } catch (e) {
    console.error('[Bot] Erro ao processar update:', e);
  }

  return { statusCode: 200, body: 'OK' };
};
