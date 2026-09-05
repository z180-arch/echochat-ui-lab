> **HISTORICAL DOCUMENT**
> This document describes an earlier project state.
> It is NOT an authoritative description of the current implementation.
> See README.md and docs/CURRENT_STATE.md for the current state.

# Lived Continuity Write Path

**Status:** Draft spec — awaiting product review. Not an implementation plan.  
**Date:** 2026-09-04  
**Baseline:** `74aecf35c65bd723a5f33073ec7e8eb33c8445d5`  
**Product freeze:** Product UI Architecture vNext (Waves 1–7) remains Design Freeze. This spec does not reopen IA, Profile structure, navigation, Landing, Chat grouping, Composer, or Morning Mint tokens.

---

## 0. One-sentence goal

Close the missing **write half** of `Conversation → Continuity` by routing already-paid extraction work into the existing conservative candidate → confirm → Memory (and optional lightweight Moment) path, so retrieval and「想起了…」have something real to show.

```text
Conversation
    ↓
发现值得保留的信息          (heuristic + reused auto-summary)
    ↓
Conservative candidate
    ↓
用户确认 / 等价安全确认
    ↓
Memory / 至多一条 lightweight Moment
    ↓
Continuity Journal
    ↓
未来对话 retrieve
    ↓
「想起了…」
```

This is **not** a new product surface. It is not Wave 8 IA.

---

## 1. Current write path — what the code actually does

All claims below are grounded in `74aecf3`. Mechanisms that are not called from the running app are labeled **dead**.

### 1.1 How memory candidates are produced

`extractMemoryCandidates(characterId, { chatId })` in `src/domain/memory-candidates.js`:

- Scans active (non-archived) chats for that `roleId`, optionally one `chatId`.
- Reads `peekMessages(chat.id)`.
- **User bubbles** (`role === "me"`) become candidates if `text.length >= 7` **or** (`FACT_RE` matches and length ≥ 6).
- `FACT_RE` is a Chinese heuristic: `我(喜欢|讨厌|爱吃|爱|是|在|住|有|想|会|要|叫)|今天|明天|昨天|工作|上学|生日`.
- **Assistant bubbles** become candidates only if `ABOUT_USER_RE` matches (`你(喜欢|讨厌|是|在|住|有)`) and length ≥ 6.
- Greetings matching `SKIP_RE` are skipped.
- Dedup uses `normalizeMemoryText` against existing `getMemoryList(characterId)` and in-batch `seen`.
- Duplicates are still listed, flagged `duplicate: true`, `accepted: false`.
- **No LLM.** This is local regex + length.

There is **no** other candidate producer in production. Auto-summary output is not passed through this function.

### 1.2 How the user confirms

Entry: Continuity sheet button「从对话提取」→ `App.openMemoryCandidates(roleId, chatId)` (`src/main.js`) → `memoryReviewMarkup` (`src/ui/views/memory-review.js`).

Review UI:

- Checkbox per item (duplicates disabled).
- Editable textarea.
- Evidence line from message index + excerpt.
- Footer: 取消 / **写入记忆** (`memoryCandidateConfirm`).
- Extra checkbox `#mem-post-moment` **default checked**:「同时发一条动态」.

Confirm: `confirmMemoryCandidates(characterId, candidates, { postMoment })`:

- Writes only `accepted && !duplicate` via `addMemory(..., importance 6, source: "candidate")`.
- If `postMoment` and at least one memory was created, **one** Moment: ``记下了。${first.content}`` truncated to 80 chars, `source: "memory"`, `relatedMemoryId` set.

There is **no** in-chat prompt to open this sheet. Empty Continuity copy tells the user traces appear after confirming memory, but the extract action is inside the sheet they only open if they already care.

### 1.3 `rememberMessage`

`src/domain/memory.js`: `addMemory(roleId, message.text.trim(), 6, "manual")`. No candidate, no edit, no duplicate check beyond whatever later retrieve sees as similar text.

UI: message more-menu「记住」(`src/ui/views/index.js` → `App.rememberMessage`). Toast「已加入记忆」. Works on **any** bubble that has text (user or assistant) — it does not restrict to `role === "me"`.

This is a valid explicit write. It is easy to miss and can store a full chat line (including one-off chatter) as long-term memory **without review**.

### 1.4 Auto-summary — what happens today

`maybeAutoSummary(chat)` is called from `sendMessage` **after** a successful assistant persist (`src/domain/chat.js`).

