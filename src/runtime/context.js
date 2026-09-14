/**
 * Unified turn context. Holds existing EchoChat domain objects as-is.
 * Plugins may return a new object; they must not persist domain writes here.
 */

/**
 * @typedef {Object} EchoSession
 * @property {string} [chatId]
 * @property {string} [query]
 * @property {string} [extraPrompt] sync plugin append for the system prompt
 */

/**
 * @typedef {Object} EchoContext
 * @property {object|null} [character] Character or current chat (src/domain/character.js)
 * @property {object|null} [conversation] Conversation / chat record
 * @property {object[]|null} [memory] retrieved memories for this turn
 * @property {object|null} [relationship] affinity brief from relations.js
 * @property {string|null} [world] worldbook block text
 * @property {object[]|null} [moments]
 * @property {EchoSession|null} [session]
 */

/**
 * @param {Partial<EchoContext>} [fields]
 * @returns {EchoContext}
 */
export function createEchoContext(fields = {}) {
  return {
    character: fields.character ?? null,
    conversation: fields.conversation ?? null,
    memory: fields.memory ?? null,
    relationship: fields.relationship ?? null,
    world: fields.world ?? null,
    moments: fields.moments ?? null,
    session: fields.session ?? null,
  };
}
