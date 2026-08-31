# EchoChat Long-Term Architecture

> **Status**: Architecture Proposal (V1 Candidate → V2 Target)
> **Created**: 2026-08-31
> **Scope**: 2–3 year product architecture roadmap
> **Constraint**: This is NOT a Full Rebuild authorization. Every change must justify cost, migration path, and user data safety.

---

## 0. Executive Summary

EchoChat has completed V1 Closing Pass. The current architecture is a **zero-build Vanilla JS PWA** using `localStorage` for all structured data and `IndexedDB` only for Blob assets. It works for a single-user, small-dataset demo but will hit hard limits as the product grows toward a **Local-first AI Character Life Platform**.

### Core Judgment

| Dimension | Current | Verdict |
|-----------|---------|---------|
| Data Model | `chat.messages = [all messages]` in localStorage | **Must change** — hits 5MB wall, no pagination, no query |
| Storage | localStorage (4 keys, sync, 5–10MB) | **Must change** — no transactions, no indexing, blocking I/O |
| Character | Not a first-class entity (scattered in chat.config) | **Must change** — Character is the core product asset |
| Relationship | Single affinity score, no event history | **Must change** — cannot answer "why is affinity 87?" |
| Memory | Flat list per role, top-N by importance | **Must evolve** — needs retrieval, dedup, conflict resolution |
| AI Provider | Direct fetch in provider.js | **Must abstract** — no adapter boundary, no gateway |
| UI | innerHTML full re-render, main.js 637 lines | **Can defer** — works, but maintainability degrades |
| Plugin | None | **Design now, implement later** |
| Cloud | None | **Design boundary now, implement much later** |
| TypeScript | None | **Phase 2+** — not now |

### Top 3 Architectural Risks (if unaddressed)

1. **Data loss / corruption at scale** — localStorage has no transactions; a crash mid-write can corrupt the entire state blob. The current migration staging mechanism mitigates schema migrations but not runtime writes.
2. **Performance cliff at ~500 messages/chat** — every `store.set()` serializes the entire state object including all messages. At 1000+ messages this becomes visibly laggy on low-end mobile.
3. **Character data fragmentation** — a Character's identity, memories, relationships, and moments live in 4 separate localStorage keys with no referential integrity. Deleting a Character requires manual cleanup across all keys.

---

## 1. Product Redefinition

### 1.1 From "AI Chat PWA" to "Local-first AI Character Life Platform"

**CURRENT**: EchoChat is positioned as an AI chat application with memory and relationship features.

**TARGET**: EchoChat is a platform where users **create, import, shape, and long-term accompany AI Characters**. Chat is one interaction surface among many (Moments, Memory, Relationship, Behavior).

### 1.2 The Core Product Flywheel

```
Character Creation
      ↓
Character Identity (stable, first-class entity)
      ↓
Conversation (one interaction surface)
      ↓
Memory (structured, retrievable)
      ↓
Relationship (event-sourced, traceable)
      ↓
Social Life / Moments (character-initiated social simulation)
      ↓
Behavior Changes (personality modifiers + state)
      ↓
Future Conversation (informed by all of the above)
      ↓
Long-term Character (the real user asset)
```

### 1.3 What Users Actually Own

Users don't own "chats". They own:

- **Character** — identity, personality, appearance, speaking style
- **Memory** — what the character remembers about the user and world
- **Relationship** — the history of interaction and emotional trajectory
- **Social History** — moments, reactions, comments
- **Personality** — base traits + modifiers + evolution
- **Appearance** — avatar, gallery, visual description
- **Behavior** — how the character acts, reacts, initiates

These must be **first-class domain entities**, not properties nested inside a chat object.

---

## 2. Current Architecture Assessment (CURRENT)

### 2.1 Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | Vanilla JavaScript (ES Modules) | No TypeScript, no build step |
| UI | Native DOM + innerHTML | No framework, full re-render on state change |
| State | Singleton Store class | In-memory + auto-persist to localStorage |
| Storage | localStorage (4 keys) + IndexedDB (blobs only) | Sync, 5–10MB limit, no transactions |
| AI | Direct fetch to OpenAI-compatible API | No adapter abstraction |
| PWA | Service Worker + Web App Manifest | Versioned cache, APP_VERSION = 1.0.0 |
| Testing | Browser console tests + Node migration tests | No CI, no E2E framework |
| Build | None | Files served as-is |

### 2.2 Data Model (CURRENT)

```
localStorage:
  echodownload_lite_state_v1 = {
    schemaVersion: 2,
    settings: {...},
    global: {persona},
    userPersonaPresets: [],
    longTermMemory: { [roleId]: { roleName, memories: [{id, content, importance, createdAt, source}] } },
    memoryCfg: {...},
    chats: [
      {
        id, roleId, name, avatar, createdAt,
        config: { persona, myAvatar, model, temperature },
        messages: [ {id, role, text, time, status} ]  // ← ALL messages inline
      }
    ],
    currentChatId,
    ui: {...}
  }

  echodownload_worldbook_v1 = { version, books: [{id, name, scope, roleId, entries: [...]}], activeGlobalBookId }
  echodownload_moments_v1 = { version, moments: [{id, roleId, content, image, likes, comments: [...]}] }
  echodownload_relations_v1 = { version, checkIn, roles: { [roleId]: {roleName, chatTurns, streakDays, lastChatAt, ...} } }
  echodownload_meta_v2 = { schemaVersion, migratedAt, ... }

IndexedDB:
  echodownload_assets / blobs = { id, blob }
```

### 2.3 Critical Limitations

| # | Limitation | Impact | Severity |
|---|-----------|--------|----------|
| 1 | `chat.messages` contains entire history | 5MB wall, no pagination, O(n) search | P0 |
| 2 | localStorage is synchronous | Blocks main thread on every write | P0 |
| 3 | No transactions across 4 keys | Partial writes possible on crash | P0 |
| 4 | Character is not a first-class entity | Data scattered, no referential integrity | P1 |
| 5 | Relationship has no event history | Cannot trace "why affinity = 87" | P1 |
| 6 | Memory retrieval is top-N sort | No semantic search, no context budget management | P1 |
| 7 | Store persists entire state on every change | O(total data) per message append | P1 |
| 8 | AI provider is hardcoded fetch | No adapter, no gateway, no retry/circuit-breaker | P1 |
| 9 | main.js = 637 lines (routing + events + business) | Hard to maintain, hard to test | P2 |
| 10 | UI full re-render via innerHTML | No virtual DOM, no component lifecycle | P2 |
| 11 | No type safety | Runtime errors only, no compile-time checks | P2 |
| 12 | No CI/CD | Manual testing only | P2 |
| 13 | No error tracking | console.log only | P2 |
| 14 | No plugin boundary | Future plugins would have full app access | P3 (design now) |
| 15 | No cloud boundary | Future sync design unconstrained | P3 (design now) |

---

## 3. Target Architecture (TARGET)