Gate (`src/core/store.js` defaults):

- `memoryCfg.autoSummary.enabled === true`
- `everyTurns === 20`
- Fires when `history.length >= 20` **and** `length % 20 === 0`
- Single-flight: `summaryRunning`
- Extra completion: `chatCompletion` with `temperature: 0.5`, `maxTokens: 200` (cfg `maxLength`)
- Context window: last `everyTurns * 2` messages (40 lines at default)
- Prompt asks for `【摘要】` (up to 5 lines of user facts/prefs/events) and `【动态】` (20–80 字, character voice)

Parse: `parseSummaryAndMoment` (`src/domain/moments.js`).

Then:

```text
void summary;          // summary discarded
if (moment) addMoment({ source: "auto_summary" });  // Moment written with no user confirm
```

Failures are `console.warn` only. No toast, no retry, no candidate.

Note: `settings.autoSummary` exists on settings state; **`maybeAutoSummary` does not read it**. Only `memoryCfg.autoSummary` matters.

### 1.5 Why summary does not form Continuity (as Memory)

- Conservative V1.1 decision: do not dump summary lines into `longTermMemory`. That part is correct for prompt safety.
- The discarded summary is **exactly** the kind of candidate list the review sheet was built for. The API cost is already paid; the write half is not connected.
- The only automatic Continuity artifact is a **Moment in character voice**, which:
  - is **not** injected into `buildSystemPrompt` (prompt uses retrieved memories + affinity + worldbook, not moment text);
  - **does** appear in the Continuity journal as a `trace-line`;
  - is model-authored, unconfirmed, and can read like a social post — the opposite of the frozen “relationship trace” intent;
  - does not create Memory, so「想起了…」still stays dark.

So today auto-summary **spends tokens to decorate the journal**, not to remember the user.

### 1.6 Moment write sources (production)

| Source | When | Confirm? |
|---|---|---|
| `auto_summary` | `maybeAutoSummary` parsed a 【动态】 | No |
| `memory` | Confirm candidates with「同时发一条动态」 | Yes (bundled with memory confirm) |
| `manual` | API exists; Continuity sheet does not offer a composer | N/A in current Continuity UX |
| `candidate` / `reconstruction` | Allowed on `normalizeMoment`; **reconstruction confirm does not call `addMoment`** | — |

Like/comment still exist on `renderMomentsFeedHtml`, which **Continuity does not use**. Affinity still scores likes/comments; those scores are largely idle after the trace-line change.

### 1.7 Relationship event write sources

`pushEvent` keeps last 12 events and sets `role.brief` to the latest event text.

| Writer | Event type | When |
|---|---|---|
| `recordChatTurn` | `first_meeting` / 「第一次开口」 | First successful turn (`wasTurns === 0`) |
| `recordChatTurn` | `stage` / 「关系变成「…」」 | After turn, if `lastStage` changed and was not `none` |
| `recordRelationshipEvent` | caller-supplied | **Used by reconstruction tests and reconstruction only for `recordChatTurn` on relationship clues — not by Chat/Continuity confirm** |

Not written in the app loop: return-after-gap, memory-saved, check-in (function `recordCheckIn` is **dead**), proactive (`rollProactive` is **dead**).

Affinity formula is unchanged by this spec: `turns * 0.1 + likes * 0.5 + comments * 1 + checkInBonus`. This work package **must not** change it.

---

## 2. Desired write path (minimum reliable loop)

### Principle

**Conservative > automatic.** Nothing new enters `longTermMemory` without an explicit user confirm (checkbox / 写入记忆) or the existing explicit「记住」action.

Forbidden:

> Every few turns, the model writes straight into Memory.

Required:

> System finds candidates → existing review (or an equally undoable confirm) → write.

### Loop

1. **Detect** using (a) existing heuristic extract and/or (b) parsed 【摘要】 lines from the **already scheduled** auto-summary completion.
2. **Normalize** into the current candidate shape `{ id, text, accepted, duplicate, evidence }`.
3. **Dedupe** with `normalizeMemoryText` against existing memories and pending candidates.
4. **Quality filter** (section 7) — drop junk before the user sees it.
5. **Park** as *pending candidates* for this `roleId` (runtime first; see data boundary).
6. **Notify without new IA** — action toast + Continuity still has「从对话提取」; pending count can appear as Continuity empty/lead copy only if it stays a sheet, not a new page.
7. **Review** = current `memoryReviewMarkup` (copy may be tuned; structure stays).
8. **Confirm** = current `confirmMemoryCandidates` → `addMemory`.
9. **Moment:** at most one lightweight Moment **from confirmed facts**, not from unconfirmed 【动态】.
10. **Optional event:** `recordRelationshipEvent` type `memory` after a successful confirm with `added > 0` (section 5).
11. Downstream unchanged: journal sorts Memory + Moments; `retrieveMemoriesForTurn`; recall chip when `hadHit`.

