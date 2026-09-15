# EchoChat External Design Intelligence Registry

Repository-level **contract** for design skills. This file is not a skill body.

- **Skill availability** is environment-dependent (Cursor vs Claude Code vs Codex vs others).
- **EchoChat design authority** is repository-dependent: [DESIGN.md](../../DESIGN.md) wins.
- Do **not** vendor third-party skill trees into this repo unless a later task cites a license that allows it **and** the user asks to vendor.
- Do **not** add GSAP (or any other motion library) to the production runtime because a GSAP skill is installed.
- Last verified: **2026-09-15** (this machine: Windows, Cursor Agent + Claude Code skill dirs).

How to load: [AGENT_DESIGN_PROTOCOL.md](AGENT_DESIGN_PROTOCOL.md) → Skill Loading Protocol.  
How other agents discover this: [AGENTS.md](../../AGENTS.md) → Design Intelligence.  
Past use: [SKILL_USAGE.md](SKILL_USAGE.md).

Canonical machine path on this host (unless a row says otherwise):

```text
C:\Users\toko\.agents\skills\<skill-name>\SKILL.md
```

Claude Code mirrors (verified 2026-09-15): `C:\Users\toko\.claude\skills\<skill-name>\`.  
Cursor project adapter (EchoChat-owned, committed): `.cursor/skills/echo-design-intelligence/`.  
Codex CLI: **not on PATH** here; `C:\Users\toko\.codex\skills\` does not contain the npx-installed set (only a manual `frontend-design` copy).

Install / update (infrastructure, not a UI task):

```text
npx skills add <owner/repo> -g -y --copy
npx skills update -g
```

Always pass `-g` so skills land in the user environment, not in this git tree.

---

## Status vocabulary

| Status | Meaning |
|--------|---------|
| `INSTALLED` | This machine has the skill files; they can be loaded |
| `AVAILABLE` | Readable here without a project-level install |
| `RESEARCH-ONLY` | Principles studied; cannot invoke the skill as a runtime |
| `UNAVAILABLE` | No reliable official upstream, or this environment cannot use it |
| `EXTERNAL TOOL` | Browser extension / GUI, not an agent skill |
| `NOT VERIFIED` | Local files exist; origin, license, or version unconfirmed |

Declare **Used** only for `INSTALLED` / `AVAILABLE` skills you actually opened.

---

## Summary

| Skill | Status | Role | Source | License | Installation | Trigger |
|-------|--------|------|--------|---------|--------------|---------|
| Hallmark | `INSTALLED` | Primary | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | MIT | `npx skills add nutlope/hallmark -g` → `~/.agents/skills/hallmark` | Page redesign, audit, anti-slop, `hallmark study` |
| Taste (official v2) | `INSTALLED` | Primary | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT | `npx skills add Leonxlnx/taste-skill -g` → `design-taste-frontend` | Visual polish, variance, density; **not** dashboards / product chrome |
| Taste family (pre-existing) | `INSTALLED` + `NOT VERIFIED` origin | Supporting | Local `~/.claude/skills/taste-*` + `emil-design-eng` | Unknown (no LICENSE in tree) | Pre-existing; do not copy into git | Redesign / brutalist / minimal / output / Emil polish |
| Claude Design (`frontend-design`) | `INSTALLED` | Primary | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `plugins/frontend-design` | Apache-2.0 | Copied from Claude marketplace cache into user skill dirs | Design direction, anti-generic frontend, UX reasoning |
| GSAP Skills | `INSTALLED` | Supporting | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | MIT (skill repo). GSAP library has its own license | `npx skills add greensock/gsap-skills -g` | Advanced motion **only if CSS cannot**. Runtime dep = 0 |
| Open Design (selected) | `INSTALLED` (3 modules) | Supporting | [nexu-io/open-design](https://github.com/nexu-io/open-design) | Apache-2.0 | `npx skills add nexu-io/open-design -g --skill design-md --skill color-expert --skill web-design-guidelines` | DESIGN.md hygiene, color science, Vercel web-interface review |
| UI/UX Pro Max | `INSTALLED` | Supporting | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | `npx skills add nextlevelbuilder/ui-ux-pro-max-skill -g` | Searchable UX heuristics; DESIGN.md still wins |
| Cinematic UI | `INSTALLED` | Supporting | [akseolabs-seo/cinematic-ui](https://github.com/akseolabs-seo/cinematic-ui) (canonical; forks exist) | MIT | `npx skills add akseolabs-seo/cinematic-ui -g` | Rare reunion / cinematic band only. EchoChat is not a film site |
| design-md-chrome | `EXTERNAL TOOL` | Research | [bergside/design-md-chrome](https://github.com/bergside/design-md-chrome) / [UiCandy/design-md-chrome](https://github.com/UiCandy/design-md-chrome) | See upstream repo | Chrome extension. Not installed here. Related CLI: `npx typeui.sh` (not installed) | Extract DESIGN.md from a live page |
| PencilPlaybook | `INSTALLED` | Optional | [stevembarclay/pencilplaybook](https://github.com/stevembarclay/pencilplaybook) | MIT | `npx skills add stevembarclay/pencilplaybook -g` | Pencil.dev canvas. Not EchoChat `/app/` |
| Landing Page Generator | `UNAVAILABLE` | Optional | No single official upstream. Community forks on skills.sh (alirezarezvani, borghei, …) were **not** installed | — | Do not pick a random fork | EchoChat `/` uses Hallmark + existing `index.html` / `landing-v3.html` |

Project-owned (always in this repo, not external): `echo-design-intelligence`, `echo-references`, `echo-test`, `echo-change-review`, and the other `echo-*` skills.

Related but **not** the requested UI/UX Pro Max: `ui-design-brain` at `C:\Users\toko\.cursor\skills\ui-design-brain` (MIT, carmahhawwari/ui-design-brain). Do not confuse the two.

---

## Discovery for other coding agents

Any agent that reads project files can follow this without Cursor’s private config:

1. `AGENTS.md` → Design Intelligence  
2. `DESIGN.md`  
3. This file  
4. `AGENT_DESIGN_PROTOCOL.md`  
5. Environment check of the local paths below  

Claude Code also reads `~/.claude/skills/`. Cursor in this environment also listed `~/.agents/skills/hallmark` and `~/.claude/skills/taste-*`. Gemini / Codex / others: follow the same docs; install with `npx skills add … -g` if the skill is missing.

**Copy into git?** No, unless the row says redistribution is intended. MIT and Apache-2.0 *allow* copying; EchoChat still stores the **contract**, not the implementation.

---

## Hallmark

| Field | Value |
|-------|--------|
| Status | `INSTALLED` (existed before this round at `~/.agents/skills/hallmark`; re-registered 2026-09-15 via `npx skills add nutlope/hallmark -g -y --copy`) |
| Role | Primary — page redesign, audit, anti-slop |
| Upstream | https://github.com/Nutlope/hallmark |
| Version | Skill frontmatter **1.1.0** |
| Upstream HEAD (verified) | `13ac0ec7e148655948100b6396439e481361d690` |
| Lock folder hash | `747c924c4767b4d5fa6f1c59985c87a21c918334` |
| License | MIT (repo root `LICENSE`). The copied skill folder on disk has **no** LICENSE file; keep the URL. Redistribution into git: allowed by MIT, **not done**. |
| Local path | `C:\Users\toko\.agents\skills\hallmark\SKILL.md` (Claude mirror: `C:\Users\toko\.claude\skills\hallmark\SKILL.md`) |
| Install | `npx skills add nutlope/hallmark -g -y --copy` |
| Triggers | New UI, redesign, audit, `/hallmark`, study URL/screenshot |
| Limitations | Catalog theme rotation is **forbidden** for `/app/`. Marketing `/` may use Hallmark macros. Live-app screenshots are evidence, not DNA to clone. |
| Smoke test 2026-09-15 | SKILL.md readable; version 1.1.0 confirmed |

---

## Taste Skill

Two layers exist on this machine. Do not conflate them.

### Official Taste v2 (`design-taste-frontend`) — this round

| Field | Value |
|-------|--------|
| Status | `INSTALLED` (new 2026-09-15) |
| Role | Primary for visual polish on marketing/editorial surfaces; **supporting** for `/app/` (Taste v2 explicitly excludes dashboards / multi-step product UI) |
| Upstream | https://github.com/Leonxlnx/taste-skill · https://tasteskill.dev |
| Version | **v2 (experimental)** per upstream CHANGELOG; install name `design-taste-frontend`. v1 preserved as `design-taste-frontend-v1` |
| Upstream HEAD | `ccbc15639c97057cbfcf32ecebc38ef716e4bb37` |
| Lock folder hash | `a6d128e53b4ec0238baee751dde33bf707adb5ec` |
| License | MIT |
| Local path | `C:\Users\toko\.agents\skills\design-taste-frontend\SKILL.md` |
| Install | `npx skills add Leonxlnx/taste-skill -g -y --copy` |
| Also installed from the same repo | `design-taste-frontend-v1`, `gpt-taste`, `stitch-design-taste`, plus other pack skills the CLI selected (13 skills in the repo) |
| Limitations | Do not restyle EchoChat `/app/` as a landing/portfolio. Do not introduce Inter/Geist as brand type. DESIGN.md type stack stays Noto Sans SC. |
| Smoke test | SKILL.md readable (`tasteskill: Anti-Slop Frontend Skill`) |

### Pre-existing Taste / Emil pack — already on disk

| Field | Value |
|-------|--------|
| Status | `INSTALLED` locally; origin **`NOT VERIFIED`** |
| Paths | `C:\Users\toko\.claude\skills\taste-redesign`, `taste-brutalist`, `taste-minimalist`, `taste-output`, `emil-design-eng` |
| License | No LICENSE file in those folders |
| Used on | `a33be33` (Companion Home / Chat / lived surfaces) — see SKILL_USAGE.md |
| Update | Do not replace with a random download. Prefer official Taste v2 + Emil when both are readable |

---

## Claude Design Skill (`frontend-design`)

| Field | Value |
|-------|--------|
| Status | `INSTALLED` (this round: copied from Claude marketplace cache into user skill dirs; was **not** previously under `~/.claude/skills/frontend-design`) |
| Role | Primary — design direction, anti-generic frontend, UX reasoning |
| Upstream | https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design |
| Marketplace cache (source of copy) | `C:\Users\toko\.claude\plugins\marketplaces\claude-plugins-official\plugins\frontend-design\` |
| Plugin repo HEAD | `da823e86c8feef13b73b6712af11eadd38c992f6` |
| Version | No semver in SKILL.md. Author: Anthropic (`plugin.json`) |
| License | Apache-2.0 (`plugins/frontend-design/LICENSE`) |
| Local paths | `C:\Users\toko\.agents\skills\frontend-design\SKILL.md` · Claude / Cursor / Codex user dirs also have a copy |
| Not in | `~/.agents/.skill-lock.json` (manual copy, not `npx skills add`) |
| Triggers | Build/polish web UI; avoid generic AI aesthetics |
| Limitations | Skill encourages distinctive fonts and bold aesthetics. EchoChat `/app/` must keep Morning Mint + Noto Sans SC. Use the *reasoning*, not the font/theme suggestions that fight DESIGN.md. |
| Smoke test | SKILL.md readable; LICENSE copied beside it |

---

## GSAP Skills

| Field | Value |
|-------|--------|
| Status | `INSTALLED` (new 2026-09-15) |
| Role | Supporting — high-value motion only |
| Upstream | https://github.com/greensock/gsap-skills |
| Upstream HEAD | `aed9cfd3277740755f6bfc1155c7aa645403b760` |
| License | MIT (skill repository). **GSAP the library** is separately licensed; installing the skill does not add GSAP to EchoChat. |
| Local paths | `C:\Users\toko\.agents\skills\gsap-core` (and `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-utils`, `gsap-frameworks`, `gsap-react`, `gsap-performance`) |
| Lock hashes | `gsap-core` `135754edd728103e329a8df8b471b197375b370e` (others in `~/.agents/.skill-lock.json`) |
| Install | `npx skills add greensock/gsap-skills -g -y --copy` |
| EchoChat motion | ~90% CSS / native (`src/styles/motion.css`, `MOTION.md`). ~10% reserved for advanced motion. **Runtime GSAP dependency = 0.** `package.json` was not changed. |
| Smoke test | `gsap-core/SKILL.md` readable; license MIT in frontmatter |

---

## Open Design (selected modules)

Whole-library clone is **forbidden** for this repo. The upstream tree has 160+ skills (templates, Figma, fal, GSAP mirrors, etc.). Only EchoChat-relevant modules were installed.

| Field | Value |
|-------|--------|
| Status | `INSTALLED` for three modules; remainder of the library is **not installed** |
| Upstream | https://github.com/nexu-io/open-design · https://open-design.ai |
| Upstream HEAD | `39de577a5d4cd78b79da568af02c08b4f65676f1` |
| License | Apache-2.0 |
| Install | `npx skills add nexu-io/open-design -g -y --copy --skill design-md --skill color-expert --skill web-design-guidelines` |
| Modules | **design-md** (`32912e591b63ca0b9bd865d9aa04f210f12f56a230944902be998a2a5b1ac7d1`) — DESIGN.md authoring. **color-expert** (`434774c3bff1671b3e36cfe503d545fa557be76f5edad73aad886559648dd648`) — OKLCH / contrast. **web-design-guidelines** (`5f6253a6400e3e2ce453157222ca88a49af98643758f53bcf4d58972aa5514db`) — Vercel web interface guidelines. |
| Local paths | `C:\Users\toko\.agents\skills\design-md`, `color-expert`, `web-design-guidelines` |
| Not installed from Open Design | Open Design’s own `frontend-design` (Anthropic’s copy is the Claude Design skill), `anti-ai-slop` (no skill by that name in the tree), typography/design-system packs that were catalog-only or duplicative, GSAP mirrors (use greensock official), `ui-ux-pro-max` mirror (use nextlevelbuilder official) |
| Absorbed into EchoChat | DESIGN.md as source of truth; OKLCH as design record; anti-slop already in DESIGN.md |
| Smoke test | All three SKILL.md files readable |

---

## UI/UX Pro Max

| Field | Value |
|-------|--------|
| Status | `INSTALLED` — **not catalog-only**. Searchable CSV + `scripts/search.py` present |
| Role | Supporting — accessibility / responsive / UX heuristics. DESIGN.md still wins |
| Upstream | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill · https://uupm.cc |
| Upstream HEAD | `15de38fb70bc80ae9276fa7703b48ae861a672e6` |
| Lock folder hash | `f0415e89eeadda8933a49a3f432acae52fa542aa` |
| License | MIT |
| Local path | `C:\Users\toko\.agents\skills\ui-ux-pro-max\` (`SKILL.md`, `data/*.csv`, `scripts/search.py`, `references/`) |
| Data (catalog-summary.json, verifiedAt 2026-08-26) | 79 searchable styles (50 active), 192 palettes, 74 font pairings, 119 UX guidelines, 105 icons, 17 GSAP presets, 25 chart types, 22 stacks |
| Smoke test | `python scripts/search.py --domain ux --max-results 1 --json "companion chat hierarchy"` returned JSON from `ux-guidelines.csv` |
| Limitations | Dataset is generic product-UI. EchoChat is a companion, not a SaaS dashboard. Do not import stack templates (Next.js, shadcn) into this vanilla PWA. |

---

## Cinematic UI

| Field | Value |
|-------|--------|
| Status | `INSTALLED` (new 2026-09-15) |
| Role | Supporting — rare cinematic / reunion transitions |
| Upstream | **Canonical:** https://github.com/akseolabs-seo/cinematic-ui (MIT). Forks `prishsu0730/cinematic-ui` and `Neogod59/cinematic-ui` were **not** used. |
| Version / commit | Installed folder hash = upstream HEAD `24a66c1d6140c21ec0d0e4d9ef663a97264003de` |
| License | MIT |
| Local path | `C:\Users\toko\.agents\skills\cinematic-ui\SKILL.md` |
| Install | `npx skills add akseolabs-seo/cinematic-ui -g -y --copy` |
| Limitations | Skill is for film-inspired marketing sites. EchoChat is a companion PWA. Follow `MOTION.md` cinematic band only; do not restyle `/app/` as a movie site. Primary runtimes claimed: Claude Code and Codex. |
| Smoke test | SKILL.md readable (`# Cinematic Layout`) |

---

## design-md-chrome

| Field | Value |
|-------|--------|
| Status | `EXTERNAL TOOL` / research. **Not** an EchoChat runtime skill. Not installed on this machine (no local `design-md-chrome` directory). |
| What it solves | Chrome extension: extract type/color/spacing from a live tab → DESIGN.md / SKILL.md (TypeUI format) |
| Upstream | Original: https://github.com/bergside/design-md-chrome (`8e07614fb18752ab1ee14dd65a8ff93e63c9b13b`). Mirror: https://github.com/UiCandy/design-md-chrome (`7b3054f56ba0f2f0997c22be9580ce19812a0831`) |
| Related CLI | https://www.typeui.sh · `npx typeui.sh` — **not** installed this round (would write skill files into a project; we already have DESIGN.md) |
| Absorbed | EchoChat already keeps DESIGN.md as authority; do not generate a second competing DESIGN.md from a random site |
| How to enable later | Load the Chrome extension in a developer browser; do not add it as a PWA / npm dependency |

---

## PencilPlaybook

| Field | Value |
|-------|--------|
| Status | `INSTALLED` on this machine; **low value for EchoChat `/app/`** |
| Role | Optional — Pencil.dev `.pen` canvas workflows |
| Upstream | https://github.com/stevembarclay/pencilplaybook |
| Version | Frontmatter **1.1.0**; folder hash = HEAD `b7324295d73d67ea0a672cf16832880c111df0ed` |
| License | MIT |
| Local path | `C:\Users\toko\.agents\skills\pencilplaybook\SKILL.md` |
| Install | `npx skills add stevembarclay/pencilplaybook -g -y --copy` |
| Limitations | SKILL.md says it **must be configured before first use**. Requires Pencil.dev. EchoChat is vanilla HTML/CSS/JS, not Pencil. Do not introduce `.pen` files or Pencil as a host. |
| Smoke test | SKILL.md readable |

---

## Landing Page Generator

| Field | Value |
|-------|--------|
| Status | `UNAVAILABLE` |
| Why | No single official Anthropic / Vercel / EchoChat upstream. skills.sh lists **community** packages (`alirezarezvani/claude-skills`, `borghei/claude-skills`, `cyranob/*`). Installing a fork would violate “don’t treat search results as the official skill.” |
| EchoChat landing | Already shipped: `index.html`, `landing-v3.html`. Lead for `/` redesigns: **Hallmark**, under DESIGN.md (shared language, not shared layout with `/app/`). |
| Future enable | Only if the user names a specific official package |

---

## How a future agent updates this file

1. Do not reinstall on every UI task.  
2. When upgrading: `npx skills update -g`, then record new HEAD / folder hash / date here.  
3. Never `git add` `~/.agents/skills` or a cloned third-party tree.  
4. If a skill disappears from the environment, set status to `UNAVAILABLE` and keep DESIGN.md as the fallback.
