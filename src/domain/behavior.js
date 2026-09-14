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

/** Frozen Memory → prompt header. Do not retune around a single hobby. */
export const FROZEN_USER_MEMORY_HEADER =
  "Known about the user (not about you). Leave it in the background unless this turn is clearly about it:";

/** Prompt-only subject. Stored memory text is unchanged. */
export function presentUserMemoryFact(content) {
  const raw = String(content || "").trim();
  if (!raw) return "";
  if (/^用户/.test(raw) || /^the user\b/i.test(raw)) return raw;
  if (/^I'm\s+/i.test(raw)) return raw.replace(/^I'm\s+/i, "The user is ");
  if (/^I\s+/i.test(raw)) return raw.replace(/^I\s+/i, "The user ");
  if (/^我们/.test(raw)) return `用户：${raw}`;
  if (/^我/.test(raw)) return `用户${raw.slice(1)}`;
  return raw;
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
    const lines = memList.map((m) => `- ${presentUserMemoryFact(m.content)}`);
    parts.push(`---\n${FROZEN_USER_MEMORY_HEADER}\n${lines.join("\n")}`);
  }

  const relOk = hasRelationshipSignal(affinity);
  if (relOk) {
    const days = affinity.knownDays != null ? ` Known for ${affinity.knownDays} days.` : "";
    const tone = affinity.toneHint ? ` Tone: ${affinity.toneHint}.` : "";
    const stage = affinity.stageLabel ? ` Stage: ${affinity.stageLabel}.` : "";
    const brief = affinity.brief ? ` Brief: ${affinity.brief}.` : "";
    const last = !affinity.brief && affinity.lastEvent ? ` Last: ${affinity.lastEvent}.` : "";
    parts.push(
      `---\nRelationship with the user (how you two relate, not the user's biography).${days}${tone}${stage}${brief}${last} Stay in character and keep this relationship tone.`
    );
  }

  if (gapReturn && memList.length && relOk) {
    parts.push(
      "---\nThis turn: continue the lived thread. The user is returning after a pause and may not restate what already happened. If a known fact about the user fits this greeting, touch it as something they have been doing — never as something you have been doing. Do not dump a dossier. Keep the relationship tone."
    );
  }

  return parts.join("\n\n");
}
