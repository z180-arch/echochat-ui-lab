# EchoChat — Roadmap

Already-shipped work is **CURRENT**, not a TODO list. There is no Stage 0–13 queue.

---

## CURRENT

Shipped in the running product ([CURRENT_STATE.md](CURRENT_STATE.md)):

- Local-first companion PWA (`/` landing, `/app/` application)
- Character, Conversation, Memory, Moments, Relationship, Worldbook
- `assembleTurnContext` as the only turn-context door; plugin `extraPrompt` (extra-notes)
- Quiet remember of user facts; retrieve-for-turn (schema and retrieval frozen)
- Reconstruction import; Character Card V2 import/export
- Long-chat tail window + virtual list; stream paint
- STT into the composer (Web Speech); TTS via `speechSynthesis`
- Morning Mint / Ripple in-app design (frozen)
- Product Core frozen as the host — not Chatbox / DSH / Agents SDK / SillyTavern

---

## NEXT

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for P0 / P1 / P2. No other backlog is checked in.

Frozen unless a task explicitly asks: Memory schema, retrieval, `assembleTurnContext`, Provider architecture, Dexie schema, in-app visual language.

---

## LATER

Recorded intent only (not scheduled):

- Ship the application **without** marketing `index.html` / `landing-v3.html`
- DSH / marketplace / sandbox / plugin SDK — not scheduled; see [PLUGIN_POLICY.md](architecture/PLUGIN_POLICY.md)
