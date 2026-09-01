/**
 * Character Reconstruction MVP
 *
 * Plain-text chat log → parse → speakers → structured findings with evidence
 * → user review → CharacterRepository (existing contract).
 *
 * Local heuristics are the default so reconstruction works without an API key.
 * Nothing is written until confirmReconstruction().
 */

import { parseChatTranscript, messagesFromEchoChat } from "./parse.js";
import { detectSpeakers, partitionBySpeaker } from "./speakers.js";
import { extractStructured, composeIdentity } from "./extract.js";
import { createFromTemplate, getRoleName } from "../persona.js";
import { addMemory } from "../memory.js";
import { recordChatTurn } from "../relations.js";
import { peekMessages } from "../message-store.js";
import { store } from "../../core/store.js";

export { parseChatTranscript, messagesFromEchoChat } from "./parse.js";
export { detectSpeakers } from "./speakers.js";
export {
  extractStructured,
  composeIdentity,
  assessSufficiency,
  DIMENSIONS,
  DIMENSION_LABELS,
} from "./extract.js";

export function buildReconstructionDraft(rawText, options = {}) {
  const parsed = parseChatTranscript(rawText);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, draft: null };
  }
  return draftFromMessages(parsed.messages, options);
}

export function buildDraftFromConversation(chatId, options = {}) {
  const chat = store.getState().chats.find((c) => c.id === chatId) || store.getCurrentChat();
  if (!chat) return { ok: false, error: "no-chat", draft: null };
  const history = peekMessages(chat.id);
  const parsed = messagesFromEchoChat(history, getRoleName(chat));
  if (!parsed.ok) return { ok: false, error: parsed.error, draft: null };
  return draftFromMessages(parsed.messages, { ...options, nameHint: getRoleName(chat) });
}

function draftFromMessages(messages, options = {}) {
  let speakers = detectSpeakers(messages);
  if (options.characterName) {
    speakers = {
      ...speakers,
      characterName: options.characterName,
      characterCount: messages.filter((m) => m.speaker === options.characterName).length,
    };
  }
  const extracted = extractStructured(messages, speakers);
  return {
    ok: true,
    error: null,
    draft: {
      messages,
      speakers: extracted.speakers,
      sufficiency: extracted.sufficiency,
      findings: extracted.findings,
      determined: extracted.determined,
      unknown: extracted.unknown,
      name: options.nameHint || extracted.speakers.characterName || "重建角色",
    },
  };
}

export function setDraftCharacterSpeaker(draft, characterName) {
  if (!draft) return draft;
  const detected = detectSpeakers(draft.messages);
  const userName =
    detected.speakers.find((s) => s.name !== characterName)?.name || detected.userName;
  const speakers = {
    ...detected,
    characterName,
    userName,
    characterCount: draft.messages.filter((m) => m.speaker === characterName).length,
    userCount: userName ? draft.messages.filter((m) => m.speaker === userName).length : 0,
  };
  const extracted = extractStructured(draft.messages, speakers);
  return {
    ...draft,
    speakers: { ...extracted.speakers, characterName, userName },
    sufficiency: extracted.sufficiency,
    findings: extracted.findings,
    determined: extracted.determined,
    unknown: extracted.unknown,
    name: characterName || draft.name,
  };
}

export function setDraftName(draft, name) {
  if (!draft) return draft;
  const trimmed = String(name || "").trim();
  return { ...draft, name: trimmed || draft.name };
}

export function setFindingAccepted(draft, findingId, accepted) {
  if (!draft) return draft;
  return {
    ...draft,
    findings: draft.findings.map((f) => (f.id === findingId ? { ...f, accepted: !!accepted } : f)),
  };
}

export function editFindingText(draft, findingId, text) {
  if (!draft) return draft;
  return {
    ...draft,
    findings: draft.findings.map((f) => (f.id === findingId ? { ...f, text: String(text || "") } : f)),
  };
}

export async function confirmReconstruction(draft) {
  if (!draft || !draft.messages?.length) return { ok: false, error: "no-draft" };
  const accepted = (draft.findings || []).filter((f) => f.accepted && f.text);
  const identity = composeIdentity(accepted);
  const first = partitionBySpeaker(draft.messages, draft.speakers.characterName, draft.speakers.userName)
    .character[0];
  const name = String(draft.name || draft.speakers.characterName || "重建角色").trim() || "重建角色";
  const speech = accepted.filter((f) => f.dimension === "speechStyle").map((f) => f.text);
  const prefs = accepted.filter((f) => f.dimension === "preferences").map((f) => f.text);
  const chat = await createFromTemplate({
    name,
    persona: identity || `${name}。由聊天记录重建，人设仍可补充。`,
    firstMessage: first?.text || "我在。",
    avatar: "assets/avatars/default.svg",
    source: "reconstructed",
    speakingStyle: { notes: speech.join(" ") },
    preferences: { notes: prefs.join("；") },
  });
  const characterId = chat.roleId;

  for (const f of accepted.filter((x) => x.dimension === "memories")) {
    addMemory(characterId, f.text.replace(/^用户说过：/, ""), 6, "reconstruction");
  }
  if (accepted.some((f) => f.dimension === "relationshipClues")) {
    recordChatTurn(characterId, name);
  }

  return {
    ok: true,
    characterId,
    chatId: chat.id,
    acceptedCount: accepted.length,
    insufficient: !draft.sufficiency?.sufficient,
  };
}
