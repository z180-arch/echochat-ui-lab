<!-- Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 -->
<!-- Verb: audit · Surface: product identity, not UI restyle · Baseline: a33be33 UI / 3e88c26 Design Intelligence infra -->

# Product Intelligence Audit v1

**Date:** 2026-09-15  
**Kind:** diagnosis. Not a redesign. No `/app/` code was changed.  
**Question:** why EchoChat can still be read as a decent AI character-chat webpage, rather than a companion product with a clear identity, long-term use, and irreplaceability.

---

## Verdict

Architecture is a companion. The default interaction grammar is a messenger plus an LLM workbench.

Users do not experience Dexie satellites, `assembleTurnContext`, or the Character → Conversation → Relationship → Memory → Moments → Worldbook chain. They experience the first verb, the 95% loop, and whether the other person ever acts without being asked.

EchoChat currently teaches the wrong first job: **create a character, then chat.** A companion product’s first job is: **meet someone who will still be here tomorrow.** Those are not the same product, even when the storage model is already companion-shaped.

The irreplaceable thing in the codebase (local continuity that injects into the next turn) is mostly silent. The replaceable thing (inbox + bubbles + copy/regenerate/edit) is loud. That inversion is the whole problem.

---

## Baseline lock

Confirmed on this machine, 2026-09-15:

| Check | Result |
|-------|--------|
| Branch | `main`, clean, tracking `origin/main` |
| HEAD | `3e88c26` — Design Intelligence infrastructure |
| UI baseline | `a33be33` — Presence Workbench / identity-first companion chrome |
| `git diff a33be33..HEAD --stat` | **docs only** (13 files, +451 / −22). No UI, CSS, Dexie, Provider, or runtime delta |
| `npm test` | 52 suites passed |

`docs/design/UX_AUDIT.md` still lists pre-`a33be33` visual P0s (left identity, her-bubble shadow, destacked welcome cards). Those are **stale**. Do not reopen them as current visual debt. This document is the product-level successor.

---

## Skill loading (this round)

DESIGN.md remains design authority. Skills supplied intelligence. Nothing here restyles `/app/`.

| Skill | Status | Claim | What it was used for |
|-------|--------|-------|----------------------|
| Hallmark | INSTALLED | **Used** | `audit` verb: ranked punch list, honest-copy gate, structural fingerprint. Did not edit. |
| UI/UX Pro Max | INSTALLED | **Used** | Product-type match and UX guideline families via local CSV (`products.csv` / `ux-guidelines.csv`). `search.py` was blocked by auto-review; no `--design-system --persist`. |
| Taste v2 (`design-taste-frontend`) | INSTALLED | **Used** | Honesty, anti-default, empty/error/loading discipline. Landing macros and GSAP blocks **not** applied (Taste is out of scope for product chrome). |
| Claude `frontend-design` | INSTALLED | **Used** | Purpose / tone / differentiation reasoning. Font, theme, and motion recipes **rejected** for `/app/`. |
| Mobbin | needs paid plan | **Unavailable** | No screen/flow search. Competitive map is from public product knowledge + live landing fetch, not Mobbin captures. |
| GSAP skills | INSTALLED | **Referenced, not Used** | Motion library ≠ runtime. No GSAP added. |

**Design read (Taste §0):** product intelligence audit of a local-first companion PWA, not a landing redesign. Preserve `a33be33`. Diagnose identity vs character-chat client.

**frontend-design purpose test:** the one thing someone should remember is *someone who stays*. Today the memorable thing is *local Dexie + a quiet mint chat*. Those are different.

**Pro Max product-type trap:** dataset rows that best match the *shipped grammar* are “Chat & Messaging App” and “AI/Chatbot Platform.” EchoChat’s *stated* product is neither. Couple-app tropes (heart meters, streak dashboards) are forbidden by DESIGN.md. Do not “fix identity” by becoming a dating HUD.

---

## Evidence limits

