# EchoChat Long-Term Architecture Proposal

> **Status**: Architecture Proposal — Revision 2 (prepared for Independent Architecture Gate Review)
> **Created**: 2026-08-31
> **Revised**: 2026-08-31
> **Based on**: V1 Candidate codebase (commit a1b56d2 + governance ed8b6fa)
> **Constraint**: This is NOT implementation authorization. Every phase requires explicit approval. No product code changes in this revision.

---

## 0. Executive Summary

EchoChat V1 Closing Pass is complete. The current architecture is a **zero-build Vanilla JS PWA** using `localStorage` for all structured data and `IndexedDB` exclusively for Blob assets. It validates the product concept but will hit hard limits as EchoChat evolves into a **Local-first AI Character Life Platform**.

This revision refines the original proposal with stricter boundaries, less over-engineering, and explicit Current → Transition → Target states for every major system.

### Core Verdict

| Question | Answer |
|----------|--------|
| Can current architecture continue as V1 base? | **Yes**, with targeted fixes. No Full Rebuild. |
| V1.1 top 3 upgrades? | ① Storage abstraction + Dexie for messages ② Character first-class entity ③ Repository layer |
| Relationship event model? | **Current State + Event History** (not Full Event Sourcing) |
| Recommended web database? | **Dexie (IndexedDB wrapper)** via Storage Adapter |
| Recommended desktop database? | **SQLite** (native, via Tauri) |
| Character Reconstruction? | **First-class system**, structured extraction, not giant prompt |
| Privacy boundary? | **Local-first, Context Builder minimal exposure, default-deny cloud** |

### Top 5 Risks (if unaddressed)

1. **Data corruption at scale** — localStorage has no transactions; crash mid-write can corrupt the entire state blob.
2. **Performance cliff ~500 messages/chat** — every `store.set()` serializes entire state including all messages.
3. **Character data fragmentation** — identity/memories/relationships/moments in 4 keys with no referential integrity.
4. **Scope creep → de facto Full Rebuild** — architecture enthusiasm can outrun product needs. Strict phase gates required.
5. **Privacy regression** — future cloud/plugin features could erode local-first guarantees without explicit boundaries.

---

## 1. Product Definition

### 1.1 EchoChat = Local-first AI Character Life Platform

**Not** an "AI Chat PWA". Chat is one interaction surface.

The core product asset is the **Character** — created, imported, shaped, and long-term accompanied by the user.

### 1.2 Core Product Flywheel

```
Character Creation → Character Identity → Conversation → Memory
→ Relationship → Moments/Social Life → Behavior Changes
→ Future Conversation → Long-term Character
```

### 1.3 What Users Own

- Character (identity, personality, appearance, speaking style)
- Memory (structured, retrievable)
- Relationship (history + current state)
- Social History (moments, reactions, comments)
- Personality (base + modifiers + evolution)
- Appearance (avatar, gallery, visual description)
- Behavior (how the character acts, reacts, initiates)

These are **first-class domain entities**, not properties nested inside a chat.

---

## 2. Product Domain Map

```
┌─────────────────────────────────────────────────────────────┐
│                    Character (Core)                         │
│  Identity │ Personality │ Appearance │ Speaking Style       │
│  Memory   │ Relationship │ Social Life │ Behavior           │
└──────┬──────────┬──────────┬───────────┬───────────┬────────┘
       │          │          │           │           │
       ▼          ▼          ▼           ▼           ▼
  Conversation  Memory    Relationship  Moments    Behavior
  (chat/message)(retrieval)(state+events)(social sim)(modifiers)
       │          │          │           │           │
       └──────────┴──────────┴───────────┴───────────┘
                  │
                  ▼
          AI Provider (via Gateway)
                  │
                  ▼
          Import/Export (Character Card, Chat History, Backup)
```

**Key invariant**: `Chat ≠ Character`. One Character can have multiple Chats. Character is the long-term asset; Chat is an interaction session.

---

## 3. Current Architecture (CURRENT)

### 3.1 Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | Vanilla JavaScript (ES Modules), no TypeScript |
| UI | Native DOM + innerHTML, full re-render on state change |
| State | Singleton Store class, in-memory + auto-persist to localStorage |
| Storage | localStorage (4 keys) + IndexedDB (blobs only) |
| AI | Direct `fetch()` to OpenAI-compatible API in `provider.js` |
| PWA | Service Worker + Web App Manifest, APP_VERSION = 1.0.0 |
| Testing | Browser console tests (50+ assertions) + Node migration tests (90 assertions) |
| Build | None (files served as-is) |
| CI | None |

### 3.2 Data Model (CURRENT — actual code)

```
localStorage keys:
  echodownload_lite_state_v1 = {
    schemaVersion: 2,
    settings: {...},
    global: {persona},
    userPersonaPresets: [],
    longTermMemory: { [roleId]: { roleName, memories: [{id,content,importance,createdAt,source}] } },
    memoryCfg: { maxPerRole:20, injectMax:10, autoSummary:{...} },
    chats: [
      {
        id, roleId, name, avatar, createdAt,
        config: { persona, myAvatar, model, temperature },
        messages: [ {id, role, text, time, status} ]  // ALL messages inline ← P0
      }
    ],
    currentChatId, ui: {...}
  }
  echodownload_worldbook_v1 = { version, books: [...], activeGlobalBookId }
  echodownload_moments_v1 = { version, moments: [{id, roleId, content, image, likes, comments:[...]}] }
  echodownload_relations_v1 = { version, checkIn, roles: { [roleId]: {roleName, chatTurns, streakDays, ...} } }
  echodownload_meta_v2 = { schemaVersion, migratedAt, ... }
  echodownload_migration_staging_v2 = { targetVersion, backup, snapshot }  // migration safety

IndexedDB:
  echodownload_assets / blobs = { id, blob }
```

### 3.3 Code Size (actual)

| File | Lines | Role |
|------|-------|------|
| src/main.js | 637 | Entry, routing, event binding, business logic |
| src/ui/views/index.js | 480 | All view rendering |
| src/core/storage.js | 456 | localStorage + migration |
| src/domain/worldbook.js | 332 | Worldbook CRUD + injection |
| src/core/store.js | 320 | Singleton state + persist |
| src/domain/chat.js | 257 | Send/stream/retry/edit |
| src/domain/moments.js | 217 | Moments CRUD + likes/comments |
| src/domain/relations.js | 201 | Affinity calc + check-in |
| src/domain/memory.js | 180 | Memory CRUD + auto summary |
| src/domain/provider.js | 167 | Direct fetch + SSE parse |
| src/domain/persona.js | 155 | Character card import/export |
| src/infrastructure/idb.js | 227 | IndexedDB blob wrapper |
| **Total** | **~4744** | |

---

## 4. Architecture Problems (CURRENT → why change)

| # | Problem | Evidence | Severity |
|---|---------|----------|----------|
| 1 | `chat.messages` = entire history inline | store.js: chats[].messages array | P0 |
| 2 | localStorage synchronous, 5–10MB limit, no transactions | storage.js: safeSet = JSON.stringify + setItem | P0 |
| 3 | Full state serialization per message | store.js: _persist() writes entire state on every set() | P0 |
| 4 | Character not first-class (scattered in chat.config) | persona.js: getPersona reads chat.config.persona | P1 |
| 5 | Relationship = single number, no event history | relations.js: affinity = turns*0.1 + likes*0.5 + ... | P1 |
| 6 | Memory retrieval = top-N sort, no semantic search | memory.js: buildMemoryBlock sorts by importance, takes top 10 | P1 |
| 7 | AI provider = hardcoded fetch, no adapter | provider.js: streamChat directly calls fetch(url) | P1 |
| 8 | No Repository layer (domain → storage directly) | All domain modules import storage/store directly | P1 |
| 9 | main.js 637 lines (routing + events + business) | main.js | P2 |
| 10 | UI full innerHTML re-render | views/index.js | P2 |
| 11 | No type safety | All .js, no JSDoc types | P2 |
| 12 | No CI/CD | No .github/workflows | P2 |
| 13 | No error tracking (console.log only) | All modules | P2 |
| 14 | No plugin boundary | N/A | P3 (design now) |
| 15 | No cloud boundary | N/A | P3 (design now) |

---

## 5. Target Architecture (TARGET)

