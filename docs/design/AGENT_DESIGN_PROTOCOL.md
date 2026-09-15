# EchoChat Agent Design Protocol

How a future coding agent works with the Design Intelligence Layer.

This file is **procedure**. [DESIGN.md](../../DESIGN.md) is **authority**. [AGENTS.md](../../AGENTS.md) is **operational rules** (layers, freezes, git).

---

## Authority order

1. EchoChat product purpose (companion continuity — not a chatbot wrapper)
2. `DESIGN.md`
3. EchoChat UX architecture (this protocol + `UX_AUDIT.md` + surface rules in DESIGN.md)
4. This file
5. Selected design skill (one lead)
6. External visual reference
7. Generic frontend convention

If a skill recommends a pattern that fights product purpose (dashboard widgets, XP meters, ChatGPT chrome, landing-page heroes in `/app/`), discard the skill’s pattern.

Skill availability is environment-dependent. EchoChat design authority is repository-dependent.

---

## Skill Loading Protocol

Future agents execute this **before** claiming a named skill was used.

### Step 1 — Authority

Read [DESIGN.md](../../DESIGN.md).

### Step 2 — Contract

Read [SKILL_REGISTRY.md](SKILL_REGISTRY.md). That file is the contract: name, upstream, version/commit, license, local path, status, triggers, limitations. It is **not** the third-party skill body.

### Step 3 — Classify the task

Exactly one primary class:

- redesign
- audit
- visual polish
- typography
- layout
- UX architecture
- motion
- cinematic transition
- accessibility
- responsive
- design research
- landing (`/` only)

### Step 4 — Design Lead

Pick **one** lead from the matrix below. DESIGN.md remains authority even when the lead is Hallmark.

### Step 5 — Supporting skills

At most **2–3**. Never let every installed skill co-author a page.

### Step 6 — Status check

For each selected skill, read its row in `SKILL_REGISTRY.md`, then check whether the **local path** (or this agent’s equivalent) is actually readable.

| Status | Meaning | May declare |
|--------|---------|-------------|
| `INSTALLED` | This machine has the skill files; they can be loaded | **Used** (after loading) |
| `AVAILABLE` | Readable in this agent environment without a project install | **Used** (after loading) |
| `RESEARCH-ONLY` | Principles were studied; the skill cannot be invoked here | **Referenced** |
| `UNAVAILABLE` | No reliable upstream, or this environment cannot use it | **Unavailable** |
| `EXTERNAL TOOL` | Browser extension / GUI app, not an agent skill | **Referenced** (tool), never **Used** as a skill |
| `NOT VERIFIED` | Files exist locally but origin/license/version is unconfirmed | **Referenced** unless you verify first |

### Step 7 — Claim language

Only `INSTALLED` / `AVAILABLE` skills that were actually opened may be declared **Used**.

Otherwise write **Referenced** or **Unavailable**. Do not write **Used** for a skill you did not load.

### Update policy

Skill installation is **infrastructure**, not a UI task. Re-run install/update only when: a skill version changes, a skill becomes unavailable, upstream moves, or the agent environment changes. Normal UI work reads the already-installed skill.

Do not reopen validated `/app/` UI from `a33be33` because a skill was newly installed. Need browser evidence or an explicit design conflict.

### GSAP / Open Design / extensions

- **GSAP skill installed ≠ GSAP runtime dependency.** EchoChat motion is CSS-first (`docs/design/MOTION.md`). Do not add `gsap` to the app because the skill exists.
- **Open Design:** do not clone the whole library into this repo. Use only the modules listed in the registry.
- **design-md-chrome:** Chrome extension. Not an EchoChat dependency. Record as `EXTERNAL TOOL`.
- **PencilPlaybook:** Pencil.dev canvas workflows. Not EchoChat runtime.
- **Landing Page Generator:** no single official upstream. EchoChat landing is `index.html` / `landing-v3.html` under DESIGN.md + Hallmark.

---

## When this protocol fires

Any task matching: 优化 UI · 改 UI · redesign · make it premium · improve UX · prettier · polish · this page · this component · visual QA · motion · spacing · typography.

Does **not** fire for: Dexie, Memory schema, `assembleTurnContext`, Provider HTTP, retrieval aliases, storage keys.

---

## Skill priority matrix

Pick **one Design Lead** and at most **2–3 supporting** skills. Never let every skill co-author a page.

