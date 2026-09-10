const MAX_FILES = 10;
const MAX_BYTES = 45 * 1024 * 1024;

const setupEl = document.getElementById("setup");
const gateEl = document.getElementById("gate");
const dropEl = document.getElementById("drop");
const gateForm = document.getElementById("gate-form");
const dropForm = document.getElementById("drop-form");
const passwordInput = document.getElementById("password");
const gateError = document.getElementById("gate-error");
const noteInput = document.getElementById("note");
const fileInput = document.getElementById("files");
const well = document.getElementById("well");
const fileList = document.getElementById("file-list");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");
const lockAgain = document.getElementById("lock-again");

const config = window.SHARE_CONFIG || { webhookUrl: "", passwordHash: "" };
const files = [];
let password = "";

init();

function init() {
  if (!config.webhookUrl || !config.passwordHash) {
    setupEl.classList.remove("hidden");
    return;
  }

  gateEl.classList.remove("hidden");
  gateForm.addEventListener("submit", onUnlock);
  dropForm.addEventListener("submit", onSend);
  lockAgain.addEventListener("click", lock);
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    well.addEventListener(eventName, (event) => {
      event.preventDefault();
      well.classList.add("drag");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    well.addEventListener(eventName, (event) => {
      event.preventDefault();
      well.classList.remove("drag");
    });
  });
  well.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
  document.addEventListener("paste", onPaste);
}

async function onUnlock(event) {
  event.preventDefault();
  gateError.textContent = "";
  const value = passwordInput.value.trim();
  if (!value) {
    gateError.textContent = "Enter the password.";
    return;
  }

  const hash = await sha256hex(value);
  if (hash !== config.passwordHash) {
    gateError.textContent = "Wrong password.";
    return;
  }

  password = value;
  passwordInput.value = "";
  gateEl.classList.add("hidden");
  dropEl.classList.remove("hidden");
  noteInput.focus();
}

function lock() {
  password = "";
  files.splice(0, files.length).forEach(revoke);
  renderFiles();
  noteInput.value = "";
  setStatus("");
  dropEl.classList.add("hidden");
  gateEl.classList.remove("hidden");
  passwordInput.focus();
}

function onPaste(event) {
  if (dropEl.classList.contains("hidden")) return;
  const pasted = [...(event.clipboardData?.files || [])];
  if (pasted.length) addFiles(pasted);
}

function addFiles(list) {
  for (const file of list) {
    if (files.length >= MAX_FILES) {
      setStatus(`You can attach up to ${MAX_FILES} files.`, "bad");
      break;
    }
    if (file.size > MAX_BYTES) {
      setStatus(`${file.name} is over 45 MB. Telegram will reject it.`, "bad");
      continue;
    }
    files.push({
      file,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    });
  }
  renderFiles();
}

function renderFiles() {
  fileList.innerHTML = "";
  files.forEach((entry, index) => {
    const row = document.createElement("li");
    row.className = "file-row";

    if (entry.url) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = "";
      img.src = entry.url;
      row.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "thumb";
      row.appendChild(placeholder);
    }

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.innerHTML = `<b>${escapeHtml(entry.file.name)}</b><small>${formatSize(entry.file.size)}</small>`;
    row.appendChild(meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-btn";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      const [gone] = files.splice(index, 1);
      revoke(gone);
      renderFiles();
    });
    row.appendChild(remove);
    fileList.appendChild(row);
  });
}

async function onSend(event) {
  event.preventDefault();
  const text = noteInput.value.trim();
  if (!text && files.length === 0) {
    setStatus("Add a note or at least one file.", "bad");
    return;
  }

  sendBtn.disabled = true;
  setStatus("Sending…");

  const body = new FormData();
  body.set("password", password);
  body.set("text", text);
  for (const entry of files) body.append("files", entry.file, entry.file.name);

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      body,
    });
    const payload = await readJson(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Send failed (${response.status})`);
    }
    files.splice(0, files.length).forEach(revoke);
    renderFiles();
    noteInput.value = "";
    setStatus("Delivered to Telegram.", "ok");
  } catch (error) {
    const message = String(error.message || error);
    const corsHint =
      message === "Failed to fetch"
        ? " Could not reach the bot server. Check WEBHOOK_URL and CORS."
        : "";
    setStatus(message + corsHint, "bad");
  } finally {
    sendBtn.disabled = false;
  }
}

async function sha256hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw.slice(0, 180) };
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind || ""}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function revoke(entry) {
  if (entry?.url) URL.revokeObjectURL(entry.url);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
