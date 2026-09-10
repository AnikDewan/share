import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const SHARE_PASSWORD = process.env.SHARE_PASSWORD || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const DRY_RUN = process.env.SHARE_DRY_RUN === "1";
const MAX_BODY = 55 * 1024 * 1024;
const TG = "https://api.telegram.org";

const rate = new Map();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method !== "POST" || (url.pathname !== "/send" && url.pathname !== "/")) {
      json(res, 404, { ok: false, error: "Not found" });
      return;
    }

    if (!SHARE_PASSWORD) {
      json(res, 500, { ok: false, error: "SHARE_PASSWORD is not set" });
      return;
    }
    if (!DRY_RUN && !BOT_TOKEN) {
      json(res, 500, { ok: false, error: "BOT_TOKEN is not set" });
      return;
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    if (tooMany(ip)) {
      json(res, 429, { ok: false, error: "Too many requests. Try again later." });
      return;
    }

    const length = Number(req.headers["content-length"] || 0);
    if (length > MAX_BODY) {
      json(res, 413, { ok: false, error: "Payload too large" });
      return;
    }

    const body = await readBody(req, MAX_BODY);
    const contentType = req.headers["content-type"] || "";
    const parsed = contentType.includes("multipart/form-data")
      ? parseMultipart(body, contentType)
      : { fields: Object.fromEntries(urlEncoded(body)), files: [] };

    const password = String(parsed.fields.password || "").trim();
    if (!safeEqual(password, SHARE_PASSWORD)) {
      hit(ip, true);
      json(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const text = String(parsed.fields.text || "").trim();
    const files = parsed.files.filter((file) => file.filename && file.data.length);
    if (!text && files.length === 0) {
      json(res, 400, { ok: false, error: "Add a note or at least one file." });
      return;
    }

    hit(ip, false);

    if (DRY_RUN) {
      json(res, 200, {
        ok: true,
        dryRun: true,
        text,
        files: files.map((file) => ({ name: file.filename, bytes: file.data.length })),
      });
      return;
    }

    const chatId = await resolveChatId();
    const header = formatHeader(text, files);
    for (const chunk of splitMessage(header)) {
      await telegram("sendMessage", { chat_id: chatId, text: chunk });
    }
    for (const file of files) {
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set(
        "document",
        new Blob([new Uint8Array(file.data)], {
          type: file.type || "application/octet-stream",
        }),
        file.filename
      );
      await telegramForm("sendDocument", form);
    }

    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 500, { ok: false, error: String(error.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`Share bot listening on http://127.0.0.1:${PORT}`);
});

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res, status, payload) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function safeEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function tooMany(ip) {
  const now = Date.now();
  const rec = rate.get(ip);
  if (!rec) return false;
  rec.fails = rec.fails.filter((t) => now - t < 15 * 60 * 1000);
  rec.ok = rec.ok.filter((t) => now - t < 60 * 60 * 1000);
  return rec.fails.length >= 10 || rec.ok.length >= 40;
}

function hit(ip, failed) {
  const rec = rate.get(ip) || { fails: [], ok: [] };
  rec[failed ? "fails" : "ok"].push(Date.now());
  rate.set(ip, rec);
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function urlEncoded(body) {
  return new URLSearchParams(body.toString("utf8"));
}

function parseMultipart(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) throw new Error("Missing multipart boundary");
  const boundary = match[1] || match[2];
  const rawParts = body.toString("latin1").split(`--${boundary}`);
  const fields = {};
  const files = [];

  for (let raw of rawParts) {
    if (!raw || raw === "--" || raw === "--\r\n") continue;
    if (raw.startsWith("\r\n")) raw = raw.slice(2);
    if (raw.endsWith("--\r\n")) raw = raw.slice(0, -4);
    else if (raw.endsWith("\r\n")) raw = raw.slice(0, -2);
    if (raw === "--") continue;

    const headerEnd = raw.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = raw.slice(0, headerEnd);
    const data = Buffer.from(raw.slice(headerEnd + 4), "latin1");
    const nameMatch = /name="([^"]+)"/i.exec(header);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const fileMatch = /filename="([^"]*)"/i.exec(header);
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);

    if (fileMatch) {
      if (!fileMatch[1]) continue;
      files.push({
        field: name,
        filename: fileMatch[1],
        type: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
        data,
      });
    } else {
      fields[name] = data.toString("utf8");
    }
  }

  return { fields, files };
}

async function resolveChatId() {
  if (TELEGRAM_CHAT_ID) return TELEGRAM_CHAT_ID;
  const data = await telegram("getUpdates", {}, "GET");
  const last = [...(data.result || [])].reverse().find((item) => item.message?.chat?.id);
  if (!last) {
    throw new Error(
      "TELEGRAM_CHAT_ID is not set. Message your bot, then retry or set the env var."
    );
  }
  return last.message.chat.id;
}

function formatHeader(text, files) {
  const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const names = files.map((file) => file.filename).join(", ");
  const fileLine = files.length
    ? `${files.length} file${files.length === 1 ? "" : "s"}: ${names}`
    : "No files";
  return [`Drop · ${when}`, fileLine, text].filter(Boolean).join("\n\n");
}

function splitMessage(text) {
  const chunks = [];
  let rest = text;
  while (rest.length > 4096) {
    chunks.push(rest.slice(0, 4096));
    rest = rest.slice(4096);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function telegram(method, payload, httpMethod = "POST") {
  const url = `${TG}/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: httpMethod,
    headers: httpMethod === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: httpMethod === "POST" ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data;
}

async function telegramForm(method, form) {
  const response = await fetch(`${TG}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data;
}
