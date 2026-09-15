---
name: echo-test
description: Choose and run the right EchoChat Node suite under tests/*.mjs when adding tests, debugging a failure, or deciding what to run before npm test. Do not use for CSS, landing HTML, or architecture-import questions with no test change.
---

# EchoChat tests

Local entry is **only** `npm test` (`scripts/run_node_tests.mjs`). New suites must be appended to `SUITES` in that file or they will not run.

Run the smallest covering file first (`node tests/<name>_test.mjs`), then `npm test` before a problem commit.

| Area | Suite |
|------|--------|
| Layers | `architecture_boundary_test.mjs`, `foundation_test.mjs` |
| Messages / Dexie cutover | `storage_cutover_test.mjs`, `message_window_test.mjs` |
| Satellites / backup | `storage_satellite_test.mjs` |
| Memory persist | `memory_persist_test.mjs` |
| LS schema v1→v2 | `migration_atomicity_test.mjs` |
| Send / provider | `chat_send_test.mjs`, `provider_test.mjs` |
| Context | `v1_1_context_test.mjs`, `context_integration_test.mjs`, `retrieval_regression_test.mjs` |

Do not delete tests to go green. Browser verifies are CI-only (`scripts/*_verify.mjs`).
