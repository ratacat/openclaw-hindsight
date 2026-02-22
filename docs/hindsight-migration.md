# Hindsight Memory Migration Plan

## Goal
Replace OpenClaw's built-in `memory-core` (SQLite + embeddings) with Hindsight as the memory backend. This is not a backend swap — it's a paradigm shift from file-centric chunk retrieval to a fact-centric knowledge graph with entity resolution, temporal reasoning, and opinion formation.

## Key Insight: Extension vs. MCP Server

Hindsight ships a built-in MCP server (`HINDSIGHT_API_MCP_ENABLED=true`), but we're building a proper OpenClaw extension instead. The reasoning:

**The extension handles deterministic plumbing** — things that must always happen reliably:
- Retain on file write (with debouncing)
- Recall → format translation (facts → OpenClaw's expected `{text, path, lines}`)
- Compaction flush
- Health checks and fallback
- Configuration management

**Prompting handles cognitive judgment** — things the agent should decide:
- When to call `reflect()` (is deeper reasoning needed?)
- How to interpret reflect results (opinions, confidence scores, patterns)
- Proactive memory surfacing during heartbeats

Putting the plumbing in prompts means memory silently degrades when the agent forgets to retain, formats a query wrong, or skips metadata. An extension makes the boring stuff deterministic and lets prompting handle the interesting stuff.

## Architecture

```
OpenClaw Agent
  │
  ├── memory_search tool ──► Extension (deterministic) ──► Hindsight recall API
  │                           ├── query → recall translation
  │                           ├── fact results → {text, path, lines} format
  │                           └── health check / fallback
  │
  ├── memory_get tool ──────► Extension ──► local file read (unchanged)
  │                           └── optionally also recall with metadata filter
  │
  ├── memory writes ────────► Extension ──► debounced retain pipeline
  │                           ├── file watcher with 30s debounce
  │                           ├── document_id for idempotent upserts
  │                           └── metadata: path, date, source type
  │
  ├── pre-compaction flush ─► Extension ──► retain conversation summary
  │                           └── tagged as "experience" network facts
  │
  └── reflect (agent-driven) ► Agent calls Hindsight reflect directly
                               ├── heartbeat-driven insights
                               ├── pre-session context priming
                               └── opinion formation on recurring topics
```

Workspace files (SOUL.md, AGENTS.md, TOOLS.md, USER.md, etc.) remain as-is — they're session context, not memory.

## Understanding the Paradigm Shift

### What changes (memory-core → Hindsight)

| Aspect | memory-core (current) | Hindsight |
|--------|----------------------|-----------|
| Storage unit | Text chunks with embeddings | Narrative facts with entity links |
| Search | Vector similarity + BM25 | 4-way parallel: semantic + BM25 + graph traversal + temporal filtering, fused via RRF + cross-encoder reranking |
| Entity awareness | None | Entity resolution, co-occurrence tracking, canonical names |
| Temporal reasoning | Decay scoring on timestamps | Native date parsing, range queries, temporal links |
| Knowledge synthesis | None | Background observation consolidation (merges related facts) |
| Reasoning | None | `reflect()` — opinions with confidence scores, pattern discovery, risk assessment |
| State | Stateless between queries | Persistent knowledge graph across sessions |
| Database | SQLite + sqlite-vec + FTS5 | PostgreSQL + pgvector (inside Docker) |
| LLM dependency | None (embeddings only) | LLM required for retain (fact extraction), reflect, and observation consolidation |

### What this means for the extension
- **Retain is not "index"** — it runs an LLM to extract 2-5 narrative facts per chunk, resolve entities, detect causal links, and classify into memory networks (World, Experience, Observation, Opinion)
- **Recall doesn't return file snippets** — it returns extracted facts with entity references and confidence scores. The extension must translate these back to OpenClaw's expected format
- **There's a background pipeline** — observation consolidation continuously merges related facts. This runs automatically and requires LLM calls

## Separate Repository

This extension lives in its own repo for shareability:

```
openclaw-hindsight/
├── package.json              # npm package: @openclaw/hindsight-memory (or similar)
├── tsconfig.json
├── src/
│   ├── index.ts              # Plugin entry point, implements OpenClaw memory interface
│   ├── retain.ts             # Write path: file changes → debounce → retain
│   ├── recall.ts             # Search path: query → recall → format translation
│   ├── reflect.ts            # Reflect integration (exposed as agent tool)
│   ├── format.ts             # Hindsight facts → OpenClaw {text, path, lines} mapping
│   ├── health.ts             # Health checks, fallback behavior
│   └── config.ts             # Hindsight connection & bank configuration
├── scripts/
│   └── migrate.ts            # One-time migration script
├── tests/
│   ├── retain.test.ts
│   ├── recall.test.ts
│   └── format.test.ts        # Format translation is critical — test thoroughly
├── README.md
└── LICENSE
```

## Components

### 1. Hindsight Server (Docker)
- Run on Mac Studio, port 8888 (API), port 9999 (UI)
- PostgreSQL + pgvector runs inside the Docker compose stack
- Persistent volume at `~/.hindsight-docker`
- Memory bank: `sapphira`
- Bank configuration:
  - **Mission**: Should reflect Sapphira's role (e.g., "Personal AI assistant memory for Jared — tracks preferences, project context, technical decisions, and relationship dynamics")
  - **Disposition**: Calibrate skepticism/literalism/empathy (1-5 scale) to match Sapphira's personality. These affect `reflect()` only, not recall
  - **Directives**: Hard rules (e.g., "Never disclose private user information in reflect outputs")

### 2. OpenClaw Extension (`openclaw-hindsight`)

Implements OpenClaw's memory plugin interface. Key design decisions:

#### Retain Pipeline (writes → Hindsight)
- **File watcher** with **30-second debounce** — don't retain on every keystroke. Wait for writes to settle.
- Each retain call includes:
  - `document_id`: file path (for idempotent upserts — re-retaining the same file replaces previous facts)
  - `context`: describes what the content is ("daily memory log", "curated long-term memory", "session compaction summary")
  - `timestamp`: extracted from filename (YYYY-MM-DD) for daily notes, or current time for compaction
  - `metadata`: `{"source": "workspace", "path": "memory/2026-02-03.md", "type": "daily_log"}`
- **Compaction flush**: When OpenClaw compacts context, the summary is retained as experience-network facts. Format: the compaction summary as-is, with context "session compaction summary" and metadata tagging the session ID

#### Recall Pipeline (search → Hindsight → format)
- Translates OpenClaw `memory_search(query, {maxResults, minScore})` into Hindsight recall
- **Format translation** (the hard part):
  - Hindsight returns facts with: `text`, `entity_refs`, `network` (world/experience/observation/opinion), `confidence`, `timestamp`
  - OpenClaw expects: `{text, path, start_line, end_line}`
  - Strategy: Use retained metadata to reconstruct `path`. For facts without a clear source file, use a synthetic path like `hindsight://facts/{network}/{id}`. Set `start_line`/`end_line` to 0 (not meaningful for extracted facts)
  - Include entity names and confidence in the text field for agent context
- **Token budget**: Map OpenClaw's maxTokens to Hindsight's recall budget parameter. Hindsight supports budget levels — determine exact mapping

#### Reflect Integration
- Exposed as an additional tool the agent can call (not automatic)
- Use cases configured via prompting in AGENTS.md or SOUL.md:
  - Heartbeat: "What patterns or insights should I surface?"
  - Pre-session: "What do I know about this user's current priorities?"
  - On-demand: "What's my assessment of X with confidence?"

#### Health & Fallback
- Health check on startup and before each recall
- If Hindsight is unreachable:
  - Log warning
  - Fall back to local file search (grep workspace memory files) for basic functionality
  - Queue retain calls for replay when service recovers
- Auto-reconnect with exponential backoff

### 3. Data Migration

**Strategy: Curated memory first, daily notes optional.**

The bulk migration of 24+ daily notes through LLM fact extraction will produce lower-quality entity resolution than organic memory building (no conversational context to disambiguate). Daily notes also contain heterogeneous content — debugging logs, tool notes, architectural decisions all mixed together.

Recommended approach:
1. **Migrate MEMORY.md first** — this is curated, high-signal content. Validate entity resolution quality in the Hindsight UI.
2. **Migrate recent daily notes (last 7 days)** — recent context matters most. Review extracted facts for quality.
3. **Decide on older notes** — if extraction quality is good, migrate the rest. If not, let them age out. The important bits should already be in MEMORY.md.
4. Each file → one retain call with appropriate context and metadata
5. After migration, check the Hindsight UI (localhost:9999) for:
   - Entity resolution quality (are entities correctly merged?)
   - Fact quality (are extracted facts meaningful, not noise?)
   - Observation consolidation (are related facts being merged sensibly?)

### 4. Configuration
```json5
// openclaw.json changes
{
  plugins: {
    slots: {
      memory: "openclaw-hindsight"  // replaces "memory-core"
    }
  },
  memory: {
    backend: "hindsight",
    hindsight: {
      baseUrl: "http://localhost:8888",
      bankId: "sapphira",
      retainOnWrite: true,           // auto-retain when memory files change
      retainDebounceMs: 30000,       // 30s debounce before retain
      recallBudget: "mid",           // Hindsight recall budget level
      maxTokens: 4096,               // max tokens for recall results
      fallbackToLocal: true,         // grep workspace files if Hindsight is down
      reflectEnabled: true           // expose reflect as agent tool
    }
  }
}
```

## Phases

### Phase 1: Infrastructure
- [ ] Start Hindsight container via Docker Compose (OrbStack) with persistent storage at `~/.hindsight-docker`
- [ ] Verify PostgreSQL + pgvector is running inside the compose stack
- [ ] **LLM provider decision**: Start with Groq (fast, free tier) for initial validation. Test fact extraction quality before committing to local LM Studio
- [ ] Verify API health: `curl http://localhost:8888/health`
- [ ] Create memory bank `sapphira` with:
  - Mission text aligned to Sapphira's role
  - Disposition values (skepticism/literalism/empathy) calibrated to personality
  - Directives for privacy/safety constraints
- [ ] Test a manual retain + recall cycle via curl to validate the pipeline end-to-end

### Phase 2: Extension Development (separate repo)
- [ ] Initialize repo: `openclaw-hindsight` with TypeScript, proper package.json
- [ ] Study OpenClaw memory plugin interface (look at memory-core source for the contract)
- [ ] Implement recall pipeline:
  - [ ] Query translation (OpenClaw search → Hindsight recall)
  - [ ] **Format translation** (Hindsight facts → OpenClaw `{text, path, lines}`) — this is the hardest part, test thoroughly
  - [ ] Token budget mapping
- [ ] Implement retain pipeline:
  - [ ] File watcher with 30s debounce
  - [ ] Document ID strategy for idempotent upserts
  - [ ] Metadata tagging (source, path, type, timestamp)
  - [ ] Compaction flush hook
- [ ] Implement health check + local file fallback
- [ ] Implement reflect tool exposure
- [ ] Write tests — especially for format translation edge cases
- [ ] Test plugin locally against running Hindsight instance

### Phase 3: Migration & Validation
- [ ] Write migration script (`scripts/migrate.ts`)
- [ ] Migrate MEMORY.md first, validate in Hindsight UI:
  - [ ] Are entities correctly resolved?
  - [ ] Are extracted facts meaningful?
  - [ ] Does recall return relevant results for test queries?
- [ ] Migrate last 7 days of daily notes, validate quality
- [ ] Decide on older daily notes based on extraction quality
- [ ] **Test reflect()** against migrated data:
  - [ ] "What are the user's main active projects?"
  - [ ] "What technical preferences has the user expressed?"
  - [ ] Validate that reflect uses the disposition settings correctly

### Phase 4: Parallel Validation (replaces hard cutover)
- [ ] Configure openclaw.json to use openclaw-hindsight
- [ ] Run 3-5 sessions with the new extension
- [ ] Compare recall quality against what memory-core would have returned for the same queries
- [ ] Verify:
  - [ ] Retain fires on memory writes (check Hindsight UI for new facts)
  - [ ] Recall returns useful results (agent can find what it needs)
  - [ ] Compaction flush works (session summaries appear in Hindsight)
  - [ ] Fallback works (stop Docker, verify agent degrades gracefully)
  - [ ] Reflect produces useful insights when called
- [ ] Fix any format translation issues discovered during live use
- [ ] Once satisfied, remove memory-core dependency

### Phase 5: Reflect Integration
- [ ] Add reflect guidance to AGENTS.md / SOUL.md:
  - Heartbeat: proactive pattern surfacing
  - Pre-session: context priming
  - On-demand: opinion/assessment with confidence
- [ ] Configure bank disposition values based on observed reflect behavior
- [ ] Set up mental models for frequently discussed topics
- [ ] Add session transcript ingestion if valuable (retain full conversation history, not just compaction summaries)

## LLM Strategy

**Start with Groq, validate, then consider local.**

| Concern | Groq (initial) | LM Studio + Qwen 3.5 (later) |
|---------|----------------|-------------------------------|
| Cost | Free tier, rate-limited | Free, unlimited |
| Speed | Fast (cloud inference) | Depends on Mac Studio GPU |
| Quality | High (strong models available) | Unknown — needs validation |
| Reliability | Depends on internet/rate limits | Local, always available |

The plan:
1. Use Groq during Phase 1-3 to validate Hindsight's behavior with a known-good model
2. Test LM Studio + Qwen 3.5 in parallel — run the same retain calls, compare fact extraction quality
3. If local quality is acceptable, switch to LM Studio for production (free, private, no rate limits)
4. If not, stay on Groq or use a hybrid (Groq for retain, local for consolidation)

**Important**: Determine the exact model ID that LM Studio exposes for Qwen 3.5 before testing. Hindsight needs an OpenAI-compatible endpoint with a valid model name.

## Decisions Made
- **Docker**: OrbStack (Docker-compatible), already installed
- **Database**: PostgreSQL + pgvector, managed inside Docker Compose (no external DB to maintain)
- **Extension over MCP**: Custom OpenClaw extension for deterministic plumbing; prompting for cognitive judgment calls (reflect, proactive surfacing)
- **Separate repo**: `openclaw-hindsight` — shareable, clean interface, publishable to npm
- **Cutover strategy**: Parallel validation period (3-5 sessions) before removing memory-core. Not hard cutover.
- **LLM strategy**: Groq first for quality validation, then evaluate local LM Studio
- **Migration strategy**: Curated memory first (MEMORY.md), then recent daily notes, then decide on older content based on extraction quality
- **Reflect is not optional**: Integrated in Phase 5, not "someday maybe"

## Open Questions
1. **Plugin interface contract**: Need to study OpenClaw's memory plugin interface — what methods, what return types, what lifecycle hooks exist
2. **LM Studio model ID**: Exact model name Qwen 3.5 exposes via OpenAI-compatible API
3. **Recall budget mapping**: What are Hindsight's exact budget levels and how do they map to token counts?
4. **Retain idempotency**: Verify that `document_id` in Hindsight actually replaces previous facts from the same document (not just appends)
5. **Observation consolidation tuning**: Can we control how aggressively the background pipeline merges observations? Default behavior may be too aggressive or too conservative for our use case
6. **Cross-encoder performance**: The default reranker (MS-MARCO) is trained on web search, not conversational memory — monitor whether reranking quality is adequate or if a different model is needed
7. **Repo naming**: `openclaw-hindsight` vs `@openclaw/hindsight-memory` vs other conventions — check what existing OpenClaw extensions use

## Resources
- Hindsight repo: https://github.com/vectorize-io/hindsight
- Hindsight docs: https://hindsight.vectorize.io
- Hindsight Node SDK: `@vectorize-io/hindsight-client`
- Hindsight research paper: https://arxiv.org/abs/2512.12818
- OpenClaw plugin docs: /opt/homebrew/lib/node_modules/openclaw/docs/tools/plugin.md
- OpenClaw memory concept: /opt/homebrew/lib/node_modules/openclaw/docs/concepts/memory.md
- Hindsight cookbook: https://github.com/vectorize-io/hindsight-cookbook