### Equivalence: low-friction confirm

Allowed as **the same safety class** as the review sheet:

| Path | Why it is OK |
|---|---|
| Existing review checkboxes + 写入记忆 | Canonical |
| Message「记住」 | User pointed at a specific bubble; still one-tap undo via Continuity `MemoryRow` delete |

Not equivalent (disallowed in MVP):

- Silent `addMemory` from summary or heuristics
- “Timeout = accept”
- Confirming by navigating away
- Auto-accepting assistant speculation about the user

**记住** stays, but MVP should not expand it. V1 may skip obvious duplicates on remember (same `normalizeMemoryText`) so explicit remember does not double-write.

---

## 3. Auto-summary

### Decision table

| Output | Direct Memory? | Candidate pipeline? | Direct Moment? | Relationship event? |
|---|---|---|---|---|
| 【摘要】 lines | **No** | **Yes (MVP)** | No | No |
| 【动态】 | No | No | **No in MVP** (stop auto-post) | No |
| After user confirms ≥1 memory | via confirm only | — | Optional one Moment, user checkbox, **default off** | Yes, one `memory` event if we ship that in MVP |

### Why not save summary “because we paid for it”

- Summary lines are model output: they can invent, merge, or moralize.
- Dumping them recreates the V1.1 bug (prompt pollution).
- Turning every 【动态】 into a journal row fights Design Freeze (trace, not feed).
- The paid value is **a shortlist of candidate sentences**, not a stored document.

### How summary enters candidates

After `parseSummaryAndMoment`:

1. Split `summary` on newlines / `；` / leading `-` / `•`.
2. Trim; drop empty; cap **5** items (prompt already asks for max 5).
3. Map each line to a candidate with `source` evidence: `{ excerpt: line, index: 0 }` plus a stable tag in evidence text such as「摘要」so the user knows it is model-proposed, not a verbatim quote. **Do not** treat summary lines as user speech.
4. Run the same duplicate + quality filters as heuristic extract.
5. **Default `accepted: false`** for model-proposed lines (stricter than today’s heuristic, which pre-checks non-duplicates). User must opt in. Heuristic items from the same window may keep today’s default-checked-if-fresh behavior **or** also default unchecked when mixed in one sheet — MVP: **all pending items from summary default unchecked; heuristic-only opens keep current defaults.**

### Frequency and cost

- **Do not add a second extraction completion** in MVP.
- Keep `everyTurns = 20` and `maxTokens = 200`.
- Prompt change allowed: drop the 【动态】 request in MVP so the 200 tokens go to cleaner summary lines; parser still accepts 【动态】 if the model emits it, but it is ignored.
- If summary parse is empty after filters: **no UI nag**. Fail closed.
- `summaryRunning` stays; overlapping sends must not queue extra completions.

### API failure

Same as today: warn, no write, no blocking the chat send path. Pending state unchanged.

---

## 4. Memory vs Moment

### Memory

Long-lived, **role-scoped** facts the model should be allowed to reuse:

- Stable identity / background (job, city, living situation) the **user stated**
- Stable preferences
- Important ongoing relationship facts the user confirmed (“我们约定每周日聊”)
- Things that would make「想起了…」feel true next week

Stored as today: `{ id, content, importance, createdAt, source }` on `longTermMemory[roleId]`. Injected only via `retrieveMemoriesForTurn` with overlap > 0.

### Moment

A **dated trace** of something that happened in the relationship — one beat, not a reusable fact dump.

- “记下了。你下周要面试。” is a trace *of the act of remembering*, tied to `relatedMemoryId`
- Auto character-voice “朋友圈” is **not** a Moment we want in MVP

Moments are **not** in the system prompt. They exist so Continuity has a time-shaped journal, not so the model quotes them.

### Anti-duplication rule

For one confirm batch:

