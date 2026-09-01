/**
 * Identify the character speaker vs the user from parsed messages.
 */

const USER_ALIASES = new Set(["我", "me", "user"]);

export function detectSpeakers(messages) {
  const counts = new Map();
  for (const m of messages || []) {
    const name = (m.speaker || "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const speakers = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const user = speakers.find((s) => USER_ALIASES.has(s.name.toLowerCase())) || speakers[1] || null;
  const character =
    speakers.find((s) => !user || s.name !== user.name) || speakers[0] || null;

  return {
    speakers,
    characterName: character?.name || null,
    userName: user?.name || null,
    characterCount: character ? counts.get(character.name) || 0 : 0,
    userCount: user ? counts.get(user.name) || 0 : 0,
  };
}

export function partitionBySpeaker(messages, characterName, userName) {
  const character = [];
  const user = [];
  for (const m of messages || []) {
    if (m.speaker === characterName) character.push(m);
    else if (userName && m.speaker === userName) user.push(m);
  }
  return { character, user };
}