### 3.1 Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│                   UI / Presentation                 │
│  (Web SPA / PWA / Desktop Shell / Mobile Shell)     │
├─────────────────────────────────────────────────────┤
│              Application / Use Case Layer           │
│  (ChatSession, CharacterCreation, ImportEngine,     │
│   MomentInteraction, BackupRestore)                 │
├─────────────────────────────────────────────────────┤
│                   Domain Layer                      │
│  Character, Conversation, Memory, Relationship,     │
│  Moments, Worldbook, Behavior, Personality          │
├─────────────────────────────────────────────────────┤
│                 Repository Layer                    │
│  CharacterRepo, MessageRepo, MemoryRepo,            │
│  RelationshipRepo, MomentRepo, WorldbookRepo,       │
│  AssetRepo, SettingsRepo, PluginRepo                │
├─────────────────────────────────────────────────────┤
│              Infrastructure / Storage               │
│  IndexedDB (Dexie) / SQLite (desktop/mobile)        │
│  Asset Blob Store                                   │
│  AI Provider Adapters                               │
│  Platform Adapters                                  │
└─────────────────────────────────────────────────────┘
```

### 3.2 Core Principles

1. **Character is first-class** — Every domain entity references `characterId`, not `chatId` or `roleId`.
2. **Messages are independent** — Messages are stored in a separate store with `chatId` foreign key, paginated and queryable.
3. **Repository boundary** — Domain never touches storage directly. All I/O goes through Repository interfaces.
4. **Platform-agnostic core** — Core logic has no `window`, `document`, or `indexedDB` references. Platform adapters inject dependencies.
5. **Local-first by default** — Everything works offline. Cloud is opt-in and explicitly bounded.
6. **Privacy by architecture** — AI requests contain only minimal context, never the full database.
7. **Event-sourced relationships** — Relationship state is derived from an event log, not a single mutable number.
8. **Plugin capability model** — Plugins run in sandbox with explicit permissions, never default access.

---

## 4. Domain Design

### 4.1 Character (核心 Domain)

**CURRENT**: Character data is scattered across `chat.config.persona`, `relations.roles[roleId]`, `moments[].roleId`, `longTermMemory[roleId]`. There is no single Character entity.

**TRANSITION**: Introduce `Character` entity while maintaining backward-compatible `chat.roleId` references.

**TARGET**:

```
Character {
  id: string (UUID, stable)
  name: string
  createdAt: timestamp
  updatedAt: timestamp
  deletedAt: timestamp | null  (soft delete)

  // Identity
  persona: string              // 人设描述
  personality: PersonalityProfile  // 结构化人格
  speakingStyle: SpeakingStyle
  firstMessage: string

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
  source: "template" | "user_created" | "imported_card" | "reconstructed"
  isGuide: boolean           // Guide Character flag
  characterVersion: number   // for future schema evolution
  metadata: Record<string, any>  // extension point
}
```

#### Guide Character Policy

- **CURRENT**: 12 system templates in `config.js` (baiyueguang, chenwen, dushe, etc.)
- **TARGET**: 1 primary Guide Character + optional variants. Guide Characters:
  - Have `isGuide: true`
  - Are NOT shown in the user's main Character list
  - Serve only onboarding / capability demonstration
  - Can be skipped entirely
  - Do not pollute user data (their memories/relationships are sandboxed or deletable)

### 4.2 Conversation / Chat

**CURRENT**: `chat.messages = [all messages]` inline in the state object.

**TARGET**:

```
Chat {
  id: string
  characterId: string        // ← was roleId
  title: string
  createdAt: timestamp
  updatedAt: timestamp
  archivedAt: timestamp | null
  config: {
    model: string
    temperature: number
    baseUrl: string | null   // per-chat override
  }
  messageCount: number       // denormalized for list views
  lastMessageAt: timestamp   // denormalized for sorting
}

Message {
  id: string
  chatId: string             // foreign key
  characterId: string        // denormalized for query
  role: "user" | "assistant" | "system"
  content: string
  createdAt: timestamp
  updatedAt: timestamp | null
  status: "draft" | "sending" | "streaming" | "sent" | "error" | "stopped"
  parentMessageId: string | null  // for branching / regenerate
  generationMeta: {
    model: string
    tokensIn: number
    tokensOut: number
    latencyMs: number
    provider: string
  } | null
  attachments: AttachmentRef[]
  metadata: Record<string, any>
}
```

**Key changes**:
- Messages stored in independent store, indexed by `chatId` + `createdAt`
- Pagination: load last N messages, load more on scroll
- Search: full-text or keyword search across messages
- Branching: `parentMessageId` enables regenerate without deleting history
- Streaming: message status transitions, partial content updates

### 4.3 Memory System

**CURRENT**: `longTermMemory[roleId].memories = [{id, content, importance, createdAt, source}]`, retrieved by top-N importance sort.

**TARGET**:

```
Memory {
  id: string
  characterId: string
  type: "conversation" | "short_term" | "long_term" | "relationship" | "character" | "social" | "worldbook"
  content: string
  importance: number (0-10)
  confidence: number (0-1)    // for AI-extracted memories
  source: "manual" | "auto_summary" | "reconstruction" | "imported" | "plugin"
  relatedChatId: string | null
  relatedMessageId: string | null
  createdAt: timestamp
  updatedAt: timestamp
  expiresAt: timestamp | null   // short-term memories expire
  tags: string[]
  metadata: Record<string, any>
}
```

#### Memory Pipeline

```
Conversation Turn
      ↓
Memory Candidate Generator (AI-assisted)
      ↓
Importance Scoring
      ↓
Deduplication (similarity / exact match)
      ↓
Conflict Resolution (new info contradicts old?)
      ↓
Storage (by type)
      ↓
Retrieval (Context Builder)
      ↓
Relevant Context → Behavior Engine → Prompt Builder → AI Provider
```

**Retrieval is NOT "read entire DB"**. The Context Builder:
1. Takes current conversation context (last N messages)
2. Queries memories by characterId + type + relevance
3. Applies token budget constraint
4. Returns only the most relevant subset
5. Never sends raw database content to AI

### 4.4 Relationship Engine

**CURRENT**: `relations.roles[roleId] = {chatTurns, streakDays, lastChatAt, ...}`, affinity computed as `turns * 0.1 + likes * 0.5 + comments * 1 + checkBonus`. No event history.

**TARGET**:

```
Relationship {
  id: string
  characterId: string
  userId: string              // "user" or future multi-user
  type: "friend" | "romantic" | "mentor" | "family" | "custom"
  status: "active" | "blocked" | "archived"
  createdAt: timestamp
  updatedAt: timestamp

  // Derived metrics (recomputed from events)
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
  id: string
  relationshipId: string
  characterId: string
  type: "chat" | "moment_like" | "moment_comment" | "important_conversation"
      | "conflict" | "apology" | "memory_created" | "block" | "unblock"
      | "gift" | "milestone" | "custom"
  timestamp: timestamp
  payload: Record<string, any>    // type-specific data
  affinityDelta: number           // computed effect on affinity
  description: string             // human-readable "why"
}
```

**Key principle**: `affinity = 87` is always answerable by replaying `RelationshipEvent` history. No more "magic number".

#### Deletion vs Block (分离)

| Action | Effect | Reversible |
|--------|--------|------------|
| Delete Chat | Removes chat + messages | Soft delete → trash → permanent |
| Delete Character | Removes character + all chats + memories + relationship + moments | Soft delete → trash → permanent |
| Delete Relationship | Resets relationship metrics, keeps chat history | Yes (recreate) |
| Delete Memory | Removes single memory | Yes (trash) |
| Block Character | Character cannot initiate, chat read-only, no moments | Yes (unblock) |
| Archive Chat | Hides from list, data preserved | Yes (unarchive) |

**Cascade policy**: Deleting a Character triggers soft-delete of all dependent entities (chats, messages, memories, relationship, moments). A 30-day trash window allows recovery. Permanent delete requires explicit confirmation.

### 4.5 Moments / Social Simulation

**CURRENT**: `moments.moments = [{id, roleId, content, image, likes, comments: [...]}]`, flat array, max 200.

**TARGET**:

```
Moment {
  id: string
  characterId: string
  authorType: "character" | "user"
  content: string
  media: AssetRef[]
  createdAt: timestamp
  visibility: "public" | "friends" | "private"
  socialContext: {
    mood: string
    relatedMemoryId: string | null
    trigger: "auto" | "manual" | "chat_derived"
  }
  likeCount: number (denormalized)
  commentCount: number (denormalized)
}

MomentComment {
  id: string
  momentId: string
  authorType: "character" | "user"
  characterId: string | null
  content: string
  createdAt: timestamp
}

MomentReaction {
  id: string
  momentId: string
  authorType: "character" | "user"
  characterId: string | null
  reaction: string  // emoji or type
  createdAt: timestamp
}
```

#### Moments Interaction Loop

```
User likes Moment
      ↓
Social Event (type: moment_like)
      ↓
Character Interpretation (AI: "how would character react?")
      ↓
Relationship Effect (affinity +, RelationshipEvent created)
      ↓
