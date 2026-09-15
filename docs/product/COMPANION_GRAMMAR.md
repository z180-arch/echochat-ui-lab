# Companion Interaction Grammar

EchoChat’s basic interaction unit is not a message. It is:

**encounter → conversation → witnessing → continuation**

Messages are how a conversation is written down. They are not the product.

This file is the contract for later agents. Visual tokens stay in [DESIGN.md](../../DESIGN.md). Product diagnosis stays in [docs/design/PRODUCT_INTELLIGENCE_AUDIT.md](../design/PRODUCT_INTELLIGENCE_AUDIT.md).

Do not invent Memory, Moments, relationship scores, or outreach. If there is no real last talk, stay quiet.

---

## First Verb

**把 TA 带进来.**

One door on first run. Not 创建角色, not 开始聊天, not dual CTAs.

The first job is to meet someone who will still be here. Reconstruction, a template, or a blank name are ways to bring that person in. They are not the product sentence.

API keys stay off the first impression. Hint only: 开口需要你自己的 API 密钥.

---

## Encounter Grammar

Empty house: **还没有人在这儿.**

If someone already exists, the empty chat surface shows **that person waiting**, from real `lastAt` / `lastPreview`. Not a roster grid.

First conversation with a new companion can offer starter chips from the character definition only.

---

## Conversation Grammar

Chat is paper in a room.

Primary action on a message: **记下** / **记下了** (continuity).

Secondary, behind **更多**: 复制, 朗读, 重生成, 编辑, 删除.

Do not put utility on the same semantic row as witnessing.

---

## Witnessing Grammar

When a durable fact or a lived moment is kept, the user sees a quiet in-chat line:

- 记下了 · …
- 这件事留下了 · …

Not a toast. Not “memory added.” Not schema language.

Manual 记下, quiet remember, lived capture, and auto-summary review all go through `noteWitness`.

---

## Reunion Grammar

If the last real message is ≥ 4 hours ago:

- same day: 你回来了
- 1 day: 隔了一天
- a few days / weeks / longer: existing gap copy

Show it on the header, resume strip, and Home 正在聊 — only next to real last preview. No modal. No “last session detected.”

---

## Proactive Grammar

`rollProactive` is wired.

A companion may speak first only when:

- the user has not turned **她先开口** off
- affinity and cooldown gates pass
- there is a real last-talk preview or a real moment
- the last message is not already outreach
- a 30% roll succeeds (existing chance)

The line is composed from that real last talk / moment. It is a `her` message with `metadata.outreach`. It does not `recordChatTurn`.

No daily random pings. No streaks. No engagement bait.

---

## Continuity Grammar

Home answers: **我们现在在哪里？**

Order: identity → 正在聊 → 我们 (relationship + latest lived fragment) → 关于你 → 这个世界.

Nav: **陪伴 · 我们 · 我的.**

我们 is lived days, not a feature named 痕迹.

Landing tells the truth: local-first companion, relationship accumulates, BYOK API key. It does not say 打开即用.