### 5.1 Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│              Presentation (Platform-specific)        │
│  Web SPA │ PWA │ Desktop (Tauri) │ Mobile │ Mini    │
├─────────────────────────────────────────────────────┤
│           Application / Use Cases (shared)           │
│  SendMessage │ LikeMoment │ CreateCharacter          │
│  DeleteCharacter │ ImportChatHistory │ BackupRestore │
├─────────────────────────────────────────────────────┤
│                    Domain (shared)                   │
│  Character │ Conversation │ Memory │ Relationship    │
│  Moments │ Worldbook │ Personality/Behavior          │
├─────────────────────────────────────────────────────┤
│              Repository Interfaces (shared)          │
│  CharacterRepo │ MessageRepo │ MemoryRepo │ ...      │
├─────────────────────────────────────────────────────┤
│            Infrastructure (Platform-specific)        │
│  StorageAdapter │ AIAdapter │ PlatformAdapter        │
│  (Dexie/SQLite)  (OpenAI/Anthropic)  (Web/Desktop)  │
└─────────────────────────────────────────────────────┘
```

### 5.2 Core Principles

1. **Character is first-class** — all entities reference `characterId`, not `chatId`.
2. **Messages are independent** — separate store, paginated, queryable, branchable.
3. **Repository boundary** — Domain never touches storage directly.
4. **Platform-agnostic core** — no `window`, `document`, `indexedDB`, `localStorage`, or `fetch` in Domain/Application.
5. **Local-first by default** — everything works offline. Cloud is opt-in.
6. **Privacy by architecture** — AI requests contain only minimal context.
7. **Relationship = Current State + Event History** — not Full Event Sourcing (see §13).
8. **Plugin default-deny** — sandboxed, capability-gated, never default access.
9. **Do not overengineer** — every addition must pass the Decision Criteria (§29).

---

## 6. Domain Model

### 6.1 Character (一级核心实体)

```
Character {
  id: string (UUID, stable, never changes)
  name: string
  createdAt: timestamp
  updatedAt: timestamp
  deletedAt: timestamp | null

  // Identity
  persona: string
  personality: PersonalityProfile (structured)
  speakingStyle: SpeakingStyle
  firstMessage: string
  source: "user_created" | "imported_card" | "reconstructed" | "guide"
  isGuide: boolean

  // Appearance
  avatar: AssetRef | null
  profileImage: AssetRef | null
  gallery: AssetRef[]
  visualDescription: string
  appearanceStyle: string

  // Behavior
  habits: string[]
  preferences: Record<string, any>
  behaviorModifiers: BehaviorModifier[]

  // Symbolic (entertainment-only)
  zodiac: string | null
  chineseZodiac: string | null
  tarotArcana: string | null

  // Meta
  characterVersion: number
  metadata: Record<string, any>  // extension point
}
```

**Chat ≠ Character**: One Character has many Chats. Character is the long-term asset.

### 6.2 Chat / Conversation

```
Chat {
  id, characterId, title, createdAt, updatedAt, archivedAt
  config: { model, temperature, baseUrl? }
  messageCount: number (denormalized)
  lastMessageAt: timestamp (denormalized)
}

Message {
  id, chatId, characterId (denormalized)
  role: "user" | "assistant" | "system"
  content, createdAt, updatedAt
  status: "draft"|"sending"|"streaming"|"sent"|"error"|"stopped"
  parentMessageId: string | null (branching)
  generationMeta: { model, tokensIn, tokensOut, latencyMs, provider }
  attachments: AttachmentRef[]
}
```

### 6.3 Guide Character Rules

- `isGuide: true` characters are **not** shown in the main Character list.
- Exactly 1 primary Guide Character (optional small variants).
- Guide Character can be **skipped** during onboarding.
- Guide Character data is **sandboxed**: its memories/relationships do not pollute user data.
- Guide Character can be **deleted** by the user.
- User characters have `source: "user_created" | "imported_card" | "reconstructed"`.
- Template quantity is **not** a product structure.

---

## 7. Data Architecture

### 7.1 Entity Relationship (logical)

```
Character 1───* Chat 1───* Message
Character 1───* Memory
Character 1───1 Relationship 1───* RelationshipEvent
Character 1───* Moment 1───* MomentComment
Character 1───* MomentReaction
Character 1───* WorldbookBook 1───* WorldbookEntry
Character 1───* Asset (avatar, gallery)
```

### 7.2 Memory vs Worldbook — Why Different Systems

| Aspect | Memory | Worldbook |
|--------|--------|-----------|
| Origin | Extracted from conversations | User-authored / imported |
| Mutability | Grows automatically, AI-assisted | Manually curated |
| Structure | {content, importance, type, source} | {keys, content, priority, trigger} |
| Retrieval | Relevance + importance + recency | Keyword/regex trigger matching |
| Scope | Per-character (what character learned) | Global or per-character (lore/rules) |
| Example | "User's birthday is March 15" | "When user says 'tea', character mentions jasmine" |
| Lifetime | Can expire (short-term) or persist (long-term) | Persists until user edits/deletes |

**Memory** is about what the character *remembers*. **Worldbook** is about *lore and trigger-based injection*. They are complementary, not redundant.

### 7.3 Memory Types

- **Conversation Context** — last N messages (not stored as Memory, built at request time)
- **Short-term Memory** — recent facts, expires (hours/days)
- **Long-term Memory** — persistent facts, importance-scored
- **Relationship Memory** — events about the user-character relationship
- **Character Memory** — facts about the character itself (backstory)
- **Social Memory** — events from Moments interactions
- **Worldbook** — separate system (see above)

### 7.4 Context Builder (明确架构边界)

```
Local Database
    ↓
Retrieval (query by characterId + type + relevance)
    ↓
Context Budget (token-aware, not char-count)
    ↓
Relevant Context (only what fits)
    ↓
Behavior Engine (personality modifiers + relationship state)
    ↓
Prompt Builder (assembles system + context + messages)
    ↓
AI Provider
```

**AI Provider never reads the database directly.** It receives only the assembled prompt string.

---

## 8. Storage Decision

### 8.1 Storage Abstraction Boundary (强制)

```
Application / Domain
    ↓
Repository Interface (platform-agnostic)
    ↓
Storage Adapter (interface)
    ├── IndexedDBAdapter (wraps Dexie or raw IndexedDB)
    ├── SQLiteAdapter (desktop/mobile native)
    └── FutureAdapter (e.g., OPFS, remote sync)
