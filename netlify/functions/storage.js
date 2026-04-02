// netlify/functions/storage.js
// Storage persistente com Netlify Blobs

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'vip-bot';

function getBlobStore() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  });
}

function itemKey(store, id) {
  return `${store}/${id}`;
}

function arrayKey(store) {
  return `__arrays__/${store}`;
}

async function get(store, id) {
  const blobs = getBlobStore();
  const data = await blobs.get(itemKey(store, id), { type: 'json' });
  return data || null;
}

async function set(store, id, value) {
  const blobs = getBlobStore();
  const key = itemKey(store, id);
  const existing = await get(store, id);
  const nextValue = existing ? { ...existing, ...value } : value;
  await blobs.setJSON(key, nextValue);
  return true;
}

async function del(store, id) {
  const blobs = getBlobStore();
  await blobs.delete(itemKey(store, id));
  return true;
}

async function list(store) {
  const blobs = getBlobStore();
  const { blobs: entries } = await blobs.list({ prefix: `${store}/` });

  const results = [];
  for (const entry of entries) {
    const value = await blobs.get(entry.key, { type: 'json' });
    if (value) results.push(value);
  }
  return results;
}

async function push(store, item) {
  const blobs = getBlobStore();
  const key = arrayKey(store);
  const arr = (await blobs.get(key, { type: 'json' })) || [];
  arr.push(item);
  await blobs.setJSON(key, arr);
  return true;
}

async function listArray(store, filterFn = null) {
  const blobs = getBlobStore();
  const key = arrayKey(store);
  const arr = (await blobs.get(key, { type: 'json' })) || [];
  return filterFn ? arr.filter(filterFn) : arr;
}

async function updateInArray(store, id, updates) {
  const blobs = getBlobStore();
  const key = arrayKey(store);
  const arr = (await blobs.get(key, { type: 'json' })) || [];
  const idx = arr.findIndex((item) => item.id === id);
  if (idx === -1) return false;

  arr[idx] = { ...arr[idx], ...updates };
  await blobs.setJSON(key, arr);
  return true;
}

function getDefaultConfig() {
  return {
    welcome_message: `🔥 *Bem-vindo(a)!*\n\nVocê chegou no lugar certo! 😈\n\nAqui você tem acesso a conteúdos exclusivos e sensuais.\n\nUse os botões abaixo para explorar:`,
    vip_message: `👑 *Área VIP*\n\nNosso plano VIP te dá acesso TOTAL a:\n\n✅ Fotos e vídeos exclusivos\n✅ Lives privadas\n✅ Conteúdo diário\n✅ Suporte prioritário\n\nEscolha seu plano abaixo:`,
    payment_pending: `⏳ *Pagamento Pendente*\n\nSeu PIX está sendo processado!\n\nAssim que confirmarmos, você recebe acesso VIP imediatamente. 🔥`,
    payment_confirmed: `✅ *Pagamento Confirmado!*\n\n🎉 Parabéns! Você agora é VIP!\n\nSeu acesso foi liberado. Aproveite! 😈`,
    support_message: `🆘 *Suporte*\n\nPrecisa de ajuda? Fale com nossa equipe!\n\n📩 Nossa equipe responde em até 1 hora.`,
    already_vip: `👑 *Você já é VIP!*\n\nSeu acesso está ativo. Aproveite todo o conteúdo exclusivo! 😈`,
    plans: [
      { id: 'week', name: '7 Dias 🔥', price: 2990, days: 7, description: 'Acesso completo por 7 dias' },
      { id: 'month', name: '30 Dias 👑', price: 6990, days: 30, description: 'Acesso completo por 30 dias' },
      { id: 'quarter', name: '90 Dias 💎', price: 14990, days: 90, description: 'Acesso completo por 90 dias' },
    ],
    vip_content_link: 'https://t.me/+seu_grupo_vip',
    support_username: '@seu_suporte',
  };
}

async function getConfig() {
  const cfg = await get('config', 'settings');
  return cfg || getDefaultConfig();
}

async function saveConfig(config) {
  return set('config', 'settings', config);
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
};
