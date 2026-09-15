---
name: echo-design-intelligence
description: EchoChat Design Intelligence adapter. Read DESIGN.md, AGENT_DESIGN_PROTOCOL.md, and SKILL_REGISTRY.md before UI/UX/visual/motion work. Choose a Design Lead only after checking skill status. Use for redesign, polish, audit, typography, layout, motion, landing visuals. Do not use for Dexie, Memory schema, Provider HTTP, or assembleTurnContext.
---

# EchoChat Design Intelligence (adapter)

This file is **EchoChat-owned**. It is not Hallmark, Taste, or any third-party skill body.

## Authority

```text
Product purpose
→ DESIGN.md
→ docs/design/AGENT_DESIGN_PROTOCOL.md
→ docs/design/SKILL_REGISTRY.md
→ selected skill (if INSTALLED / AVAILABLE)
→ browser evidence
```

Skills do not decide how EchoChat looks. DESIGN.md does.

## Load order

1. [DESIGN.md](../../../DESIGN.md)
2. [docs/design/AGENT_DESIGN_PROTOCOL.md](../../../docs/design/AGENT_DESIGN_PROTOCOL.md) — Skill Loading Protocol
3. [docs/design/SKILL_REGISTRY.md](../../../docs/design/SKILL_REGISTRY.md)
4. Pick one Design Lead, at most 2–3 supporting skills
5. Open the **real** skill file from the registry local path if this environment has it
6. If it does not: follow DESIGN.md. Declare **Referenced** or **Unavailable**, never **Used**

## Do not

- Vendor third-party skill trees into this repo
- Add GSAP (or another motion library) to production because a GSAP skill is installed
- Reopen validated `/app/` UI from `a33be33` just because a skill was newly installed
- Claim a skill was used when it is `RESEARCH-ONLY`, `UNAVAILABLE`, or `EXTERNAL TOOL`

In-app component rules after this adapter: `echo-references`.