```

**Core Domain MUST NOT know about**: localStorage, IndexedDB, Dexie, SQLite, browser APIs, Node APIs.

### 8.2 Database Decision Matrix

| Criterion | localStorage | IndexedDB raw | idb | Dexie | SQLite WASM | OPFS SQLite | Desktop SQLite | Mobile SQLite |
|-----------|-------------|---------------|-----|-------|-------------|-------------|---------------|---------------|
| Transaction | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Query | ❌ full scan | ✅ indexes | ✅ | ✅ rich | ✅ SQL | ✅ SQL | ✅ SQL | ✅ SQL |
| Index | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pagination | ❌ | ✅ cursor | ✅ | ✅ | ✅ LIMIT | ✅ LIMIT | ✅ LIMIT | ✅ LIMIT |
| Search | ❌ | ❌ manual | ❌ manual | ❌ manual | ✅ FTS5 | ✅ FTS5 | ✅ FTS5 | ✅ FTS5 |
| Large dataset (>10MB) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance (read) | Fast sync | Async good | Async good | Async good | Excellent | Excellent | Excellent | Excellent |
| Performance (write) | Blocks main | Async | Async | Async | Excellent | Excellent | Excellent | Excellent |
| Offline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Migration | Manual | versionchange | versionchange | Built-in | SQL migrations | SQL migrations | SQL migrations | SQL migrations |
| Backup | JSON dump | JSON dump | JSON dump | JSON dump | SQL dump | SQL dump | SQL dump | SQL dump |
| Encryption | ❌ | ❌ manual | ❌ manual | ❌ manual | ✅ SQLCipher | ✅ SQLCipher | ✅ SQLCipher | ✅ SQLCipher |
| Browser compat | All | All modern | All modern | All modern | Chrome/Edge/Firefox* | Chrome/Edge | N/A | N/A |
| Desktop compat | N/A | N/A | N/A | N/A | Possible | Possible | ✅ native | N/A |
| Mobile compat | N/A | N/A | N/A | N/A | Possible | Possible | N/A | ✅ native |
| Maintenance | Zero | Medium | Low | Low | Medium | Medium | Low | Low |
| Ecosystem | N/A | Basic | Good | Excellent | Excellent | Good | Excellent | Excellent |
| Bundle size | 0 | 0 | ~2KB | ~15KB | ~1MB WASM | ~1MB WASM | 0 (native) | 0 (native) |
| Complexity | Low | Medium | Low | Low | High | High | Low | Low |

*SQLite WASM in Firefox requires OPFS or IndexedDB backend; performance varies.

### 8.3 Recommendations by Platform

| State | Platform | Database | Rationale |
|-------|----------|----------|-----------|
| **CURRENT** | Web/PWA | localStorage (4 keys) | V1, works for small data |
| **TRANSITION** | Web/PWA | Dexie (IndexedDB wrapper) | Solves P0 (transactions, async, >10MB, pagination), minimal migration cost, no WASM |
| **RECOMMENDED WEB** | Web/PWA | Dexie via StorageAdapter | Best balance of capability, compatibility, bundle size, maintenance |
| **RECOMMENDED DESKTOP** | Tauri | SQLite (native via sqlx/rusqlite) | ACID, FTS5, SQLCipher, zero bundle cost, native performance |
| **RECOMMENDED MOBILE** | React Native/Flutter | SQLite (native) | Same as desktop, native performance |

**Why not SQLite WASM for web?** ~1MB download, Firefox inconsistency, OPFS requires HTTPS+activation. Dexie solves 90% of problems at 1.5% of the bundle cost. SQLite becomes relevant with native apps.

**Why not force one database for all platforms?** Different platforms have different optimal storage. The Storage Adapter abstraction lets the shared core work with any backend. Forcing SQLite WASM on mobile would be worse than native SQLite.

---

## 9. Repository Architecture

### 9.1 Repository Responsibilities

**Repository IS responsible for**:
- Translating domain objects to/from storage records
- CRUD operations (create, read, update, delete)
- Querying and filtering (by characterId, date range, etc.)
- Pagination
- Transaction boundaries (begin/commit/rollback)
- Index usage
- Soft delete / restore

**Repository is NOT responsible for**:
- Business logic (e.g., "affinity = turns * 0.1")
- AI prompt building
- UI state management
- Validation of domain invariants (that's Domain's job)
- Event emission (that's Application/Domain)
- Orchestrating multiple repositories (that's Application Use Case)

**Repository MUST NOT become a God Object.** Each repository manages exactly one aggregate root.

### 9.2 Repository Inventory

| Repository | Aggregate Root | Key Methods |
|------------|---------------|-------------|
| CharacterRepository | Character | findById, findAll, create, update, softDelete, restore, permanentDelete |
| ChatRepository | Chat | findByCharacterId, findById, create, update, archive, delete |
| MessageRepository | Message | findByChatId (paginated), findById, create, update, delete, search, count |
| MemoryRepository | Memory | findByCharacterId, findRelevant (context budget), create, update, delete, deduplicate |
| RelationshipRepository | Relationship | findByCharacterId, updateState, block, unblock, reset |
| RelationshipEventRepository | RelationshipEvent | append, findByRelationshipId, findSince, count |
| MomentRepository | Moment | findAll, findByCharacterId, create, update, delete |
| MomentCommentRepository | MomentComment | findByMomentId, create, delete |
| MomentReactionRepository | MomentReaction | toggle, findByMomentId, count |
| WorldbookRepository | WorldbookBook/Entry | findAll, findByCharacterId, getActiveEntries, createBook, addEntry, updateEntry, deleteEntry |
| AssetRepository | Asset | storeBlob, getBlob, getRef, delete |
| SettingsRepository | Settings | get, set, getAll |

### 9.3 Transaction Rule

When a Use Case spans multiple repositories (e.g., DeleteCharacter = delete character + chats + messages + memories + relationship + moments), the **Application layer** manages the transaction:

```
beginTransaction()
  CharacterRepository.softDelete(characterId)
  ChatRepository.softDeleteByCharacterId(characterId)
  MessageRepository.softDeleteByCharacterId(characterId)
  ...
commit()
```

Repositories themselves do not orchestrate cross-aggregate operations.

---

## 10. Character Architecture

### 10.1 Character as Aggregate Root

Character is the aggregate root that ties together:
- Identity (name, persona, personality)
- Appearance (avatar, gallery)
- Chats (multiple per character)
- Memories (per character)
- Relationship (one per character-user pair)
- Moments (per character)
- Worldbook (character-specific entries)

### 10.2 Character Creation Paths

1. **Create from Scratch** — user fills name, persona, appearance
2. **Import Character Card** — SillyTavern V2 format (already partial in persona.js)
3. **Import Chat History → Reconstruction** — AI-assisted extraction (see §16)
4. **Generate from Conversation** — extract character from existing chat (subset of reconstruction)
5. **Guide Character** — system-provided, sandboxed

### 10.3 Character Deletion (Cascade Policy)

```
Delete Character (soft)
  → Character.deletedAt = now
  → all Chats for character: archived (not deleted)
  → all Messages: retained (chat archive)
  → Memories: soft-deleted
  → Relationship: status = "deleted"
  → Moments: soft-deleted
  → Worldbook: character-specific books soft-deleted
  → Assets: orphaned, cleaned up by garbage collection
  → 30-day trash window
  → User can restore within window
  → Permanent delete after window or user confirmation
```

**Delete Chat ≠ Delete Character**: deleting a chat removes messages but character, memories, relationship, and moments persist.

---

## 11. Conversation Architecture

### 11.1 Message Independence (P0 fix)

**CURRENT**: `chat.messages = [all messages]` in localStorage state blob.

**TARGET**: Messages in independent store, indexed by `chatId + createdAt`, paginated.

Benefits:
- Load last 50 messages instantly, load more on scroll
- Search across messages without loading all
- Branching via `parentMessageId` (regenerate without deleting history)
- Per-message operations (edit, delete, react) don't serialize entire chat
- Long chats (1000+ messages) don't bloat state object

### 11.2 Streaming Architecture

```
User sends message
  → MessageRepository.create (status: "sending")
  → AI Gateway.streamChat
    → onDelta: MessageRepository.update (status: "streaming", content: partial)
    → onComplete: MessageRepository.update (status: "sent", generationMeta)
    → onError: MessageRepository.update (status: "error")
  → RelationshipEventRepository.append (type: "chat")
  → Memory candidate generation (async, non-blocking)
```

### 11.3 Branching / Regenerate

`parentMessageId` enables:
- Regenerate an AI reply without deleting the old one (creates a branch)
- Edit a user message and continue from that point
- View conversation history as a tree, not just a linear list

V1.1 may keep linear model (delete old on regenerate) but `parentMessageId` field is reserved.

---

## 12. Memory Architecture

### 12.1 Memory Pipeline

```
Conversation Turn
    ↓
Memory Candidate Generator (AI-assisted, structured output)
    ↓
Importance Scoring (0-10)
    ↓
Deduplication (exact match + similarity threshold)
    ↓
Conflict Resolution (new info contradicts old? update vs add)
    ↓
Storage (by type: short_term / long_term / relationship / character / social)
    ↓
