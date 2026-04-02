// dashboard.js — Painel Administrativo VIP Bot
// SPA simples sem frameworks, totalmente funcional

const API = '/api/admin-api';
let TOKEN = localStorage.getItem('admin_token');

// ─── Redirect se não logado ──────────────────────────────────────────────────
if (!TOKEN) { window.location.href = '/'; }

// ─── Estado global ───────────────────────────────────────────────────────────
const State = {
  section: 'overview',
  stats: null,
  usersPage: 1,
  paymentsPage: 1,
  messagesPage: 1,
  config: null,
};

// ─── API Helper ───────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/';
    return;
  }

  return res.json();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(title, content) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = content;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

// ─── Loader ───────────────────────────────────────────────────────────────────
function loading() {
  return `<div class="loader"><div class="spinner"></div> Carregando...</div>`;
}
function emptyState(icon, msg) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;
}

// ─── Formatação ───────────────────────────────────────────────────────────────
function fmtMoney(cents) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtUser(u) {
  if (!u) return '—';
  return u.username ? `@${u.username}` : u.first_name || u.id || '—';
}
function statusBadge(s) {
  const map = { paid: ['badge-success', '✓ Pago'], pending: ['badge-warning', '⏳ Pendente'], cancelled: ['badge-error', '✕ Cancelado'] };
  const [cls, label] = map[s] || ['badge-info', s];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── SEÇÕES ──────────────────────────────────────────────────────────────────

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
async function renderOverview() {
  const el = document.getElementById('content');
  el.innerHTML = loading();

  const stats = await api('/stats');
  if (!stats) return;
  State.stats = stats;

  const revenueChartData = Object.entries(stats.revenue_by_month || {}).slice(-6).map(([m, v]) => ({ month: m, value: v }));

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card stat-accent">
        <div class="stat-label">Leads Totais</div>
        <div class="stat-value">${stats.total_users.toLocaleString()}</div>
        <div class="stat-sub">+${stats.new_users_24h} nas últimas 24h</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total de Vendas</div>
        <div class="stat-value">${stats.total_sales}</div>
        <div class="stat-sub">${stats.pending_payments} pendentes</div>
      </div>
      <div class="stat-card stat-accent">
        <div class="stat-label">Receita Total</div>
        <div class="stat-value">${fmtMoney(stats.total_revenue)}</div>
        <div class="stat-sub">Pagamentos confirmados</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Usuários VIP</div>
        <div class="stat-value">${stats.vip_users}</div>
        <div class="stat-sub">Acessos ativos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Conversão</div>
        <div class="stat-value">${stats.conversion_rate}%</div>
        <div class="stat-sub">Lead → Venda</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Mensagens</div>
        <div class="stat-value">${stats.total_messages.toLocaleString()}</div>
        <div class="stat-sub">Total recebidas</div>
      </div>
    </div>

    <div class="section-header" style="margin-top:1rem">
      <span class="section-title">📈 Receita por Mês</span>
    </div>
    <div class="table-wrap" style="padding:1.5rem">
      ${renderRevenueChart(revenueChartData)}
    </div>

    <div class="section-header" style="margin-top:1.5rem">
      <span class="section-title">⚡ Ações Rápidas</span>
    </div>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="navigate('leads')">👥 Ver Leads</button>
      <button class="btn btn-ghost" onclick="navigate('payments')">💳 Pagamentos</button>
      <button class="btn btn-ghost" onclick="navigate('messages')">💬 Mensagens</button>
      <button class="btn btn-primary" onclick="navigate('broadcast')">📢 Disparar Mensagem</button>
    </div>
  `;
}

function renderRevenueChart(data) {
  if (!data.length) return emptyState('📊', 'Nenhuma venda ainda.');
  const max = Math.max(...data.map((d) => d.value), 1);

  return `<div style="display:flex;align-items:flex-end;gap:1rem;height:140px">
    ${data.map((d) => {
      const pct = Math.max((d.value / max) * 100, 4);
      const label = d.month.substring(5);
      return `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0.4rem">
          <span style="font-size:0.65rem;color:var(--text-muted)">${fmtMoney(d.value)}</span>
          <div style="width:100%;height:${pct}%;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:4px 4px 0 0;min-height:8px;transition:height 0.5s ease"></div>
          <span style="font-size:0.7rem;color:var(--text-muted)">${label}</span>
        </div>`;
    }).join('')}
  </div>`;
}

// ── LEADS ─────────────────────────────────────────────────────────────────────
async function renderLeads() {
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="section-header"><span class="section-title">👥 Leads</span></div>
    <div class="search-bar">
      <input class="search-input" id="leadsSearch" placeholder="Buscar por username, nome ou ID..." />
      <select id="leadsFilter">
        <option value="">Todos</option>
        <option value="true">Somente VIP</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="loadLeads()">Buscar</button>
    </div>
    <div id="leadsTable">${loading()}</div>
    <div class="pagination" id="leadsPagination"></div>
  `;
  loadLeads();
}

async function loadLeads() {
  const search = document.getElementById('leadsSearch')?.value || '';
  const vip = document.getElementById('leadsFilter')?.value || '';
  const page = State.usersPage;
  const data = await api(`/users?search=${encodeURIComponent(search)}&vip_only=${vip}&page=${page}&limit=15`);
  if (!data) return;

  const rows = data.users.map((u) => `
    <tr>
      <td class="mono">${u.id}</td>
      <td>${u.first_name || ''} ${u.last_name || ''}</td>
      <td>${u.username ? `@${u.username}` : '—'}</td>
      <td>${fmtDate(u.first_seen)}</td>
      <td>${fmtDate(u.last_interaction)}</td>
      <td>${u.vip_status ? `<span class="badge badge-purple">👑 VIP</span>` : `<span class="badge badge-info">Free</span>`}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="showUserDetail('${u.id}')">Ver</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('leadsTable').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Nome</th><th>Username</th><th>Entrada</th><th>Última Int.</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7">${emptyState('👥', 'Nenhum lead ainda.')}</td></tr>`}</tbody>
      </table>
    </div>`;

  document.getElementById('leadsPagination').innerHTML = `
    <span>${data.total} leads no total</span>
    <div class="pagination-btns">
      ${page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="changePage('users',-1)">← Anterior</button>` : ''}
      <span style="padding:0 0.5rem;font-size:0.8rem;color:var(--text-muted)">Pág. ${page}</span>
      ${data.users.length === 15 ? `<button class="btn btn-ghost btn-sm" onclick="changePage('users',1)">Próxima →</button>` : ''}
    </div>`;
}

async function showUserDetail(userId) {
  openModal('Detalhes do Usuário', loading());
  const data = await api(`/users/${userId}`);
  if (!data) return;

  const lastMessages = (data.messages || []).slice(0, 5).map((m) => `
    <div style="padding:0.5rem;background:var(--bg);border-radius:6px;margin-top:0.4rem">
      <span style="font-size:0.7rem;color:var(--text-muted)">${fmtDate(m.timestamp)} · ${m.direction === 'outbound' ? '📤' : '📥'}</span>
      <div style="font-size:0.85rem;margin-top:0.2rem">${escHtml(m.message)}</div>
    </div>`).join('');

  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><span class="label">ID Telegram</span><span class="value mono">${data.id}</span></div>
    <div class="detail-row"><span class="label">Username</span><span class="value">${data.username ? '@' + data.username : '—'}</span></div>
    <div class="detail-row"><span class="label">Nome</span><span class="value">${data.first_name || ''} ${data.last_name || ''}</span></div>
    <div class="detail-row"><span class="label">Entrada</span><span class="value">${fmtDate(data.first_seen)}</span></div>
    <div class="detail-row"><span class="label">Última interação</span><span class="value">${fmtDate(data.last_interaction)}</span></div>
    <div class="detail-row"><span class="label">Status VIP</span><span class="value">${data.vip_status ? '✅ Ativo' : '❌ Inativo'}</span></div>
    <div class="detail-row"><span class="label">Expiração VIP</span><span class="value">${fmtDate(data.vip_expiration)}</span></div>

    <div style="margin-top:1.25rem;font-weight:600;font-size:0.875rem">Últimas mensagens</div>
    ${lastMessages || `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:0.5rem">Nenhuma mensagem.</p>`}

    <div class="reply-area">
      <div style="font-weight:600;font-size:0.875rem;margin-bottom:0.5rem">Responder</div>
      <textarea id="replyText" placeholder="Digite sua resposta..." rows="3"></textarea>
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" onclick="replyUser('${data.id}')">💬 Enviar Resposta</button>
      ${data.vip_status
        ? `<button class="btn btn-danger" onclick="revokeVip('${data.id}')">❌ Revogar VIP</button>`
        : `<button class="btn btn-success" onclick="grantVipModal('${data.id}')">👑 Dar VIP</button>`}
    </div>
  `;
}

async function replyUser(userId) {
  const msg = document.getElementById('replyText')?.value?.trim();
  if (!msg) return toast('Digite uma mensagem', 'error');
  const res = await api('/messages/reply', { method: 'POST', body: { user_id: userId, message: msg } });
  if (res?.success) { toast('Mensagem enviada!', 'success'); closeModal(); }
  else toast('Erro ao enviar mensagem', 'error');
}

async function grantVipModal(userId) {
  const days = prompt('Por quantos dias? (deixe vazio para 30)') || '30';
  const res = await api('/vip/grant', { method: 'POST', body: { user_id: userId, days: parseInt(days) } });
  if (res?.success) { toast('VIP concedido!', 'success'); closeModal(); }
  else toast('Erro ao conceder VIP', 'error');
}

async function revokeVip(userId) {
  if (!confirm('Revogar acesso VIP deste usuário?')) return;
  const res = await api('/vip/revoke', { method: 'POST', body: { user_id: userId } });
  if (res?.success) { toast('VIP revogado.', 'success'); closeModal(); }
  else toast('Erro ao revogar', 'error');
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────
async function renderMessages() {
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">💬 Mensagens</span>
    </div>
    <div id="inboxList">${loading()}</div>
    <div class="pagination" id="msgPagination"></div>
  `;
  loadMessages();
}

async function loadMessages() {
  const data = await api(`/messages?page=${State.messagesPage}&limit=25`);
  if (!data) return;

  const items = data.messages.map((m) => `
    <div class="inbox-item" onclick="showMessageDetail('${m.user_id}')">
      <div class="inbox-header">
        <span class="inbox-user">${m.user ? fmtUser(m.user) : m.user_id}</span>
        <div style="display:flex;align-items:center;gap:0.5rem">
          ${m.direction === 'outbound' ? `<span class="badge badge-info inbox-type-badge">📤 Enviado</span>` : ''}
          <span class="inbox-time">${fmtDate(m.timestamp)}</span>
        </div>
      </div>
      <div class="inbox-msg">${escHtml(m.message || '')}</div>
    </div>`).join('');

  document.getElementById('inboxList').innerHTML = items || emptyState('💬', 'Nenhuma mensagem ainda.');
  document.getElementById('msgPagination').innerHTML = `
    <span>${data.total} mensagens</span>
    <div class="pagination-btns">
      ${State.messagesPage > 1 ? `<button class="btn btn-ghost btn-sm" onclick="changePage('messages',-1)">← Anterior</button>` : ''}
      <span style="padding:0 0.5rem;font-size:0.8rem;color:var(--text-muted)">Pág. ${State.messagesPage}</span>
      ${data.messages.length === 25 ? `<button class="btn btn-ghost btn-sm" onclick="changePage('messages',1)">Próxima →</button>` : ''}
    </div>`;
}

function showMessageDetail(userId) { showUserDetail(userId); }

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
async function renderPayments() {
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="section-header"><span class="section-title">💳 Pagamentos</span></div>
    <div class="search-bar">
      <select id="paymentFilter">
        <option value="">Todos</option>
        <option value="pending">Pendentes</option>
        <option value="paid">Pagos</option>
        <option value="cancelled">Cancelados</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="loadPayments()">Filtrar</button>
    </div>
    <div id="paymentsTable">${loading()}</div>
    <div class="pagination" id="paymentsPagination"></div>
  `;
  loadPayments();
}

async function loadPayments() {
  const status = document.getElementById('paymentFilter')?.value || '';
  const data = await api(`/payments?status=${status}&page=${State.paymentsPage}&limit=15`);
  if (!data) return;

  const rows = data.payments.map((p) => `
    <tr>
      <td class="mono" style="font-size:0.72rem">${p.id}</td>
      <td>${p.user ? fmtUser(p.user) : p.user_id}</td>
      <td>${p.plan_name || '—'}</td>
      <td style="font-weight:600">${fmtMoney(p.amount)}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${fmtDate(p.created_at)}</td>
      <td>${fmtDate(p.paid_at)}</td>
      <td>
        ${p.status === 'pending' ? `
          <button class="btn btn-success btn-sm" onclick="approvePayment('${p.id}')">✓ Aprovar</button>
          <button class="btn btn-danger btn-sm" onclick="cancelPayment('${p.id}')">✕</button>
        ` : '—'}
      </td>
    </tr>`).join('');

  document.getElementById('paymentsTable').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Usuário</th><th>Plano</th><th>Valor</th><th>Status</th><th>Criado</th><th>Pago em</th><th>Ações</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8">${emptyState('💳', 'Nenhum pagamento.')}</td></tr>`}</tbody>
      </table>
    </div>`;

  document.getElementById('paymentsPagination').innerHTML = `
    <span>${data.total} pagamentos</span>
    <div class="pagination-btns">
      ${State.paymentsPage > 1 ? `<button class="btn btn-ghost btn-sm" onclick="changePage('payments',-1)">← Anterior</button>` : ''}
      <span style="padding:0 0.5rem;font-size:0.8rem;color:var(--text-muted)">Pág. ${State.paymentsPage}</span>
      ${data.payments.length === 15 ? `<button class="btn btn-ghost btn-sm" onclick="changePage('payments',1)">Próxima →</button>` : ''}
    </div>`;
}

async function approvePayment(id) {
  if (!confirm('Aprovar este pagamento e liberar VIP?')) return;
  const res = await api(`/payments/${id}/approve`, { method: 'POST' });
  if (res?.success) { toast('Pagamento aprovado! VIP liberado.', 'success'); loadPayments(); }
  else toast(res?.error || 'Erro ao aprovar', 'error');
}

async function cancelPayment(id) {
  if (!confirm('Cancelar este pagamento?')) return;
  const res = await api(`/payments/${id}/cancel`, { method: 'POST' });
  if (res?.success) { toast('Pagamento cancelado.', 'success'); loadPayments(); }
  else toast('Erro ao cancelar', 'error');
}

// ── VIP ───────────────────────────────────────────────────────────────────────
async function renderVip() {
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">⭐ Controle VIP</span>
      <button class="btn btn-primary btn-sm" onclick="showGrantVipForm()">+ Adicionar VIP</button>
    </div>
    <div id="vipTable">${loading()}</div>
  `;
  loadVip();
}

async function loadVip() {
  const data = await api('/vip');
  if (!data) return;

  const now = new Date();
  const rows = data.vip_users.map((u) => {
    const expired = u.vip_expiration && new Date(u.vip_expiration) < now;
    return `
    <tr>
      <td class="mono">${u.id}</td>
      <td>${u.first_name || ''} ${u.last_name || ''}</td>
      <td>${u.username ? '@' + u.username : '—'}</td>
      <td>${fmtDate(u.vip_granted_at)}</td>
      <td>${u.vip_expiration ? fmtDate(u.vip_expiration) : '∞ Permanente'}</td>
      <td>${expired ? `<span class="badge badge-error">Expirado</span>` : `<span class="badge badge-purple">Ativo</span>`}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="revokeVipDirect('${u.id}')">Revogar</button>
        <button class="btn btn-ghost btn-sm" onclick="grantVipModal('${u.id}')">Renovar</button>
      </td>
    </tr>`; }).join('');

  document.getElementById('vipTable').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Nome</th><th>Username</th><th>Desde</th><th>Expira</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7">${emptyState('⭐', 'Nenhum VIP ativo.')}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function showGrantVipForm() {
  openModal('Adicionar VIP Manual', `
    <div class="form-group">
      <label>ID do Usuário no Telegram</label>
      <input class="form-input" id="newVipId" placeholder="123456789" />
    </div>
    <div class="form-group">
      <label>Dias de Acesso</label>
      <input class="form-input" id="newVipDays" type="number" value="30" min="1" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="grantVipDirect()">👑 Conceder VIP</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function grantVipDirect() {
  const id = document.getElementById('newVipId')?.value?.trim();
  const days = parseInt(document.getElementById('newVipDays')?.value) || 30;
  if (!id) return toast('Informe o ID do usuário', 'error');
  const res = await api('/vip/grant', { method: 'POST', body: { user_id: id, days } });
  if (res?.success) { toast('VIP concedido!', 'success'); closeModal(); loadVip(); }
  else toast(res?.error || 'Erro ao conceder VIP', 'error');
}

async function revokeVipDirect(userId) {
  if (!confirm('Revogar acesso VIP deste usuário?')) return;
  const res = await api('/vip/revoke', { method: 'POST', body: { user_id: userId } });
  if (res?.success) { toast('VIP revogado.', 'success'); loadVip(); }
  else toast('Erro ao revogar', 'error');
}

// ── BROADCAST ─────────────────────────────────────────────────────────────────
async function renderBroadcast() {
  const stats = State.stats || await api('/stats');
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="section-header"><span class="section-title">📢 Disparo de Mensagens</span></div>
    <div class="broadcast-box">
      <div class="form-group">
        <label>Destinatários</label>
        <select id="broadcastTarget" class="form-input">
          <option value="all">Todos os leads (${stats?.total_users || 0} usuários)</option>
          <option value="vip">Somente VIPs (${stats?.vip_users || 0} usuários)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Mensagem (suporta Markdown do Telegram)</label>
        <textarea id="broadcastMsg" rows="6" placeholder="*Olá!* Use _itálico_, *negrito*, \`código\` e [links](https://exemplo.com)"></textarea>
      </div>
      <div style="display:flex;align-items:center;gap:1rem">
        <button class="btn btn-primary" id="broadcastBtn" onclick="sendBroadcast()">📤 Enviar Mensagem</button>
        <span style="font-size:0.8rem;color:var(--text-muted)">⚠️ Ação irreversível. Confirme antes de disparar.</span>
      </div>
      <div id="broadcastResult" style="margin-top:1rem"></div>
    </div>
  `;
}

async function sendBroadcast() {
  const message = document.getElementById('broadcastMsg')?.value?.trim();
  const target = document.getElementById('broadcastTarget')?.value;
  if (!message) return toast('Digite uma mensagem', 'error');

  const targetLabel = target === 'vip' ? 'VIPs' : 'todos os leads';
  if (!confirm(`Enviar mensagem para ${targetLabel}? Esta ação não pode ser desfeita.`)) return;

  const btn = document.getElementById('broadcastBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';

  const res = await api('/broadcast', { method: 'POST', body: { message, target } });
  btn.disabled = false;
  btn.textContent = '📤 Enviar Mensagem';

  if (res?.success) {
    toast(`Envio concluído! ${res.results.sent} enviados, ${res.results.failed} falhas.`, 'success');
    document.getElementById('broadcastResult').innerHTML = `
      <div class="stats-grid" style="margin-top:0">
        <div class="stat-card"><div class="stat-label">Enviados</div><div class="stat-value" style="font-size:1.5rem">${res.results.sent}</div></div>
        <div class="stat-card"><div class="stat-label">Falhas</div><div class="stat-value" style="font-size:1.5rem">${res.results.failed}</div></div>
        <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" style="font-size:1.5rem">${res.results.total}</div></div>
      </div>`;
  } else {
    toast('Erro ao enviar broadcast', 'error');
  }
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
async function renderConfig() {
  const el = document.getElementById('content');
  el.innerHTML = loading();
  const config = await api('/config');
  if (!config) return;
  State.config = config;

  const plansHtml = (config.plans || []).map((plan, i) => `
    <div class="plan-card">
      <div class="form-group">
        <label>Nome do Plano</label>
        <input class="form-input" id="plan_name_${i}" value="${escHtml(plan.name)}" />
      </div>
      <div class="form-group">
        <label>Preço (em centavos, ex: 2990 = R$29,90)</label>
        <input class="form-input" type="number" id="plan_price_${i}" value="${plan.price}" />
      </div>
      <div class="form-group">
        <label>Dias de acesso</label>
        <input class="form-input" type="number" id="plan_days_${i}" value="${plan.days}" />
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">⚙️ Configurações do Bot</span>
      <button class="btn btn-primary" onclick="saveConfig()">💾 Salvar Tudo</button>
    </div>

    <div class="config-card">
      <div class="config-card-title">🔗 Links</div>
      <div class="form-row">
        <div class="form-group">
          <label>Link do Grupo VIP</label>
          <input class="form-input" id="cfg_vip_link" value="${escHtml(config.vip_content_link || '')}" />
        </div>
        <div class="form-group">
          <label>Username de Suporte</label>
          <input class="form-input" id="cfg_support" value="${escHtml(config.support_username || '')}" />
        </div>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">💬 Mensagens do Bot</div>
      <div class="form-group">
        <label>Mensagem de Boas-vindas (/start)</label>
        <textarea id="cfg_welcome">${escHtml(config.welcome_message || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Mensagem VIP (/vip)</label>
        <textarea id="cfg_vip_msg">${escHtml(config.vip_message || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Mensagem Pagamento Confirmado</label>
        <textarea id="cfg_paid">${escHtml(config.payment_confirmed || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Mensagem de Suporte</label>
        <textarea id="cfg_support_msg">${escHtml(config.support_message || '')}</textarea>
      </div>
    </div>

    <div class="config-card">
      <div class="config-card-title">💰 Planos</div>
      <div class="plans-grid">${plansHtml}</div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:0.5rem">
      <button class="btn btn-primary" onclick="saveConfig()">💾 Salvar Configurações</button>
    </div>
  `;
}

async function saveConfig() {
  const config = State.config;
  const plans = (config.plans || []).map((_, i) => ({
    id: config.plans[i].id,
    name: document.getElementById(`plan_name_${i}`)?.value,
    price: parseInt(document.getElementById(`plan_price_${i}`)?.value) || 0,
    days: parseInt(document.getElementById(`plan_days_${i}`)?.value) || 30,
    description: config.plans[i].description,
  }));

  const updated = {
    ...config,
    vip_content_link: document.getElementById('cfg_vip_link')?.value,
    support_username: document.getElementById('cfg_support')?.value,
    welcome_message: document.getElementById('cfg_welcome')?.value,
    vip_message: document.getElementById('cfg_vip_msg')?.value,
    payment_confirmed: document.getElementById('cfg_paid')?.value,
    support_message: document.getElementById('cfg_support_msg')?.value,
    plans,
  };

  const res = await api('/config', { method: 'PUT', body: updated });
  if (res?.success) { State.config = res.config; toast('Configurações salvas!', 'success'); }
  else toast('Erro ao salvar configurações', 'error');
}

// ─── Navegação ────────────────────────────────────────────────────────────────
const SECTION_MAP = {
  overview: { title: 'Overview', render: renderOverview },
  leads: { title: 'Leads', render: renderLeads },
  messages: { title: 'Mensagens', render: renderMessages },
  payments: { title: 'Pagamentos', render: renderPayments },
  vip: { title: 'Controle VIP', render: renderVip },
  broadcast: { title: 'Disparo', render: renderBroadcast },
  config: { title: 'Configurações', render: renderConfig },
};

function navigate(section) {
  State.section = section;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.section === section);
  });
  document.getElementById('pageTitle').textContent = SECTION_MAP[section]?.title || section;
  SECTION_MAP[section]?.render();

  // Fecha sidebar em mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function changePage(type, delta) {
  if (type === 'users') { State.usersPage = Math.max(1, State.usersPage + delta); loadLeads(); }
  if (type === 'payments') { State.paymentsPage = Math.max(1, State.paymentsPage + delta); loadPayments(); }
  if (type === 'messages') { State.messagesPage = Math.max(1, State.messagesPage + delta); loadMessages(); }
}

// ─── Escape HTML ──────────────────────────────────────────────────────────────
function escHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach((el) => {
  el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.section); });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  window.location.href = '/';
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  navigate(State.section);
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ─── Verifica status da API ───────────────────────────────────────────────────
async function checkApiStatus() {
  try {
    const res = await fetch(`${API}/stats`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    document.getElementById('statusDot').style.background = res.ok ? 'var(--success)' : 'var(--error)';
  } catch {
    document.getElementById('statusDot').style.background = 'var(--error)';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
navigate('overview');
checkApiStatus();
setInterval(checkApiStatus, 30000);
