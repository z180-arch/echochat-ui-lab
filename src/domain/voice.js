/**
 * Browser speechSynthesis TTS. Dictation lives in stt.js — do not couple either to the chat Provider.
 */

import { store } from "../core/store.js";

let currentUtterance = null;

function synth() {
  return typeof globalThis.speechSynthesis !== "undefined" ? globalThis.speechSynthesis : null;
}

export function isSpeechSupported() {
  return !!synth() && typeof globalThis.SpeechSynthesisUtterance === "function";
}

export function stopSpeech() {
  currentUtterance = null;
  const s = synth();
  if (!s) return;
  try {
    s.cancel();
  } catch {
    // ignore
  }
}

export function speakText(text, opts = {}) {
  const engine = synth();
  if (!engine || typeof globalThis.SpeechSynthesisUtterance !== "function") return false;
  const body = String(text || "").trim();
  if (!body) return false;
  stopSpeech();
  const u = new globalThis.SpeechSynthesisUtterance(body.slice(0, 4000));
  const settings = store.getState().settings || {};
  u.lang = opts.lang || settings.voiceLang || "zh-CN";
  const rate = Number(opts.rate != null ? opts.rate : settings.voiceRate);
  u.rate = Number.isFinite(rate) && rate > 0 ? Math.min(2, Math.max(0.5, rate)) : 1;
  currentUtterance = u;
  u.onend = () => {
    if (currentUtterance === u) currentUtterance = null;
  };
  engine.speak(u);
  return true;
}

export function speakAssistantMessage(message) {
  const settings = store.getState().settings || {};
  if (!settings.ttsEnabled) return false;
  const text = message?.text || message;
  return speakText(text);
}

export function isSpeaking() {
  const s = synth();
  return !!(currentUtterance && s && s.speaking);
}
