# EchoChat V1 Baseline Lock

> **Phase**: 0 — Baseline Lock
> **Date**: 2026-08-31
> **Commit**: 79d8e58
> **Status**: V1 runtime / storage / API **contract lock** (still in force). Product surface after this lock is V1.1 RC at `403e721` — see [`V1_1_RC_CURRENT_STATE.md`](./V1_1_RC_CURRENT_STATE.md). This file still defines frozen storage keys, schema v2, and the API contract. V1.1 did not change that contract.

## 1. Repository Baseline

| Item | Value |
|------|-------|
| Branch | main |
| Latest commit | 79d8e58 (docs: refine long-term architecture proposal) |
| Working tree | Clean |
| Total JS lines (src/) | 4099 |
| Build system | None (zero-build, native ES Modules) |
| Package manager | None (no package.json) |
| License | PolyForm Noncommercial 1.0.0 |

## 2. Storage Baseline

### localStorage Keys (8)

| Key | Purpose | Data Format |
|-----|---------|-------------|
| `echodownload_lite_state_v1` | App state (chats, messages, memory, settings) | JSON |
| `echodownload_worldbook_v1` | Worldbook books + entries | JSON |
| `echodownload_moments_v1` | Moments feed + likes + comments | JSON |
| `echodownload_relations_v1` | Relationship metrics + check-in | JSON |
| `echodownload_meta_v2` | Schema version + migration log | JSON |
| `echodownload_migration_staging_v2` | Migration staging (backup + snapshot) | JSON |
| `echodownload_onboard_done` | Onboarding completion flag | string |
| `echodownload_ios_hint` | iOS install hint dismissed flag | string |

### IndexedDB

| Database | Store | Purpose |
|----------|-------|---------|
| `echodownload_assets` | `blobs` | Binary asset storage (avatars, images) |

### Schema Version

- **Current**: SCHEMA_VERSION = 2
- **Migration**: v1 → v2 (roleKey hash → stable roleId)
- **Migration safety**: Write-ahead staging with backup + recovery (90 tests)

## 3. Data Model Baseline

### State (in localStorage STATE key)

```
{
  schemaVersion: 2,
  settings: { baseUrl, apiKey, model, temperature, theme, ... },
  global: { persona },
  userPersonaPresets: [],
  longTermMemory: { [roleId]: { roleName, memories: [{id, content, importance, createdAt, source}] } },
  memoryCfg: { maxPerRole: 20, injectMax: 10, autoSummary: {...} },
  chats: [
    {
      id, roleId, name, avatar, createdAt,
      config: { persona, myAvatar, model, temperature },
      messages: [ {id, role, text, time, status} ]  // ← ALL messages inline
    }
  ],
  currentChatId,
  ui: { activeTab, sidebarOpen, profileOpen, searchQuery, momentsFilter }
}
```

### Key Limitations (documented for Phase 2-3)

1. `chat.messages` = entire history inline → 5MB wall, no pagination
2. Full state serialization on every `store.set()` → O(total data) per message
3. Character not first-class (identity in `chat.config.persona`)
4. Relationship = single affinity number, no event history
5. No transactions across 4 localStorage keys

## 4. API Baseline

### AI Provider

| Item | Value |
|------|-------|
| Protocol | OpenAI-compatible REST + SSE streaming |
| Endpoint | `{baseUrl}/chat/completions` |
| Auth | Bearer token (user-provided API key) |
| Models | User-configurable (default: Qwen/Qwen2.5-7B-Instruct) |
| Presets | SiliconFlow, DeepSeek, Moonshot, Zhipu, custom |
| Streaming | SSE (`data: {json}` chunks) |
| Abort | AbortController |

### Provider Module

- `src/domain/provider.js` — direct `fetch()` calls, no adapter abstraction
- `buildMessages()` — constructs OpenAI format from chat + system prompt
- `streamChat()` — SSE parser with delta callbacks
- `chatCompletion()` — non-streaming for summaries

## 5. UI Baseline

