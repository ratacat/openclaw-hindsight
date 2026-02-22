# openclaw-hindsight

OpenClaw memory extension powered by [Hindsight](https://github.com/vectorize-io/hindsight) — replaces the default `memory-core` with a fact-centric knowledge graph featuring entity resolution, temporal reasoning, and reflection.

## What This Does

- **Retain**: Automatically ingests memory file changes into Hindsight (debounced, idempotent)
- **Recall**: Replaces `memory_search` with Hindsight's 4-way parallel retrieval (semantic + BM25 + graph + temporal)
- **Reflect**: Exposes Hindsight's reasoning engine for agent-driven insights
- **Fallback**: Degrades gracefully to local file search if Hindsight is unreachable

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw)
- [Hindsight](https://github.com/vectorize-io/hindsight) server running (Docker recommended)
- An LLM provider for Hindsight's fact extraction (LM Studio, Groq, OpenAI, etc.)

## Setup

```bash
# 1. Start Hindsight
docker run --rm -d -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_PROVIDER=lmstudio \
  -e HINDSIGHT_API_LLM_BASE_URL=http://host.docker.internal:1234/v1 \
  -v $HOME/.hindsight-docker:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest

# 2. Install this extension
npm install openclaw-hindsight

# 3. Configure openclaw.json
# See Configuration below
```

## Configuration

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

Environment variables or config options:

| Option | Default | Description |
|--------|---------|-------------|
| `HINDSIGHT_URL` | `http://localhost:8888` | Hindsight API base URL |
| `HINDSIGHT_BANK_ID` | `default` | Memory bank ID |
| `retainOnWrite` | `true` | Auto-retain on memory file changes |
| `retainDebounceMs` | `30000` | Debounce interval for file watcher |
| `recallBudget` | `mid` | Hindsight recall budget (low/mid/high) |
| `maxTokens` | `4096` | Max tokens for recall results |
| `fallbackToLocal` | `true` | Fall back to local grep if Hindsight is down |

## Migration

Ingest existing memory files into Hindsight:

```bash
npm run migrate -- --bank sapphira --workspace ~/.openclaw/workspace
```

## Development

```bash
npm install
npm run dev    # watch mode
npm test       # run tests
```

## Architecture

See [hindsight-migration.md](docs/hindsight-migration.md) for the full design document.

## License

MIT
