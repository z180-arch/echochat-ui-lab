/**
 * Character behavior context for prompt construction.
 * Not an agent framework — assembles persona + memory + relationship
 * for the current character only.
 */

export function buildBehaviorContext({ persona, memories, affinity } = {}) {
  const parts = [];
  const personaText = typeof persona === "string" ? persona : persona?.persona || persona?.description || "";
  if (personaText) parts.push(personaText);

  const memList = Array.isArray(memories) ? memories.filter((m) => m && m.content) : [];
  if (memList.length) {
    const lines = memList.map((m) => `- ${m.content}`);
    parts.push(`---\nAbout the user (remembered from past conversations):\n${lines.join("\n")}`);
  }

  if (affinity && (affinity.toneHint || affinity.knownDays)) {
    const days = affinity.knownDays != null ? ` Known for ${affinity.knownDays} days.` : "";
    const tone = affinity.toneHint ? ` Tone: ${affinity.toneHint}.` : "";
    parts.push(`---\nRelationship with the user.${days}${tone} Stay in character and keep this relationship tone.`);
  }

  return parts.join("\n\n");
}