Memory Candidate (if significant)
      ↓
Character State Update
      ↓
Future Conversation (character references the interaction)
```

**Layering rule**: Domain events → Application logic → UI animation/sound. Business logic never lives in animation code.

### 4.6 Personality Modifier System

**CURRENT**: Personality is a free-text `persona` string. No structured modifiers.

**TARGET**:

```
Base Personality
     +
Zodiac Modifier (entertainment)
     +
Chinese Zodiac Modifier (entertainment)
     +
Tarot / Symbolic Modifier (entertainment)
     +
User Custom Modifier
     +
Relationship Modifier (derived from Relationship state)
     +
Current State (mood, recent events, time of day)
     ↓
Effective Character State → Behavior Engine → Prompt Builder
```

**Rules**:
- Zodiac/Tarot/Chinese Zodiac are explicitly labeled as **entertainment / role-shaping mechanisms**, not scientific personality assessment.
- Each modifier has `weight` (0-1) and `priority`.
- Conflicts resolved by priority (higher wins) or user override.
- Relationship state can temporarily modify personality (e.g., "character is upset → more distant tone").
- Current mood can override long-term traits for a single conversation.
- Memories can trigger behavior shifts ("user mentioned birthday → character acts celebratory").

### 4.7 Worldbook

**CURRENT**: Flat books with entries, keyword substring matching, priority sort, 1200 char hard cap.

**TARGET**:

```
WorldbookBook {
  id: string
  name: string
  scope: "global" | "character"
  characterId: string | null
  entries: WorldbookEntry[]
  active: boolean
}

WorldbookEntry {
  id: string
  bookId: string
  name: string
  keys: string[]
  secondaryKeys: string[]
  content: string
  enabled: boolean
  constant: boolean
  priority: number
  depth: number          // scan depth (last N messages)
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
  position: "before_char" | "after_char" | "system"
  injectionPolicy: "always" | "once_per_session" | "on_keyword"
  tags: string[]
  conditions: Record<string, any>  // future: conditional injection
}
```

**Improvements**:
- Context budget management (token-aware, not char cap)
- Character-specific + global books
- Plugin access (read-only by default)
- Conflict handling by priority + position

---

## 5. Storage Architecture

### 5.1 Database Decision Matrix

| Criterion | localStorage | IndexedDB (raw) | Dexie | SQLite WASM | SQLite (Tauri) |
|-----------|-------------|-----------------|-------|-------------|----------------|
| Performance (read) | Fast (sync) | Async, good | Async, good | Async, excellent | Sync, excellent |
| Performance (write) | Fast but blocks | Async, good | Async, good | Async, excellent | Sync, excellent |
| Reliability | Low (no tx) | Medium (tx) | High (tx) | High (ACID) | High (ACID) |
| Transactions | ❌ | ✅ | ✅ | ✅ | ✅ |
| Query | ❌ (full scan) | ✅ (indexes) | ✅ (rich query) | ✅ (SQL) | ✅ (SQL) |
| Migration | Manual | versionchange | Built-in | SQL migrations | SQL migrations |
| Large dataset (>10MB) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Offline | ✅ | ✅ | ✅ | ✅ | ✅ |
| Browser support | All | All modern | All modern | Chrome/Edge/Firefox* | N/A (desktop) |
| Desktop | N/A | N/A | N/A | Possible | ✅ native |
| Mobile | N/A | N/A | N/A | Possible | ✅ native |
| Backup/Export | JSON dump | JSON dump | JSON dump | SQL dump | SQL dump |
| Encryption | ❌ | ❌ (manual) | ❌ (manual) | ✅ (SQLCipher) | ✅ (SQLCipher) |
| Maintenance | Zero | Medium | Low | Medium | Low |
| Ecosystem | N/A | Basic | Good | Excellent | Excellent |

*SQLite WASM in Firefox requires OPFS or IndexedDB backend; performance varies.

### 5.2 Decision

**V1.1 (TRANSITION)**: **Dexie.js (IndexedDB wrapper)**

Rationale:
- Solves the P0 problems (transactions, indexing, async, >10MB)
- Minimal migration cost: Dexie wraps IndexedDB, no WASM download
- Browser support: all modern browsers
- Familiar API: Promise-based, schema versioning built-in
- No build system required (can import from CDN or vendor the file)
- Progressive migration: move one entity at a time

**V2 (TARGET)**: **Shared Database Core with platform adapters**

- Web/PWA: Dexie (IndexedDB)
- Desktop (Tauri): SQLite (native)
- Mobile: SQLite (native)
- Core logic depends on a `DatabaseAdapter` interface, not a specific engine

**Why not SQLite WASM for V1.1?**
- WASM bundle adds ~1MB download
- Firefox support is inconsistent
- OPFS requires HTTPS + user activation
- Dexie solves 90% of the problem with 10% of the complexity
- SQLite becomes relevant when desktop/mobile native apps exist

### 5.3 Storage Migration Strategy

**Phase approach** (not big-bang):

1. **Phase 2.1**: Add Dexie, create schema for `messages` only. New messages write to Dexie. Read from Dexie with localStorage fallback.
2. **Phase 2.2**: Migrate `characters`, `chats`, `memories` to Dexie.
3. **Phase 2.3**: Migrate `relationships`, `moments`, `worldbook` to Dexie.
4. **Phase 2.4**: Remove localStorage dependency for structured data. Keep localStorage only for settings/UI prefs.
5. **Phase 2.5**: Introduce Repository abstraction over Dexie.

**User data safety**: Each phase follows the existing migration pattern:
```
Validate source → Prepare snapshot → Transform → Validate → Staging → Commit → Mark version
```
Never delete old data until new data is verified.

---

## 6. Repository Layer

### 6.1 Repository Interfaces

```typescript
interface CharacterRepository {
  findById(id: string): Promise<Character | null>
  findAll(filter?: CharacterFilter): Promise<Character[]>
  create(character: Omit<Character, "id"|"createdAt">): Promise<Character>
  update(id: string, patch: Partial<Character>): Promise<Character>
  softDelete(id: string): Promise<void>
  restore(id: string): Promise<void>
  permanentDelete(id: string): Promise<void>
}

interface MessageRepository {
  findByChatId(chatId: string, opts?: {limit: number, before?: string}): Promise<Message[]>
  findById(id: string): Promise<Message | null>
  create(message: Omit<Message, "id">): Promise<Message>
  update(id: string, patch: Partial<Message>): Promise<Message>
  delete(id: string): Promise<void>
  search(characterId: string, query: string): Promise<Message[]>
  countByChatId(chatId: string): Promise<number>
}

interface MemoryRepository {
  findByCharacterId(characterId: string, opts?: MemoryQuery): Promise<Memory[]>
  findRelevant(characterId: string, context: string, budget: number): Promise<Memory[]>
  create(memory: Omit<Memory, "id">): Promise<Memory>
  update(id: string, patch: Partial<Memory>): Promise<Memory>
  delete(id: string): Promise<void>
  deduplicate(characterId: string): Promise<number>  // returns removed count
}

interface RelationshipRepository {
  findByCharacterId(characterId: string): Promise<Relationship | null>
  appendEvent(event: Omit<RelationshipEvent, "id">): Promise<RelationshipEvent>
  getEvents(relationshipId: string, opts?: {limit: number, before?: timestamp}): Promise<RelationshipEvent[]>
  recomputeMetrics(relationshipId: string): Promise<Relationship>
  block(characterId: string): Promise<void>
  unblock(characterId: string): Promise<void>
}

interface MomentRepository {
  findAll(opts?: MomentFilter): Promise<Moment[]>
  findByCharacterId(characterId: string): Promise<Moment[]>
  create(moment: Omit<Moment, "id">): Promise<Moment>
  addComment(momentId: string, comment: Omit<MomentComment, "id">): Promise<MomentComment>
  toggleReaction(momentId: string, reaction: string): Promise<void>
  delete(momentId: string): Promise<void>
}

