// netlify/functions/admin-api.js
// API REST do Painel Administrativo
// Todas as rotas são protegidas por autenticação JWT simples

const https = require('https');
const crypto = require('crypto');
const storage = require('./storage');
const { confirmPayment, grantVipAccess } = require('./webhook');

// ─── JWT Simples ──────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.ADMIN_PASSWORD || 'changeme';

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    // Token expira em 24h
    if (Date.now() - payload.iat > 24 * 60 * 60 * 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(data),
  };
}

function requireAuth(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  return verifyToken(token);
}

// ─── Enviar mensagem Telegram ─────────────────────────────────────────────────
function sendTelegramMessage(chatId, text, extra = {}) {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return reject(new Error('TELEGRAM_BOT_TOKEN não definido'));
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── ROTAS ────────────────────────────────────────────────────────────────────

// POST /admin-api/login
async function handleLogin(body) {
  const { password } = body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    return json(401, { error: 'Senha incorreta' });
  }

  const token = signToken({ role: 'admin' });
  return json(200, { token, message: 'Login realizado com sucesso' });
}

// GET /admin-api/stats
async function handleStats() {
  const users = storage.list('users');
  const payments = storage.listArray('payments');
  const messages = storage.listArray('messages');

  const totalUsers = users.length;
  const paidPayments = payments.filter((p) => p.status === 'paid');
  const totalRevenue = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const vipUsers = users.filter((u) => u.vip_status).length;
  const conversion = totalUsers > 0 ? ((paidPayments.length / totalUsers) * 100).toFixed(1) : 0;

  // Últimas 24h
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const newUsers24h = users.filter((u) => u.first_seen > since24h).length;

  // Receita por mês (últimos 6 meses)
  const revenueByMonth = {};
  paidPayments.forEach((p) => {
    const month = p.paid_at ? p.paid_at.substring(0, 7) : p.created_at.substring(0, 7);
    revenueByMonth[month] = (revenueByMonth[month] || 0) + p.amount;
  });

  return json(200, {
    total_users: totalUsers,
    total_sales: paidPayments.length,
    total_revenue: totalRevenue,
    vip_users: vipUsers,
    conversion_rate: parseFloat(conversion),
    new_users_24h: newUsers24h,
    pending_payments: payments.filter((p) => p.status === 'pending').length,
    total_messages: messages.length,
    revenue_by_month: revenueByMonth,
  });
}

// GET /admin-api/users
async function handleGetUsers(query) {
  const users = storage.list('users');
  const { search, vip_only, page = 1, limit = 20 } = query;

  let filtered = users;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(
      (u) => u.username?.toLowerCase().includes(s) || u.id?.includes(s) || u.first_name?.toLowerCase().includes(s)
    );
  }
  if (vip_only === 'true') {
    filtered = filtered.filter((u) => u.vip_status);
  }

  // Ordenar por última interação
  filtered.sort((a, b) => (b.last_interaction || '').localeCompare(a.last_interaction || ''));

  const total = filtered.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const paginated = filtered.slice(offset, offset + parseInt(limit));

  return json(200, { users: paginated, total, page: parseInt(page), limit: parseInt(limit) });
}

// GET /admin-api/users/:id
async function handleGetUser(userId) {
  const user = storage.get('users', userId);
  if (!user) return json(404, { error: 'Usuário não encontrado' });

  const messages = storage.listArray('messages', (m) => m.user_id === userId);
  const payments = storage.listArray('payments', (p) => p.user_id === userId);

  return json(200, { ...user, messages, payments });
}

// GET /admin-api/messages
async function handleGetMessages(query) {
  const { user_id, page = 1, limit = 50 } = query;
  let messages = storage.listArray('messages');

  if (user_id) {
    messages = messages.filter((m) => m.user_id === user_id);
  }

  // Ordenar por data (mais recentes primeiro)
  messages.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  // Enriquecer com dados do usuário
  const enriched = messages.map((m) => {
    const user = storage.get('users', m.user_id);
    return { ...m, user: user ? { username: user.username, first_name: user.first_name } : null };
  });

  const total = enriched.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  return json(200, { messages: enriched.slice(offset, offset + parseInt(limit)), total });
}

// POST /admin-api/messages/reply
async function handleReply(body) {
  const { user_id, message } = body;
  if (!user_id || !message) return json(400, { error: 'user_id e message são obrigatórios' });

  try {
    await sendTelegramMessage(user_id, `💬 ${message}`);
    // Registra mensagem enviada
    storage.push('messages', {
      user_id: String(user_id),
      message,
      type: 'admin_reply',
      timestamp: new Date().toISOString(),
      direction: 'outbound',
    });
    return json(200, { success: true });
  } catch (e) {
    return json(500, { error: e.message });
  }
}

// GET /admin-api/payments
async function handleGetPayments(query) {
  const { status, page = 1, limit = 20 } = query;
  let payments = storage.listArray('payments');

  if (status) payments = payments.filter((p) => p.status === status);

  // Mais recentes primeiro
  payments.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // Enriquecer com usuário
  const enriched = payments.map((p) => {
    const user = storage.get('users', p.user_id);
    return { ...p, user: user ? { username: user.username, first_name: user.first_name } : null };
  });

  const total = enriched.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  return json(200, { payments: enriched.slice(offset, offset + parseInt(limit)), total });
}

