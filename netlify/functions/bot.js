// netlify/functions/bot.js
// Bot Telegram - Webhook Handler Principal
// Recebe todas as mensagens e callbacks do Telegram

const https = require('https');
const storage = require('./storage');

// ─── Helper: Chamada para API do Telegram ────────────────────────────────────
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
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { resolve({ ok: false, raw }); }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Envia mensagem simples ──────────────────────────────────────────────────
async function sendMessage(chatId, text, extra = {}) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}

// ─── Envia mensagem com botões inline ───────────────────────────────────────
async function sendInlineMenu(chatId, text, buttons) {
  return sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

// ─── Edita mensagem existente (callback) ────────────────────────────────────
async function editMessage(chatId, messageId, text, buttons = null) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'Markdown',
  };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };
  return telegramRequest('editMessageText', body);
}

// ─── Responde callback query (remove loading) ────────────────────────────────
async function answerCallback(callbackQueryId, text = '') {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  });
}

// ─── Registra / atualiza usuário no storage ──────────────────────────────────
function upsertUser(from) {
  const userId = String(from.id);
  const existing = storage.get('users', userId);
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
  };

  storage.set('users', userId, userData);
  return userData;
}

// ─── Verifica se usuário é VIP ativo ─────────────────────────────────────────
function isVipActive(user) {
  if (!user.vip_status) return false;
  if (!user.vip_expiration) return true; // VIP permanente
  return new Date(user.vip_expiration) > new Date();
}

// ─── Registra mensagem recebida ──────────────────────────────────────────────
function logMessage(userId, text, type = 'text') {
  storage.push('messages', {
    user_id: String(userId),
    message: text,
    type,
    timestamp: new Date().toISOString(),
    direction: 'inbound',
  });
}

// ─── Gera ID único para transação ────────────────────────────────────────────
function generateTransactionId() {
  return `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

// ─── Gera cobrança PIX (mock adaptável) ─────────────────────────────────────
async function generatePixCharge(userId, amount, planId, transactionId) {
  // NOTA: Substitua esta função pela integração real com seu gateway PIX
  // Exemplos compatíveis: MercadoPago, PagSeguro, Asaas, EfiBank, Pix-API etc.
  // Use as variáveis de ambiente PIX_API_KEY, PIX_API_URL, PIX_MERCHANT_KEY

  const PIX_API_KEY = process.env.PIX_API_KEY;
  const PIX_API_URL = process.env.PIX_API_URL;

  // Exemplo com EfiBank/Gerencianet (adapte conforme seu gateway)
  if (PIX_API_KEY && PIX_API_URL) {
    try {
      // Implementação real: chame sua API PIX aqui
      // const response = await callPixAPI(PIX_API_URL, PIX_API_KEY, { amount, userId, transactionId });
      // return { qrcode: response.qrcode, copiaecola: response.copiaecola };
    } catch (e) {
      console.error('[PIX] Erro na API real:', e.message);
    }
  }

  // ── Mock para desenvolvimento/teste ──────────────────────────────────────
  const amountFormatted = (amount / 100).toFixed(2).replace('.', ',');
  const mockPixKey = `00020126580014BR.GOV.BCB.PIX0136${transactionId}5204000053039865406${amount}5802BR5925BOT VIP CONTEUDO ADULTO6009SAO PAULO62070503***6304ABCD`;

  return {
    qrcode_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(mockPixKey)}`,
    copia_cola: mockPixKey,
    transaction_id: transactionId,
    amount,
    status: 'pending',
  };
}