| Item | Value |
|------|-------|
| Rendering | Native DOM + innerHTML, full re-render on state change |
| Entry | `src/main.js` (637 lines: routing + events + business) |
| Views | `src/ui/views/index.js` (480 lines: all views) |
| Components | `src/ui/components/index.js` (120 lines: toast, modal, buttons, etc.) |
| Styling | Native CSS + Design Tokens + CSS Variables |
| Theme | Morning Mint (light/dark + accent colors) |
| Responsive | Mobile single-column + bottom nav, Desktop multi-column |
| Splash | Logo launch animation (800ms, supports prefers-reduced-motion) |

### Views

- Landing / Onboarding
- App Shell (sidebar + chat + moments + me)
- Chat (message list + input + streaming)
- Moments (feed + likes + comments)
- Me (profile + settings + worldbook + memory)
- Modals (settings, character edit, worldbook editor, memory manager)

## 6. PWA Baseline

| Item | Value |
|------|-------|
| Service Worker | `sw.js` (202 lines) |
| Cache strategy | HTML: Network First; JS/CSS: SWR; Images: Cache First; API: Network Only |
| Versioning | APP_VERSION = 1.0.0, cache namespace per version |
| Installable | manifest.webmanifest (standalone, icons 192/512) |
| Offline | Static assets cached; API calls fail gracefully |
| Update | New SW → new cache → activate → clean old caches |
| User data | NOT in SW cache (separate from app version) |

## 7. Test Baseline

| Suite | Count | Runner | Status |
|-------|-------|--------|--------|
| Migration atomicity | 90 assertions (15 scenarios) | Node.js (.mjs) | ✅ PASS |
| Core modules | 50+ assertions | Browser console | ⚠️ No CI |
| E2E | 0 | — | ❌ None |
| Visual regression | 0 | — | ❌ None |
| Performance | 0 | — | ❌ None |

### Migration Test Coverage

- Normal v1→v2 migration
- Transform failure / Validate failure
- Commit failure at each of 4 keys (STATE/WORLDBOOK/MOMENTS/RELATIONS)
- Recovery from staging after interrupted commit
- v2 idempotency
- Staging write failure (old data untouched)
- Corrupt staging detection + clean restart
- Backup integrity in staging record

## 8. Performance Baseline (known from V1 Closing Pass)

| Metric | Value (estimated) |
|--------|-------------------|
| Cold load | < 500ms (zero-build, native) |
| Message insert (small chat) | < 50ms |
| Message insert (500 messages) | ~200-500ms (full state serialize) |
| Message insert (1000+ messages) | > 1s (degrades sharply) |
| Memory usage | Low for small data, grows with chat size |
| Storage limit | 5-10MB (localStorage quota) |

**Known cliff**: ~500-1000 messages per chat due to full-state JSON serialization.

## 9. Documentation Baseline

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview + quick start |
| `docs/architecture/ECHOCHAT_LONG_TERM_ARCHITECTURE.md` | Long-term architecture proposal (R2) |
| `docs/architecture/DATA_OWNERSHIP.md` | Data classification + privacy |
| `docs/architecture/PLUGIN_POLICY.md` | Plugin security boundary |
| `docs/LICENSING_POLICY.md` | License selection rationale |
| `docs/AI_*_REPORT.md` | V1 closing pass reports (7 docs) |
| `LICENSE` | PolyForm Noncommercial 1.0.0 |
| `COPYRIGHT.md` | Copyright + asset classification |
| `TRADEMARKS.md` | Brand usage policy |
| `CONTRIBUTING.md` | Contribution guide + terms |
| `THIRD_PARTY_NOTICES.md` | Dependency declarations (none runtime) |

## 10. V1 Runnable Confirmation

✅ Repository clean, main branch at 79d8e58
✅ All 4099 lines of src/ JS pass syntax check
✅ 90/90 migration tests pass
✅ index.html loads main.js (ES Module)
✅ manifest.webmanifest valid JSON
✅ Service Worker registered with versioned cache
✅ localStorage schema v2 with safe migration
✅ IndexedDB asset store functional
✅ PWA installable, offline-capable for static assets
✅ Zero runtime dependencies (no npm packages)

**V1 Baseline Reproducible: PASS**

---

## Exit Criteria Met

- [x] Architecture Baseline documented
- [x] Data Baseline documented
- [x] Test Baseline documented
- [x] Performance Baseline documented (known limits)
- [x] V1 current runnable confirmed
- [x] No code refactoring in this phase

**Phase 0 Complete. Proceeding to Phase 1: Repository Boundary.**