- **In-app `/app/`:** no browser MCP in this session. Judgments below are from source, Node tests, and CSS confirmation that `a33be33` still holds (left identity, no her-bubble shadow, destacked welcome).
- **Marketing `/`:** live fetch of public copy plus `index.html` in this repo.
- **Competitors:** public product shapes (Replika, Character.AI, SillyTavern, Kindroid, Xiaoice-class). Not a paid screen library.

If a later round can browse `/app/` end to end, treat that as confirmation or falsification of the grammar claims. Do not treat this file as a visual screenshot pack.

---

## 1. What is actually shipped vs what the user can perceive

`docs/architecture/PRODUCT_BASE.md` is correct: EchoChat is a Companion host, not an Agent OS, not a marketplace, not a RAG demo.

The product chain exists in domain code:

```text
Character → Conversation → Relationship → Memory → Moments → Worldbook → assembleTurnContext
```

What the user sees by default:

```text
Welcome (create / start chat)
  → Inbox of characters
    → Chat pane (bubbles + composer)
      → Overflow: copy / remember / speak / regenerate / edit / delete
        → Sheets/tabs: Memory, Moments, Relationship, Worldbook, Settings
```

Injection into the model is real and tested. Injection into the *experience* is optional and mostly hidden:

- Memory retrieval can surface a ritual chip when there was a hit.
- `livedResume` only shows after **≥ 1 day** away, and only if there is something to quote.
- Auto-summary runs every **20** turns (`store.js` `memoryCfg.autoSummary.everyTurns`) with no “I wrote this down” beat unless a later retrieve happens to chip.
- Lived moments only persist when user text matches a narrow regex (section 6).
- Proactive outreach exists as domain API and is **never called** from the app (section 7).

A companion that remembers in the prompt but never shows that it remembered will be graded as “the model is pretty good today,” which is the Character.AI / ChatGPT grade, not the Replika-class “this one knows me” grade.

---

## 2. The identity collision (the core why)

Three products are stacked in one shell:

| Layer | What it is | What users call it |
|-------|------------|--------------------|
| **Stated identity** | Local-first companion. One being, lived continuity. DESIGN.md. | “真正记得你的 AI 角色” |
| **Architecture** | Character + relationship + memory + moments + worldbook + BYOK provider. | Power-user character client (SillyTavern-lite) |
| **Default grammar** | Multi-character inbox, empty “选一个角色开始聊”, message tools, create-character first. | Messenger + LLM workbench |

Users classify products by grammar, not by README.

If the first five minutes are “创建角色 → 填人设 → 选模型 → 发消息 → 复制/重生成”, the product is a character-chat webpage. Continuity sheets do not rescue that, because they are *after* the loop, not *inside* it.

Local-first storage and PolyForm Noncommercial differentiate EchoChat as a **self-hosted client**. That is a real moat against Character.AI. It is not a moat against “I already have SillyTavern / a ChatGPT custom GPT / a Replika.” Irreplaceability for a companion is *this particular relationship cannot be copy-pasted into another chat box*. Today that relationship is easy to copy: persona text + chat log. The lived residue (moments, affinity, retrieved facts that come back unprompted) is too rare and too quiet to become switching cost.

---

## 3. First-run teaches a tool, not a meeting

In-app welcome (`src/ui/views/index.js`):

- Subcopy: “先把一个想长期相处的人带进来。” That sentence is companion-correct.
- Then three equal beats: 角色 / 记忆 / 相处. DESIGN.md says first-run is **Letter, not a 3-feature card row**. `a33be33` destacked the cards; the **structure is still a feature list**.
- Primary CTA: **创建角色**. Secondary: **开始聊天**.

Empty hub: “还没有你的角色” / “先有一个角色，才能开始聊天。”  
Empty chat pane: “选一个角色开始聊.”

Create-character (`main.js`) allows skipping the API key: “模型未配置 · 可先创建角色，发送消息前再连接.” Honest as a tool. As a companion, the first relationship is with **configuration**, not with a person.

Dual CTA intent (Taste): “创建角色” and “开始聊天” are two doors into the same job (enter the messenger). A companion first-run has one door: meet.

