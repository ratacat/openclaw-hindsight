# openclaw-hindsight

OpenClaw memory extension that replaces the default `memory-core` with [Hindsight](https://github.com/vectorize-io/hindsight) — a fact-centric knowledge graph with entity resolution, temporal reasoning, and AI-driven reflection.

Where `memory-core` stores and retrieves raw text, Hindsight extracts structured facts, resolves entities across documents, and reasons over what it knows. Your agent gets memory that understands context, not just matches keywords.

## Who It Is For

- OpenClaw users who want richer agent memory than grep over markdown files
- Teams running persistent agents that accumulate knowledge across sessions
- Anyone already running Hindsight who wants OpenClaw integration

## Core Capabilities

- **Retain** — Watches memory files and ingests changes into Hindsight (debounced, idempotent)
- **Recall** — 4-way parallel retrieval: semantic + BM25 + knowledge graph + temporal filtering
- **Reflect** — Hindsight's reasoning engine for synthesizing insights across memories
- **Fallback** — Degrades gracefully to local grep search if Hindsight is unreachable

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) 2026.2.21-2+
- [Hindsight](https://github.com/vectorize-io/hindsight) server (Docker recommended)
- An LLM provider for Hindsight's fact extraction (LM Studio, Groq, OpenAI, etc.)

## Quickstart

### 1. Start Hindsight

```bash
docker run --rm -d -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_PROVIDER=lmstudio \
  -e HINDSIGHT_API_LLM_BASE_URL=http://host.docker.internal:1234/v1 \
  -v $HOME/.hindsight-docker:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

Swap `lmstudio` for `groq`, `openai`, etc. and adjust the base URL to match your provider.

### 2. Install the extension

```bash
npm install openclaw-hindsight
```

### 3. Configure OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json5
{
  plugins: {
    slots: {
      memory: "openclaw-hindsight"
    }
  }
}
```

### 4. Verify

```bash
openclaw hindsight status
```

If connected, your agent's `memory_search` now routes through Hindsight.

## Tools

The extension registers three tools that replace or extend `memory-core`:

| Tool | Replaces | What it does |
|------|----------|--------------|
| `memory_search(query)` | `memory-core` search | Queries Hindsight with semantic + graph retrieval; falls back to local grep |
| `memory_get(path)` | `memory-core` get | Reads local workspace files (unchanged behavior) |
| `memory_reflect(query)` | *new* | Synthesizes reasoning across stored facts with confidence scoring |

### `memory_search`

```
memory_search("what does the user prefer for error handling?")
```

Returns structured facts with entity context, temporal metadata, and source paths. When Hindsight is down and `fallbackToLocal` is `true`, silently falls back to grep over `MEMORY.md` and `memory/*.md`.

### `memory_reflect`

```
memory_reflect("what patterns emerge in the user's coding style?")
```

Returns synthesized reasoning backed by specific facts. Only available when `reflectEnabled` is `true`.

## CLI Commands

```bash
openclaw hindsight status       # check Hindsight connection
openclaw hindsight search       # search memories from the terminal
openclaw hindsight retain       # manually ingest a file
openclaw hindsight reflect      # run reflection from the terminal
```

## Configuration

Environment variables take precedence over config file values.

| Config key | Env var | Default | Description |
|------------|---------|---------|-------------|
| `baseUrl` | `HINDSIGHT_URL` | `http://localhost:8888` | Hindsight API URL |
| `bankId` | `HINDSIGHT_BANK_ID` | `sapphira` | Memory bank ID |
| `retainOnWrite` | — | `true` | Auto-retain on memory file changes |
| `retainDebounceMs` | — | `30000` | File watcher debounce (ms) |
| `recallBudget` | — | `mid` | Retrieval compute budget: `low`, `mid`, `high` |
| `maxTokens` | — | `4096` | Max tokens in recall results |
| `fallbackToLocal` | — | `true` | Grep fallback when Hindsight is down |
| `reflectEnabled` | — | `true` | Expose `memory_reflect` tool |
| `autoRecall` | — | `false` | Inject memories before agent starts |
| `autoRetain` | — | `true` | Retain conversation content when agent ends |

## Migration

Bulk-ingest existing memory files into Hindsight:

```bash
npm run migrate -- --workspace ~/.openclaw/workspace --bank sapphira

# preview without writing
npm run migrate -- --workspace ~/.openclaw/workspace --bank sapphira --dry-run
```

Processes `MEMORY.md` first (highest signal), then daily notes newest-first. Uses `document_id` for idempotent upserts — safe to re-run.

## How It Works

```
Agent
  │
  ├─ memory_search(query)
  │    └─ POST /v1/default/banks/{bankId}/memories/recall
  │         → 4-way retrieval → format facts → return to agent
  │         → (or grep fallback if unreachable)
  │
  ├─ memory_reflect(query)
  │    └─ POST /v1/default/banks/{bankId}/reflect
  │         → reasoning over fact graph → return synthesis
  │
  └─ file watcher (MEMORY.md, memory/*.md)
       └─ POST /v1/default/banks/{bankId}/memories
            → fact extraction → entity resolution → store
```

The extension handles plumbing (file watching, API calls, format translation, fallback). Hindsight handles cognition (fact extraction, entity resolution, temporal reasoning, reflection).

## Development

```bash
npm install           # install dependencies
npm run dev           # watch mode (tsc --watch)
npm run build         # production build
npm test              # run tests (vitest)
npm run lint          # eslint
```

Output goes to `dist/`. Entry point is `dist/index.js`.

## Architecture

See [docs/hindsight-migration.md](docs/hindsight-migration.md) for the full design document covering the paradigm shift from `memory-core`, component design, and implementation phases.

## License

MIT
