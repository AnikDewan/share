# Share

A private drop page: type a note, attach files, and your bot forwards both to Telegram.

GitHub Pages only hosts the static page. The bot token never goes in the frontend.

```
Browser  →  GitHub Pages (password gate)
         →  your bot server (checks password, uses BOT_TOKEN)
         →  Telegram
```

**Full setup (Telegram bot + Railway + GitHub Pages):** see **[docs/setup.md](docs/setup.md)**.

Live site: https://anikdewan.github.io/share/

## Quick map

| Piece | Where it lives |
|---|---|
| Website | `site/` on GitHub Pages |
| Webhook | `backend/server.mjs` on Railway |
| Bot token, chat id, password | Railway variables |
| Site password hash + webhook URL | GitHub Actions secrets, inlined at deploy |

## Local preview

```bash
export SITE_PASSWORD='dev-password'
export WEBHOOK_URL='http://127.0.0.1:8787/send'
node scripts/gen-site-config.mjs

SHARE_PASSWORD='dev-password' SHARE_DRY_RUN=1 node backend/server.mjs
python3 -m http.server 4173 --directory site
```

Open `http://127.0.0.1:4173`. Dry-run accepts drops without calling Telegram.
