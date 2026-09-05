/**
 * Character behavior context for prompt construction.
 * Not an agent framework — assembles persona + memory + relationship
 * for the current character only.
 */

function hasRelationshipSignal(affinity) {
  return !!(
    affinity &&
    (affinity.toneHint || affinity.knownDays || affinity.stageLabel || affinity.brief || affinity.lastEvent)
  );
}

export function buildBehaviorContext({ persona, slots, userPersona, memories, affinity, gapReturn } = {}) {
  const parts = [];
  const personaText =
    (slots && slots.identity) ||
    (typeof persona === "string" ? persona : persona?.persona || persona?.description || "");
  if (personaText) parts.push(personaText);
  if (slots?.scenario) parts.push(`---\nScenario:\n${slots.scenario}`);
  if (slots?.examples) parts.push(`---\nExample dialogue:\n${slots.examples}`);
  if (slots?.speakingStyle) parts.push(`---\nSpeaking style:\n${slots.speakingStyle}`);

  const user = typeof userPersona === "string" ? userPersona.trim() : "";
  if (user) parts.push(`---\nAbout how the user wants to be seen:\n${user}`);

  const memList = Array.isArray(memories) ? memories.filter((m) => m && m.content) : [];
  if (memList.length) {
    const lines = memList.map((m) => `- ${m.content}`);
    parts.push(`---\nAbout the user (remembered from past conversations):\n${lines.join("\n")}`);
  }

  const relOk = hasRelationshipSignal(affinity);
  if (relOk) {
    const days = affinity.knownDays != null ? ` Known for ${affinity.knownDays} days.` : "";
    const tone = affinity.toneHint ? ` Tone: ${affinity.toneHint}.` : "";
    const stage = affinity.stageLabel ? ` Stage: ${affinity.stageLabel}.` : "";
    const brief = affinity.brief ? ` Brief: ${affinity.brief}.` : "";
    const last = !affinity.brief && affinity.lastEvent ? ` Last: ${affinity.lastEvent}.` : "";
    parts.push(`---\nRelationship with the user.${days}${tone}${stage}${brief}${last} Stay in character and keep this relationship tone.`);
  }

  if (gapReturn && memList.length && relOk) {
    parts.push(
      "---\nThis turn: continue the lived thread. The user is returning after a pause and may not restate what already happened. If a remembered fact is relevant, let it shape this reply naturally. Do not dump a dossier. Keep the relationship tone."
    );
  }

  return parts.join("\n\n");
}
