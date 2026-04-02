// storage.js - Módulo de armazenamento compatível com serverless
// Usa Netlify Blobs (preferencial) com fallback para memória em dev
// Para produção real, substitua por Upstash Redis, PlanetScale ou similar

const fs = require('fs');
const path = require('path');

// ─── Detecta ambiente ────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production' && !process.env.NETLIFY;
const DATA_DIR = path.join('/tmp', 'vip-bot-data');

// ─── Inicializa diretório de dados (dev/tmp) ─────────────────────────────────
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getFilePath(store) {
  return path.join(DATA_DIR, `${store}.json`);
}

// ─── Lê store ────────────────────────────────────────────────────────────────
function readStore(store) {
  try {
    ensureDataDir();
    const filePath = getFilePath(store);
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[Storage] Erro ao ler ${store}:`, e.message);
    return {};
  }
}

// ─── Escreve store ───────────────────────────────────────────────────────────
function writeStore(store, data) {
  try {
    ensureDataDir();
    const filePath = getFilePath(store);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error(`[Storage] Erro ao escrever ${store}:`, e.message);
    return false;
  }
}

// ─── API Pública ─────────────────────────────────────────────────────────────

/**
 * Obtém um registro por ID em um store
 */
function get(store, id) {
  const data = readStore(store);
  return data[id] || null;
}

/**
 * Define/atualiza um registro por ID em um store
 */
function set(store, id, value) {
  const data = readStore(store);
  data[id] = { ...data[id], ...value };
  return writeStore(store, data);
}

/**
 * Deleta um registro por ID
 */
function del(store, id) {
  const data = readStore(store);
  delete data[id];
  return writeStore(store, data);
}

/**
 * Lista todos os registros de um store
 */
function list(store) {
  const data = readStore(store);
  return Object.values(data);
}

/**
 * Adiciona item a uma lista (store de arrays)
 */
function push(store, item) {
  try {
    ensureDataDir();
    const filePath = getFilePath(store);
    let arr = [];
    if (fs.existsSync(filePath)) {
      arr = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    arr.push(item);
    fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error(`[Storage] Erro ao push ${store}:`, e.message);
    return false;
  }
}

/**
 * Lista todos itens de um store de array, com filtro opcional
 */
function listArray(store, filterFn = null) {
  try {
    ensureDataDir();
    const filePath = getFilePath(store);
    if (!fs.existsSync(filePath)) return [];
    const arr = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return filterFn ? arr.filter(filterFn) : arr;
  } catch (e) {
    return [];
  }
}

/**
 * Atualiza item em store de array pelo campo id
 */
function updateInArray(store, id, updates) {
  try {
    ensureDataDir();
    const filePath = getFilePath(store);
    if (!fs.existsSync(filePath)) return false;
    let arr = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const idx = arr.findIndex(item => item.id === id);
    if (idx === -1) return false;
    arr[idx] = { ...arr[idx], ...updates };
    fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Obtém configurações do bot
 */
function getConfig() {
  const cfg = get('config', 'settings');
  return cfg || getDefaultConfig();
}

/**
 * Salva configurações do bot
 */
function saveConfig(config) {
  return set('config', 'settings', config);
}

/**
 * Configurações padrão do bot
 */
function getDefaultConfig() {
  return {
    // Textos do bot
    welcome_message: `🔥 *Bem-vindo(a)!*\n\nVocê chegou no lugar certo! 😈\n\nAqui você tem acesso a conteúdos exclusivos e sensuais.\n\nUse os botões abaixo para explorar:`,
    vip_message: `👑 *Área VIP*\n\nNosso plano VIP te dá acesso TOTAL a:\n\n✅ Fotos e vídeos exclusivos\n✅ Lives privadas\n✅ Conteúdo diário\n✅ Suporte prioritário\n\nEscolha seu plano abaixo:`,
    payment_pending: `⏳ *Pagamento Pendente*\n\nSeu PIX está sendo processado!\n\nAssim que confirmarmos, você recebe acesso VIP imediatamente. 🔥`,
    payment_confirmed: `✅ *Pagamento Confirmado!*\n\n🎉 Parabéns! Você agora é VIP!\n\nSeu acesso foi liberado. Aproveite! 😈`,
    support_message: `🆘 *Suporte*\n\nPrecisa de ajuda? Fale com nossa equipe!\n\n📩 Nossa equipe responde em até 1 hora.`,
    already_vip: `👑 *Você já é VIP!*\n\nSeu acesso está ativo. Aproveite todo o conteúdo exclusivo! 😈`,

    // Planos
    plans: [
      { id: 'week', name: '7 Dias 🔥', price: 2990, days: 7, description: 'Acesso completo por 7 dias' },
      { id: 'month', name: '30 Dias 👑', price: 6990, days: 30, description: 'Acesso completo por 30 dias' },
      { id: 'quarter', name: '90 Dias 💎', price: 14990, days: 90, description: 'Acesso completo por 90 dias' },
    ],

    // Links de conteúdo VIP
    vip_content_link: 'https://t.me/+seu_grupo_vip',
    support_username: '@seu_suporte',
  };
}

module.exports = {
  get,
  set,
  del,
  list,
  push,
  listArray,
  updateInArray,
  getConfig,
  saveConfig,
  getDefaultConfig,
  readStore,
  writeStore,
};