| Task | Design Lead | Supporting |
|------|-------------|------------|
| Page redesign | Hallmark | Claude-style UX reasoning (if loaded) |
| Anti-AI-slop | Hallmark | DESIGN.md |
| Visual polish | Taste (redesign / Emil) | Hallmark |
| Typography | Taste | DESIGN.md |
| Layout / IA | DESIGN.md | Hallmark |
| UX architecture | DESIGN.md | this protocol |
| Motion | `docs/design/MOTION.md` | Taste / Emil — GSAP only if CSS cannot |
| Cinematic / reunion | MOTION.md cinematic band | Cinematic UI skill if loaded |
| Design research | recorded in `docs/design/references/` | DESIGN.md |
| Wireframe / alt directions | PencilPlaybook if loaded | DESIGN.md |
| Accessibility / responsive heuristics | DESIGN.md | UI/UX Pro Max if actually loaded |
| Marketing landing `/` | Hallmark (landing generator is `UNAVAILABLE`) | DESIGN.md (shared language only) |
| App core UI | **DESIGN.md** | Hallmark + Taste |

Project skill `echo-references` still applies to `src/ui` and `src/styles`: reuse tokens/sheets; do not pick a Hallmark catalog theme for `/app/`.

If a named skill is **not installed or not readable**, do not pretend it was used. Record **Referenced** or **Unavailable** in the review. See Skill Loading Protocol above.

---

## Execution steps

### 1 — Read

Required:

- `DESIGN.md`
- this file (including Skill Loading Protocol)
- `SKILL_REGISTRY.md` when an external skill might be used
- relevant specialist doc (`MOTION.md`, `COMPONENT_GUIDELINES.md`, `UX_AUDIT.md`)
- the component / view / CSS you will touch
- covering tests under `tests/ui_*.mjs`

### 2 — Understand

Answer in the change (commit body, review template, or PR — not a manifesto):

1. What is this page’s product job?
2. What state is the user in?
3. What is the single next action?
4. What is Primary / Secondary / Supporting?
5. What hierarchy problem exists now?
6. What in DESIGN.md does the current UI violate?

### 3 — Classify

Exactly one: page redesign · component redesign · visual polish · UX architecture · typography · motion · responsive · accessibility · design research.

### 4 — Select skills

One lead. 0–3 supporting. Write the names in the review.

### 5 — Design

Reason first. For a P0 surface, write a short Design Decision (problem, choice, rejected alternatives). If two directions are both legal under DESIGN.md, compare against: user goal, hierarchy, continuity, identity, density, responsive, a11y, implementation cost. Pick the EchoChat one. Do not generate variation for theatre.

### 6 — Implement

Smallest change. No feature creep. No fake data. No architecture thaw.

Allowed: UI, UX presentation, visual system, hierarchy, nav presentation, motion, responsive presentation, typography, color *usage*, spacing, composition.

Frozen unless the task explicitly says otherwise: Memory schema, retrieval, `assembleTurnContext`, Provider architecture, Dexie schema, `echodownload_*` keys, license, Character Continuity domain.

### 7 — Test

Covering `tests/*.mjs` first, then `npm test` for the problem commit. Do not delete tests to go green. Update tests that encoded a superseded visual decision (e.g. a mint relationship *card*) in the same commit as the visual change.

### 8 — Visual QA

If browser tools exist: open `/app/`, exercise the surface, screenshot. Check hierarchy, density, type, alignment, color, depth, affordance, identity, anti-slop, responsive, motion.

If they do not: run the closest `scripts/*_verify.mjs` that covers the surface **only when Chrome is available**; otherwise say what could not be verified.

### 9 — DESIGN.md compliance

Run the Visual Quality Gate and Anti-AI-slop list in DESIGN.md.

### 10 — Fix

Do not ship a known visual miss.

### 11 — Commit

One complete UI subgoal per commit. Messages: `design: …` / `fix(ui): …` / `refactor(ui): …`. Do not `git add .`. Do not make one “complete ui overhaul” commit.

### 12 — Document

If the system changed (new token role, new density rule, rejected a pattern), amend DESIGN.md or the specialist doc. Do not leave a second conflicting rule in `docs/design.md`.

---

## Hallmark on this repo

- **Audit / redesign / anti-slop:** allowed.
- **Catalog theme rotation for `/app/`:** forbidden. This is a `DESIGN.md`-managed product; pages share the system.
- **Marketing `/`:** Hallmark macros allowed if they keep Morning Mint language.
- Screenshots of the live app are **current-state evidence**, not DNA to clone.

---

## Browser / responsive / reduced-motion QA

Minimum widths: 390, 640, 768, 1024, 1200, 1280, 1440.

Reduced motion: `prefers-reduced-motion: reduce` must keep usability and drop decorative animation (ambient canvas, welcome letter stagger, bubble rise).
