import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const password = (process.env.SITE_PASSWORD || "").trim();
const webhookUrl = (process.env.WEBHOOK_URL || "").trim();
const passwordHash = password
  ? createHash("sha256").update(password).digest("hex")
  : "";

const config = { webhookUrl, passwordHash };
writeFileSync(
  join(root, "site", "config.js"),
  `window.SHARE_CONFIG = ${JSON.stringify(config, null, 2)};\n`
);
console.log(
  passwordHash
    ? "Wrote site/config.js"
    : "Wrote site/config.js (empty — set SITE_PASSWORD and WEBHOOK_URL)"
);
