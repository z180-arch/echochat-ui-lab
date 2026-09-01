/**
 * Heuristic structured extraction with evidence.
 * Does not invent personality. Insufficient samples stay unknown.
 */

import { detectSpeakers, partitionBySpeaker } from "./speakers.js";

export const MIN_CHARACTER_TURNS = 6;
export const MIN_TOTAL_TURNS = 8;

export const DIMENSIONS = [
  "personality",
  "speechStyle",
  "preferences",
  "background",
  "behavioralTraits",
  "memories",
  "relationshipClues",
];

export const DIMENSION_LABELS = {
  personality: "性格",
  speechStyle: "说话方式",
  preferences: "偏好",
  background: "背景",
  behavioralTraits: "行为习惯",
  memories: "重要记忆",
  relationshipClues: "关系线索",
};

function finding(id, dimension, text, evidence) {
  return {
    id,
    dimension,
    text,
    evidence: evidence.map((m) => ({ index: m.index, excerpt: String(m.text || "").slice(0, 80) })),
    accepted: true,
  };
}

function excerptEvidence(messages, max = 3) {
  return messages.slice(0, max);
}

export function assessSufficiency(messages, characterCount) {
  const total = (messages || []).length;
  const enough = characterCount >= MIN_CHARACTER_TURNS && total >= MIN_TOTAL_TURNS;
  return {
    sufficient: enough,
    characterTurns: characterCount,
    totalTurns: total,
    minCharacterTurns: MIN_CHARACTER_TURNS,
    minTotalTurns: MIN_TOTAL_TURNS,
    notice: enough
      ? null
      : `当前数据不足（角色发言 ${characterCount} 条，对话共 ${total} 条）。只能确定部分维度，其余需要你补充。至少需要角色 ${MIN_CHARACTER_TURNS} 条、对话 ${MIN_TOTAL_TURNS} 条。`,
  };
}

export function extractStructured(messages, speakerInfo) {
  const detected = speakerInfo || detectSpeakers(messages);
  const { character, user } = partitionBySpeaker(
    messages,
    detected.characterName,
    detected.userName
  );
  const sufficiency = assessSufficiency(messages, character.length);
  const findings = [];
  let n = 0;
  const nextId = () => `f${++n}`;

  if (character.length) {
    const sample = excerptEvidence(character, 3);
    const particles = character.filter((m) => /[呀呢吧嘛啊哦嗯]/.test(m.text)).length;
    const tone = particles / character.length > 0.3 ? "偏口语、带语气词" : "偏直接、干脆";
    findings.push(
      finding(nextId(), "personality", `从现有发言看，语气${tone}。`, sample)
    );

    const lengths = character.map((m) => m.text.length);
    const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
    const style =
      particles / character.length > 0.3
        ? `口语、带语气词，句子偏${avg < 18 ? "短" : "中等"}（约 ${avg} 字）。`
        : `表述相对干脆，句子均长约 ${avg} 字。`;
    findings.push(finding(nextId(), "speechStyle", style, excerptEvidence(character, 2)));
  }

  const prefHits = character.filter((m) => /喜欢|爱吃|想去|讨厌|不喜欢|受不了|like |love |hate /i.test(m.text));
  for (const m of prefHits.slice(0, 5)) {
    findings.push(finding(nextId(), "preferences", m.text, [m]));
  }

  const bgHits = character.filter((m) => /我是|我住|我家|工作|上学|以前|I am |I work |I live /i.test(m.text));
  for (const m of bgHits.slice(0, 4)) {
    findings.push(finding(nextId(), "background", m.text, [m]));
  }

  const traitHits = character.filter((m) => /总是|经常|从不|习惯|每次|always |usually |never /i.test(m.text));
  for (const m of traitHits.slice(0, 4)) {
    findings.push(finding(nextId(), "behavioralTraits", m.text, [m]));
  }

  const memHits = user.filter((m) => m.text.length >= 6);
  for (const m of memHits.slice(0, 5)) {
    findings.push(finding(nextId(), "memories", `用户说过：${m.text}`, [m]));
  }

  const relHits = [...character, ...user].filter((m) =>
    /想你|喜欢你|朋友|讨厌你|在一起|分手|见面/.test(m.text)
  );
  for (const m of relHits.slice(0, 4)) {
    findings.push(finding(nextId(), "relationshipClues", m.text, [m]));
  }

  const present = new Set(findings.map((f) => f.dimension));
  const determined = DIMENSIONS.filter((d) => present.has(d));
  const unknown = DIMENSIONS.filter((d) => !present.has(d));

  return {
    speakers: detected,
    sufficiency,
    findings,
    determined,
    unknown,
  };
}

export function composeIdentity(findings) {
  const accepted = (findings || []).filter((f) => f.accepted && f.text);
  const by = (dim) => accepted.filter((f) => f.dimension === dim).map((f) => f.text);
  const parts = [];
  const personality = by("personality");
  const speech = by("speechStyle");
  const prefs = by("preferences");
  const bg = by("background");
  const traits = by("behavioralTraits");
  if (personality.length) parts.push(personality.join(" "));
  if (speech.length) parts.push(`说话方式：${speech.join(" ")}`);
  if (prefs.length) parts.push(`偏好：${prefs.join("；")}`);
  if (bg.length) parts.push(`背景：${bg.join("；")}`);
  if (traits.length) parts.push(`习惯：${traits.join("；")}`);
  return parts.join("\n") || "";
}