- N memories may be written (user-selected).
- **At most one** Moment, and only if the user checks「同时记下一条痕迹」(rename of「同时发一条动态」; same checkbox id allowed).
- Copy stays `记下了。${firstAccepted.content}` (already implemented).
- Do **not** also write the 【动态】 from the same summary cycle.
- Do **not** create one Moment per memory line.

If the user only wants Memory, journal still shows `MemoryRow`s. That is enough Continuity.

---

## 5. Relationship events

### Allowed in this product direction

| Event | MVP? | Rule |
|---|---|---|
| Existing `first_meeting` / `stage` | Keep | Already real |
| `memory` — user confirmed ≥1 new memory | **MVP yes** | Fire once per successful confirm with `added > 0`. Text: short, factual, e.g. 「记下了一件关于你的事」— **not** the full memory text (brief is last event; dumping secrets into brief is unnecessary). |
| `return` — reopen/send after ≥1 calendar day since `lastChatAt`, `hasHistory` | **V1** | Real gap only. No fake “I missed you” copy as an event type that implies emotion the product did not observe. Label: 「又见面了」is observational. |

### Forbidden

- Changing affinity math
- `recordCheckIn` UI or wiring
- Streak display, progress bars, stage gauges
- Invented milestones (“你们已经成为最好的朋友”)
- Events from unconfirmed summary
- Events from auto Moment (removed in MVP)

`recordRelationshipEvent` already exists; MVP uses it. Do not add a new event store.

---

## 6. Trigger strategy

| | UX | API cost | Noise | Complexity | Fit with current code |
|---|---|---|---|---|---|
| **A. Every N turns (new extract job)** | Regular but naggy | **High** if N is small or if it is a new LLM call | Medium | Medium | We already have N=20 for summary; a **second** LLM is waste |
| **B. On conversation end** | Clean in theory | Low–medium | Low | High | **No session-end event** in this PWA; closing the tab is not observable reliably |
| **C. High-value heuristic** | Precise when regex hits | **Zero extra** | High false positive (`今天`, `想`, `是`) | Low | `extractMemoryCandidates` already is C; too noisy to auto-open a modal every send |
| **D. On auto-summary** | Aligned with “a chapter just closed” (20 turns) | **Zero extra** (reuse completion) | Medium (model junk) — mitigated by filter + default unchecked | Low | Directly replaces `void summary` |
| **E. Hybrid** | Best | Same as D + zero-cost C on demand | Controlled | Low–medium | D for discovery; C for Continuity button; remember for explicit |

### Recommendation: **E (D-primary hybrid)**

1. **Primary discovery (D):** when `maybeAutoSummary` returns a usable summary, convert to pending candidates and invite review.
2. **On-demand (C):** keep「从对话提取」heuristic — no new API.
3. **Explicit:** keep「记住」.
4. **Do not implement B.**
5. **Do not add another N-turn LLM** (A as extra job). Keeping `everyTurns` is not “strategy A”; it is the existing summary cadence.

If 20 turns feels slow after launch, **V1** may lower `everyTurns` (e.g. 12) as a config-only change — still one completion, not two.

---

## 7. Candidate quality

### Worth proposing

Must be **about the user or the shared relationship**, reusable later:

- Stable facts the user asserted (name they use, job, city, pets, schedule constraints)
- Preferences (likes/dislikes that are not a one-line joke)
- Long-running background (“在备考”, “和家人同住”)
- Relationship agreements the user said in-thread
- Concrete future events with a handle (“下周五面试”) — still a fact, not a mood

### Exclude (drop before UI)

- Greetings / fillers (existing `SKIP_RE`)
- Pure one-off chat with no fact payload
- Transient emotion (“好烦”, “哈哈哈”) without an attached fact
- Model speculation, mind-reading, or “用户可能是…”
- Assistant self-description unless it is clearly “you told me X about you”
- Duplicates (`normalizeMemoryText`)
- Lines shorter than 6 CJK chars after trim (align with extract)
- Sensitive dumps: do not add a medical/legal classifier in MVP; **user confirm is the safety gate**. Review copy must say they are writing **this character only**.
- Summary lines that are just recap of the assistant’s plot (“她笑了”) with no user fact

### Heuristic vs summary

- Heuristic: high recall, high noise — keep behind a button; do not toast on every send.
- Summary: lower volume, hallucination risk — toast/pending only if ≥1 line survives filters.

---

## 8. UX (frozen IA)

### Must not

