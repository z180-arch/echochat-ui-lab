/**
 * Companion outreach — wires existing rollProactive to a real last-talk line.
 * Never invents content. Never records a chat turn.
 */

import { store } from "../core/store.js";
import { listCharactersForHub } from "./character-hub.js";
import { peekMessages, addMessage } from "./message-store.js";
import { listMoments } from "./moments.js";
import { rollProactive, markProactiveSent } from "./relations.js";

function clip(text, max = 22) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const cap = Number(max) || 22;
  return s.length > cap ? `${s.slice(0, cap)}…` : s;
}

export function composeOutreachLine(person, latestMoment) {
  const last = clip(person?.lastPreview, 22);
  const moment = clip(latestMoment?.content, 18);
  if (moment && last) return `还记得${moment}吗。上次说到「${last}」…`;
  if (last) return `上次说到「${last}」，后来怎样了？`;
  if (moment) return `还记得${moment}吗。`;
  return "";
}

export function outreachEnabledFromSettings(settings) {
  return settings?.outreachEnabled !== false;
}

/**
 * @param {{ now?: number, rng?: () => number, persist?: boolean, outreachEnabled?: boolean }} [opts]
 * @returns {Promise<Array<{ roleId: string, chatId: string, text: string }>>}
 */
export async function considerOutreach(opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const persist = opts.persist !== false;
  const enabled =
    opts.outreachEnabled != null ? !!opts.outreachEnabled : outreachEnabledFromSettings(store.getState().settings);
  if (!enabled) return [];

  const sent = [];
  for (const person of listCharactersForHub()) {
    if (!person?.id || !person.lastConversationId) continue;
    const msgs = peekMessages(person.lastConversationId) || [];
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.metadata?.outreach) continue;
    const latestMoment = (listMoments(person.id) || [])[0] || null;
    const text = composeOutreachLine(person, latestMoment);
    if (!text) continue;
    const roll = rollProactive(person.id, { now, moments: listMoments(person.id) }, rng);
    if (!roll.ok || !roll.roll) continue;
    if (persist) {
      await addMessage(person.lastConversationId, {
        role: "her",
        text,
        status: "sent",
        metadata: { outreach: true },
      });
      markProactiveSent(person.id, now);
    }
    sent.push({ roleId: person.id, chatId: person.lastConversationId, text });
  }
  return sent;
}
