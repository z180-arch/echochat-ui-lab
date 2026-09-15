# Documentation

Source of truth is **running code**, then this folder.

| File | Read when |
|------|-----------|
| [CURRENT_STATE.md](CURRENT_STATE.md) | What is shipped, storage names, PWA, tests, debt |
| [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) | Stable / risks / next P0–P2 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers and the turn-context door |
| [architecture/PRODUCT_BASE.md](architecture/PRODUCT_BASE.md) | Why EchoChat is the host, not an agent OS |
| [architecture/PLUGIN_POLICY.md](architecture/PLUGIN_POLICY.md) | Plugin = `extraPrompt` only |
| [architecture/DATA_OWNERSHIP.md](architecture/DATA_OWNERSHIP.md) | User data vs code vs brand |
| [architecture/CURRENT_STATE_AUDIT.md](architecture/CURRENT_STATE_AUDIT.md) | 2026-09-15 architecture audit (code-verified) |
| [architecture/AGENT_SYSTEM_AUDIT.md](architecture/AGENT_SYSTEM_AUDIT.md) | 2026-09-15 agent-rules / skills / docs-loading audit |
| [architecture/ARCHITECTURE_IMPROVEMENT_PROPOSAL.md](architecture/ARCHITECTURE_IMPROVEMENT_PROPOSAL.md) | Follow-ups after P0; remaining P1 |
| [../DESIGN.md](../DESIGN.md) | Design authority — visual / UX / motion / anti-slop |
| [design.md](design.md) | Pointer to DESIGN.md (old path) |
| [design/AGENT_DESIGN_PROTOCOL.md](design/AGENT_DESIGN_PROTOCOL.md) | How agents change UI |
| [design/SKILL_REGISTRY.md](design/SKILL_REGISTRY.md) | External design-skill contract (status, license, path) |
| [design/SKILL_USAGE.md](design/SKILL_USAGE.md) | Which skills were used on which surfaces |
| [design/UX_AUDIT.md](design/UX_AUDIT.md) | Latest visual/UX audit |
| [design/MOTION.md](design/MOTION.md) | Motion language |
| [ROADMAP.md](ROADMAP.md) | CURRENT / NEXT / LATER |

Root files: [README.md](../README.md), [AGENTS.md](../AGENTS.md), [THIRD_PARTY_SOURCES.md](../THIRD_PARTY_SOURCES.md), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Project agent skills: `.cursor/skills/` (`echo-design-intelligence`, `echo-architecture`, `echo-storage`, `echo-context`, `echo-test`, `echo-change-review`, `echo-audit`, `echo-references`). Triggers are listed in `AGENTS.md`. External design skills: [design/SKILL_REGISTRY.md](design/SKILL_REGISTRY.md).

Do not reconstruct product decisions from git history snapshots or old stage names (Foundation, V1, V1.1).