- New primary nav, Moments tab, Memory page, dashboard
- Profile layer / chevron IA changes
- Composer layout, message grouping, send contract
- Restoring three Continuity sections or a social feed

### Options considered

| Option | Verdict |
|---|---|
| Chat-after toast with action「查看」opening **existing** review modal | **MVP yes** — no layout change |
| Pending lead line inside Continuity sheet (“有 n 条待确认”) + existing extract button | **MVP yes** — same sheet |
| New recall-like chip in Chat (“可以记下 n 件事”) | **V1** — adjacent to existing `recall-chip`; not required to close the loop |
| Auto-open modal mid-chat | **No** — hijacks conversation |
| Badge on Profile「记忆与世界」row | **No** — Profile IA freeze |

### Recommended minimum

1. After a successful summary→candidates park: `showToast` with action opening `openMemoryCandidates` **preloaded with pending list** (not a live re-extract that throws them away).
2. Continuity: if pending exists, one muted line + primary still「从对话提取」which opens the **pending** set if any, else heuristic extract as today.
3. User dismisses toast → pending remains until review, confirm, or **clear pending** (Cancel on modal does not have to clear; V1 add「以后再说」that snoozes until next summary).
4. Rename in review:「同时发一条动态」→「同时在痕迹里记一笔」; **default unchecked**.
5. Chat empty-state sentence already mentions confirming memory — leave it.

Composer and transcript grouping stay untouched.

---

## 9. Failure and safety

| Case | Behavior |
|---|---|
| Heuristic empty | Existing empty review + close |
| Summary API fail | No pending, no toast, chat unaffected |
| Summary empty / all filtered | No toast |
| Duplicate candidates | Show disabled「已经记过」as today |
| User rejects (uncheck / cancel) | No `addMemory`; pending: Cancel keeps pending; 写入记忆 with zero accepted = today’s “没有新的记忆” |
| User ignores toasts repeatedly | At most **one** pending set per role; next summary **replaces** unused pending (avoid pile-up). Do not escalate to modal. |
| Too many candidates | Cap display at **8**. Prefer summary lines first, then heuristic fill only when opening extract with no pending. |
| Wrong fact confirmed | Continuity `MemoryRow` delete already exists — this is the product undo. Prompt pollution stops after delete + next retrieve. |
| Wrong fact **auto-written** | Must not happen for Memory. Stopping auto Moment removes a class of journal spam. |
| Conflicting new vs old memory | **MVP:** both can exist; retrieve ranks by overlap + importance + recency. User deletes the stale row. **Later:** merge UI. Do not auto-delete old facts. |
| rememberMessage junk | User responsibility; delete path exists. V1: duplicate skip. |

**Hard rule:** auto-summary and heuristics never call `addMemory`.

---

## 10. Data / architecture boundary

### Reuse as-is

- Memory schema `longTermMemory[roleId].memories[]`
- `addMemory` / `deleteMemory` / `retrieveMemoriesForTurn` / `getLastMemoryRetrieve`
- `extractMemoryCandidates` / `confirmMemoryCandidates` / `normalizeMemoryText`
- `memoryReviewMarkup` + `App.openMemoryCandidates` / `memoryCandidateConfirm`
- Moments store + `addMoment` (confirm path only)
- `recordRelationshipEvent` / `getAffinity` / `recordChatTurn`
- `maybeAutoSummary` trigger site in `sendMessage`
- `parseSummaryAndMoment`
- Continuity journal renderer
- Recall chip logic

### Runtime pending (MVP)

Hold pending candidates **in process memory** (module field on `App._mem` or a small domain module), keyed by `roleId`. Lost on full reload is acceptable for MVP (worst case: user uses 从对话提取).

**Do not** add a new localStorage key or schemaVersion bump in MVP.

### Absolute non-goals (this feature)

- Dexie migration for Memory / Relations / Moments
- New memory DB, vectors, RAG
- New storage contract / `KEYS.*`
- Repository rewrite
- Affinity formula change
- Plugin, market, check-in, proactive wiring
- Worldbook matcher rewrite
- Reconstruction pipeline changes

### Prompt / API contract

- `streamChat` / `sendMessage` control flow stays.
- Extra completion remains the existing summary `chatCompletion`, not a new provider API.

---

## 11. MVP / V1 / Later

### MVP — minimum closed loop