// ─── MENU PRINCIPAL ──────────────────────────────────────────────────────────
async function handleStart(chatId, user) {
  const config = storage.getConfig();
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

// ─── MENU VIP ────────────────────────────────────────────────────────────────
async function handleVip(chatId, user) {
  const config = storage.getConfig();

  if (isVipActive(user)) {
    const buttons = [
      [{ text: '⭐ Acessar Conteúdo VIP', url: config.vip_content_link }],
      [{ text: '↩️ Menu Principal', callback_data: 'menu_main' }],
    ];
    return sendInlineMenu(chatId, config.already_vip, buttons);
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

// ─── COMPRAR PLANO ───────────────────────────────────────────────────────────
async function handleBuy(chatId, user, planId) {
  const config = storage.getConfig();
  const plan = config.plans.find((p) => p.id === planId);

  if (!plan) {
    return sendMessage(chatId, '❌ Plano não encontrado. Use /planos para ver as opções.');
  }

  if (isVipActive(user)) {
    return sendInlineMenu(chatId, config.already_vip, [
      [{ text: '⭐ Acessar VIP', url: config.vip_content_link }],
    ]);
  }

  const transactionId = generateTransactionId();

  // Registra pagamento pendente
  storage.push('payments', {
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

  // Gera cobrança PIX
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

// ─── MOSTRAR QR CODE ─────────────────────────────────────────────────────────
async function handleShowQR(chatId, transactionId) {
  const payments = storage.listArray('payments', (p) => p.id === transactionId);
  const payment = payments[0];

  if (!payment) {
    return sendMessage(chatId, '❌ Transação não encontrada.');
  }

  const pix = await generatePixCharge(
    payment.user_id,
    payment.amount,
    payment.plan_id,
    transactionId
  );

  // Envia foto do QR Code
  await telegramRequest('sendPhoto', {
    chat_id: chatId,
    photo: pix.qrcode_url,
    caption: `🔳 *QR Code PIX*\n\nEscaneie com seu app bancário\n\nTransação: \`${transactionId}\``,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Já Paguei', callback_data: `check_${transactionId}` }],
      ],
    },
  });
}

// ─── VERIFICAR PAGAMENTO ─────────────────────────────────────────────────────
async function handleCheckPayment(chatId, userId, transactionId) {
  const payments = storage.listArray('payments', (p) => p.id === transactionId);
  const payment = payments[0];

  if (!payment) {
    return sendMessage(chatId, '❌ Transação não encontrada.');
  }

  if (payment.status === 'paid') {
    return sendMessage(chatId, '✅ Seu pagamento já foi confirmado! Você tem acesso VIP.');
  }

  // Simula verificação (em produção, consulte a API PIX)
  const buttons = [
    [{ text: '🔄 Verificar Novamente', callback_data: `check_${transactionId}` }],
    [{ text: '🆘 Falar com Suporte', callback_data: 'menu_support' }],
  ];

  await sendInlineMenu(
    chatId,
    `⏳ *Aguardando Confirmação*\n\nNão identificamos seu pagamento ainda.\n\nSe já pagou, aguarde alguns minutos e tente novamente.\n\nTransação: \`${transactionId}\``,
    buttons
  );
}

// ─── SUPORTE ─────────────────────────────────────────────────────────────────
async function handleSupport(chatId) {
  const config = storage.getConfig();
  const buttons = [
    [{ text: '💬 Falar no Telegram', url: `https://t.me/${config.support_username.replace('@', '')}` }],
    [{ text: '↩️ Menu Principal', callback_data: 'menu_main' }],
  ];
  await sendInlineMenu(chatId, config.support_message, buttons);
}

// ─── PROCESSAR COMANDO DE TEXTO ──────────────────────────────────────────────
async function processCommand(message, user) {
  const chatId = message.chat.id;
  const text = message.text || '';

  // Log da mensagem
  logMessage(user.id, text, 'command');

  if (text.startsWith('/start')) return handleStart(chatId, user);
  if (text.startsWith('/vip') || text.startsWith('/planos')) return handleVip(chatId, user);
  if (text.startsWith('/comprar')) return handleVip(chatId, user);
  if (text.startsWith('/suporte')) return handleSupport(chatId);

  // Mensagem normal - registra e responde
  if (!text.startsWith('/')) {
    logMessage(user.id, text, 'message');
    const buttons = [
      [{ text: '👑 Ver Planos VIP', callback_data: 'menu_vip' }],
      [{ text: '🆘 Suporte', callback_data: 'menu_support' }],
    ];
    return sendInlineMenu(
      chatId,
      `💬 Recebi sua mensagem!\n\nPara atendimento personalizado, entre em contato com nosso suporte. 😊`,
      buttons
    );
  }
}

// ─── PROCESSAR CALLBACK (botões inline) ──────────────────────────────────────
async function processCallback(callbackQuery, user) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;

  await answerCallback(callbackQuery.id);
  logMessage(user.id, `[CALLBACK] ${data}`, 'callback');

  if (data === 'menu_main') return handleStart(chatId, user);
  if (data === 'menu_vip') return handleVip(chatId, user);
  if (data === 'menu_support') return handleSupport(chatId);
  if (data === 'menu_free') {
    const buttons = [[{ text: '👑 Quero VIP', callback_data: 'menu_vip' }], [{ text: '↩️ Voltar', callback_data: 'menu_main' }]];
    return sendInlineMenu(chatId, `🔥 *Conteúdo Gratuito*\n\nEsta é apenas uma amostra do que temos!\n\nPara acesso COMPLETO, assine o VIP. 😈`, buttons);
  }

  if (data.startsWith('buy_')) {
    const planId = data.replace('buy_', '');
    return handleBuy(chatId, user, planId);
  }

  if (data.startsWith('qr_')) {
    const txId = data.replace('qr_', '');
    return handleShowQR(chatId, txId);
  }

  if (data.startsWith('check_')) {
    const txId = data.replace('check_', '');
    return handleCheckPayment(chatId, user.id, txId);
  }
}

// ─── HANDLER PRINCIPAL NETLIFY ───────────────────────────────────────────────
exports.handler = async (event) => {
  // Apenas POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Validação básica do secret (opcional mas recomendado)
  const secret = event.headers['x-telegram-bot-api-secret-token'];
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    console.warn('[Bot] Secret token inválido');
    return { statusCode: 403, body: 'Forbidden' };
  }

  let update;
  try {
    update = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Bad Request' };
  }

  try {
    // Extrai dados do update
    const message = update.message;
    const callbackQuery = update.callback_query;
    const from = message?.from || callbackQuery?.from;

    if (!from) {
      return { statusCode: 200, body: 'OK' };
    }

    // Anti-spam simples (ignora bots)
    if (from.is_bot) {
      return { statusCode: 200, body: 'OK' };
    }

    // Upsert usuário
    const user = upsertUser(from);

    // Processa update
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
