/**
 * Character Hub helpers — Character as a first-class product object.
 * Uses existing store dual-write + messageStore previews. No new storage.
 */

import { store } from "../core/store.js";
import { getLastMessagePreview } from "./message-store.js";
import { createConversationForCharacter, getConversationsByCharacter } from "./conversation.js";
import { getCharacterById } from "./character.js";

const DEFAULT_AVATAR = "assets/avatars/default.svg";

export function resolveAvatarSrc(avatar) {
  if (!avatar || typeof avatar !== "string") return DEFAULT_AVATAR;
  const v = avatar.trim();
  if (!v) return DEFAULT_AVATAR;
  if (v.startsWith("blob:")) return DEFAULT_AVATAR;
  return v;
}

export function listCharactersForHub() {
  const chats = (store.getState().chats || []).filter((c) => !c.archivedAt);
  const map = new Map();
  for (const chat of chats) {
    const id = chat.roleId;
    if (!id) continue;
    const preview = getLastMessagePreview(chat.id);
    const lastAt = preview?.time || chat.createdAt || 0;
    // 身份取最早那轮对话：后开的对话名是会话标题（“第二对话”），不是角色名
    const bornAt = chat.createdAt || 0;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, {
        id,
        name: chat.name || "角色",
        avatar: resolveAvatarSrc(chat.avatar),
        conversationCount: 1,
        lastConversationId: chat.id,
        lastPreview: (preview?.text || "").slice(0, 40),
        lastAt,
        bornAt,
      });
    } else {
      existing.conversationCount += 1;
      // chats 是新→旧，同毫秒创建时用 <= 让后遍历到的那条（更旧的）胜出
      if (bornAt <= existing.bornAt) {
        existing.bornAt = bornAt;
        existing.name = chat.name || existing.name;
        existing.avatar = resolveAvatarSrc(chat.avatar || existing.avatar);
      }
      if (lastAt >= existing.lastAt) {
        existing.lastAt = lastAt;
        existing.lastConversationId = chat.id;
        existing.lastPreview = (preview?.text || existing.lastPreview || "").slice(0, 40);
      }
    }
  }
  return [...map.values()].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
}

export function listActiveConversations(characterId) {
  return getConversationsByCharacter(characterId)
    .filter((c) => !c.archivedAt)
    .map((c) => {
      const preview = getLastMessagePreview(c.id);
      return {
        ...c,
        lastPreview: preview?.text || "",
        lastAt: preview?.time || c.createdAt || 0,
      };
    })
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
}

export function continueCharacter(characterId) {
  const list = listActiveConversations(characterId);
  if (list.length) {
    store.selectChat(list[0].id);
    store.setActiveTab("messages");
    return list[0];
  }
  const chat = createConversationForCharacter(characterId, { title: "新对话" });
  store.setActiveTab("messages");
  return chat;
}

export async function startConversationForCharacter(characterId) {
  const char = await getCharacterById(characterId);
  const existing = getConversationsByCharacter(characterId)[0];
  const persona =
    (typeof char?.identity === "string" && char.identity) ||
    existing?.config?.persona ||
    "";
  const chat = createConversationForCharacter(characterId, {
    name: char?.name || existing?.name || "新对话",
    avatar: char?.avatar || existing?.avatar || "",
    persona,
    firstMessage: char?.personality?.firstMessage || "",
    title: char?.name || existing?.name || "新对话",
  });
  store.setActiveTab("messages");
  return chat;
}

export function setSelectedCharacter(characterId) {
  store.set((s) => ({ ...s, ui: { ...s.ui, selectedCharacterId: characterId || null } }));
}