interface WorldbookRepository {
  findAll(): Promise<WorldbookBook[]>
  findByCharacterId(characterId: string): Promise<WorldbookBook[]>
  getActiveEntries(characterId: string, context: string): Promise<WorldbookEntry[]>
  createBook(book: Omit<WorldbookBook, "id">): Promise<WorldbookBook>
  addEntry(bookId: string, entry: Omit<WorldbookEntry, "id">): Promise<WorldbookEntry>
  updateEntry(entryId: string, patch: Partial<WorldbookEntry>): Promise<WorldbookEntry>
  deleteEntry(entryId: string): Promise<void>
}

interface AssetRepository {
  storeBlob(blob: Blob, metadata: AssetMeta): Promise<AssetRef>
  getBlob(id: string): Promise<Blob | null>
  delete(id: string): Promise<void>
  getRef(id: string): Promise<AssetRef | null>
}

interface SettingsRepository {
  get(key: string): Promise<any>
  set(key: string, value: any): Promise<void>
  getAll(): Promise<Record<string, any>>
}
```

### 6.2 Why Repository Layer?

1. **Domain doesn't know about storage** — `Character` domain logic works the same whether backed by Dexie, SQLite, or an in-memory mock.
2. **Testability** — Repositories can be mocked for unit/integration tests without a browser.
3. **Migration safety** — Changing storage engine requires only changing Repository implementations, not domain code.
4. **Cross-platform** — Desktop app can inject SQLite-backed repositories; web app injects Dexie-backed repositories.
5. **Plugin boundary** — Plugins never get direct Repository access; they go through a capability-gated API.

---

## 7. AI Provider Architecture

### 7.1 Current State

**CURRENT**: `provider.js` directly calls `fetch()` to OpenAI-compatible `/chat/completions`. `buildMessages()` constructs the prompt. No retry, no circuit breaker, no provider abstraction.

### 7.2 Target Architecture

```
Chat Domain
    ↓
AI Gateway (application-level)
    ↓
Provider Adapter Interface
    ├── OpenAICompatibleAdapter (SiliconFlow, DeepSeek, Moonshot, etc.)
    ├── AnthropicAdapter (future)
    ├── GoogleAdapter (future)
    ├── EchoChatCloudAdapter (future, if cloud exists)
    └── MockAdapter (for testing)
```

```typescript
interface AIProviderAdapter {
  id: string
  name: string
  supportsStreaming: boolean

  chat(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse>
  streamChat(request: ChatRequest, signal: AbortSignal, onDelta: (text: string) => void): Promise<string>
  validateConfig(config: ProviderConfig): ValidationResult
  estimateTokens(text: string): number
}

interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature: number
  maxTokens?: number
  stream: boolean
}

interface ChatResponse {
  content: string
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
  raw: any  // provider-specific raw response
}
```

**AI Gateway responsibilities**:
- Select adapter based on user config
- Build prompt via Context Builder + Behavior Engine (not in adapter)
- Retry with exponential backoff (idempotent requests only)
- Circuit breaker (stop sending after N consecutive failures)
- Token budget management
- Error normalization (provider-specific errors → unified error types)
- Logging (without logging user content)

**Chat Domain does NOT know about**:
- `fetch()`
- Endpoint URLs
- Provider-specific request formats
- API key handling (Gateway reads from Settings Repository)

---

## 8. Privacy & Security Architecture

### 8.1 Data Classification

| Category | Examples | Storage | AI Access | Cloud Sync | Plugin Access |
|----------|----------|---------|-----------|------------|---------------|
| Private Local Data | Chats, messages, memories, character persona | Local DB | Minimal context only | Opt-in, encrypted | Permission-gated |
| AI Request Data | Message content sent to provider | Transient | N/A | N/A | Never |
| API Keys | Provider API keys | Encrypted local | Used by Gateway only | Never | Never |
| Cloud Sync Data | User-selected entities | Encrypted at rest | N/A | End-to-end encrypted | Never |
| Community Data | Public characters, posts | Cloud server | N/A | Public | Read-only |
| Plugin Data | Plugin-specific storage | Plugin sandbox | N/A | Plugin-controlled | Isolated |
| Telemetry | Error logs, performance metrics | Optional, anonymized | N/A | Opt-in only | Never |

### 8.2 Privacy by Architecture

1. **Local-first**: All user data defaults to local storage. No account required.
2. **Minimal AI context**: Context Builder sends only relevant memories + recent messages, never the full database.
3. **API Key protection**: Keys stored in encrypted settings (Web Crypto API). Never exposed to plugins or UI.
4. **No telemetry by default**: Error tracking is opt-in. Never collect chat content, memories, or character data.
5. **Plugin sandbox**: Plugins run in isolated context (Web Worker / iframe). No direct DOM or DB access.
6. **Export/Delete**: Users can export all data in open format and permanently delete everything.
7. **Cloud sync encryption**: If cloud sync is enabled, data is encrypted client-side before upload.

### 8.3 What We Do NOT Claim

- ❌ "We never upload your data" — AI API requests necessarily send message content to the user's chosen AI provider.
- ❌ "Absolute privacy" — Browser storage is accessible to anyone with device access.
- ✅ "Your data stays on your device unless you explicitly configure an external service."

---

## 9. Plugin Architecture

### 9.1 Design Principles

- **Plugins never have default access** to chat history, API keys, or the database.
- **Capability-based permission model**: each plugin declares needed permissions in its manifest.
- **Sandboxed execution**: plugins run in Web Worker (logic) + isolated UI container.
- **Explicit user consent**: permissions granted at install time, revocable at any time.

### 9.2 Permission Model

```
chat.read          — read current chat messages
chat.write         — send messages as user
character.read     — read character profile
character.write    — modify character profile
memory.read        — read character memories
memory.write       — add/edit memories
relationship.read  — read relationship metrics
moments.read       — read moments feed
moments.write      — create moments
storage.local      — access plugin's own isolated storage
network.request    — make network requests (domain whitelist)
ui.extension       — render UI in designated extension points
```

**Default-deny**:
- `api_key` — NEVER granted. Plugins cannot read API keys.
- `chat.read_all` — NEVER granted. Plugins can only read current chat, not all history.
- `database.raw` — NEVER granted. No direct IndexedDB/localStorage access.

### 9.3 Plugin Lifecycle

```
Plugin Manifest (permissions, entry, apiVersion)
      ↓
User Review + Consent
      ↓
Install (verify signature, isolate storage)
      ↓
Sandbox Load (Web Worker)
      ↓
Capability API Injection (only granted permissions)
      ↓
Runtime (message-based communication)
      ↓