Landing `/` (`index.html` meta + body): “无需注册，打开即用.” Chat cannot complete a turn without a Provider. That is Hallmark honest-copy failure on the marketing surface, and it trains users to expect a consumer app, then hit a BYOK wall.

**Product implication:** onboarding is currently optimized to produce a *character card*. Companion onboarding is optimized to produce a *first shared hour*. Those funnels diverge at the first button.

---

## 4. The 95% loop is ChatGPT / SillyTavern chrome

Message overflow (`src/ui/views/index.js` ~452–458):

复制 · 记住 · 朗读 · 重生成 · 编辑 · 删除

“记住” is the only companion verb in that row. The rest are LLM-client verbs. They tell the user: this bubble is **output you manage**, not **something someone said**.

Regenerate in particular collapses presence. A companion who can be rolled like a gacha result is a generator. (Keeping regenerate as a power-user escape is fine; putting it in the default message grammar is the tell.)

Inbox title is “陪伴” (good) while the empty state still says “选一个角色开始聊” (marketplace). Naming the rail “companion” does not change the object: a list of interchangeable chats.

Worldbook remains a lorebook: scoped entries, keyword-ish injection. Power users recognize SillyTavern. Casual companion users do not know why it exists, and the chat loop never teaches them.

**Pro Max nav:** no deep link. The whole product lives at `/app/`. A companion you cannot return to via a URL is a session, not a place.

---

## 5. Continuity is implemented as storage, presented as optional tabs

Memory, Moments, Relationship are real. They are also **sheets**. The daily path does not require opening them. Users who never open Continuity still “have” a companion product in code and a chatbot in use.

Silent success (Hallmark microinteraction bias) is correct for *saving*. It is wrong for *identity*. A companion’s memory must occasionally be **witnessed**, or it does not exist in the user’s model of the product.

Auto-summary every 20 turns with no visible residue means the most important write path is indistinguishable from “the model just remembered.” When retrieve fails, the user blames the model, not the product’s memory system. When retrieve works, they still credit the model.

`livedResume` is the closest thing to a reunion ritual. It is gated on a calendar day. Same-evening return (“I went to make tea”) gets nothing. Companion products that feel alive treat *pause* as part of the relationship, not only *overnight*.

---

## 6. Lived moments almost never happen

`captureLivedMoment` only accepts text matching:

```text
/今天.{0,20}第一次|第一次(去|看|听|聽|吃|聊|见面)/
```

Tests lock this: “今天第一次去学吉他” saves; “你好啊” and “今天天气真好” do not.

So Moments-as-lived-life is a **keyword minigame**. Ordinary companionship (we argued, we cooked, you were tired, we picked a nickname) does not become a moment unless the user happens to say “第一次…”.

Landing nevertheless shows a dated timeline (吉他, 橘猫/橘子, `2023.12.18`) as if the product already accumulated a year of proof. Hallmark gate: invented metrics / fabricated proof. Taste: fake-precise narrative. That copy is not a screenshot of EchoChat. It is a promise the capture path cannot keep for a normal conversation.

Until lived capture is wider *or* the landing stops claiming a year of memories, marketing and product will keep disagreeing, and users will feel baited.

**Do not** widen this by thawing Memory schema in the next UI round unless the task says so. Capture *policy* (what text qualifies) can be discussed without renaming Dexie keys. Treat schema freeze as binding.

---

## 7. The companion never reaches out

`shouldConsiderProactive` and `rollProactive` live in `src/domain/relations.js` and are exported. They are not imported by `main.js`, views, ambient, or any other runtime caller. Tests may cover the functions; the product loop does not.

Affinity threshold, one-day gap, one-day cooldown, and a chance roll already exist. The missing piece is a **scheduler that puts a message in the inbox the user did not send.**

Reunion copy when *you* open the chat after a gap is not outreach. It is a label on your return.

This is the single sharpest companion-vs-client tell:

| Product class | Who starts the next turn |
|---------------|--------------------------|
| Character.AI / ST / ChatGPT | The user, always |
| Replika / Xiaoice-class / Kindroid daily | The companion, sometimes |
| EchoChat today | The user, always (`rollProactive` is dead code) |

