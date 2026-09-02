// ============================================================
//  EchoChat · Assistant reply cleaner
//  去掉模型爱加的表情括号、情绪标签、舞台指示；
//  保留正常聊天里的补充说明。只处理 AI 回复，不碰用户消息。
// ============================================================

const STAGE_WORDS =
  /^(?:笑眯眯|微笑|笑|轻笑|偷笑|苦笑|傻笑|憋笑|坏笑|冷笑|干笑|哈哈|呵呵|嘿嘿|嘻嘻|噗|哼|嗯|嘟囔|小声|轻声|低声|沉默|叹气|皱眉|眨眼|脸红|害羞|点头|摇头|歪头|歪着头|低头|抬头|挥手|鼓掌|凑近|靠近|拥抱|抱抱|拍拍|耸肩|愣住|顿了顿|看向你|看着你|smiles?|laughs?|grins?|chuckles?|giggles?|sighs?|blushes?|nods?|winks?|shrugs?|pauses?|smirks?)$/i;

function isMostlyStage(inner) {
  const t = String(inner || "").trim().replace(/[。.…·\s]+$/g, "");
  if (!t) return true;
  if (/[0-9]/.test(t)) return false;
  if (/[吗呢吧呀？。！?!，,：:、]/.test(t)) return false;
  // 情绪标签可以比普通动作指示更长：[Cute(Convincing)/撒娇]
  if (/[\/／]/.test(t) && t.length <= 40) return true;
  if (/^[A-Za-z][A-Za-z ]{0,20}\([^)]{1,24}\)$/.test(t)) return true;
  if (t.length > 12) return false;
  if (STAGE_WORDS.test(t)) return true;
  if (/^(?:走|站|坐|看|望|靠|抱|拍|叹|笑|皱|眨|歪|点|摇|低|抬|挥|凑).{0,6}$/.test(t) && t.length <= 8) {
    return true;
  }
  return false;
}

function stripStageParens(s) {
  return s.replace(/[（(]([^）)]{1,24})[）)]/g, (full, inner) => (isMostlyStage(inner) ? "" : full));
}

function stripStageBrackets(s) {
  // 不碰 markdown 链接 [text](url)
  return s.replace(/\[([^\]\n]{1,48})\](?!\()/g, (full, inner) => (isMostlyStage(inner) ? "" : full));
}

function stripStageCjkBrackets(s) {
  return s.replace(/【([^】]{1,24})】/g, (full, inner) => (isMostlyStage(inner) ? "" : full));
}

function stripStarActions(s) {
  return s.replace(/\*([^*\n]{1,40})\*/g, (full, inner) => (isMostlyStage(inner) ? "" : full));
}

export function cleanAssistantReply(text) {
  if (text == null) return "";
  let s = String(text);
  s = stripStageBrackets(s);
  s = stripStageCjkBrackets(s);
  s = stripStarActions(s);
  s = stripStageParens(s);
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export const MAX_USER_MESSAGE_CHARS = 2000;

export function assertUserMessageLength(text) {
  const n = String(text || "").length;
  return n <= MAX_USER_MESSAGE_CHARS;
}
