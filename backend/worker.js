const TG = "https://api.telegram.org";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true }, env);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Not found" }, env, 404);
    }

    if (!env.SHARE_PASSWORD) {
      return json({ ok: false, error: "SHARE_PASSWORD is not set" }, env, 500);
    }
    if (!env.BOT_TOKEN) {
      return json({ ok: false, error: "BOT_TOKEN is not set" }, env, 500);
    }

    try {
      const form = await request.formData();
      const password = String(form.get("password") || "").trim();
      if (password !== env.SHARE_PASSWORD) {
        return json({ ok: false, error: "Unauthorized" }, env, 401);
      }

      const text = String(form.get("text") || "").trim();
      const files = form
        .getAll("files")
        .filter((part) => part && typeof part === "object" && typeof part.arrayBuffer === "function" && part.size);

      if (!text && files.length === 0) {
        return json({ ok: false, error: "Add a note or at least one file." }, env, 400);
      }

      const chatId = await resolveChatId(env);
      const header = formatHeader(
        text,
        files.map((file) => file.name || "file")
      );
      for (const chunk of splitMessage(header)) {
        await telegram(env, "sendMessage", { chat_id: chatId, text: chunk });
      }
      for (const file of files) {
        const payload = new FormData();
        payload.set("chat_id", String(chatId));
        payload.set("document", file, file.name || "file");
        await telegramForm(env, "sendDocument", payload);
      }

      return json({ ok: true }, env);
    } catch (error) {
      return json({ ok: false, error: String(error.message || error) }, env, 500);
    }
  },
};

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(payload, env, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env) },
  });
}

async function resolveChatId(env) {
  if (env.TELEGRAM_CHAT_ID) return env.TELEGRAM_CHAT_ID;
  const data = await telegram(env, "getUpdates", {}, "GET");
  const last = [...(data.result || [])].reverse().find((item) => item.message?.chat?.id);
  if (!last) {
    throw new Error(
      "TELEGRAM_CHAT_ID is not set. Message your bot, then retry or set the env var."
    );
  }
  return last.message.chat.id;
}

function formatHeader(text, names) {
  const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const fileLine = names.length
    ? `${names.length} file${names.length === 1 ? "" : "s"}: ${names.join(", ")}`
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

async function telegram(env, method, payload, httpMethod = "POST") {
  const url = `${TG}/bot${env.BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: httpMethod,
    headers: httpMethod === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: httpMethod === "POST" ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data;
}

async function telegramForm(env, method, form) {
  const response = await fetch(`${TG}/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data;
}
