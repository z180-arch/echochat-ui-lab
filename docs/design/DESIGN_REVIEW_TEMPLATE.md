# Design Review Template

Copy this into the commit body, a `docs/design/` note, or the PR when a P0/P1 surface changes. Delete unused headings. Do not invent metrics.

## Product Problem

What is broken for the user, in one sentence.

## User Context

Who they are in this session (first-run / returning / inside a character / empty traces).

## Page Responsibility

What this surface is for. What it is not.

## Information Hierarchy

- PRIMARY:
- SECONDARY:
- SUPPORTING:

## Design Decision

What we changed, and the DESIGN.md rule it follows.

## Primary Skill

One name.

## Supporting Skills

0–3 names. Skills not installed: list as unavailable, do not claim use.

## Why This Design

User goal · continuity · identity · density.

## Alternatives Rejected

Direction B/C and why they lost.

## DESIGN.md Compliance

- [ ] Hierarchy (one dominant)
- [ ] Density
- [ ] Typography roles
- [ ] Accent budget
- [ ] Depth (hairline first)
- [ ] Not a card stack
- [ ] Personality still companion

## Anti-AI-Slop Review

List hits found and whether each was fixed. Two unfixed hits = do not ship.

## Responsive QA

Widths checked: 390 / 640 / 768 / 1024 / 1280 / 1440. Overflow / wrapping / nav / overlay.

## Motion QA

Band used. Reduced-motion: pass / fail / not run.

## Accessibility QA

Focus visible · 44px targets · contrast · labels.

## Browser Visual QA

Tool used, or “not available — verified via tests / scripts …”. Screenshots if captured.

## Remaining Issues

Honest leftovers.
