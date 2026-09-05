#!/usr/bin/env node
/**
 * Optional live-LLM probe. Not CI. Not product proof by itself.
 *
 *   set ECHOCHAT_PROBE_BASE_URL / ECHOCHAT_PROBE_API_KEY / ECHOCHAT_PROBE_MODEL
 *   node scripts/lived_thread_llm_probe.mjs
 *
 * Exits 0 on skip (no key) so it never fakes a pass in CI.
 */
const baseUrl = String(process.env.ECHOCHAT_PROBE_BASE_URL || "").replace(/\/+$/, "");
const apiKey = String(process.env.ECHOCHAT_PROBE_API_KEY || "").trim();
const model = String(process.env.ECHOCHAT_PROBE_MODEL || "Qwen/Qwen2.5-7B-Instruct");

if (!baseUrl || !apiKey) {
  console.log("lived_thread_llm_probe: SKIP (set ECHOCHAT_PROBE_BASE_URL and ECHOCHAT_PROBE_API_KEY to run)");
  process.exit(0);
}

const dump = `温柔安静的陪伴者

---
About the user (remembered from past conversations):
- 用户很怕坐飞机，长途飞行会慌

---
Relationship with the user. Known for 5 days. Tone: 略亲近. Stage: 渐渐熟悉. Brief: 上次聊到出差前的紧张. Stay in character and keep this relationship tone.`;

const coupled = `${dump}

---
This turn: continue the lived thread. The user is returning after a pause and may not restate what already happened. If a remembered fact is relevant, let it shape this reply naturally. Do not dump a dossier. Keep the relationship tone.`;

const user = "后天要出差，我有点慌";

async function complete(system) {
  const url = `${baseUrl}/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 120,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${await resp.text()}`);
  const json = await resp.json();
  return String(json.choices?.[0]?.message?.content || "");
}

function mentionsFlight(text) {
  return /飞机|飞行|怕/.test(text);
}

const dumpReply = await complete(dump);
const coupledReply = await complete(coupled);
const dumpHit = mentionsFlight(dumpReply);
const coupledHit = mentionsFlight(coupledReply);

console.log("--- dump-only ---\n" + dumpReply);
console.log("--- coupled ---\n" + coupledReply);
console.log(JSON.stringify({ dumpHit, coupledHit, model }));

if (!coupledHit) {
  console.error("probe: coupled prompt did not yield a flight mention — real model may ignore Lived Thread");
  process.exit(1);
}
console.log("probe: coupled prompt produced a flight-related reply (single-sample, not a product proof)");