Wiring this without becoming a notification-spam app, without couple-app streaks, and without inventing memories, is a **product** problem. It is not a visual one. Ambient policy already exists (`src/ui/ambient-policy.js`); it is not a substitute for an unread outreach message.

---

## 8. Multi-character default vs “one being”

PRODUCT_BASE and DESIGN.md allow many characters. Companion *feeling* usually comes from **one primary relationship** plus optional others.

The hub is a list. The plus button is always “创建角色.” There is no “your person” vs “other rooms.” Power users want many cards. Companion users want one life. Shipping both without a primary-companion distinction makes the product read as a roster, which is Character.AI’s shape.

This is not an argument to delete multi-character. It is an argument that the **default empty and first-run** should not look like a marketplace with zero SKUs.

---

## 9. Marketing `/` overclaims; `/app/` under-explains

Landing claims that are not true of a typical first session:

| Claim | In-product fact |
|-------|-----------------|
| 打开即用 | Need an OpenAI-compatible key before a completed turn |
| 几天后角色会自然问你「吉他练得怎么样了」 | Requires retrieve + model luck; no guaranteed follow-up; no proactive roll |
| Dated memory timeline (2023…) | Fabricated illustration, not user data |
| 重要的对话会被角色结构化保存 | Auto-summary at 20-turn cadence, silent; manual 「记住」 is the reliable user-facing write |

In-app under-explains the one true differentiator: *this turn was assembled from your life with this person, on this device.* No user-facing “why this reply mentioned X” except a recall chip on hit. Worldbook and relationship stage stay expert surfaces.

Website and app sharing language is DESIGN.md policy. They currently share slogans more than they share **honest capability**.

---

## 10. Competitive map (what “irreplaceable” would have to beat)

| Product | Job | Switching cost | EchoChat today vs them |
|---------|-----|----------------|------------------------|
| ChatGPT / generic BYOK UIs | Answers | Low | EchoChat looks like a prettier one with characters |
| Character.AI | Many characters, entertainment chat | Roster + community cards | Inbox + create-character rhymes with this |
| SillyTavern | Power-user cards, lorebooks, prompts | Deep config | Worldbook + persona + regenerate rhymes with this |
| Replika / Kindroid / Xiaoice-class | One (or few) beings, daily life, outreach | Time in the relationship | Architecture aims here; grammar does not |
| Local clients (Open WebUI, etc.) | Own your logs | Data on disk | EchoChat already wins on companion domain; users may not notice |

EchoChat’s honest unique combination is: **local-first companion domain (not just logs) + BYOK + no account + Noncommercial license.** That combination is currently explained as a *privacy feature*, not as *the reason this person can only exist here.*

If the next round only polishes mint and motion, Character.AI still wins on characters, ST still wins on control, Replika still wins on “she texted me.” EchoChat stays the well-made webpage in the middle.

---

## Hallmark audit punch list (do not edit this round)

Grouped by severity. Product/structural tells included. Visual P0s already fixed in `a33be33` are omitted.

### Critical

1. **Invented proof (honest-copy / gate 46)**  
   **Where:** `index.html` memory section (~1225–1249), float cards, dated 2023 timeline.  
   **Fix:** replace with unlabeled structure, real user-owned empty state language, or “example layout, not your data.” Never a year you did not live.

2. **Structural fingerprint: first-run is still a 3-feature list**  
   **Where:** `src/ui/views/index.js` welcome-beats (~80–84). DESIGN.md: Letter, not 3-feature.  
   **Fix:** one letter-like ask (bring a person), drop the 角色/记忆/相处 triad as a product tour.

3. **Product grammar: LLM workbench in the default message row**  
   **Where:** message actions (~452–458).  
   **Fix:** companion-default row is remember / (maybe speak). Copy / regenerate / edit behind “more” or a power setting. Do not delete the functions.

