# Lived Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Quiet Companion gap-return turns prove **Lived Continuity** — memory × relationship actually shape the prompt the model sees — without new Memory/Relationship UI.

**Architecture:** Keep the existing `buildSystemPrompt` pipeline in `src/domain/chat.js`. Add a falsifiable `tests/lived_continuity_test.mjs` that encodes the Success Definition. Improve `retrieveMemoriesForTurn` with an idle/gap **anchor fallback** when token overlap is empty, and ensure lived salient memories refresh relationship brief/events so affinity injection stays non-empty. No storage key/schema renames. No new feature pages.

**Tech Stack:** Existing zero-build ES modules, Node test harness (`node --test` style used by current `tests/*.mjs`), in-memory store patterns from `tests/v1_1_context_test.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-05-lived-continuity-design.md`

---

## Hard gate (every task)

Before marking a task done, answer in the commit/PR note:

> Does this make the character’s **behavior** more continuous on a gap-return turn — not only store/retrieve more rows?

---

## File map

| File | Role |
|------|------|
| `tests/lived_continuity_test.mjs` | **Create** — Success Definition fixtures |
| `src/domain/memory.js` | **Modify** — gap/idle anchor fallback in retrieve |
| `src/domain/relations.js` | **Modify** — link salient memory to brief/event (compatible) |
| `src/domain/chat.js` | **Modify only if needed** — keep assembly; maybe tiny helper export for tests |
| `src/domain/behavior.js` | Touch only if integrity helper belongs here |
| `docs/product-lab/experiments/lived-continuity-mvp.md` | **Update** — mark experiment status after green |

Do **not** modify: `index.html`, `app/index.html`, UI views for new pages, Dexie schema, storage keys, PWA, landing.

---

### Task 1: Failing Lived Continuity suite (Success Definition)

**Files:**
- Create: `tests/lived_continuity_test.mjs`
- Read for harness patterns: `tests/v1_1_context_test.mjs`, `tests/core_product_test.mjs`

- [ ] **Step 1: Write the failing test file**

Create `tests/lived_continuity_test.mjs` that:

1. Boots store like other domain tests (same `srcHref` / store reset pattern as `v1_1_context_test.mjs`).
2. Seeds character roleId `role_lc`, adds memory: `用户很怕坐飞机，长途飞行会慌` with importance `8`.
3. Records relationship event / ensures `getAffinity` returns non-empty `brief` or `lastEvent` and a non-`none` stage after `recordChatTurn` calls.
4. Sets `lastChatAt` (via turns or direct relation field if exported; prefer public APIs) to simulate **≥ 2 days idle**.
5. Builds a chat whose **recent messages do not restate** the flight fear.
6. Calls `buildSystemPrompt(chat, { query: "后天要出差，我有点慌" })` — query must **not** literally copy the memory sentence.
7. Asserts prompt includes a distinctive substring from the memory (e.g. `怕坐飞机` or `飞行`).
8. Asserts prompt includes relationship continuity (`Relationship with the user` block or `brief` / stage / tone text from `buildBehaviorContext`).
9. **Integrity:** build a parallel behavior string with `memories: []` or `affinity: null` and assert the full prompt continuity check fails a helper `continuitySignals(prompt)` requiring `{ hasMemory: true, hasRelationship: true }`.

Sketch (adapt imports/helpers to match repo test style exactly when implementing):

```js
function continuitySignals(prompt) {
  const p = String(prompt || "");
  return {
    hasMemory: /怕坐飞机|飞行会慌/.test(p),
    hasRelationship: /Relationship with the user|熟悉|亲近|第一次|Brief:|Stage:/.test(p),
  };
}

test("gap-return prompt continues memory and relationship without user restating", () => {
  // seed memory + relationship + idle …
  const prompt = buildSystemPrompt(chat, { query: "后天要出差，我有点慌" });
  const sig = continuitySignals(prompt);
  assert.equal(sig.hasMemory, true, "memory must shape the turn the model sees");
  assert.equal(sig.hasRelationship, true, "relationship must shape the turn the model sees");
});

test("continuity integrity: memory-only or relationship-only is insufficient", () => {
  const memOnly = buildBehaviorContext({ persona: "角色", memories: [{ content: "用户很怕坐飞机，长途飞行会慌" }], affinity: null });
  const relOnly = buildBehaviorContext({
    persona: "角色",
    memories: [],
    affinity: { toneHint: "更亲近、更熟络", stageLabel: "已经熟络", brief: "第一次开口", knownDays: 5 },
  });
  assert.equal(continuitySignals(memOnly).hasRelationship, false);
  assert.equal(continuitySignals(relOnly).hasMemory, false);
});
```

- [ ] **Step 2: Run the new suite — expect FAIL**

Run:

```bash
node tests/lived_continuity_test.mjs
```

Expected: at least one failure on gap-return memory presence (today’s retrieve often returns `[]` when CJK overlap is weak / empty), proving the Success Definition is not yet met.

- [ ] **Step 3: Commit the failing test only**

```bash
git add tests/lived_continuity_test.mjs
git commit -m "test: add lived continuity gap-return success fixtures"
```

---

### Task 2: Gap/idle anchor fallback in memory retrieve

**Files:**
- Modify: `src/domain/memory.js` (`retrieveMemoriesForTurn`)
- Test: `tests/lived_continuity_test.mjs`

