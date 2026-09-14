/**
 * Load probe credentials from env or gitignored `.echochat.local.json`.
 * Never log the key.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_FILE = join(ROOT, ".echochat.local.json");

export function loadLocalSecrets() {
  let file = {};
  if (existsSync(LOCAL_FILE)) {
    try {
      file = JSON.parse(readFileSync(LOCAL_FILE, "utf8")) || {};
    } catch {
      file = {};
    }
  }
  const apiKey = String(process.env.ECHOCHAT_PROBE_API_KEY || file.ECHOCHAT_PROBE_API_KEY || file.apiKey || "").trim();
  const baseUrl = String(
    process.env.ECHOCHAT_PROBE_BASE_URL || file.ECHOCHAT_PROBE_BASE_URL || file.baseUrl || "https://api.siliconflow.cn/v1"
  ).replace(/\/+$/, "");
  const model = String(
    process.env.ECHOCHAT_PROBE_MODEL || file.ECHOCHAT_PROBE_MODEL || file.model || "Qwen/Qwen2.5-7B-Instruct"
  ).trim();
  return { apiKey, baseUrl, model, hasKey: !!apiKey };
}
