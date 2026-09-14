/**
 * Browser Web Speech API dictation. Independent of the chat Provider.
 * Fills the composer; does not send. TTS stays in voice.js.
 */

let recognition = null;
let listening = false;

export function getSpeechRecognitionCtor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

export function isSttSupported() {
  return typeof getSpeechRecognitionCtor() === "function";
}

export function isDictating() {
  return listening;
}

export function joinDictation(base, extra) {
  const a = String(base || "");
  const b = String(extra || "");
  if (!b) return a;
  if (!a) return b;
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b;
  if (/^[，。！？、；：,.!?;:]/.test(b)) return a + b;
  const cjk = /[\u4e00-\u9fff]$/.test(a) && /^[\u4e00-\u9fff]/.test(b);
  return a + (cjk ? "" : " ") + b;
}

export function sttErrorMessage(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "麦克风权限被拒绝";
    case "no-speech":
      return "没听清，点一下再试";
    case "audio-capture":
      return "找不到麦克风";
    case "network":
      return "语音识别需要网络";
    case "aborted":
      return "";
    default:
      return "";
  }
}

export function sttSupportNote() {
  if (!isSttSupported()) {
    return "当前浏览器没有语音识别。Chrome、Edge 和 Safari 可以用。";
  }
  return "说完会填进输入框，不会自动发送。识别走系统语音服务，不经过聊天模型。";
}

export function stopDictation() {
  const rec = recognition;
  recognition = null;
  listening = false;
  if (!rec) return;
  try {
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
  } catch {
    // ignore
  }
  try {
    rec.stop();
  } catch {
    // ignore
  }
  try {
    rec.abort();
  } catch {
    // ignore
  }
}

export function startDictation(opts = {}) {
  stopDictation();
  const Ctor = getSpeechRecognitionCtor();
  if (typeof Ctor !== "function") return { ok: false, reason: "unsupported" };
  let rec;
  try {
    rec = new Ctor();
  } catch {
    return { ok: false, reason: "unsupported" };
  }
  rec.lang = opts.lang || "zh-CN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  recognition = rec;
  listening = true;

  rec.onresult = (event) => {
    let interim = "";
    let finalText = "";
    const results = event?.results;
    if (!results) return;
    const start = Number.isFinite(event.resultIndex) ? event.resultIndex : 0;
    for (let i = start; i < results.length; i++) {
      const r = results[i];
      const t = r?.[0]?.transcript || "";
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    if (finalText && typeof opts.onFinal === "function") opts.onFinal(finalText);
    else if (interim && typeof opts.onInterim === "function") opts.onInterim(interim);
  };
  rec.onerror = (e) => {
    listening = false;
    if (recognition === rec) recognition = null;
    const code = e?.error || "error";
    if (typeof opts.onError === "function") opts.onError(code);
  };
  rec.onend = () => {
    listening = false;
    if (recognition === rec) recognition = null;
    if (typeof opts.onEnd === "function") opts.onEnd();
  };
  try {
    rec.start();
  } catch (err) {
    listening = false;
    recognition = null;
    return { ok: false, reason: err?.message || "start-failed" };
  }
  return { ok: true };
}
