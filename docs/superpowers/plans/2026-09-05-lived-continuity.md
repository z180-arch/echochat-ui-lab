# Lived Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Quiet Companion gap-return turns prove **Lived Continuity** — memory × relationship actually shape the prompt the model sees — without new Memory/Relationship UI.

**Architecture:** Keep the existing `buildSystemPrompt` pipeline in `src/domain/chat.js`. Add a falsifiable `tests/lived_continuity_test.mjs` that encodes the Success Definition. Improve `retrieveMemoriesForTurn` with a **gap/idle-gated** continuity anchor fallback (not a generic no-overlap dump). Relationship axis: verify existing public write/read path first; change production only if verification fails. Keep `continuitySignals` in the test file unless production truly needs a shared helper. No storage key/schema renames. No new feature pages.

**Plan corrections (approved 2026-09-05):**
1. Anchor fallback only on **gap/idle return + weak/empty overlap** — never on every no-overlap active turn.
2. Task 3 is **verify-first**; production relationship writes only if Success Definition cannot be met with existing APIs.
3. Do **not** default-create `src/domain/continuity.js`.

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
| `src/domain/memory.js` | **Modify** — gap/idle-gated anchor fallback in retrieve |
| `src/domain/relations.js` | **Modify only if Task 3 verification proves insufficient** |
| `src/domain/chat.js` | **Modify only if needed** to pass idle/lastChatAt into retrieve (prefer reuse) |
| `docs/product-lab/experiments/lived-continuity-mvp.md` | **Update** — mark experiment status after green |
| `src/domain/continuity.js` | **Do not create** unless production code must share the helper |

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
10. **Anti-contamination (must pass on current code):** after a *recent* `lastChatAt` (active conversation, not idle), a no-overlap query must **not** inject the flight-fear memory into `buildSystemPrompt`. This locks Correction 1 before Task 2.

Keep `continuitySignals()` **inside this test file** (Correction 3).

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

- [ ] **Step 2: Implement minimal gap/idle-gated anchor fallback**

**Hard rule:** Memory fallback is a **gap-return continuity mechanism**, not a **no-overlap memory dump**.

In `retrieveMemoriesForTurn` (signature may accept optional idle signal from caller):

- Apply anchors **only when** all of:
  1. Query is non-empty, and
  2. Overlap pool is empty or very weak, and
  3. Role is in **gap/idle return** (reuse existing `lastChatAt` / relationship timing — e.g. idle ≥ 2 days; pass from `buildSystemPrompt` via `getAffinity(...).lastChatAt` or equivalent public data — **no new storage field**)
- Then inject at most **1–2** high-importance memories (`importance >= 7`), ranked with existing importance + recency signals only. Do not invent a new scoring system.
- **Active conversation** (not idle): if overlap is empty, keep **current** behavior (do not broadcast important memories).
- Add a regression assertion in the suite: active/non-idle + no-overlap query must **not** inject the flight-fear anchor.
- Update `lastRetrieve` so tests can observe anchor items.

Keep strong-overlap path unchanged (do not regress `v1_1_context_test`).

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

### Task 3: Verify relationship continuity path (modify production only if needed)

**Files:**
- Test: `tests/lived_continuity_test.mjs` (primary)
- Modify `src/domain/relations.js` / memory write path **only if** verification fails

**Verify-first order (mandatory):**

1. Construct relationship state with **existing public APIs** (`recordChatTurn`, `recordRelationshipEvent`, and/or existing continuity confirm path that writes `记下了一件关于你的事`).
2. Prove brief/event/stage **still exist after idle gap**.
3. Prove they **enter** `buildSystemPrompt()` / behavior context.
4. **Only then**, if Success Definition still fails on the relationship axis, make the smallest production fix.

Do **not** expand automatic relationship writes just because Memory × Relationship is the product bet.

If existing APIs suffice, Task 3 ends as a **verification/test** commit (no `relations.js` change), with a short note in the commit body.

- [ ] **Step 1: Verify with public APIs + adjust test seed if needed**

- [ ] **Step 2: Production fix only if verification proves a real gap**

- [ ] **Step 3: Run**

```bash
node tests/lived_continuity_test.mjs
node tests/continuity_write_path_test.mjs
node tests/v1_1_context_test.mjs
```

- [ ] **Step 4: Commit**

If tests-only:

```bash
git add tests/lived_continuity_test.mjs
git commit -m "test: verify relationship continuity on gap-return path"
```

If production fix required:

```bash
git add src/domain/relations.js tests/lived_continuity_test.mjs
git commit -m "fix: restore relationship brief on gap-return continuity turns"
```

---

### Task 4: Continuity integrity gate (test-local helper)

**Files:**
- Modify: `tests/lived_continuity_test.mjs` only by default
- **Do not create** `src/domain/continuity.js` unless production chat/domain code must share the helper (default: keep `continuitySignals()` in the test file)

- [ ] **Step 1: Ensure integrity tests require both axes on assembled turns**

```js
test("Success Definition: assembled turn requires memory × relationship", () => {
  const full = buildSystemPrompt(chat, { query: "后天要出差，我有点慌" });
  const sig = continuitySignals(full);
  assert.ok(sig.hasMemory && sig.hasRelationship);
});
```

Also keep the mem-only / rel-only insufficiency checks from Task 1.

- [ ] **Step 2: No production UI / no unnecessary domain abstraction**

`git diff --stat` must not touch `src/ui/`. Must not add `src/domain/continuity.js` without a proven need.

- [ ] **Step 3: Commit**

```bash
git add tests/lived_continuity_test.mjs
git commit -m "test: enforce memory×relationship continuity integrity"
```

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
