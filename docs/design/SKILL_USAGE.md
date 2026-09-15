# EchoChat Design Intelligence — Usage Log

Major UI work and which skills were actually loaded. New agents should append a row; do not rewrite history.

**Used** means the skill was `INSTALLED` / `AVAILABLE` and opened. **Referenced** means principles were applied from DESIGN.md / research, not a loaded skill file.

| Date | Surface | Lead | Supporting | Claim | Outcome |
|------|---------|------|------------|-------|---------|
| 2026-09-15 | Design Intelligence Layer (`DESIGN.md`, `docs/design/*`, `AGENTS.md`) | DESIGN.md | Hallmark (anti-slop / structure language) | Hallmark **Used** (readable at `~/.agents/skills/hallmark`) | Commit `9708023`. No page restyle in that commit. |
| 2026-09-15 | Companion Home | Hallmark | Taste (`taste-redesign`, `emil-design-eng`) | Hallmark **Used**; Taste family **Used** (pre-existing `~/.claude/skills`) | Commit `a33be33`. Presence workbench, identity first, traces as supporting. |
| 2026-09-15 | Chat | Hallmark | Taste | Hallmark **Used**; Taste **Used** | `a33be33`. Paper transcript, quieter chrome, grouped bubbles. |
| 2026-09-15 | Navigation | Hallmark | DESIGN.md | Hallmark **Used** | `a33be33`. Continuity weighting, not a feature list. |
| 2026-09-15 | Memory, Moments, Relationship, Settings | Hallmark | Taste | Hallmark **Used**; Taste **Used** | `a33be33`. Lived surfaces, not dashboard cards. |
| 2026-09-15 | Skill infrastructure (this registry) | — | — | Install/register only. **No UI redesign.** | Registry + protocol + `AGENTS.md`. Preserve `a33be33`. |

Official Taste v2 (`design-taste-frontend`), Claude `frontend-design`, GSAP skills, Open Design modules, UI/UX Pro Max, Cinematic UI, and PencilPlaybook were **not** Used on `a33be33`. They were installed or registered later the same day.

Claude Design / Open Design / GSAP / Cinematic / Pro Max / PencilPlaybook / design-md-chrome / Landing Page Generator: see [SKILL_REGISTRY.md](SKILL_REGISTRY.md) for current status. Do not backfill **Used** onto older commits.
