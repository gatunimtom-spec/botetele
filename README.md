# 🔥 VIP Bot — Telegram + PIX + Admin Dashboard

Bot de Telegram para monetização via PIX com painel administrativo completo.
Deploy em minutos no Netlify.

---

## 📁 Estrutura do Projeto

```
/
├── netlify/
│   └── functions/
│       ├── bot.js          # Webhook do Telegram (comandos + menus)
│       ├── webhook.js      # Webhook PIX (confirmação de pagamentos)
│       ├── admin-api.js    # API REST do painel administrativo
│       └── storage.js      # Módulo de armazenamento (KV/JSON)
├── public/
│   ├── index.html          # Tela de login admin
│   ├── dashboard.html      # Painel administrativo
│   ├── css/
│   │   └── dashboard.css
│   └── js/
│       └── dashboard.js
├── netlify.toml
└── README.md
```

---

## 🚀 Deploy no Netlify

### 1. Fork / Clone

```bash
git clone https://github.com/seu-usuario/vip-bot
cd vip-bot
```

### 2. Suba para o GitHub e conecte ao Netlify

1. Acesse [netlify.com](https://netlify.com) e faça login
2. Clique em **"Add new site" → "Import an existing project"**
3. Conecte seu repositório GitHub
4. O `netlify.toml` já configura tudo automaticamente

---

## 🔐 Variáveis de Ambiente

No painel do Netlify: **Site Settings → Environment Variables**

| Variável | Descrição | Exemplo |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token do seu bot (obtido com @BotFather) | `1234567890:ABCdef...` |
| `ADMIN_PASSWORD` | Senha para acessar o painel admin | `MinhaSenh@Segura123` |
| `WEBHOOK_SECRET` | Token secreto para validar webhooks | `qualquerStringAleatoria` |
| `PIX_API_KEY` | Chave da sua API PIX (opcional, ativa gateway real) | `sua_chave_api` |
| `PIX_API_URL` | URL base da sua API PIX | `https://api.seugateway.com` |

---

## 🤖 Configurar Webhook do Telegram

Após o deploy, configure o webhook do Telegram com:

```bash
# Substitua TOKEN pelo seu token e SITE pela URL do Netlify
curl -X POST "https://api.telegram.org/botSEU_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://SEU-SITE.netlify.app/api/bot",
    "secret_token": "SEU_WEBHOOK_SECRET"
  }'
```

Ou acesse diretamente no navegador:
```
https://api.telegram.org/botSEU_TOKEN/setWebhook?url=https://SEU-SITE.netlify.app/api/bot
```

### Verificar webhook ativo:
```bash
curl "https://api.telegram.org/botSEU_TOKEN/getWebhookInfo"
```

---

## 💰 Integrar Gateway PIX

### Opção 1: EfiBank (Gerencianet) — Recomendado

```javascript
// Em webhook.js, substitua a função generatePixCharge:
async function generatePixCharge(userId, amount, planId, transactionId) {
  const response = await fetch(`${process.env.PIX_API_URL}/v2/cob`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PIX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      calendario: { expiracao: 1800 },
      devedor: { cpf: '00000000000', nome: `User ${userId}` },
      valor: { original: (amount / 100).toFixed(2) },
      chave: process.env.PIX_CHAVE,
      infoAdicionais: [{ nome: 'transacao', valor: transactionId }],
    }),
  });
  const data = await response.json();
  return {
    qrcode_url: data.imagemQrcode,
    copia_cola: data.pixCopiaECola,
    transaction_id: transactionId,
  };
}
```

### Opção 2: MercadoPago

```javascript
// Webhook do MercadoPago já é parseado automaticamente
// Apenas configure PIX_API_KEY com o access token do MercadoPago
// e PIX_API_URL com https://api.mercadopago.com
```

### Opção 3: Asaas

```javascript
// Webhook do Asaas já é parseado automaticamente
// Configure PIX_API_KEY com a chave API do Asaas
```

### Configurar URL do Webhook PIX no gateway:

```
https://SEU-SITE.netlify.app/api/webhook
```

---

## 📊 Acesso ao Painel Admin

```
https://SEU-SITE.netlify.app/
```

- Use a senha configurada em `ADMIN_PASSWORD`
- O token de sessão expira em 24 horas

### Funcionalidades do painel:

- **Overview** — Métricas gerais (leads, vendas, receita, conversão)
- **Leads** — Lista todos os usuários com busca e filtros
- **Mensagens** — Inbox de todas as mensagens + resposta direta
- **Pagamentos** — Lista com filtro por status + aprovação/cancelamento manual
- **VIP** — Controle de acessos VIP (ativar, revogar, renovar)
- **Disparo** — Broadcast para todos os leads ou apenas VIPs
- **Configurações** — Editar textos do bot, planos e links

---

## 🤖 Comandos do Bot

| Comando | Descrição |
|---|---|
| `/start` | Menu principal com boas-vindas |
| `/vip` | Exibe planos e opção de compra |
| `/planos` | Alias para `/vip` |
| `/comprar` | Alias para `/vip` |
| `/suporte` | Link para suporte |

---

## 🗄️ Banco de Dados

O projeto usa armazenamento em `/tmp` (para desenvolvimento e Netlify Functions).

**Para produção robusta**, substitua o `storage.js` por:

- **Upstash Redis** — Free tier generoso, ideal para serverless
  ```bash
  npm install @upstash/redis
  ```

- **Neon PostgreSQL** — Free tier com PostgreSQL completo
  ```bash
  npm install @neondatabase/serverless
  ```

- **Netlify Blobs** — Storage nativo do Netlify (Beta)
  ```bash
  npm install @netlify/blobs
  ```

---

## 🔒 Segurança

- Todas as rotas do admin requerem token JWT (expira em 24h)
- Webhook do Telegram validado via `X-Telegram-Bot-Api-Secret-Token`
- Webhook PIX validado via HMAC-SHA256 (quando configurado)
- Inputs sanitizados para prevenir XSS
- Anti-spam: ignora mensagens de bots

---

## 📝 Personalizar Bot

Acesse o painel admin → **Configurações** para editar:

- Textos de boas-vindas
- Mensagens de pagamento
- Valores dos planos
- Links de conteúdo VIP
- Username de suporte

---

## 🛠️ Desenvolvimento Local

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Criar arquivo .env
cat > .env << EOF
TELEGRAM_BOT_TOKEN=seu_token_aqui
ADMIN_PASSWORD=senha123
WEBHOOK_SECRET=segredo123
EOF

# Rodar localmente
netlify dev
```

O servidor local ficará em `http://localhost:8888`

Para testar o bot localmente, use [ngrok](https://ngrok.com):
```bash
ngrok http 8888
# Use a URL gerada para configurar o webhook do Telegram
```

---

## 📈 Escalar o Sistema

1. **Banco de dados**: Migre para Upstash Redis ou Neon
2. **Imagens/vídeos**: Use Cloudinary ou AWS S3
3. **Rate limit**: Adicione Redis para controle de spam
4. **Multi-bot**: Instancie múltiplos bots com diferentes tokens
5. **Analytics**: Integre com Google Analytics ou Plausible

---

*Desenvolvido para deploy imediato no Netlify.*
