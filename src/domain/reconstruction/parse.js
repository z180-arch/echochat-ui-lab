/**
 * Parse plain-text chat logs into numbered messages.
 * MVP input is text only — not WeChat/WhatsApp export files.
 */

const LINE_RE = /^([^:：\n]{1,32})[:：]\s*(.+)$/;

function stripLinePrefix(line) {
  return line
    .replace(/^\[.*?\]\s*/, "")
    .replace(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s+/, "")
    .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s+/, "");
}

function looksLikeJsonDocument(text) {
  const t = text.trim();
  if (t.startsWith("{")) return true;
  if (/^\[\s*[{"]/.test(t)) return true;
  return false;
}

function isPlausibleSpeaker(name) {
  if (!name) return false;
  if (/[{}"\[\]\\]/.test(name)) return false;
  if (/^https?:/i.test(name)) return false;
  return true;
}

export function parseChatTranscript(raw) {
  if (raw == null) return { ok: false, error: "empty", messages: [] };
  const text = String(raw).replace(/^\uFEFF/, "").trim();
  if (!text) return { ok: false, error: "empty", messages: [] };
  if (looksLikeJsonDocument(text)) return { ok: false, error: "no-messages", messages: [] };

  const messages = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = stripLinePrefix(line.trim());
    if (!trimmed) continue;
    const m = trimmed.match(LINE_RE);
    if (!m) continue;
    const speaker = m[1].trim();
    const content = m[2].trim();
    if (!isPlausibleSpeaker(speaker) || !content) continue;
    messages.push({
      index: messages.length + 1,
      speaker,
      text: content,
    });
  }

  if (!messages.length) return { ok: false, error: "no-messages", messages: [] };
  return { ok: true, error: null, messages };
}

export function messagesFromEchoChat(history, characterName = "角色") {
  const list = Array.isArray(history) ? history : [];
  const messages = [];
  for (const m of list) {
    const text = String(m?.text || "").trim();
    if (!text) continue;
    const speaker = m.role === "me" ? "我" : characterName || "角色";
    messages.push({
      index: messages.length + 1,
      speaker,
      text,
    });
  }
  if (!messages.length) return { ok: false, error: "no-messages", messages: [] };
  return { ok: true, error: null, messages };
}
