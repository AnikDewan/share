# Setup: Telegram bot + Railway backend

This is the full walkthrough for Share: create a Telegram bot, deploy the webhook on Railway, then point the GitHub Pages site at it.

## How it fits together

```
You on the website
  → GitHub Pages (password gate)
  → Railway (checks the same password, uses BOT_TOKEN)
  → Telegram, in your chat
```

Pages never sees the bot token. Railway holds `BOT_TOKEN`, `SHARE_PASSWORD`, and `TELEGRAM_CHAT_ID`.

The GitHub repo is Railway-ready. `package.json` and `railway.toml` start:

```bash
node backend/server.mjs
```

Railway injects `PORT`. The server already reads it. Do not set `PORT` yourself.

---

## 1. Create the Telegram bot

1. Open Telegram and search **@BotFather**.
2. Send `/newbot`.
3. Choose a display name (anything) and a username that ends in `bot`, for example `anik_share_bot`.
4. BotFather replies with a token like `123456789:AAHxxxxxxxx`. Copy it. That is `BOT_TOKEN`. Treat it as a password.

Do **not** put the token in GitHub, in the website, or in this repo.

Optional:

- `/setdescription` — short blurb
- `/setuserpic` — icon

You do **not** need a Telegram webhook. This server calls Telegram’s HTTP API (`sendMessage` / `sendDocument`) when the site posts to `/send`.

---

## 2. Get your chat id

The bot can only message a chat it already knows.

1. Open **your** new bot in Telegram and send `/start`.
2. In a browser, open (paste your real token):

   ```text
   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   ```

3. In the JSON, find:

   ```json
   "chat": { "id": 123456789, "type": "private" }
   ```

   That number is `TELEGRAM_CHAT_ID`.

- Private chat with you: positive, for example `123456789`
- Group or channel: negative, for example `-1001234567890`

If `"result": []`, send the bot another message and refresh.

For a **group**: add the bot, send a message in the group, then reload getUpdates. If the bot does not see group messages, in BotFather run `/setprivacy` → **Disable**.

---

## 3. Deploy the backend on Railway

Use the GitHub repo [AnikDewan/share](https://github.com/AnikDewan/share).

### Create the project

1. Go to [railway.com](https://railway.com) and sign in (GitHub login is easiest).
2. **New Project → Deploy from GitHub repo**.
3. Authorize Railway if asked, then pick **`AnikDewan/share`**.
4. Deploy. The first build may go **CRASHED** until variables are set. That is fine.

### Set variables

Open the service → **Variables** and add these (no quotes):

| Variable | Value |
|---|---|
| `SHARE_PASSWORD` | The password you want on the website. Same value you will put in GitHub as `SITE_PASSWORD`. |
| `BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_CHAT_ID` | The chat id from step 2 |
| `CORS_ORIGIN` | `https://anikdewan.github.io` |

Do **not** set `SHARE_DRY_RUN`. Do **not** set `PORT`.

Saving variables triggers a redeploy.

### Give it a public URL

1. Service → **Settings → Networking → Generate Domain**.
2. Copy the URL, for example `https://share-production-xxxx.up.railway.app`.
3. Your webhook (what GitHub Pages will call) is that URL plus `/send`:

   ```text
   https://share-production-xxxx.up.railway.app/send
   ```

### Confirm Railway is up

```bash
curl https://YOUR-RAILWAY-DOMAIN/health
```

Expected: `{"ok":true}`.

A wrong password should be rejected:

```bash
curl -sS -F 'password=wrong' -F 'text=hi' https://YOUR-RAILWAY-DOMAIN/send
```

Expected: `{"ok":false,"error":"Unauthorized"}` and HTTP 401.

A real send (this should arrive in Telegram):

```bash
curl -sS -F 'password=YOUR-SHARE-PASSWORD' -F 'text=Railway is wired up' https://YOUR-RAILWAY-DOMAIN/send
```

Expected: `{"ok":true}` and a Telegram message titled like `Drop · …`.

The site posts `multipart/form-data` to `POST /send` with fields `password`, `text`, and `files`.

---

## 4. Point GitHub Pages at Railway

Pages cannot read runtime env vars. The deploy workflow hashes the password and inlines the webhook URL at build time. The bot token is never written into the site.

1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**. Add both:

   | Secret | Value |
   |---|---|
   | `SITE_PASSWORD` | **Exactly** the same as Railway `SHARE_PASSWORD` |
   | `WEBHOOK_URL` | `https://YOUR-RAILWAY-DOMAIN/send` |

2. **Actions → Deploy to GitHub Pages → Run workflow** (or push any commit). Wait until it is green.

3. Open **https://anikdewan.github.io/share/**

   - You should see **Enter the password**, not **Not configured yet**.
   - Unlock with `SITE_PASSWORD`.
   - Send a note (and optionally a file). It should show up in Telegram.

If the page still says it is not configured, the workflow ran before the secrets existed. Re-run the workflow.

---

## 5. End-to-end check

1. `curl https://YOUR-RAILWAY-DOMAIN/health` → `{"ok":true}`
2. Website unlocks with your password
3. Wrong password on the site is rejected
4. A note-only drop arrives in Telegram
5. A file drop arrives as a document (Telegram limit is 50 MB; the site caps at 45 MB)

---

## What you never put where

| Thing | Lives in |
|---|---|
| `BOT_TOKEN` | Railway only |
| `TELEGRAM_CHAT_ID` | Railway only |
| `SHARE_PASSWORD` | Railway **and** GitHub secret `SITE_PASSWORD` |
| `WEBHOOK_URL` | GitHub secret only (the URL is visible in the built site; password is still required on `/send`) |

The hashed password and webhook URL end up in `config.js` on Pages. That is why Railway checks the password again on every request.

---

## Later changes

- **New password:** update Railway `SHARE_PASSWORD` **and** GitHub `SITE_PASSWORD`, then re-run the Pages workflow.
- **New Railway domain:** update GitHub `WEBHOOK_URL`, then re-run the Pages workflow.
- **Code change on `main`:** Railway redeploys from GitHub automatically once the repo is connected. The Pages site only needs a new workflow run if `SITE_PASSWORD` or `WEBHOOK_URL` changed.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Railway logs `BOT_TOKEN is not set` | Variable missing, or deploy happened before it was saved |
| Railway logs `SHARE_PASSWORD is not set` | Same as above |
| `{"ok":false,"error":"Unauthorized"}` | Password sent to `/send` does not match `SHARE_PASSWORD` |
| Telegram `chat not found` / no message | Wrong `TELEGRAM_CHAT_ID`, or you never messaged the bot |
| `getUpdates` returns `"result": []` | Send `/start` to the bot, then refresh |
| Site shows **Not configured yet** | GitHub secrets missing, or Pages workflow not re-run after adding them |
| Site unlocks but send fails with “Failed to fetch” | Wrong `WEBHOOK_URL`, Railway is down, or `CORS_ORIGIN` is not `https://anikdewan.github.io` |
| Build treated as a static site | Service is not using repo root `package.json` / `railway.toml` on `main` |
| First Railway deploy **CRASHED** | Variables were not set yet; save them and let it redeploy |
| Group never gets files | Bot privacy is on; BotFather `/setprivacy` → **Disable**, then send a new group message |

Railway **Logs** for the service are the first place to look after a failed send.