- [ ] **Step 1: Re-run gap-return test to confirm still failing**

```bash
node tests/lived_continuity_test.mjs
```

- [ ] **Step 2: Implement minimal anchor fallback**

In `retrieveMemoriesForTurn`, after building `pool` from overlap:

- If `q` is non-empty and `pool` is empty (or too thin), and there are high-importance memories (e.g. `importance >= 7`), inject up to `min(2, injectMax)` top importance+recency memories as **anchors**.
- Prefer anchors when the role appears idle: caller may pass nothing extra if we treat “empty overlap + important memories” as sufficient for MVP; optionally accept `opts.idleDays` later — **do not** require UI.
- Update `lastRetrieve` so tests/debug can see `hadHit` / items including anchors (e.g. set preview from first anchor).

Keep token-overlap path unchanged when overlaps exist (do not regress `v1_1_context_test`).

- [ ] **Step 3: Run continuity + context suites**

```bash
node tests/lived_continuity_test.mjs
node tests/v1_1_context_test.mjs
```

Expected: gap-return `hasMemory` passes; v1_1 still passes.

- [ ] **Step 4: Commit**

```bash
git add src/domain/memory.js tests/lived_continuity_test.mjs
git commit -m "feat: idle memory anchors for gap-return continuity"
```

---

### Task 3: Salient memory refreshes relationship continuity signal

**Files:**
- Modify: `src/domain/relations.js` and/or call site in memory confirm / `addMemory` path used by tests
- Prefer: when `addMemory(..., importance >= 7)` or existing confirm path runs, call `recordRelationshipEvent` with a short continuity-safe line that still yields `Brief:` in behavior (may reference that something important about travel/fear was shared — **do not** dump full secrets if current product rule forbids; but Success Definition requires *some* relationship signal; memory carries the fact body).

Check `tests/continuity_write_path_test.mjs`: confirmed memory already creates event `记下了一件关于你的事`. Ensure gap-return seed uses that path **or** `recordRelationshipEvent` so `hasRelationship` is true after idle.

- [ ] **Step 1: Write/adjust test asserting brief/event survives idle and appears in `buildSystemPrompt`**

- [ ] **Step 2: Implement minimal wiring if seed-only is insufficient**

If public APIs already suffice, only fix the test seed to use `recordRelationshipEvent` + `recordChatTurn` — still commit a note that relationship axis is mandatory. If brief clears on idle (it should not), fix persistence bug.

- [ ] **Step 3: Run**

```bash
node tests/lived_continuity_test.mjs
node tests/continuity_write_path_test.mjs
node tests/v1_1_context_test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/relations.js src/domain/memory.js tests/lived_continuity_test.mjs
git commit -m "feat: keep relationship brief in lived continuity turns"
```

---

### Task 4: Continuity integrity helper + prompt-level gate

**Files:**
- Create or modify: small helper — prefer `src/domain/continuity.js` **only if** both chat tests and domain need it; otherwise keep `continuitySignals` in the test file and export `buildSystemPrompt` usage only.
- Modify: `tests/lived_continuity_test.mjs`

- [ ] **Step 1: Add test that fails if either axis stripped from the assembled turn**

Example:

```js
test("Success Definition: assembled turn requires memory × relationship", () => {
  const full = buildSystemPrompt(chat, { query: "后天要出差，我有点慌" });
  const sig = continuitySignals(full);
  assert.ok(sig.hasMemory && sig.hasRelationship);
});
```

- [ ] **Step 2: No production UI changes**

Verify `git diff --stat` does not touch `src/ui/views/` except if absolutely required (should be none).

- [ ] **Step 3: Commit**

```bash
git add tests/lived_continuity_test.mjs src/domain/continuity.js
git commit -m "test: enforce memory×relationship continuity integrity"
```

(Omit `continuity.js` from `git add` if not created.)

---

### Task 5: Regression wall + experiment doc

**Files:**
- Modify: `docs/product-lab/experiments/lived-continuity-mvp.md` (status → proven/failed)
- Tests only otherwise

- [ ] **Step 1: Run regression pack**

```bash
node tests/lived_continuity_test.mjs
node tests/foundation_test.mjs
node tests/storage_cutover_test.mjs
node tests/v1_1_context_test.mjs
node tests/continuity_write_path_test.mjs
node tests/core_product_test.mjs
```

Expected: all pass; foundation 27/0; storage 28/0.

- [ ] **Step 2: Update experiment doc** with pass/fail against Success Definition (user-perceivable gap-return), not only hit rates.

- [ ] **Step 3: Commit**

```bash
git add docs/product-lab/experiments/lived-continuity-mvp.md
git commit -m "docs: record lived continuity MVP verification"
```

---

## Out of scope (reject during implementation)

- Memory review as required UX for the bet  
- Relationship settings page  
- Embeddings / Dexie schema bumps / key renames  
- Moments primary loop  
- Copying SillyTavern / Risu / Aelios / Constellation code  

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Success Definition (behavior, not mere storage) | Task 1, 4 |
| Gap-return without restating | Task 1–2 |
| Memory × Relationship both required | Task 1, 3, 4 |
| No new UI | Task 4 check |
| Storage freeze | All tasks |
| Existing suites green | Task 5 |

## Placeholder scan

No TBD steps. Commands and target files are concrete. Exact assertion regex may be tuned to seeded Chinese strings when writing the test — keep distinctive anchors stable.