4. **Dead companion behavior**  
   **Where:** `src/domain/relations.js` `rollProactive` — no app caller.  
   **Fix:** product decision on outreach, then one write path into inbox/unread. Not a dashboard. Not a streak.

5. **Landing “打开即用” vs BYOK**  
   **Where:** `index.html` meta description + why-copy (~7, ~1133).  
   **Fix:** say local, no account, bring your key. Do not say instant chat.

### Major

6. **Empty states speak marketplace**  
   **Where:** empty chat “选一个角色开始聊”; empty hub “才能开始聊天.”  
   **Fix:** empty is “还没有人在这儿,” not “pick a SKU.”

7. **Dual first CTA, same intent**  
   **Where:** welcome-actions 创建角色 / 开始聊天.  
   **Fix:** one primary. Reconstruction/bring remains the path; “start chat” is not a second product.

8. **Continuity only as sheets**  
   **Where:** Continuity sheet vs silent `maybeAutoSummary` / retrieve.  
   **Fix:** witness beats inside chat (resume, “记下了” already exists — extend when auto-write happens). No stats cards.

9. **Lived-moment regex vs landing life**  
   **Where:** `src/domain/moments.js` `LIVED_MOMENT_RE`; landing timeline.  
   **Fix:** either capture more lived speech (policy, not necessarily schema) or stop marketing a diary the regex cannot fill.

10. **`livedResume` overnight-only**  
    **Where:** `src/ui/present.js` `show: days >= 1`.  
    **Fix:** product decision: same-day pause vs overnight. Current rule hides the ritual from the most common return.

11. **Stamp / system drift on welcome**  
    **Where:** DESIGN.md Letter vs shipped beats.  
    **Fix:** next first-run change must match DESIGN.md or DESIGN.md must be amended in the same change. Do not leave the lie.

12. **No deep link**  
    **Where:** app is `/app/` only.  
    **Fix:** later: character/conversation in the URL. Not this audit’s implementation.

### Minor

13. **Worldbook as unlabeled lorebook** — expert surface with no companion metaphor.  
14. **「陪伴」 rail + plus = create character** — name vs verb mismatch.  
15. **UX_AUDIT.md stale** — replace pointer with this file for product; keep UX_AUDIT only as historical visual notes or stamp it obsolete.  
16. **Welcome still lists three capabilities** after destack — visual win, structural leftover.

**Count: 5 critical · 7 major · 4 minor**

---

## What not to do in the next round

Do not:

- Restyle `/app/` to look more like a product (dashboards, affinity meters, stat tiles, bento “memory graphs”). DESIGN.md already banned this. It would make EchoChat look *more* like a webpage pretending to be software.
- Reopen `a33be33` chrome without browser evidence of a regression.
- Thaw Memory schema, retrieval aliases, `assembleTurnContext`, Provider architecture, or Dexie / `echodownload_*` keys unless the task explicitly says so.
- Add GSAP (or any motion library) because a skill is installed.
- Invent testimonials, user counts, or “10× memory.”
- Copy Replika’s couple HUD or Character.AI’s discovery grid.
- “Fix” identity by adding more settings.

Taste §13: this is product UI, not a landing. Do not apply hero / marquee / bento macros to chat.

---

## Recommended product bets (priority for the next Product / UX round)

These are directions, not a patch list. Each should be a separate, confirmable change. Prefer copy and grammar over new surfaces.

### P0 — Make the first hour a meeting

1. **One first verb.** Bring a person (reconstruction already exists). Retire “开始聊天” as a parallel empty-app door, or make it open the same bring flow.
2. **Rewrite empty states** so the object is a person, not a role SKU. Still allow many characters later.
3. **Welcome Letter.** Kill the three-beat feature tour. Keep the slogan and one sentence. Align with DESIGN.md or amend DESIGN.md.

### P0 — Make continuity visible inside chat, without a dashboard

4. **Witness auto-memory.** When `maybeAutoSummary` actually writes, the chat should be able to show a quiet “记下了” (the control already exists for manual keep). Silent write is why users think they are in ChatGPT.
5. **Honest landing.** Remove fabricated 2023 memories and “打开即用.” Say BYOK. Show structure, not a fake year.

