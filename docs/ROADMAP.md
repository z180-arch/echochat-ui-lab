# EchoChat Lite — Roadmap

There is no Stage 0–13 queue and no master backlog file besides this page.

Already-shipped work is listed as **CURRENT**, not as TODO.

---

## CURRENT

Shipped in the running product (see code + [CURRENT_STATE.md](CURRENT_STATE.md)):

- Local-first companion loop (chat send/stream, in-app hub)
- Character as a domain entity (Dexie + legacy fallback)
- Conversation, message store, memory, worldbook, relationship, moments
- Reconstruction import path
- PWA with scope `/app/`
- Marketing landing at `/`, application at `/app/`
- Morning Mint in-app UI
- Minimal in-process plugin contract (empty builtin list; DSH adapter reserved)
- Architecture decision: EchoChat remains the product base; turn context is the composition root ([PRODUCT_BASE.md](architecture/PRODUCT_BASE.md))
- Core context composition (Character / persona / Memory / Relationship / Lived Continuity / Worldbook / plugin extraPrompt) is freeze-ready on the product path; live model utilization still needs a local `ECHOCHAT_API_KEY` run

---

## NEXT

No authorized product backlog is checked into this repository.

Next work should come from **production observation and evidence**, as a small explicit work package — not from [docs/history/](history/) or old V1/V1.1 stage lists.

Do not start plugins, storage-key renames, or UI redesigns unless a task explicitly asks for them.

---

## LATER

Recorded intent only (not scheduled):

- Package the application **without** the marketing landing (`index.html` / `landing-v3.html`)
- DSH / Cordis / marketplace / sandbox / plugin SDK — not scheduled; see [PLUGIN_POLICY.md](architecture/PLUGIN_POLICY.md)
