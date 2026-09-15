# Future architecture notes (design round)

UI redesign on 2026-09-15 did **not** migrate anything below. Recorded so a later agent does not “fix” them under a visual task.

| Observation | Why not now |
|-------------|-------------|
| Messages dual-write (runtime window vs Dexie vs `echodownload_lite_state_v1` fallback) | Schema/storage freeze |
| `src/main.js` is a large orchestrator | Not a UI problem |
| Legacy satellite keys remain recovery copies | Key names frozen |
| No GSAP / no new bundler / no React | Host freeze |

If a visual change appears to need a data-model change, stop and ask. Do not thaw Memory schema, retrieval, `assembleTurnContext`, Provider, Dexie tables, or `echodownload_*` keys from a design task.