Disable / Uninstall (revoke permissions, clear storage)
```

### 9.4 Current Status

**CURRENT**: No plugin system.

**TRANSITION (Phase 7)**: Define Plugin API surface and sandbox mechanism. No plugin marketplace.

**TARGET**: Plugin runtime + capability API + local plugin installation. Marketplace is a much later phase.

---

## 10. Cloud Boundary

### 10.1 Principle

EchoChat is **local-first**. Cloud capabilities are optional, additive, and never required for core functionality.

```
Local Core (works without account)
    │
    ├── Character CRUD
    ├── Chat / Memory / Relationship / Moments
    ├── AI Provider (direct, user's own API key)
    ├── Import / Export / Backup
    │
    └── Optional Cloud (user explicitly enables)
        ├── Account / Auth
        ├── Encrypted Cloud Sync
        ├── AI Gateway (optional proxy)
        ├── Community (optional publish)
        └── Plugin Registry (optional)
```

### 10.2 Sync Policy

| Data Type | Sync Default | Notes |
|-----------|-------------|-------|
| Characters | Opt-in | Encrypted, conflict-resolved by updatedAt |
| Chats/Messages | Opt-in | Encrypted, append-only sync |
| Memories | Opt-in | Encrypted |
| Relationships | Opt-in | Encrypted, event-sourced |
| Moments | Opt-in | Encrypted |
| API Keys | Never synced | Device-local only |
| Settings | Opt-in | Non-sensitive prefs only |
| User Persona | Opt-in | Encrypted |

**Conflict resolution**: Last-Write-Wins with field-level merge. Deletes propagate as tombstones. User is notified of conflicts with option to review.

**Delete propagation**: Deleting on one device creates a tombstone that propagates to all synced devices. Tombstones expire after 90 days.

---

## 11. Community Architecture

### 11.1 Private vs Public Separation

```
Private Character Life (local, encrypted)
      │
      │ user explicitly chooses to publish
      ↓
Community (cloud server, public by default)
```

**Community server data**:
- Public Character cards (user explicitly publishes)
- Posts / Moments shared to community
- Comments / Reactions on public content
- User profiles (public-facing only)
- Followers / Following
- Reports / Moderation

**Never auto-published**:
- Private chat history
- Private memories
- Private relationship data
- API keys
- Device settings

### 11.2 Current Status

**CURRENT**: No community features.

**TARGET**: Community is a Phase 8+ concern. Design the boundary now, implement much later.

---

## 12. Cross-Platform Strategy

### 12.1 Platform Adapter Pattern

```
Platform-Agnostic Core (domain, repository interfaces, AI gateway)
      │
      ├── Web Adapter (browser APIs, IndexedDB/Dexie, DOM)
      ├── PWA Adapter (Service Worker, install prompt, offline)
      ├── Desktop Adapter (Tauri: native SQLite, native menus, file system)
      ├── Mobile Adapter (React Native / Flutter: native SQLite, native UI)
      └── Mini Program Adapter (WeChat: limited storage, restricted APIs)
```

**Core must NOT depend on**:
- `window`
- `document`
- `indexedDB`
- `localStorage`
- `fetch` (use injected HTTP client)
- Any browser-only API

### 12.2 Desktop: Tauri Evaluation

| Factor | Tauri | Electron | PWA (installed) |
|--------|-------|----------|-----------------|
| Bundle size | ~5–10MB | ~100–150MB | ~1MB (cached) |
| Native SQLite | ✅ | ✅ (better-sqlite3) | ❌ (IndexedDB only) |
| File system access | ✅ | ✅ | ❌ |
| Native notifications | ✅ | ✅ | ✅ (Web Notifications) |
| Auto-update | ✅ | ✅ | ✅ (SW update) |
| Memory usage | Low | High | Low |
| Development complexity | Medium (Rust) | Low (JS) | Zero |
| Existing code reuse | WebView (high) | Chromium (high) | 100% |

**Recommendation**: Tauri for V2 desktop. Rationale: native SQLite solves the storage problem definitively, small bundle, low memory. The Rust learning curve is manageable for a thin shell (most logic stays in JS core).

**Why not now**: V1.1 should focus on web stability. Desktop is Phase 9.

### 12.3 Mobile

**Recommendation**: Evaluate React Native or Flutter for V3. Shared core logic (if properly platform-agnostic) can be reused via JS bridge. Not before Phase 9.

---

## 13. Deployment Architecture

### 13.1 Current (CURRENT)

- Static hosting (Cloudflare Pages)
- No CI
- Manual deploy via git push
- No preview environments

### 13.2 Target (TARGET)

```
GitHub Push
    ↓
CI (GitHub Actions)
    ├── Lint / Type check (when TS adopted)
    ├── Unit tests
    ├── Integration tests
    ├── Build (when build system adopted)
    └── Artifact generation
    ↓
Preview Deploy (per PR)
    └── Cloudflare Pages preview URL
    ↓
Production Deploy (merge to main)
    ├── Cloudflare Pages (static assets)
    ├── CDN cache invalidation
    ├── PWA version bump
    └── Health check
```

**Future (when cloud exists)**:
- API server (Cloudflare Workers / Node.js)
- Database (PostgreSQL / SQLite at edge)
- Object storage (R2 / S3) for community assets
- Error tracking (Sentry / self-hosted)
- Performance monitoring (Plausible / self-hosted, privacy-respecting)

---

## 14. Testing Architecture

### 14.1 Test Layers

| Layer | Tool | Scope | Current |
|-------|------|-------|---------|
| Unit | Node test runner / Vitest | Pure functions, domain logic | Partial (browser console) |
| Integration | Vitest + fake-indexeddb | Repository + Domain | None |
| Migration | Node test runner | Schema migration safety | ✅ (90 assertions) |
| E2E | Playwright | Full user flows | None |
| Visual Regression | Playwright screenshots | UI consistency | None |
| Performance | Lighthouse / custom | Load time, render, memory | None |
| Security | Manual audit + plugin sandbox tests | Privacy, permission | None |

### 14.2 Priority Test Areas

1. **Migration safety** — already strong, maintain
2. **Character CRUD + cascade delete** — when Character becomes first-class
3. **Relationship event sourcing** — metrics recompute correctly from events
4. **Memory retrieval** — context builder returns relevant subset, respects budget
5. **Import/Export** — round-trip data integrity
6. **Privacy** — AI request contains only minimal context, no API key leakage
7. **Plugin sandbox** — permissions enforced, no escape

### 14.3 Current Status

**CURRENT**: Browser console tests (50+ assertions) + Node migration tests (90 assertions). No CI.

**TRANSITION (Phase 1)**: Add GitHub Actions CI. Move browser tests to Node with fake-indexeddb.

---

## 15. Observability

### 15.1 Current

- `console.log` / `console.error` only
- No error tracking
- No performance metrics
- No crash reporting

### 15.2 Target

**Error Tracking** (opt-in):
- Client-side error capture (window.onerror, unhandledrejection)
- Anonymized error reports (stack trace, browser, app version)
- **Never include**: chat content, memory content, character data, API keys
- Self-hosted or privacy-respecting service (Sentry self-hosted / GlitchTip)

**Performance Metrics** (always local):
- App load time (first paint, interactive)
- Chat render time (N messages)
- Memory usage (estimated)
- AI response latency
- Storage usage

**Crash Reporting** (opt-in):
- Service Worker crash detection
- Storage corruption detection
- Recovery flow (safe mode, data export before reset)

**Telemetry boundary**: Product telemetry (errors, performance) is distinct from user private content. Telemetry payloads are inspected before send to strip any user content.

---

## 16. Import / Export Architecture

### 16.1 Import Engine

```
Input File
    ↓
Detect Format (EchoChat backup, Character Card, SillyTavern, Chat History, JSON)
    ↓
Parse (format-specific parser)
    ↓
Normalize (to EchoChat domain entities)
    ↓
Validate (schema, referential integrity)
    ↓
Preview (show user what will be imported)
    ↓
User Confirm
    ↓
Transaction (all-or-nothing import)
    ↓
Import Complete
```

### 16.2 Chat History → Character Reconstruction (重点)

```
Chat History File
    ↓
Parser (identify format: WhatsApp, Telegram, plain text, JSON)
    ↓
Speaker Identification (map speakers to user/character)
    ↓
Conversation Analysis (topics, patterns, timeline)
    ↓
Personality Extraction (AI-assisted, structured output)
    ↓
Speaking Style Extraction (vocabulary, tone, catchphrases)
    ↓
Preference Extraction (likes, dislikes, habits)
    ↓
Memory Extraction (important events, facts)
    ↓
Relationship Pattern (interaction style, emotional trajectory)
    ↓
Character Draft (structured, NOT a giant prompt)
    ↓
User Review (edit, approve, reject individual fields)
    ↓
Character Created + Memories Imported + Relationship Initialized
```

**Key rule**: Results are stored as structured data (personality fields, memory entities, relationship events), not stuffed into a single `persona` string.

### 16.3 Export

Export formats:
- **Full Backup**: All entities in EchoChat JSON format (for restore)
- **Character Card**: SillyTavern-compatible V2 format
- **Chat Export**: JSON or plain text (per chat)
- **Memory Export**: JSON list
- **Moments Export**: JSON

### 16.4 EchoChat Data Format

```json
{
  "format": "echodata",
  "version": 1,
  "exportedAt": "2026-08-31T00:00:00Z",
  "appVersion": "1.0.0",
  "characters": [...],
  "chats": [...],
  "messages": [...],
  "memories": [...],
  "relationships": [...],
  "relationshipEvents": [...],
  "moments": [...],
  "worldbook": [...],
  "assets": [...],
  "settings": {...}
}
```

---

## 17. Backup / Recovery

### 17.1 Backup Strategy

| Type | Trigger | Retention | Storage |
|------|---------|-----------|---------|
| Manual Export | User action | Forever (user-controlled) | User device |
| Automatic Snapshot | Daily (if app opened) | Last 7 | Local (IndexedDB) |
| Versioned Backup | Before migration | Forever | Local + user export |
| Cloud Backup | If sync enabled | Per cloud policy | Encrypted cloud |

### 17.2 Corruption Detection

- On app start: validate database integrity (checksum, schema version)
- If corruption detected: enter Safe Mode
  - Attempt automatic recovery from latest snapshot
  - If recovery fails: offer data export (salvage what's readable)
  - Last resort: reset with user consent

### 17.3 Migration Safety (existing pattern, preserved)

```
Validate Source
    ↓
Prepare Complete Snapshot (memory)
    ↓
Transform (memory only, no I/O)
    ↓
Validate Complete Snapshot
    ↓
Staging (write to separate key/table)
    ↓
Commit (swap / copy from staging)
    ↓
Mark Schema Version
    ↓
Cleanup Staging
```

**Never**: `localStorage.clear()`, `indexedDB.deleteDatabase()`, or destructive operations before new data is verified.

---

## 18. Data Model Extensibility

### 18.1 Entity Versioning

Every entity has:
- `schemaVersion` (database-level)
- `entityVersion` (entity-level, for individual record evolution)
- `createdAt`, `updatedAt`, `deletedAt` (soft delete)
- `metadata: Record<string, any>` (extension point for plugins / future features)

### 18.2 Event Sourcing: Partial, Not Total

**Decision**: Do NOT use full Event Sourcing for all entities.

**Rationale**:
- Full Event Sourcing adds significant complexity (event store, projections, snapshots, replay).
- EchoChat's core entities (Character, Chat, Message) are CRUD-heavy, not event-heavy.
- The overhead is not justified for a small team / single-developer project.

**Where event sourcing IS appropriate**:
- **Relationship** — metrics must be traceable. RelationshipEvent log is essential.
- **Audit log** — for security-sensitive actions (delete, export, plugin permission changes).

**Where it is NOT**:
- Character profile (just keep updatedAt + version)
- Messages (append-only log is natural, but no need for event projection)
- Moments (CRUD is sufficient)

---

## 19. Technology Stack Upgrade Strategy

### 19.1 TypeScript

| Question | Answer |
|----------|--------|
| Current problem? | No type safety, runtime errors only, no IDE autocomplete for domain models |
| What does it solve? | Catch bugs at compile time, document data shapes, safer refactoring |
| Migration cost? | High if big-bang. Low if incremental (rename .js → .ts, add types gradually) |
| Worth it now? | **No for V1.1. Yes for V2.** |
| Progressive? | Yes — TypeScript supports incremental adoption (allowJs, checkJs) |
| Breaks user data? | No — types are compile-time only |
| Breaks API/UI? | No |
| Simpler alternative? | JSDoc type annotations (partial benefit, no build step) |

**Recommendation**: Adopt JSDoc types in V1.1 (zero build cost). Migrate to TypeScript in V2 when build system is introduced.

### 19.2 Build System (Vite)

| Question | Answer |
|----------|--------|
| Current problem? | No bundling, many HTTP requests, no minification, no tree-shaking |
| What does it solve? | Smaller payload, faster load, code splitting, asset optimization |
| Migration cost? | Medium — Vite is zero-config for vanilla JS |
| Worth it now? | **No for V1.1. Yes for V2.** |
| Progressive? | Yes — Vite can handle mixed JS/TS |
| Breaks user data? | No |
| Simpler alternative? | Current zero-build works fine for <20 files |

**Recommendation**: Keep zero-build for V1.1. Adopt Vite in V2 alongside TypeScript.

### 19.3 Monorepo

| Question | Answer |
|----------|--------|
| Current problem? | Single package, no separation of concerns |
| What does it solve? | Shared core across web/desktop/mobile, independent versioning |
| Worth it now? | **No.** Not until desktop/mobile apps exist. |
| Progressive? | Yes — can split later |

**Recommendation**: Single repo through V2. Monorepo (pnpm workspaces / Turborepo) when desktop app begins (Phase 9).

### 19.4 Testing Framework

**Recommendation**: Adopt Vitest in Phase 1. Rationale: works with ES Modules, supports fake-indexeddb, fast, no config. Move existing browser console tests to Node.

### 19.5 Linting / Formatting

**Recommendation**: ESLint + Prettier in Phase 1. Low cost, high consistency value.

### 19.6 CI

**Recommendation**: GitHub Actions in Phase 1. Run tests + lint on every PR. Zero cost for public repos.

---

## 20. Repository Structure Evolution

### 20.1 CURRENT

```
echat-ui-lab/
├── index.html
├── config.js
├── sw.js
├── manifest.webmanifest
├── src/
│   ├── main.js
│   ├── core/          (events, storage, store, utils, version)
│   ├── domain/        (chat, memory, moments, persona, provider, relations, worldbook)
│   ├── infrastructure/ (idb, asset)
│   ├── ui/
│   │   ├── components/
│   │   └── views/
│   └── styles/
├── tests/
├── docs/
├── assets/
└── (governance files)
```

### 20.2 TRANSITION (V1.1 → V2)

```
echat-ui-lab/
├── index.html
├── config.js
├── sw.js
├── src/
│   ├── main.js
│   ├── core/
│   ├── domain/
│   ├── repository/        ← NEW: repository interfaces + Dexie implementations
│   ├── application/       ← NEW: use cases (ChatSession, ImportEngine, BackupRestore)
│   ├── infrastructure/
│   ├── ui/
│   └── styles/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── migration/
├── docs/
│   └── architecture/
│       ├── adr/
│       └── (this doc)
└── (governance files)
```

### 20.3 TARGET (V3, monorepo)

```
echochat/
├── apps/
│   ├── web/              ← PWA / SPA
│   ├── desktop/          ← Tauri app
│   └── mobile/           ← React Native / Flutter (future)
├── packages/
│   ├── core/             ← domain + repository interfaces (platform-agnostic)
│   ├── storage-dexie/    ← IndexedDB implementation
│   ├── storage-sqlite/   ← SQLite implementation (desktop/mobile)
│   ├── ai-providers/     ← provider adapters
│   ├── plugin-runtime/   ← plugin sandbox + capability API
│   └── ui-components/    ← shared UI components
├── services/
│   └── cloud/            ← optional cloud services (future)
├── docs/
├── tests/
├── tooling/
└── brand/                ← official brand assets
```

---

## 21. Migration Roadmap (9 Phases)

### Phase 1: V1 Freeze + Architecture Foundation

**Goal**: Stabilize V1, establish tooling and documentation foundation.

| Item | Detail |
|------|--------|
| Duration | 2–4 weeks |
| Files affected | CI config, tests, docs, lint config |
| Dependencies | None |
| Risk | Low |
| User data impact | None |

**Tasks**:
- Freeze V1 feature set (only bug fixes)
- Add GitHub Actions CI (test + lint)
- Adopt Vitest, migrate browser console tests to Node
- Add ESLint + Prettier
- Establish ADR process (`docs/architecture/adr/`)
- Write this architecture document (done)
- Add error boundary + safe mode for storage corruption

**Exit Criteria**:
- CI runs on every PR, all tests pass
- Lint clean
- ADR-001 through ADR-006 drafted
- V1 has no known P0/P1 bugs

**Rollback**: N/A (additive only)

---

### Phase 2: Storage + Repository Layer

**Goal**: Move from localStorage to Dexie, establish Repository abstraction.

| Item | Detail |
|------|--------|
| Duration | 4–8 weeks |
| Files affected | New: `src/repository/`, `src/infrastructure/dexie/`; Modified: domain modules |
| Dependencies | Dexie.js (vendored or CDN) |
| Risk | Medium — data migration is always risky |
| User data impact | Migration required, must be zero-data-loss |

**Tasks**:
- **Phase 2.1**: Add Dexie, migrate `messages` only (highest pain point)
- **Phase 2.2**: Migrate `characters`, `chats`, `memories`
- **Phase 2.3**: Migrate `relationships`, `moments`, `worldbook`
- **Phase 2.4**: Remove localStorage for structured data (keep for settings only)
- **Phase 2.5**: Introduce Repository interfaces, refactor domain to use them
- Write migration tests for each phase
- Performance test: 100/500/1000/3000 messages per chat

**Migration Strategy**: Per-entity, one at a time. Each migration follows staging pattern. Old data retained until new data verified. Dual-read period (read from new, fallback to old).

**Rollback**: If Dexie migration fails catastrophically, revert to localStorage reads (old data never deleted during migration).

**Exit Criteria**:
- All structured data in Dexie
- localStorage only used for settings/UI prefs
- All domain modules use Repository interfaces
- 3000-message chat renders < 100ms on mid-range mobile
- Migration tests pass for all entity types

---

### Phase 3: Character Domain

**Goal**: Make Character a first-class entity.

| Item | Detail |
|------|--------|
| Duration | 4–6 weeks |
| Files affected | New: `src/domain/character/`; Modified: chat, persona, UI |
| Dependencies | Phase 2 complete |
| Risk | Medium — requires data migration from chat-scattered to character-centric |
| User data impact | Migration: extract character data from chats into Character entities |

**Tasks**:
- Create `Character` entity + repository
- Migration: for each chat with `roleId`, create/update Character entity
- Link chats to `characterId` (was `roleId`)
- Move persona, avatar, appearance from `chat.config` to Character
- Implement Character list UI (separate from chat list)
- Implement Character creation (from scratch, template, character card import)
- Reduce system templates to 1 Guide Character + variants
- Guide Character sandboxing (not in main list, skippable)
- Character detail page (profile, memories, relationships, moments)

**Migration Strategy**: Characters are derived from existing chats. `roleId` → `characterId` mapping preserved. Chats retain `characterId` reference. No data loss.

**Rollback**: Character data can be flattened back into chat.config if needed (migration is reversible).

**Exit Criteria**:
- Character is first-class entity with CRUD
- All chats reference characterId
- Character list UI works
- Guide Character policy implemented
- No data loss in migration

---

### Phase 4: Relationship + Memory + Social

**Goal**: Event-sourced relationships, retrievable memory, moments domain hardening.

| Item | Detail |
|------|--------|
| Duration | 6–8 weeks |
| Files affected | `src/domain/relationship/`, `src/domain/memory/`, `src/domain/moments/` |
| Dependencies | Phase 3 complete |
| Risk | Low-Medium |
| User data impact | Relationship data migration (numeric → event-sourced) |

**Tasks**:
- **Relationship**: Create RelationshipEvent store. Recompute affinity from events. Add block/unblock/archive.
- **Memory**: Add memory types, dedup, conflict resolution. Implement Context Builder with token budget.
- **Moments**: Separate stores for moments, comments, reactions. Implement interaction → relationship → memory loop.
- Implement Deletion Policy (soft delete, trash, cascade, permanent delete)
- Add relationship history UI ("why is affinity 87?")

**Migration Strategy**: Existing relationship numeric data → initial RelationshipEvent (type: "legacy_import", payload: old metrics). Future events append. Recompute derives current state.

**Exit Criteria**:
- Every relationship metric traceable to events
- Memory retrieval uses Context Builder (not full DB read)
- Moments interaction affects relationship + memory
- Delete/block/archive all work correctly with cascade
- Memory dedup functional

---

### Phase 5: Import / Reconstruction

**Goal**: Robust import engine + Chat History → Character Reconstruction.

| Item | Detail |
|------|--------|
| Duration | 4–6 weeks |
| Files affected | New: `src/application/import/`, `src/application/export/` |
| Dependencies | Phase 3 complete |
| Risk | Low |
| User data impact | None (import only adds data) |

**Tasks**:
- Import Engine framework (detect → parse → normalize → validate → preview → confirm → transaction)
- Character Card import (SillyTavern V2) — already partial, harden
- EchoChat backup import/export (round-trip)
- Chat History import (WhatsApp/Telegram/plain text parsers)
- **Character Reconstruction**: AI-assisted extraction from chat history
  - Speaker identification
  - Personality extraction (structured output)
  - Speaking style extraction
  - Preference extraction
  - Memory extraction
  - User review + confirm
- Define EchoChat Data Format (ECDF) v1

**Exit Criteria**:
- Import engine supports 3+ formats
- Character reconstruction produces structured Character + Memories + Relationship
- Export/import round-trip is lossless for EchoChat format
- All imports are transactional (all-or-nothing)

---

### Phase 6: Behavior Engine

**Goal**: Personality modifiers, effective character state, behavior-driven responses.

| Item | Detail |
|------|--------|
| Duration | 4–6 weeks |
| Files affected | New: `src/domain/behavior/`, `src/domain/personality/` |
| Dependencies | Phase 3, 4 complete |
| Risk | Low |
| User data impact | None (additive) |

**Tasks**:
- Implement Personality Modifier system (base + zodiac + chinese zodiac + tarot + custom + relationship + state)
- Effective Character State computation
- Behavior Engine: maps state → prompt adjustments (tone, vocabulary, topic avoidance)
- Current mood / emotional state (derived from recent interactions)
- Character-initiated behavior (proactive messages, moments) — already partial, formalize
- Strict entertainment labeling for zodiac/tarot features

**Exit Criteria**:
- Personality modifiers composable with weight + priority + conflict resolution
- Behavior Engine affects AI prompts (observable in output)
- Character state changes based on interaction history
- All symbolic features labeled as entertainment

---

### Phase 7: Plugin Boundary

**Goal**: Define and implement plugin sandbox + capability API.

| Item | Detail |
|------|--------|
| Duration | 6–8 weeks |
| Files affected | New: `src/plugin/` |
| Dependencies | Phase 2 (Repository layer) complete |
| Risk | Medium — security boundary must be correct |
| User data impact | None |

**Tasks**:
- Define Plugin Manifest format + permission model
- Implement Web Worker sandbox
- Implement Capability API (gated by permissions)
- Plugin storage isolation
- Plugin UI extension points
- Local plugin install (sideload .zip)
- Permission UI (grant, review, revoke)
- Security audit: verify no permission escape
- NO plugin marketplace in this phase

**Exit Criteria**:
- Plugins run in sandbox, cannot access API keys or full chat history
- All permissions explicit and revocable
- At least 1 example plugin works (e.g., theme customizer)
- Security tests pass

---

### Phase 8: Cloud Boundary

**Goal**: Define and optionally implement account + encrypted sync.

| Item | Detail |
|------|--------|
| Duration | 8–12 weeks |
| Files affected | New: `src/cloud/`, optional server code |
| Dependencies | Phase 2, 3 complete |
| Risk | High — privacy, security, data integrity |
| User data impact | Opt-in only. Local core unaffected. |

**Tasks**:
- Account system (email / OAuth)
- Client-side encryption (Web Crypto API)
- Encrypted sync (character, chats, memories, relationships, moments)
- Conflict resolution (LWW + field merge + user notification)
- Delete propagation (tombstones)
- AI Gateway proxy (optional, for users who want it)
- Community read-only preview (public characters only)
- Privacy audit: verify no unintended data leakage

**Exit Criteria**:
- Local core works 100% without account
- Sync is opt-in, encrypted, user-controllable
- Conflict resolution tested
- Delete propagation tested
- Privacy audit passes

---

### Phase 9: Desktop / Mobile

**Goal**: Native desktop app with SQLite. Mobile exploration.

| Item | Detail |
|------|--------|
| Duration | 8–12 weeks (desktop), mobile TBD |
| Files affected | New: `apps/desktop/` (Tauri), monorepo restructure |
| Dependencies | Phase 2 (storage abstraction) complete |
| Risk | Medium |
| User data impact | Migration from IndexedDB to SQLite on desktop (import/export) |

**Tasks**:
- Restructure to monorepo (`apps/`, `packages/`)
- Extract platform-agnostic core to `packages/core/`
- Tauri desktop shell with native SQLite
- Platform adapters (file system, native notifications, native menus)
- Data migration tool (web → desktop via import/export)
- Auto-update mechanism
- Mobile: evaluate React Native vs Flutter, spike only

**Exit Criteria**:
- Desktop app runs with native SQLite
- Core logic shared between web and desktop
- Data import/export works across platforms
- Auto-update functional

---

## 22. Non-Goals (现在不要做什么)

These are explicitly out of scope for the foreseeable future. Do not start these without a new architecture decision.

1. ❌ **Do NOT rewrite everything in TypeScript** — JSDoc types first, TS in V2. Big-bang TS migration is too disruptive.
2. ❌ **Do NOT split into monorepo immediately** — Single repo through V2. Monorepo only when desktop/mobile apps exist.
3. ❌ **Do NOT add account system before Phase 8** — Local-first means no account required. Cloud is much later.
4. ❌ **Do NOT build a plugin marketplace** — Phase 7 defines the runtime and sandbox only. Marketplace is a community/cloud concern.
5. ❌ **Do NOT build community/social platform** — Community is Phase 8+. Design the boundary, don't implement.
6. ❌ **Do NOT migrate to SQLite by breaking V1** — V1.1 uses Dexie. SQLite comes with native desktop apps.
7. ❌ **Do NOT Full Rebuild for architecture aesthetics** — Every phase is incremental, reversible, and user-data-safe.
8. ❌ **Do NOT adopt Event Sourcing for everything** — Only Relationship needs event history. CRUD is fine for most entities.
9. ❌ **Do NOT claim "zero data upload"** — AI API requests send user input to providers. Be honest.
10. ❌ **Do NOT add telemetry by default** — Opt-in only, never collect private content.

---

## 23. Architecture Decision Records (ADR) Index

Create `docs/architecture/adr/` with the following ADRs (drafted in Phase 1):

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Database: Dexie for V1.1, SQLite adapter for V2 | Proposed |
| ADR-002 | Repository Layer abstraction | Proposed |
| ADR-003 | AI Provider: Gateway + Adapter pattern | Proposed |
| ADR-004 | Plugin Security: capability-based sandbox | Proposed |
| ADR-005 | Cloud Sync: opt-in, client-side encrypted, LWW conflict | Proposed |
| ADR-006 | Desktop: Tauri with native SQLite | Proposed |
| ADR-007 | Character as first-class entity | Proposed |
| ADR-008 | Relationship event sourcing (partial ES) | Proposed |
| ADR-009 | Message store: independent, paginated, branchable | Proposed |

Each ADR follows: Context → Decision → Alternatives → Consequences → Migration.

---

## 24. Architecture Score

### Current V1 Architecture

| Dimension | Score (0-10) | Assessment |
|-----------|-------------|------------|
| **Data Architecture** | 3/10 | chat.messages inline, localStorage 5MB wall, no query, no transactions. Must change. |
| **Domain Architecture** | 4/10 | Domain modules exist but Character isn't first-class, relationship has no history. Needs evolution. |
| **Privacy** | 6/10 | Local-first is good, but no encryption, no plugin boundary, AI context not budget-managed. Solid base. |
| **Scalability** | 2/10 | Full-state serialization per message. Breaks at ~500 messages/chat on mobile. Critical. |
| **Cross-platform** | 3/10 | PWA works but core depends on window/document/localStorage. No adapter pattern. |
| **Testability** | 4/10 | Migration tests are strong (90 assertions), but domain tests run in browser only, no CI, no E2E. |
| **Maintainability** | 4/10 | main.js 637 lines, UI full re-render, no types. Works but will degrade. |
| **Extensibility** | 3/10 | No plugin boundary, no repository abstraction, hard-coded AI provider. |
| **Performance** | 5/10 | Fast for small datasets (zero-build, native). Degrades sharply with data volume. |
| **Migration Safety** | 8/10 | Staging + backup + recovery mechanism is solid. This is the strongest dimension. |

**Weighted Average**: 4.2/10

### What Must Change (P0/P1)

1. **Data model** — messages independent, Character first-class (Phase 2, 3)
2. **Storage engine** — localStorage → Dexie (Phase 2)
3. **Repository layer** — domain/storage separation (Phase 2)
4. **Relationship event history** — traceable metrics (Phase 4)
5. **AI provider abstraction** — gateway + adapter (Phase 2 or 4)

### What Can Be Retained

1. **Migration safety pattern** — staging + backup + recovery is excellent. Keep and extend.
2. **Domain module boundaries** — chat/memory/moments/etc. separation is good. Refactor, don't rewrite.
3. **Event bus** — lightweight pub/sub works well.
4. **Zero-build simplicity** — keep through V1.1. Adopt build system in V2.
5. **PWA versioned cache strategy** — APP_VERSION ≠ DATA_SCHEMA_VERSION is correct.
6. **Worldbook SillyTavern compatibility** — good interoperability, keep.

### What Is Imperfect But Not Worth Touching Now

1. **UI full re-render** — works for current scale. Revisit in V2 if performance demands it.
2. **No TypeScript** — JSDoc types are sufficient for V1.1. TS in V2.
3. **No E2E tests** — add in Phase 1, but not a blocker for V1.1.
4. **main.js 637 lines** — will naturally shrink as repository/application layers are introduced. Don't refactor just for line count.
5. **No error tracking** — add in Phase 1. Low priority relative to data architecture.

---

## 25. Biggest Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Data loss during storage migration (localStorage → Dexie) | Medium | Critical | Per-entity migration, staging pattern, dual-read, never delete old data until verified, migration tests |
| 2 | Performance regression during transition | Medium | High | Performance tests at every phase, rollback capability, measure before/after |
| 3 | Scope creep → de facto Full Rebuild | High | High | Strict phase boundaries, Non-Goals list, each phase has Exit Criteria, STOP after each phase |
| 4 | Plugin security vulnerability | Low (when built) | Critical | Security audit, capability model, sandbox, no default access, security tests |
| 5 | Cloud sync privacy breach | Low (when built) | Critical | Client-side encryption, opt-in, privacy audit, local-first guarantee |
| 6 | Character migration loses data (scattered → first-class) | Medium | High | Derive from existing chats, preserve roleId mapping, reversible migration |
| 7 | AI provider lock-in | Low | Medium | Adapter pattern from Phase 2, user brings own API key |
| 8 | Maintenance burden from over-engineering | Medium | Medium | Non-Goals, incremental phases, "is this worth it now?" test for every change |

---

## 26. Glossary

| Term | Definition |
|------|-----------|
| Character | First-class domain entity representing an AI persona with identity, personality, memories, relationships |
| roleId | V1 identifier for a character (stable hash). V2: replaced by characterId |
| Guide Character | A special character used for onboarding, not part of user's main collection |
| RelationshipEvent | Immutable record of an interaction affecting a relationship |
| Context Builder | Component that selects relevant memories/messages for AI prompt within token budget |
| Repository | Data access abstraction separating domain from storage |
| Staging | Migration mechanism: write new data to separate location, verify, then swap |
| Local-first | Architecture where data defaults to device storage; cloud is optional |
| Capability API | Plugin interface that exposes only explicitly granted permissions |
| ECDF | EchoChat Data Format (backup/export format) |

---

## 27. Document Status

- **Created**: 2026-08-31
- **Based on**: V1 Candidate codebase (commit c88e7c4 + governance ed8b6fa)
- **Next review**: After Phase 1 completion, or when any major assumption changes
- **Owner**: EchoChat project maintainers
- **This is a proposal, not an implementation plan**. Each phase requires explicit authorization before starting.
