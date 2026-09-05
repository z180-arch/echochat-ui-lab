> **HISTORICAL DOCUMENT**
> This document describes an earlier project state.
> It is NOT an authoritative description of the current implementation.
> See README.md and docs/CURRENT_STATE.md for the current state.

# EchoChat Landing Hybrid Implementation Plan

> **For agentic workers:** Execute task-by-task. User directed immediate implementation.

**Goal:** Restore Sanctuary landing quality and graft soft full-bleed OD Echo craft.

**Architecture:** Keep original `landing.html` DOM/CSS/JS for product sections. Add atmosphere layer (Echo WebGL + particles + stickers) behind hero grid. Assets under `assets/`.

**Tech Stack:** Vanilla HTML/CSS/JS, Three r160 + FontLoader/TextGeometry extras, helvetiker_bold typeface.

---

### Task 1: Vendor assets

- Create: `assets/three.min.js`, `assets/three-text-extras.js`, `assets/helvetiker_bold.typeface.json`

- [ ] Copy extras from Downloads; fetch three.min + helvetiker from jsDelivr

### Task 2: Atmosphere CSS + DOM

- Modify: `landing.html`

- [ ] Full-bleed `.hero-atmosphere` + particle canvas; soft opacity; stickers
- [ ] Add Syne only for `.echo-fallback`

### Task 3: Atmosphere JS

- Modify: `landing.html` script

- [ ] Port OD particle/sticker/Echo init; Sanctuary tint colors; soft parallax
- [ ] Preserve existing phone demo / reveal / nav logic

### Task 4: Smoke check

- [ ] Open landing locally; confirm hero split + fallback if WebGL fails
