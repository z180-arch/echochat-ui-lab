// ============================================================
//  EchoChat Rebuild · Persona / Character Manager
//  角色管理：稳定 roleId、人设、角色卡导入导出
//  解决：roleKey = hash(persona) 导致人设变更数据失联的问题
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid, esc } from "../core/utils.js";
import { Character } from "./character.js";
import { ConversationRepository } from "../repository/conversation.js";
import { messageStore } from "./message-store.js";

const CFG = window.ECHOCHAT_CONFIG || {};

// 获取角色的稳定 ID（优先 roleId，兼容旧 roleKey）
export function getRoleId(chat) {
  if (!chat) return null;
  return chat.roleId || chat.config?.memRoleKey || null;
}

// 获取角色人设（chat 级优先，全局兜底）
export function getPersona(chat) {
  if (!chat) return "";
  return (chat.config && chat.config.persona) || store.getState().global.persona || "";
}

// 设置角色人设（不改变 roleId）
export function setPersona(chatId, persona) {
  store.updateChat(chatId, {
    config: { ...(store.getCurrentChat()?.config || {}), persona },
  });
}

// 获取角色名
export function getRoleName(chat) {
  if (!chat) return "角色";
  return chat.name || "角色";
}

// 获取角色头像
export function getRoleAvatar(chat) {
  if (!chat) return "assets/avatars/default.svg";
  return chat.avatar || "assets/avatars/default.svg";
}

// 从模板创建角色
export function createFromTemplate(tpl) {
  const roleId = "role_" + uid();
  const chat = store.createChat({
    roleId,
    name: tpl.name,
    avatar: tpl.avatar,
    persona: tpl.persona,
    firstMessage: tpl.firstMessage,
  });
  Character.createCharacter({
    id: roleId,
    name: tpl.name,
    avatar: tpl.avatar,
    identity: tpl.persona,
    personality: {
      description: tpl.persona,
      firstMessage: tpl.firstMessage,
    },
    appearance: { avatar: tpl.avatar || null },
  }).catch((e) => console.warn("[Persona] character create failed:", e.message));
  ConversationRepository.create({
    id: chat.id,
    characterId: roleId,
    title: chat.name,
    config: chat.config,
    createdAt: chat.createdAt,
  }).catch((e) => console.warn("[Persona] conversation create failed:", e.message));
  messageStore.migrateChatMessages(chat.id).catch(() => {});
  return chat;
}

// 系统模板列表（从 config 读取）
export function getSystemTemplates(gender) {
  const tpls = CFG.systemTemplates || { female: [], male: [] };
  if (gender === "female") return tpls.female || [];
  if (gender === "male") return tpls.male || [];
  return [...(tpls.female || []), ...(tpls.male || [])];
}

// 构建角色卡 JSON（兼容 SillyTavern 格式）
export function buildCharacterCard(chat) {
  const persona = getPersona(chat);
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: getRoleName(chat),
      description: persona,
      personality: "",
      scenario: "",
      first_mes: messageStore.peekMessages(chat.id)?.[0]?.text || "",
      mes_example: "",
      creator_notes: "Exported from EchoChat",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "EchoChat",
      character_version: "1.0",
      extensions: {
        echochat: {
          roleId: getRoleId(chat),
          avatar: chat.avatar || "",
          exportedAt: Date.now(),
        },
      },
    },
  };
}

// 解析角色卡 JSON
export function parseCharacterCard(json) {
  try {
    const obj = typeof json === "string" ? JSON.parse(json) : json;
    // v2 格式
    if (obj.data) {
      return {
        name: obj.data.name || "导入角色",
        persona: obj.data.description || "",
        firstMessage: obj.data.first_mes || "",
        avatar: obj.data.extensions?.echochat?.avatar || "",
        worldbook: obj.data.character_book || null,
      };
    }
    // v1 格式
    return {
      name: obj.name || "导入角色",
      persona: obj.description || obj.persona || "",
      firstMessage: obj.first_mes || "",
      avatar: obj.avatar || "",
      worldbook: obj.character_book || null,
    };
  } catch (e) {
    return null;
  }
}

// 用户人设预设库
export function getUserPersonaPresets() {
  return store.getState().userPersonaPresets || [];
}

export function addUserPersonaPreset(preset) {
  const p = { id: uid(), createdAt: Date.now(), ...preset };
  store.set((s) => ({
    ...s,
    userPersonaPresets: [...s.userPersonaPresets, p],
  }));
  return p;
}

export function deleteUserPersonaPreset(id) {
  store.set((s) => ({
    ...s,
    userPersonaPresets: s.userPersonaPresets.filter((p) => p.id !== id),
  }));
}

export const Persona = {
  getRoleId,
  getPersona,
  setPersona,
  getRoleName,
  getRoleAvatar,
  createFromTemplate,
  getSystemTemplates,
  buildCharacterCard,
  parseCharacterCard,
  getUserPersonaPresets,
  addUserPersonaPreset,
  deleteUserPersonaPreset,
};