1. Parse auto-summary 【摘要】 → quality filter → pending candidates (default unchecked).
2. Stop `addMoment` from auto-summary 【动态】.
3. Optionally drop 【动态】 from the summary prompt (still ignore if present).
4. Toast + action to existing review modal; Continuity extract consumes pending if present.
5. Confirm path unchanged except Moment checkbox default **off** and copy tweak.
6. One `recordRelationshipEvent` on successful memory confirm (`added > 0`).
7. Tests for: summary→candidates, no auto memory, no auto moment, confirm still writes, duplicates, API fail silent, existing core_loop extract path.

### V1 — after MVP feels right in the browser

- Chat `recall-chip`-style pending indicator
- Snooze / replace-pending policy UX
- `return` event on real ≥1 day gap
- `rememberMessage` duplicate skip
- Tune `everyTurns` if 20 is too sparse
- Mix heuristic + summary in one review when user opens extract with pending
- Evidence showing a real message excerpt for summary-derived lines when a fuzzy match exists

### Later

- Conflict merge / supersede memory
- Persist pending across reload
- Sensitivity classifier
- Proactive / check-in (still **Avoid** as product direction)
- Dexie for memory
- Second LLM dedicated to extraction
- Conversation-end trigger
- User Persona onboarding as a separate module

---

## 12. Recommended MVP implementation scope

### Modules likely to change

| Area | Files | Nature |
|---|---|---|
| Auto-summary outcome | `src/domain/memory.js` | Route summary; remove auto Moment |
| Candidates | `src/domain/memory-candidates.js` | `candidatesFromSummary`, quality filter, pending helpers |
| Events | `src/domain/relations.js` **call site only** | `recordRelationshipEvent` from confirm — no formula change |
| Confirm wiring | `src/main.js` | Pending park, toast action, confirm event, checkbox default |
| Review copy | `src/ui/views/memory-review.js` | Labels, default unchecked moment box |
| Continuity pending hint | `src/ui/views/index.js` `renderContinuitySheetContent` only | One muted line; **not** Profile chrome |

`src/domain/chat.js`: prefer **no** control-flow change (keep `maybeAutoSummary()` after success). If summary needs to return pending to the app, do it via `events.emit` (e.g. existing bus) rather than expanding `sendMessage`.

### Frozen surfaces — do not touch

- Nav (陪伴 / 我的)
- Profile IA (layers, rows, compact RelationshipBrief)
- Chat composer, message grouping, send/retry/stop
- Landing
- Morning Mint tokens
- Worldbook matcher
- Affinity formula
- Storage keys / schemaVersion
- Reconstruction (except it already writes memories on its own confirm — out of scope)

### Tests

- Extend `tests/core_loop_test.mjs`: confirm still required; auto-summary helper tests with **mocked** `chatCompletion` (if tests currently don’t cover maybeAutoSummary, add a focused `tests/continuity_write_path_test.mjs` rather than a browser-only check).
- Regression: `tests/v1_1_context_test.mjs` (retrieve still overlap-only).
- Wave UI tests: **must still pass**; do not rewrite Wave 1–4 assertions unless a Continuity string we intentionally change is asserted (prefer not to couple).
- `node --check` on touched modules.
- Full `tests/*.mjs` suite before claiming done.

### Browser verification

**Yes, required** before calling MVP done (product rule for UI-visible toast + sheet + journal):

- Chat 20-turn fixture or injected summary mock: toast appears; modal lists candidates; confirm writes Memory; journal shows MemoryRow; next overlapping user message shows「想起了…」.
- Confirm none: no new memory; journal not filled with auto 动态.
- Extract button still works with heuristic when no pending.
- Profile / Hub / Composer unchanged smoke.
- Mobile 390 and desktop 1280: modal usable (existing 640px review).

If live model is unavailable, use a stubbed completion in a debug hook **only in tests**, not a production fake-memory path.

---

## 13. Spec self-review

- No TBD/TODO left as open product choices: trigger = E/D-primary; summary → candidates not Memory; auto Moment off; return event deferred to V1; pending is runtime-only.
- Conservative write is consistent across sections 2, 3, 8, 9.
- Scope is one work package: write-path closure, not IA, not RAG, not affinity.
- 「等价确认」is enumerated (review + 记住 only).
- Filename on disk: `docs/superpowers/specs/2026-09-04-lived-continuity-write-path.md` (dated; topic as agreed).

---

## 14. Out of scope reminder

Do not treat this spec as permission to polish Continuity visuals, restore Moments feed, wire `rollProactive`, or start Wave 8.