Retrieval (Context Builder, see §7.4)
```

### 12.2 Memory Entity

```
Memory {
  id, characterId
  type: "short_term" | "long_term" | "relationship" | "character" | "social"
  content: string
  importance: number (0-10)
  confidence: number (0-1, for AI-extracted)
  source: "manual" | "auto_summary" | "reconstruction" | "imported" | "plugin"
  relatedChatId, relatedMessageId
  createdAt, updatedAt, expiresAt (short-term only)
  tags: string[]
}
```

### 12.3 Retrieval Rules

- Never return all memories to AI
- Context Builder queries by `characterId + type`, sorts by relevance + importance + recency
- Token budget is calculated (not hardcoded char limit)
- Worldbook entries are retrieved separately (trigger-based, not relevance-based)
- Relationship state is retrieved as a single summary, not all events

---

## 13. Relationship Architecture

### 13.1 Event Model Decision: A vs B vs C

| Criterion | A: Full Event Sourcing | B: Current State + Event History | C: Current State + Periodic Snapshot + Event History |
|-----------|----------------------|--------------------------------|-----------------------------------------------------|
| Implementation complexity | High (event store, projections, snapshots, replay) | Medium (state table + event append table) | High (snapshot schedule + replay from snapshot) |
| Query performance | Slow (must replay or maintain projections) | Fast (read current state directly) | Fast (read snapshot, replay recent events) |
| Data recovery | Excellent (replay from genesis) | Good (rebuild state from events if needed) | Excellent (replay from last snapshot) |
| Migration | Complex (event schema evolution) | Simple (two tables, independent evolution) | Complex (snapshot format + event format) |
| Debugging | Hard (must trace event chain) | Easy (inspect state + recent events) | Medium |
| Explainability ("why 87?") | Excellent (full replay) | Good (recent events explain delta) | Good (recent events explain delta) |
| Data volume growth | Unbounded (all events forever) | Controllable (prune old events, keep state) | Controllable (snapshots + recent events) |
| Delete (GDPR) | Hard (events immutable, must tombstone) | Easy (delete state + events) | Medium |
| Cloud sync | Complex (event conflict resolution) | Simple (state LWW + event append) | Medium |
| Conflict resolution | Complex (event ordering) | Simple (state LWW, events append-only) | Medium |

### 13.2 Recommendation: B — Current State + Event History

**Rationale**:
- EchoChat's relationship metrics are simple (affinity, trust, etc.), not complex domain requiring full event replay.
- Full Event Sourcing adds projection/snapshot complexity that a small team cannot maintain.
- Current State gives O(1) reads. Event History gives traceability ("last 50 events explain current affinity").
- If state is corrupted, rebuild from event history (recovery path exists).
- Cloud sync is simpler: state uses Last-Write-Wins, events are append-only.
- Delete is straightforward: delete state row + event rows.

**When to revisit**: If relationship logic becomes complex enough that "current state" can't be derived incrementally (e.g., multi-party relationship graph), then evaluate C or A. Not now.

### 13.3 Relationship Model

```
Relationship {
  id, characterId, userId ("user" for now)
  type: "friend" | "romantic" | "mentor" | "family" | "custom"
  status: "active" | "blocked" | "archived" | "deleted"
  createdAt, updatedAt

  // Current State (derived from events, cached)
  affinity: number
  trust: number
  familiarity: number
  intimacy: number
  tension: number
  interactionFrequency: number
  streakDays: number
  lastInteractionAt: timestamp
}

RelationshipEvent {
  id, relationshipId, characterId
  type: "chat" | "moment_like" | "moment_comment" | "important_conversation"
      | "conflict" | "apology" | "memory_created" | "block" | "unblock"
      | "gift" | "milestone" | "reset" | "custom"
  timestamp
  payload: Record<string, any>
  affinityDelta: number (computed at append time)
  description: string (human-readable "why")
}
```

### 13.4 State Update Rule

```
On RelationshipEvent appended:
  1. Compute delta based on event type + payload
  2. Update Relationship.currentState fields incrementally
  3. Persist event + updated state in same transaction
  4. If state rebuild needed: replay all events for this relationship
```

**affinity = 87 is always answerable**: read current state (87) + recent events (showing how it got there).

---

## 14. Moments / Social Architecture

### 14.1 Moments as Social Simulation Domain

```
Moment {
  id, characterId
  authorType: "character" | "user"
  content: string
  media: AssetRef[]
  createdAt
  visibility: "public" | "friends" | "private"
  socialContext: { mood, relatedMemoryId, trigger }
  likeCount, commentCount (denormalized)
}

MomentComment { id, momentId, authorType, characterId?, content, createdAt }
MomentReaction { id, momentId, authorType, characterId?, reaction, createdAt }
SocialEvent { id, type, actor, target, timestamp, payload }  // domain event
```

### 14.2 Interaction Loop

```
User likes Moment
  → UI calls LikeMoment Use Case
  → MomentReactionRepository.toggle
  → MomentRepository.update (likeCount)
  → RelationshipEventRepository.append (type: "moment_like", affinityDelta)
  → RelationshipRepository.update (affinity)
  → Memory candidate (if significant)
  → Character state update (Behavior Engine)
  → UI state update (reaction animation)
```

### 14.3 Layering Rule (强制)

```
Domain Event (SocialEvent)
    ↓
Application Logic (LikeMoment Use Case)
    ↓
Presentation (animation, sound, micro-interaction)
```

**Animation and sound MUST NOT carry business state.** A like is recorded in the database before the heart animation plays. If the animation fails, the like still exists.

---

## 15. Personality / Behavior Architecture

### 15.1 Modifier Composition

```
Base Personality
     +
Symbolic Modifiers (zodiac, chineseZodiac, tarot)  ← entertainment only
     +
Custom Modifier (user-defined)
     +
Current State (mood, recent events, time of day)
     +
Relationship State (derived from Relationship)
     +
User Override (explicit user-set personality traits)
     ↓
Effective Character State → Behavior Engine → Prompt Builder
```

### 15.2 Priority (明确)

```
1. User Override          (highest — explicit user choice wins)
2. Relationship State     (current relationship affects tone)
3. Current State          (mood/recent events temporarily shift behavior)
4. Custom Modifier        (user-defined persistent modifiers)
5. Symbolic Modifier      (zodiac/tarot/chineseZodiac — entertainment)
6. Base Personality       (lowest — foundation)
```

Conflict resolution: higher priority overrides lower. If same priority, additive with weight. User can disable any modifier category.

### 15.3 Symbolic Modifiers Disclaimer

Zodiac, Chinese Zodiac, Tarot are explicitly **entertainment / role-shaping mechanisms**. They are not scientific personality assessment. This labeling must appear in UI and documentation.

---

## 16. Import / Reconstruction Architecture

### 16.1 Character Reconstruction as First-Class System

This is EchoChat's key differentiator. The ability to reconstruct a character from chat history is a core product capability, not a utility.

### 16.2 Reconstruction Pipeline

```
Chat History File (WhatsApp / Telegram / plain text / JSON / other)
    ↓
Import Parser (format-specific)
    ↓
Speaker Detection (map speakers → user / character / other)
    ↓
Conversation Segmentation (split into meaningful exchanges)
    ↓
Personality Extraction (AI-assisted, structured JSON output)
    ↓
Speaking Style Extraction (vocabulary, tone, catchphrases, formality)
    ↓
Preference Extraction (likes, dislikes, habits, routines)
    ↓
Memory Extraction (important events, facts, dates)
    ↓
Relationship Pattern Extraction (interaction style, emotional trajectory)
    ↓
Character Draft (structured, NOT a giant prompt)
    ↓
User Review (edit / reject / confirm each section)
    ↓
Character Created + Memories Imported + Relationship Initialized
```

### 16.3 Structured Output (禁止 giant prompt)

```
ExtractedPersonality {
  traits: string[] (e.g., ["warm", "curious", "introverted"])
  values: string[]
  fears: string[]
  communicationStyle: string
  confidence: number (0-1)
}

ExtractedSpeakingStyle {
  vocabularyLevel: "simple" | "moderate" | "complex"
  formality: "casual" | "neutral" | "formal"
  catchphrases: string[]
  emojiUsage: "none" | "rare" | "frequent"
  typicalSentenceLength: number
  confidence: number
}

ExtractedPreferences {
  likes: string[]
  dislikes: string[]
  habits: string[]
  routines: string[]
  confidence: number
}

ExtractedMemory {
  content: string
  type: "event" | "fact" | "preference" | "relationship"
  importance: number
  sourceTimestamp: timestamp | null
  confidence: number
}