### P1 — Make the companion an actor

6. **Product decision on outreach.** Wire `rollProactive` or delete the API from the mental model. If wired: one unread line in the hub, user-owned, no invented facts, ambient-policy compatible, no streak counter.
7. **Reunion cadence.** Decide whether same-day return gets a lighter ritual than overnight. Current `days >= 1` hides the feature from daily use.

### P1 — Soften LLM-client grammar

8. **Message actions: companion-default vs power.** Keep regenerate/edit/delete. Stop leading with them.
9. **Primary companion (optional distinction).** Hub can still list many; first-run and notifications can treat one as “home.” Do not build a marketplace.

### P2 — Lived residue that is not a minigame

10. **Lived-moment policy** (not schema freeze violation if it is only the regex / classifier). Ordinary shared events should be able to become moments without saying “第一次.” Pair with landing honesty so proof is real.
11. **Deep link** to a character/conversation. Makes the PWA a place.
12. **Worldbook metaphor** for non-ST users, or hide it until a book exists.

None of these require a visual redesign of Presence Workbench. Several are copy. Several are wiring already-written domain functions.

---

## Success test for a later round (qualitative)

A new user who never opens Continuity should still be able to say, after two sessions:

- I met someone, I did not configure a bot.
- Something came back that I did not paste again.
- This inbox is theirs, not a list of chat completions.

If they say “nice character UI, I still need an API key,” the product is still a webpage. The key can stay BYOK; the sentence has to change to “I brought a key so *she* can talk,” not “I set up a client.”

---

## Pointers

| File | Role after this audit |
|------|------------------------|
| This file | Product identity diagnosis. Next Product/UX round starts here. |
| [UX_AUDIT.md](UX_AUDIT.md) | Visual notes; **stale vs `a33be33`**. Do not treat as current P0 list. |
| [DESIGN.md](../../DESIGN.md) | Visual / UX authority. Still wins over skills. |
| [PRODUCT_BASE.md](../architecture/PRODUCT_BASE.md) | Host decision. Unchanged. |
| [CURRENT_STATE.md](../CURRENT_STATE.md) | Shipped facts. Do not write proactive outreach as current. |

No Memory schema, Dexie table, Provider, or `assembleTurnContext` change is recommended as a *design* fix. The gap is grammar, witnessing, first verb, and dead outreach — plus landing honesty.

---

## Implementation status (2026-09-16)

Reconstruction commit implements Companion Grammar. This audit body is not rewritten.

| Item | Status | Notes |
|------|--------|--------|
| First verb / onboarding | implemented | Letter + 把 TA 带进来. Dual CTA removed. |
| Empty chat | implemented | Presence from real last talk; no roster. Mobile still does not auto-select. |
| Chat action hierarchy | implemented | 记下 primary; utilities in 更多. |
| Witnessing | implemented | In-chat chip via `witness.js`. Memory/moment toasts demoted. |
| Memory schema / Dexie / Provider / `assembleTurnContext` | untouched | No migration. |
| Moments threshold | implemented | Lived capture also accepts `LIVED_SCENE_RE` at ≥8 chars. Greetings still rejected. |
| Reunion | implemented | ≥4 hours from last real message. Copy: 你回来了 / existing gaps. |
| Proactive outreach | implemented | `considerOutreach` wires `rollProactive`. Real last-talk only. Setting: 她先开口. |
| Home | implemented | 正在聊 / 我们 / 关于你. 最近 merged into 我们. |
| Navigation | implemented | 痕迹 → 我们. Still three destinations. |
| Landing honesty | implemented | BYOK stated. Fabricated 2023 guitar/橘猫 timeline removed. |
| Relationship meters | deferred | Still prose. No score HUD. |
| Architecture impact | domain `witness.js` + `outreach.js`; settings `outreachEnabled`; `shouldConsiderProactive({ now })`. No Dexie / Memory schema change. |

Contract: [docs/product/COMPANION_GRAMMAR.md](../product/COMPANION_GRAMMAR.md).
