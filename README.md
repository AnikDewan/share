# Share

A private drop page: type a note, attach files, and your bot forwards both to Telegram.

GitHub Pages only hosts the static page. The bot token never goes in the frontend.

```
Browser  →  GitHub Pages (password gate)
         →  your bot server (checks password, uses BOT_TOKEN)
         →  Telegram
```

## 1. Telegram bot + Railway backend

Full walkthrough: create the bot, deploy `backend/server.mjs` on Railway, then point GitHub Pages at it.

### Create the bot

1. Open Telegram and search **@BotFather**.
2. Send `/newbot`.
3. Pick a name (shown in chats) and a username ending in `bot`.
4. Copy the token. It looks like `123456789:AAH...`. Treat it as a password.

### Get your chat id

1. Open your new bot in Telegram and send `/start` (any message works).
2. In a browser, open:

   `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`

   Replace `<BOT_TOKEN>` with the token from BotFather.
3. Find `"chat":{"id": 123456789`. That number is `TELEGRAM_CHAT_ID`.
   - Personal chats are positive.
   - Groups/channels are negative.

If `result` is `[]`, message the bot again and refresh. For a group, add the bot, send a message in the group, then reload getUpdates.

### Deploy on Railway

The GitHub repo is already Railway-ready (`package.json` + `railway.toml` start `node backend/server.mjs`). Railway sets `PORT` for you.

1. Go to [railway.com](https://railway.com) and sign in (GitHub login is easiest).
2. **New Project → Deploy from GitHub repo** → `AnikDewan/share`.
3. Open the service → **Variables** and add:

   | Variable | Value |
   |---|---|
   | `SHARE_PASSWORD` | The site password (same as GitHub secret `SITE_PASSWORD`) |
   | `BOT_TOKEN` | Token from BotFather |
   | `TELEGRAM_CHAT_ID` | The chat id from getUpdates |
   | `CORS_ORIGIN` | `https://anikdewan.github.io` |

   Do **not** set `SHARE_DRY_RUN`.
4. Open **Settings → Networking → Generate Domain**. You get a URL like `https://share-production-xxxx.up.railway.app`.
5. Confirm the bot is up:

   `curl https://YOUR-RAILWAY-DOMAIN/health`

   Expected: `{"ok":true}`.

The page posts `multipart/form-data` to `POST /send` with fields `password`, `text`, and `files`. Your GitHub Pages webhook is:

`https://YOUR-RAILWAY-DOMAIN/send`

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
