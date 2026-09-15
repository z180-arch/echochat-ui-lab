# EchoChat — Development Status

**Date:** 2026-09-15  
**Branch:** `main`  
Not a roadmap. Facts for the next work package.

---

## Current Stable

### Shipped

- Companion PWA: `/` landing, `/app/` application
- Character, Conversation, Memory, Moments, Relationship, Worldbook
- `assembleTurnContext` as the only turn-context door; plugin `extraPrompt` (extra-notes)
- Quiet remember of user facts; retrieve-for-turn
- Reconstruction import; Character Card V2 import/export
- Long-chat tail window + virtual list; stream paint
- STT into composer (Web Speech); TTS via `speechSynthesis`
- Morning Mint / Ripple in-app UI
- First-run starters fill composer only (no auto-send, no fake Memory)
- Reunion / resume copy from real last talk, moments, memory, stage

### Verified

- Local/CI node: `npm test` (42 suites + `src` syntax)
- CI browser (Chrome): wave3a / wave3b / wave4, landing CTA, continuity UI, moments/worldbook, storage/memory/chat lifecycle, STT, first-run, chat actions, stream paint, long chat, bulk import, provider lifecycle
- Optional live matrix: `node scripts/live_continuity_matrix.mjs` (gitignored key; retrieval contract only — not product proof)

### Frozen

Do not change unless a task explicitly asks:

- Memory schema
- Retrieval
- `assembleTurnContext`
- Provider architecture
- Dexie schema / `echodownload_*` key names
- Morning Mint design system
- Product Core as host (no Agent OS / Chatbox / DSH / SillyTavern runtime)

---

## Active Risks

- Message dual-write (store cache vs Dexie) is compatibility. Debugging can look like two sources of truth.
- `src/main.js` is a large orchestrator by design.
- Firefox has no Web Speech STT. iOS installed-PWA recognition is unreliable.
- Some OpenAI-compatible models still treat user facts as their own (e.g. photography). Retrieval stays frozen.
- Plugin layer must not grow into a marketplace or agent host.

---

## Next Development Areas

### P0 — user-facing

- STT on Firefox / installed iOS PWA: honest unsupported copy is already there; do not fake dictation.
- Model ownership slips (user hobby claimed as the character’s): observe prompts/tests; **do not** expand retrieval aliases.

### P1 — companion feel

- Keep reunion / resume / first-meet on **real** message / moment / relationship / memory data only.
- Tighten dual-write confusion only if a real desync shows up in production — not a schema migration.

### P2 — later experiments (not scheduled)

- Ship `/app` without marketing `index.html` / `landing-v3.html`
- DSH / plugin marketplace / sandbox — see PLUGIN_POLICY; not a host change
