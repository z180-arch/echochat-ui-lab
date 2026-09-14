/**
 * Optional live OpenAI-compatible smoke. Never prints the key.
 * Reads gitignored `.echochat.local.json` or ECHOCHAT_PROBE_* env.
 * Exits 0 on skip so CI stays green without secrets.
 */
import { loadLocalSecrets } from "./load_local_secrets.mjs";

const secrets = loadLocalSecrets();
if (!secrets.hasKey) {
  console.log("provider_live_smoke: SKIP (no local key)");
  process.exit(0);
}

const url = `${secrets.baseUrl.replace(/\/+$/, "")}/chat/completions`;
const host = secrets.baseUrl.replace(/^https?:\/\//, "").split("/")[0];
const resp = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secrets.apiKey}`,
  },
  body: JSON.stringify({
    model: secrets.model,
    stream: true,
    max_tokens: 16,
    temperature: 0.2,
    messages: [
      { role: "system", content: "只回两个字：在的" },
      { role: "user", content: "在吗" },
    ],
  }),
});

if (!resp.ok) {
  console.log(`provider_live_smoke: FAIL http ${resp.status} host=${host}`);
  process.exit(1);
}

const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let text = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data);
      text += json.choices?.[0]?.delta?.content || "";
    } catch {
      // ignore
    }
  }
}

if (!String(text).trim()) {
  console.log(`provider_live_smoke: FAIL empty stream host=${host}`);
  process.exit(1);
}
console.log(`provider_live_smoke: PASS host=${host} model=${secrets.model} chars=${text.trim().length}`);