RelationshipSignals {
  initialDynamic: string
  evolution: string[]
  currentTone: string
  conflictPatterns: string[]
  confidence: number
}
```

Each extraction has a `confidence` score. User can review, edit, or reject individual items. Nothing is auto-accepted without user confirmation.

### 16.4 Import Engine (general)

```
Input → Detect Format → Parse → Normalize → Validate → Preview → User Confirm → Transaction → Import
```

Supported formats: EchoChat backup, SillyTavern Character Card (V1/V2), chat history (multiple platforms), JSON.

---

## 17. Privacy Architecture

### 17.1 Privacy by Architecture (一级原则)

EchoChat's privacy guarantee is architectural, not policy-based.

### 17.2 Data Classification & Boundaries

| Category | Examples | Default Storage | AI Access | Cloud Sync | Plugin Access |
|----------|----------|----------------|-----------|------------|---------------|
| **Private Local Data** | Chats, messages, memories, character persona, relationship, private moments | Local DB | Minimal context only (via Context Builder) | Opt-in, encrypted | Permission-gated |
| **AI Request Data** | Message content sent to provider | Transient (not stored separately) | N/A (sent to user's provider) | Never | Never |
| **API Keys** | Provider API keys | Encrypted local (Web Crypto) | Used by Gateway only | Never synced | Never |
| **Cloud Sync Data** | User-selected entities | Encrypted at rest | N/A | End-to-end encrypted | Never |
| **Community Data** | Public characters, posts | Cloud server (if published) | N/A | Public (user chose) | Read-only |
| **Plugin Data** | Plugin-specific storage | Plugin sandbox | N/A | Plugin-controlled | Isolated |
| **Telemetry** | Error logs, perf metrics | Opt-in, anonymized | N/A | Opt-in only | Never |

### 17.3 Core Privacy Flow

```
Local Database
    ↓
Context Builder (selects only relevant memories + recent messages)
    ↓
Minimal Required Context (within token budget)
    ↓
Prompt Builder
    ↓
AI Provider (user's own API key, user's chosen provider)
```

**PROHIBITED**: AI Provider receiving full database, all memories, all chat history, or API keys.

### 17.4 What We Do NOT Claim

- ❌ "We never upload your data" — AI API requests send message content to user's chosen provider.
- ❌ "Absolute privacy" — browser storage is accessible to anyone with device access.
- ✅ "Your data stays on your device unless you explicitly configure an external service."

### 17.5 API Key Security

- Stored encrypted using Web Crypto API (AES-GCM with device-bound key)
- Never exposed to plugins, UI, or logs
- Gateway reads key, injects into request, never returns it
- User can view/rotate/delete keys at any time

---

## 18. Plugin Boundary

### 18.1 Design Only, No Implementation

This section defines the boundary. Implementation is Phase 7 (much later).

### 18.2 Plugin Lifecycle

```
Plugin Manifest (permissions, entry, apiVersion)
    ↓
User Review + Explicit Consent
    ↓
Install (verify, isolate storage)
    ↓
Sandbox Load (Web Worker)
    ↓
Capability API Injection (only granted permissions)
    ↓
Runtime (message-based communication)
    ↓
