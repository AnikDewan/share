# Share

A private drop page: type a note, attach files, and your bot forwards both to Telegram.

GitHub Pages only hosts the static page. The bot token never goes in the frontend.

```
Browser  →  GitHub Pages (password gate)
         →  your bot server (checks password, uses BOT_TOKEN)
         →  Telegram
```

## 1. Host the bot

Use either the Node server or the Cloudflare Worker in `backend/`. Set these env vars on **your** host:

| Variable | Required | Purpose |
|---|---|---|
| `SHARE_PASSWORD` | yes | Must match the site password |
| `BOT_TOKEN` | yes | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | recommended | Your chat id (or message the bot once so it can be inferred) |
| `CORS_ORIGIN` | recommended | `https://anikdewan.github.io` |
| `PORT` | Node only | Defaults to `8787` |

Node:

```bash
cd backend
export SHARE_PASSWORD='your-password'
export BOT_TOKEN='123:abc'
export TELEGRAM_CHAT_ID='your-chat-id'
node server.mjs
```

Cloudflare Worker:

```bash
cd backend
npx wrangler secret put SHARE_PASSWORD
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler deploy
```

The page posts `multipart/form-data` to `POST /send` with fields `password`, `text`, and `files`.

To get `TELEGRAM_CHAT_ID`, message your bot, then open:

`https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`

## 2. GitHub Pages secrets

In the repo: **Settings → Secrets and variables → Actions**. Add:

| Secret | Value |
|---|---|
| `SITE_PASSWORD` | Same password as `SHARE_PASSWORD` |
| `WEBHOOK_URL` | Public URL of your bot, including `/send` |

Pages cannot read runtime env vars. The deploy workflow hashes `SITE_PASSWORD` and inlines `WEBHOOK_URL` into `site/config.js` at build time. The bot token is never written into the site.

## 3. Pages source

This repo deploys with GitHub Actions (`.github/workflows/deploy.yml`). After the first push, the site is at:

`https://anikdewan.github.io/share/`

If you add or change secrets, run **Actions → Deploy to GitHub Pages → Run workflow**.

## Local preview

```bash
export SITE_PASSWORD='dev-password'
export WEBHOOK_URL='http://127.0.0.1:8787/send'
node scripts/gen-site-config.mjs

SHARE_PASSWORD='dev-password' SHARE_DRY_RUN=1 node backend/server.mjs
python3 -m http.server 4173 --directory site
```

Open `http://127.0.0.1:4173`. Dry-run accepts drops without calling Telegram.