// POST /admin-api/payments/:id/approve
async function handleApprovePayment(paymentId) {
  const result = await confirmPayment(paymentId, { manual: true, approved_by: 'admin' });
  if (!result.success) return json(400, result);
  return json(200, { success: true, message: 'Pagamento aprovado e VIP liberado' });
}

// POST /admin-api/payments/:id/cancel
async function handleCancelPayment(paymentId) {
  const updated = storage.updateInArray('payments', paymentId, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
  });
  if (!updated) return json(404, { error: 'Pagamento não encontrado' });
  return json(200, { success: true });
}

// GET /admin-api/vip
async function handleGetVip() {
  const users = storage.list('users').filter((u) => u.vip_status);
  users.sort((a, b) => (b.vip_granted_at || '').localeCompare(a.vip_granted_at || ''));
  return json(200, { vip_users: users, total: users.length });
}

// POST /admin-api/vip/grant
async function handleGrantVip(body) {
  const { user_id, days } = body;
  if (!user_id) return json(400, { error: 'user_id é obrigatório' });

  const user = storage.get('users', String(user_id));
  if (!user) return json(404, { error: 'Usuário não encontrado' });

  const expiration = grantVipAccess(user_id, days || 30);
  const config = storage.getConfig();

  try {
    await sendTelegramMessage(
      user_id,
      `👑 *Acesso VIP Liberado!*\n\nSeu acesso VIP foi ativado manualmente pelo admin.\n\n[⭐ Acessar Área VIP](${config.vip_content_link})`
    );
  } catch (e) {}

  return json(200, { success: true, expiration });
}

// POST /admin-api/vip/revoke
async function handleRevokeVip(body) {
  const { user_id } = body;
  if (!user_id) return json(400, { error: 'user_id é obrigatório' });

  storage.set('users', String(user_id), {
    vip_status: false,
    vip_expiration: null,
  });

  return json(200, { success: true });
}

// GET /admin-api/config
async function handleGetConfig() {
  return json(200, storage.getConfig());
}

// PUT /admin-api/config
async function handleSaveConfig(body) {
  storage.saveConfig(body);
  return json(200, { success: true, config: storage.getConfig() });
}

// POST /admin-api/broadcast
async function handleBroadcast(body) {
  const { message, target = 'all' } = body; // target: 'all' | 'vip'
  if (!message) return json(400, { error: 'message é obrigatório' });

  let users = storage.list('users');
  if (target === 'vip') {
    users = users.filter((u) => u.vip_status);
  }

  const results = { sent: 0, failed: 0, total: users.length };

  // Envia em lote com delay para evitar rate limit do Telegram
  for (const user of users) {
    try {
      await sendTelegramMessage(user.id, `📢 ${message}`);
      storage.push('messages', {
        user_id: user.id,
        message,
        type: 'broadcast',
        timestamp: new Date().toISOString(),
        direction: 'outbound',
      });
      results.sent++;
      // Delay para respeitar rate limit (30 msg/seg)
      await new Promise((r) => setTimeout(r, 50));
    } catch (e) {
      results.failed++;
    }
  }

  return json(200, { success: true, results });
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  const path = event.path.replace('/.netlify/functions/admin-api', '').replace('/api/admin-api', '');
  const method = event.httpMethod;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const query = event.queryStringParameters || {};

  // Extrai segments da rota
  const segments = path.split('/').filter(Boolean);

  // ── Login (sem autenticação) ──────────────────────────────────────────────
  if (segments[0] === 'login' && method === 'POST') {
    return handleLogin(body);
  }

  // ── Todas as demais rotas requerem autenticação ───────────────────────────
  const user = requireAuth(event);
  if (!user) return json(401, { error: 'Token inválido ou expirado' });

  // ── Roteamento ────────────────────────────────────────────────────────────
  const route = segments[0];
  const id = segments[1];
  const action = segments[2];

  switch (route) {
    case 'stats':
      return handleStats();

    case 'users':
      if (id) return handleGetUser(id);
      return handleGetUsers(query);

    case 'messages':
      if (id === 'reply' && method === 'POST') return handleReply(body);
      return handleGetMessages(query);

    case 'payments':
      if (id && action === 'approve' && method === 'POST') return handleApprovePayment(id);
      if (id && action === 'cancel' && method === 'POST') return handleCancelPayment(id);
      return handleGetPayments(query);

    case 'vip':
      if (id === 'grant' && method === 'POST') return handleGrantVip(body);
      if (id === 'revoke' && method === 'POST') return handleRevokeVip(body);
      return handleGetVip();

    case 'config':
      if (method === 'PUT') return handleSaveConfig(body);
      return handleGetConfig();

    case 'broadcast':
      if (method === 'POST') return handleBroadcast(body);
      return json(405, { error: 'Method not allowed' });

    default:
      return json(404, { error: 'Rota não encontrada' });
  }
};