Disable / Uninstall (revoke, clear storage)
```

### 18.3 Permission Model

| Permission | Description | Default |
|------------|-------------|---------|
| `chat.read` | Read current chat messages | ❌ deny |
| `chat.write` | Send messages as user | ❌ deny |
| `character.read` | Read character profile | ❌ deny |
| `character.write` | Modify character profile | ❌ deny |
| `memory.read` | Read character memories | ❌ deny |
| `relationship.read` | Read relationship metrics | ❌ deny |
| `moments.read` | Read moments feed | ❌ deny |
| `moments.write` | Create moments | ❌ deny |
| `storage.local` | Access plugin's own isolated storage | ✅ allow (own storage only) |
| `network.request` | Make network requests (domain whitelist) | ❌ deny |
| `ui.extension` | Render UI in designated extension points | ❌ deny |

**NEVER granted** (not in permission model, architecturally impossible):
- `api_key` — plugins cannot read API keys
- `chat.read_all` — plugins cannot read all chat history (only current chat)
- `database.raw` — plugins cannot access IndexedDB/localStorage directly

### 18.4 Sandbox

- Plugins run in Web Worker (no DOM access)
- UI extensions render in isolated iframe/container
- Communication via structured message passing
- No direct access to `window`, `document`, `indexedDB`, `localStorage`
- Plugin storage is isolated per-plugin

---

## 19. Cloud Boundary

### 19.1 Local-first + Optional Cloud

```
Local Core (100% functional without account)
    │
    ├── Character CRUD, Chat, Memory, Relationship, Moments
    ├── AI Provider (direct, user's own API key)
    ├── Import/Export/Backup
    │
    └── Optional Cloud (user explicitly enables)
        ├── Account / Auth
        ├── Encrypted Cloud Sync
        ├── AI Gateway (optional proxy)
        ├── Community (optional publish)
        └── Plugin Registry (optional)
```

### 19.2 Data Classification for Cloud

| Data | Default | Sync Policy |
|------|---------|-------------|
| Characters | Local-only | Opt-in, encrypted |
| Chats/Messages | Local-only | Opt-in, encrypted, append-only |
| Memories | Local-only | Opt-in, encrypted |
| Relationship | Local-only | Opt-in, encrypted |
| Moments (private) | Local-only | Opt-in, encrypted |
| Moments (public) | Community | User explicitly publishes |
| API Keys | Local-only | **Never synced** |
| Settings | Local | Opt-in (non-sensitive only) |

### 19.3 Sync Rules

- **Conflict resolution**: Last-Write-Wins with field-level merge. User notified of conflicts.
- **Delete propagation**: Deletes create tombstones that propagate. Tombstones expire after 90 days.
- **Encryption**: Client-side encryption before upload. Server never sees plaintext.
- **Opt-in only**: No account required for core functionality. Cloud is never mandatory.

---

## 20. Community Boundary

### 20.1 Private vs Public Separation

```
Private Character Life (local, encrypted)
      │
      │ user explicitly chooses to publish
      ↓
Community (cloud server, public by default)
```

### 20.2 Community Data (if/when built)

- Public Character cards (user explicitly publishes)
- Posts / shared Moments
- Comments / Reactions on public content
- User profiles (public-facing only)
- Followers / Following
- Reports / Moderation

**NEVER auto-published**:
- Private chat history
- Private memories
- Private relationship data
- API keys
- Device settings

---

## 21. Cross-Platform Architecture

### 21.1 Shared vs Platform-Specific

```
Shared (all platforms)
├── Domain logic (Character, Chat, Memory, Relationship, etc.)
├── Application use cases
├── Repository interfaces
├── AI Gateway + provider adapters
└── Import/Export engine

Platform-specific
├── Infrastructure adapters (Storage, Platform, HTTP)
├── Presentation (UI components, navigation, patterns)
└── Native capabilities (notifications, file system, biometrics)
```

**Core MUST NOT depend on** `window`, `document`, `indexedDB`, `localStorage`, `fetch`, or any browser-only API. These are injected via adapters.

### 21.2 Platform Recommendations

| Platform | UI Technology | Storage | Rationale |
|----------|--------------|---------|-----------|
| **Web/PWA** | Current vanilla JS → Vite + web components (V2) | Dexie (IndexedDB) | Zero install, broad reach, works today |
| **Desktop** | Tauri (Rust shell + webview) | SQLite (native) | Small bundle, native performance, file system access, auto-update |
| **Mobile** | Evaluate React Native or Flutter (V3 spike) | SQLite (native) | Native UX, push notifications, offline |
| **Mini Program** | WeChat Mini Program (if China market demands) | WeChat storage (limited) | Restricted APIs, separate lightweight client, not priority |

**Why not share UI across all platforms?** Different platforms have different interaction patterns (desktop = mouse/keyboard multi-window, mobile = touch/single view, mini program = constrained). Sharing domain+application but not UI gives best UX per platform.

**Why Tauri for desktop?** ~5-10MB bundle vs Electron's ~150MB, native SQLite, low memory, Rust is manageable for a thin shell. Most logic stays in shared JS core.

---

## 22. Deployment Architecture

### 22.1 Current → Near Future → Long Term

| Component | CURRENT | NEAR FUTURE (V1.1-V2) | LONG TERM (V3+) |
|-----------|---------|----------------------|-----------------|
| Hosting | Cloudflare Pages (static) | Cloudflare Pages + CI preview | Same + edge functions |
| CI | None | GitHub Actions (test + lint) | GitHub Actions + preview deploy |
| CDN | Cloudflare (default) | Cloudflare + cache invalidation | Same |
| API | None (user direct to AI provider) | None (still direct) | Optional AI Gateway (Cloudflare Workers) |
| Database | None (local only) | None (local only) | Optional sync backend (PostgreSQL at edge) |
| Object Storage | None | None | Optional R2 for community assets |
| Community | None | None | Optional backend service |
| Monitoring | None | Optional Sentry (opt-in error tracking) | Same + performance monitoring |
| Domain | echochat-f4j.pages.dev | Custom domain | Custom domain + subdomains |

**PROHIBITED now**: Deploying backend services that don't exist. This is a plan, not an implementation.

---

## 23. Testing Architecture

### 23.1 Test Layers

| Layer | Tool | Scope | Priority |
|-------|------|-------|----------|
| Unit | Vitest | Pure functions, domain logic | High |
| Domain | Vitest | Character, Relationship, Memory, Moments behavior | High |
| Repository | Vitest + fake-indexeddb | CRUD, query, pagination, transaction | High |
| Integration | Vitest | Use cases (SendMessage, LikeMoment, DeleteCharacter) | High |
| Migration | Node test runner | Schema migration safety, staging, recovery | **Critical** (already 90 assertions) |
| Import | Vitest | Format detection, parse, normalize, round-trip | High |
| Character Reconstruction | Vitest + mock AI | Extraction pipeline, structured output, user review flow | High |
| Privacy | Vitest + manual audit | Context Builder minimal exposure, API key isolation, plugin sandbox | High |
| Delete/Restore | Vitest | Soft delete, cascade, trash, permanent delete, restore | High |
| E2E | Playwright | Full user flows (create char, chat, memory, delete) | Medium |
| Visual Regression | Playwright screenshots | UI consistency | Low |
| Performance | Lighthouse + custom | Load time, chat render (100/500/1000/3000 msgs) | Medium |
| Security | Manual + automated | Plugin sandbox, XSS, data isolation | Medium |

### 23.2 Current State

- Migration tests: ✅ 90 assertions, Node-based, direct production import
- Browser console tests: ⚠️ 50+ assertions, no CI, browser-only
- CI: ❌ None
- E2E: ❌ None

### 23.3 Phase 1 Priority

1. Move browser tests to Node (Vitest + fake-indexeddb)
2. Add GitHub Actions CI
3. Add Repository integration tests (when Repository layer exists)
4. Add Privacy tests (Context Builder doesn't leak data)
5. Add Delete/Restore tests (when cascade policy exists)

---

## 24. Observability

### 24.1 Current

- `console.log` / `console.error` only
- No error tracking, no performance metrics, no crash reporting

### 24.2 Target

**Error Tracking** (opt-in):
- Client-side capture (window.onerror, unhandledrejection, SW errors)
- Anonymized reports (stack trace, browser, app version)
- **Never include**: chat content, memory content, character data, API keys
- Self-hosted or privacy-respecting service (GlitchTip / Sentry self-hosted)

**Performance Metrics** (always local):
- App load time (first paint, interactive)
- Chat render time (N messages)
- Memory usage (estimated via performance.memory)
- AI response latency
- Storage usage (IndexedDB/localStorage estimate)

**Crash Recovery**:
- Storage corruption detection on startup
- Safe Mode: attempt recovery from latest snapshot, offer data export, last resort reset with consent

**Telemetry Boundary**: Product telemetry (errors, performance) is distinct from user private content. Telemetry payloads are inspected/stripped before send. No telemetry by default.

---

## 25. Import / Export / Backup

### 25.1 Import Engine

```
Input → Detect → Parse → Normalize → Validate → Preview → User Confirm → Transaction → Import
```

All imports are **transactional** (all-or-nothing). Failed imports leave existing data untouched.

### 25.2 Export Formats

- **Full Backup** (ECDF): All entities, for restore
- **Character Card**: SillyTavern V2 compatible
- **Chat Export**: JSON or plain text (per chat)
- **Memory Export**: JSON list
- **Moments Export**: JSON

### 25.3 EchoChat Data Format (ECDF)

```json
{
  "format": "echodata", "version": 1,
  "exportedAt": "...", "appVersion": "...",
  "characters": [...], "chats": [...], "messages": [...],
  "memories": [...], "relationships": [...], "relationshipEvents": [...],
  "moments": [...], "worldbook": [...], "assets": [...], "settings": {...}
}
```

### 25.4 Backup Strategy

| Type | Trigger | Retention |
|------|---------|-----------|
| Manual Export | User action | Forever (user-controlled) |
| Automatic Snapshot | Daily (if app opened) | Last 7 (local) |
| Pre-Migration Backup | Before any schema migration | Forever (local + user export prompt) |
| Cloud Backup | If sync enabled | Per cloud policy |

### 25.5 Migration Safety (preserved from V1)

```
Validate Source → Prepare Snapshot (memory) → Transform (memory) → Validate → Staging → Commit → Mark Version → Cleanup
```

Never use `localStorage.clear()` or `indexedDB.deleteDatabase()` to solve migration. Never delete old data before new data is verified.

---

## 26. Migration Strategy

### 26.1 General Principles

1. **Per-entity, incremental** — migrate one entity type at a time, not big-bang
2. **Dual-read period** — read from new, fallback to old
3. **Staging pattern** — write to staging, verify, then swap (proven in V1 migration)
4. **Never delete old data** until new data is independently verified
5. **Reversible** — each migration has a rollback path (old data retained)
6. **User data > code elegance** — if migration is risky, keep old format longer

### 26.2 V1 → V1.1 Migration (localStorage → Dexie)

```
Phase 2.1: Messages only
  - Create Dexie messages store
  - On app start: if messages in localStorage and not in Dexie, migrate
  - Dual-read: try Dexie first, fallback to localStorage
  - Dual-write: write to both during transition
  - After 1 release: remove localStorage message read

Phase 2.2: Characters + Chats + Memories
  - Same pattern per entity

Phase 2.3: Relationships + Moments + Worldbook
  - Same pattern

Phase 2.4: Remove localStorage for structured data
  - Keep localStorage only for settings/UI prefs
```

---

## 27. Current → Transition → Target

### 27.1 Storage

| | CURRENT | TRANSITION | TARGET |
|---|---------|-----------|--------|
| Engine | localStorage (4 keys) | Repository abstraction + Dexie for messages | Platform-specific StorageAdapter (Dexie web / SQLite desktop) |
| Messages | Inline in chat object | Independent Dexie store, paginated | Independent store, searchable, branchable |
| Transactions | None | Dexie transactions | Adapter-level transactions |
| Limit | 5–10MB | >50MB (browser quota) | Platform-native (unlimited-ish) |

### 27.2 Character

| | CURRENT | TRANSITION | TARGET |
|---|---------|-----------|--------|
| Entity | Not first-class (in chat.config) | Character entity + repository | First-class aggregate root |
| ID | roleId (hash-derived) | characterId (stable UUID) | characterId (stable UUID) |
| Chats | 1 chat ≈ 1 character | Multiple chats per character | Multiple chats, character is asset |
| Guide | 12 templates in config | 1 Guide Character, sandboxed | 1 Guide, skippable, deletable |

### 27.3 Relationship

| | CURRENT | TRANSITION | TARGET |
|---|---------|-----------|--------|
| Model | Single affinity number | Current State + Event History | Current State + Event History (retained) |
| Traceability | None ("why 87?" unanswerable) | Recent events explain delta | Full event history, state rebuild possible |
| Block/Delete | Mixed with chat delete | Separate actions with cascade policy | Separate, soft-delete, trash, restore |

### 27.4 Memory

| | CURRENT | TRANSITION | TARGET |
|---|---------|-----------|--------|
| Storage | In state.longTermMemory | Independent MemoryRepository | Typed memories (5 types), dedup, conflict resolution |
| Retrieval | Top-N by importance | Context Builder with token budget | Relevance + importance + recency, budget-aware |
| Worldbook | Separate, keyword match | Separate, maintained | Separate system (not Memory), trigger-based injection |

### 27.5 AI Provider

| | CURRENT | TRANSITION | TARGET |
|---|---------|-----------|--------|
| Architecture | Direct fetch in provider.js | AI Gateway + ProviderAdapter interface | Gateway + multiple adapters (OpenAI, Anthropic, etc.) |
| Retry/Circuit | None | Exponential backoff + circuit breaker | Full gateway features |
| Domain knows fetch? | Yes (provider.js) | No (adapter handles) | No |

### 27.6 Privacy

| | CURRENT | TRANSITION | TARGET |
|---|---------|-----------|--------|
| API Key | Plaintext in localStorage | Encrypted (Web Crypto) | Encrypted, Gateway-only access |
| AI Context | Persona + top-10 memories + worldbook | Context Builder (budget-aware) | Full Context Builder + Behavior Engine |
| Plugin | None | Boundary defined | Sandboxed, capability-gated |

### 27.7 Cross-platform

| | CURRENT | TRANSITION | TARGET |
|---|---------|-----------|--------|
| Core | Depends on window/document/localStorage | Platform adapters for storage only | Fully platform-agnostic core |
| Desktop | None | None (design only) | Tauri + SQLite |
| Mobile | None | None | Evaluate RN/Flutter (V3) |

---

## 28. Architecture Non-Goals (Do Not Overengineer)

These are explicitly out of scope. Do not start without a new architecture decision.

1. ❌ **No immediate Full Rebuild** — incremental phases only, each reversible
2. ❌ **No immediate Monorepo** — single repo through V2. Monorepo when desktop/mobile exist
3. ❌ **No immediate Cloud** — local-first. Cloud is Phase 8+, opt-in only
4. ❌ **No Plugin Marketplace** — Phase 7 defines runtime/sandbox only. Marketplace is cloud/community concern
5. ❌ **No Community Backend** — Phase 8+. Design boundary, don't implement
6. ❌ **No full TypeScript migration** — JSDoc types first. TS in V2, incremental, not big-bang
7. ❌ **No SQLite WASM** — Dexie for web. SQLite comes with native desktop/mobile
8. ❌ **No Full Event Sourcing** — Current State + Event History for Relationship. ES only if justified later
9. ❌ **No all-clients-at-once** — Web first. Desktop when core is stable. Mobile after desktop spike
10. ❌ **No architecture for architecture's sake** — every addition must pass Decision Criteria (§29)

**Rule**: Build the boundary first, implement only when real demand exists.

---

## 29. Architecture Decision Criteria

Any proposed architecture change MUST answer all 10:

| # | Criterion | Question |
|---|-----------|----------|
| 1 | **User Value** | Does this directly improve user experience or enable a user-facing feature? |
| 2 | **Performance** | Does it improve a measured performance metric (load, render, memory)? |
| 3 | **Reliability** | Does it reduce crash/corruption/data-loss risk? |
| 4 | **Privacy** | Does it strengthen or at least not weaken privacy guarantees? |
| 5 | **Maintainability** | Does it make the codebase easier to understand and modify? |
| 6 | **Migration Cost** | What is the cost to migrate existing data and code? Can it be incremental? |
| 7 | **Rollback** | Can it be rolled back if problems arise? Is old data retained? |
| 8 | **Cross-platform Impact** | Does it help or hinder future desktop/mobile? |
| 9 | **Future Extensibility** | Does it enable planned features without rework? |
| 10 | **Operational Cost** | What is the ongoing maintenance burden? (dependencies, complexity, build time) |

**Rule**: If a technology cannot clearly improve at least 3 of these criteria, and is only adopted because "mature projects use it", **reject it**.

---

## 30. Roadmap (9 Phases)

### Phase 1: V1 Freeze + Architecture Foundation

| Item | Detail |
|------|--------|
| Goal | Stabilize V1, establish CI/testing/ADR foundation |
| Duration | 2–4 weeks |
| Files | CI config, tests, docs, lint config |
| Risk | Low |
| User data impact | None |

**Tasks**: Freeze V1 features (bug fixes only); GitHub Actions CI; adopt Vitest, migrate browser tests to Node; ESLint + Prettier; ADR process; error boundary + safe mode.

**Exit Criteria**: CI green on every PR; lint clean; ADR-001~009 drafted; V1 has no P0/P1 bugs.
**Rollback**: N/A (additive only).

---

### Phase 2: Storage + Repository Layer

| Item | Detail |
|------|--------|
| Goal | localStorage → Dexie, establish Repository abstraction |
| Duration | 4–8 weeks |
| Files | New: src/repository/, src/infrastructure/dexie/; Modified: domain modules |
| Dependencies | Dexie.js |
| Risk | Medium (data migration) |
| User data impact | Migration required, zero-data-loss mandatory |

**Tasks**: 2.1 Messages to Dexie; 2.2 Characters/Chats/Memories; 2.3 Relationships/Moments/Worldbook; 2.4 Remove localStorage for structured data; 2.5 Repository interfaces; performance tests (100/500/1000/3000 messages).

**Migration**: Per-entity, dual-read, staging pattern, old data retained until verified.
**Rollback**: Revert to localStorage reads (old data never deleted during migration).
**Exit Criteria**: All structured data in Dexie; domain uses Repository interfaces; 3000-message chat <100ms render on mid-range mobile.

---

### Phase 3: Character First-Class Entity

| Item | Detail |
|------|--------|
| Goal | Character as aggregate root, separate from Chat |
| Duration | 4–6 weeks |
| Dependencies | Phase 2 complete |
| Risk | Medium (data migration from scattered to centralized) |

**Tasks**: Character entity + repository; migration (extract from chats); characterId links; Character list UI; creation flows (scratch, template, card import); reduce to 1 Guide Character (sandboxed, skippable, deletable); Character detail page.

**Exit Criteria**: Character CRUD works; all chats reference characterId; Guide policy implemented; no data loss.

---

### Phase 4: Relationship + Memory + Social

| Item | Detail |
|------|--------|
| Goal | Current State + Event History for Relationship; Memory pipeline; Moments domain hardening |
| Duration | 6–8 weeks |
| Dependencies | Phase 3 complete |
| Risk | Low-Medium |

**Tasks**: RelationshipEvent store; recompute affinity from events; block/unblock/archive; Memory types + dedup + conflict resolution; Context Builder with token budget; Moments separate stores (comments/reactions); interaction → relationship → memory loop; Deletion Policy (soft delete, trash, cascade, permanent).

**Exit Criteria**: Every metric traceable to events; Memory retrieval uses Context Builder; Moments interaction affects relationship+memory; Delete/block/archive all correct with cascade.

---

### Phase 5: Import / Reconstruction

| Item | Detail |
|------|--------|
| Goal | Import engine + Chat History → Character Reconstruction (first-class) |
| Duration | 4–6 weeks |
| Dependencies | Phase 3 complete |
| Risk | Low |

**Tasks**: Import Engine framework; Character Card import (harden); ECDF backup import/export; Chat History import (WhatsApp/Telegram/plain); Character Reconstruction pipeline (speaker detection → structured extraction → user review); structured output with confidence scores.

**Exit Criteria**: Import engine supports 3+ formats; Reconstruction produces structured Character + Memories + Relationship; round-trip lossless for ECDF; all imports transactional.

---

### Phase 6: Behavior Engine

| Item | Detail |
|------|--------|
| Goal | Personality modifiers, effective character state, behavior-driven responses |
| Duration | 4–6 weeks |
| Dependencies | Phase 3, 4 complete |
| Risk | Low |

**Tasks**: Personality Modifier system (priority: User > Relationship > Current > Custom > Symbolic > Base); Effective Character State; Behavior Engine (state → prompt adjustments); current mood/emotional state; character-initiated behavior formalized; entertainment labeling for symbolic features.

**Exit Criteria**: Modifiers composable with weight/priority/conflict resolution; Behavior Engine affects AI prompts; all symbolic features labeled as entertainment.

---

### Phase 7: Plugin Boundary

| Item | Detail |
|------|--------|
| Goal | Plugin sandbox + capability API (no marketplace) |
| Duration | 6–8 weeks |
| Dependencies | Phase 2 (Repository) complete |
| Risk | Medium (security boundary) |

**Tasks**: Plugin Manifest + permission model; Web Worker sandbox; Capability API (gated); plugin storage isolation; UI extension points; local sideload; permission UI (grant/review/revoke); security audit.

**Exit Criteria**: Plugins cannot access API keys/full chat history/raw DB; all permissions explicit and revocable; 1 example plugin works; security tests pass.

---

### Phase 8: Cloud Boundary

| Item | Detail |
|------|--------|
| Goal | Account + encrypted sync (optional, opt-in) |
| Duration | 8–12 weeks |
| Dependencies | Phase 2, 3 complete |
| Risk | High (privacy, security) |

**Tasks**: Account system; client-side encryption; encrypted sync (character/chats/memories/relationship/moments); conflict resolution (LWW + field merge); delete propagation (tombstones); AI Gateway proxy (optional); community read-only preview; privacy audit.

**Exit Criteria**: Local core works 100% without account; sync is opt-in/encrypted/user-controlled; conflict resolution tested; privacy audit passes.

---

### Phase 9: Desktop / Mobile

| Item | Detail |
|------|--------|
| Goal | Tauri desktop with SQLite. Mobile exploration. |
| Duration | 8–12 weeks (desktop), mobile TBD |
| Dependencies | Phase 2 (storage abstraction) complete |
| Risk | Medium |

**Tasks**: Monorepo restructure; extract platform-agnostic core; Tauri shell + native SQLite; platform adapters; data migration (web→desktop via import/export); auto-update; mobile: RN vs Flutter spike only.

**Exit Criteria**: Desktop app runs with native SQLite; core shared between web and desktop; import/export works across platforms; auto-update functional.

---

## 31. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Data loss during storage migration | Medium | Critical | Per-entity, staging, dual-read, never delete old, migration tests |
| 2 | Performance regression in transition | Medium | High | Performance tests every phase, rollback capability, measure before/after |
| 3 | Scope creep → de facto Full Rebuild | High | High | Strict phase gates, Non-Goals, Exit Criteria, STOP after each phase |
| 4 | Plugin security vulnerability | Low (when built) | Critical | Security audit, capability model, sandbox, no default access, security tests |
| 5 | Cloud sync privacy breach | Low (when built) | Critical | Client-side encryption, opt-in, privacy audit, local-first guarantee |
| 6 | Character migration loses data | Medium | High | Derive from chats, preserve roleId→characterId mapping, reversible |
| 7 | AI provider lock-in | Low | Medium | Adapter pattern from Phase 2, user brings own API key |
| 8 | Over-engineering burden | Medium | Medium | Non-Goals, Decision Criteria, incremental phases, "is this worth it now?" |
| 9 | Reconstruction quality poor (AI extraction) | Medium | Medium | Confidence scores, user review/edit/reject, never auto-accept |
| 10 | Cross-platform core leakage (browser API in core) | Medium | Medium | Platform adapter pattern, lint rule (no window/document in core), CI check |

---

## 32. Architecture Score

### Current V1 Architecture

| Dimension | Score | Assessment |
|-----------|-------|------------|
| Data Architecture | 3/10 | Messages inline, localStorage 5MB wall, no query/transactions. Must change. |
| Domain Architecture | 4/10 | Modules exist but Character not first-class, Relationship no history. Needs evolution. |
| Privacy | 6/10 | Local-first is good; no encryption, no plugin boundary, AI context not budget-managed. Solid base. |
| Scalability | 2/10 | Full-state serialization per message. Breaks ~500 messages/chat on mobile. Critical. |
| Cross-platform | 3/10 | PWA works but core depends on browser APIs. No adapter pattern. |
| Testability | 4/10 | Migration tests strong (90), but domain tests browser-only, no CI, no E2E. |
| Maintainability | 4/10 | main.js 637 lines, full re-render, no types. Works but will degrade. |
| Extensibility | 3/10 | No plugin boundary, no repository abstraction, hard-coded AI provider. |
| Performance | 5/10 | Fast for small data (zero-build, native). Degrades sharply with volume. |
| Migration Safety | 8/10 | Staging + backup + recovery is excellent. Strongest dimension. |

**Weighted Average**: 4.3/10

### Must Change (P0/P1)

1. Data model — messages independent, Character first-class (Phase 2, 3)
2. Storage engine — localStorage → Dexie (Phase 2)
3. Repository layer — domain/storage separation (Phase 2)
4. Relationship event history — Current State + Event History (Phase 4)
5. AI provider abstraction — Gateway + Adapter (Phase 2 or 4)

### Can Retain

1. Migration safety pattern (staging + backup + recovery) — excellent, extend
2. Domain module boundaries (chat/memory/moments/etc.) — good, refactor don't rewrite
3. Event bus — lightweight pub/sub works
4. Zero-build simplicity — keep through V1.1
5. PWA versioned cache strategy (APP_VERSION ≠ DATA_SCHEMA_VERSION) — correct
6. Worldbook SillyTavern compatibility — good interoperability

### Imperfect But Not Worth Touching Now

1. UI full re-render — works at current scale. Revisit in V2.
2. No TypeScript — JSDoc types sufficient for V1.1. TS in V2.
3. No E2E tests — add in Phase 1, not a V1.1 blocker.
4. main.js 637 lines — shrinks naturally as layers are introduced. Don't refactor for line count.
5. No error tracking — add in Phase 1. Low priority vs data architecture.

---

## 33. Final Recommendation

### A. Can current architecture continue as V1 base?

**Yes.** V1 is functional and validated. No Full Rebuild. Targeted fixes via incremental phases.

### B. V1.1 top 3 architecture upgrades

1. **Storage abstraction + Dexie for messages** (Phase 2.1) — solves P0 performance + data integrity
2. **Character first-class entity** (Phase 3) — aligns architecture with product definition
3. **Repository layer** (Phase 2.5) — enables all future work (testing, plugins, desktop)

### C. Which upgrades must wait for real demand?

- Cloud sync (Phase 8) — wait until users ask for multi-device
- Plugin marketplace (Phase 7+) — wait until plugin runtime exists and users want extensions
- Community backend (Phase 8+) — wait until users want to share
- Mobile app (Phase 9) — wait until desktop validates shared core
- SQLite WASM — never for web; Dexie is sufficient
- Full Event Sourcing — Current State + Event History is enough; revisit only if relationship logic becomes complex

### D. Recommended web local database

**Dexie (IndexedDB wrapper)** via Storage Adapter. Best balance of capability, browser compatibility, bundle size (~15KB), and maintenance.

### E. Recommended desktop local database

**SQLite (native)** via Tauri (sqlx/rusqlite). ACID, FTS5 search, SQLCipher encryption, zero bundle cost, native performance.

### F. Relationship event model

**Current State + Event History (Option B)**. Not Full Event Sourcing. Current state gives O(1) reads; event history gives traceability and recovery. Simpler to implement, migrate, sync, and delete.

### G. Character Reconstruction as core capability

First-class system with structured extraction pipeline (speaker detection → personality/style/preference/memory/relationship extraction → Character Draft → user review). Each extraction has confidence score. User can edit/reject individual items. **Never** stuff results into a giant prompt.

### H. Privacy boundary definition

Six data categories with explicit boundaries. Context Builder sends only minimal relevant context to AI. API keys encrypted and Gateway-only. Cloud sync opt-in + client-side encrypted. Plugins default-deny. No telemetry by default. **Never** claim "zero data upload" (AI API requests send user input).

### I. Cloud/Community/Plugin isolation from Local Core

All three are **optional layers** on top of a fully functional local core. Local core works 100% without account/cloud/plugins. Cloud data is encrypted and opt-in. Community data is user-explicitly-published only. Plugins are sandboxed with capability permissions. None can access private user data by default.

### J. Cross-platform core sharing

**Shared Domain + Application + Repository Interfaces** across all platforms. Platform-specific Infrastructure adapters (storage, HTTP, platform APIs) and Presentation (UI). Core has zero browser API dependencies. Web = Dexie + web UI; Desktop = Tauri + SQLite + desktop UI; Mobile = native SQLite + mobile UI. Mini Program = separate lightweight client (low priority).

---

## Appendix: ADR Index

Create `docs/architecture/adr/` with:

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Storage: Dexie for web, SQLite for desktop/mobile, via Storage Adapter | Proposed |
| ADR-002 | Repository Layer abstraction (no God Object) | Proposed |
| ADR-003 | AI Provider: Gateway + Adapter pattern | Proposed |
| ADR-004 | Plugin Security: capability-based sandbox, default-deny | Proposed |
| ADR-005 | Cloud Sync: opt-in, client-side encrypted, LWW conflict | Proposed |
| ADR-006 | Desktop: Tauri with native SQLite | Proposed |
| ADR-007 | Character as first-class aggregate root | Proposed |
| ADR-008 | Relationship: Current State + Event History (not Full ES) | Proposed |
| ADR-009 | Message store: independent, paginated, branchable | Proposed |

Each ADR: Context → Decision → Alternatives → Consequences → Migration.

---

*End of Architecture Proposal Revision 2. Prepared for Independent Architecture Gate Review.*
