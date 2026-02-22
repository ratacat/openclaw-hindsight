# OpenClaw Memory Plugin Interface

Notes from studying `memory-core` and `memory-lancedb` source code.

## Plugin Registration Pattern

```ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const plugin = {
  id: "openclaw-hindsight",
  name: "Memory (Hindsight)",
  description: "Hindsight-backed memory with knowledge graph, temporal reasoning, and reflection",
  kind: "memory" as const,       // <-- this is what makes it a memory plugin (slot: memory)
  configSchema: { ... },

  register(api: OpenClawPluginApi) {
    // Register tools, CLI, services, lifecycle hooks
  }
};
export default plugin;
```

## Manifest (`openclaw.plugin.json`)

```json
{
  "id": "openclaw-hindsight",
  "kind": "memory",
  "configSchema": { ... }
}
```

## Key APIs

### `api.registerTool(toolDef, options?)`
Registers an agent tool. Tool def has:
- `name`: string (e.g. "memory_search")
- `label`: string
- `description`: string
- `parameters`: TypeBox schema or JSON Schema
- `execute(toolCallId, params)`: returns `{ content: [{type: "text", text: ...}], details?: ... }`

Options:
- `{ names: ["memory_search", "memory_get"] }` — for context factory pattern (memory-core)
- `{ name: "memory_search" }` — for single tool
- `{ optional: true }` — opt-in only

### `api.registerCli(factory, { commands: [...] })`
Register CLI subcommands.

### `api.registerService({ id, start, stop })`
Background service lifecycle.

### `api.on("before_agent_start", handler)`
Lifecycle hook — inject context before agent runs. Can return `{ prependContext: string }`.

### `api.on("agent_end", handler)`
Lifecycle hook — post-processing after agent finishes. Gets `event.messages`.

### `api.logger`
Standard logger: `.info()`, `.warn()`, etc.

### `api.resolvePath(path)`
Resolve a path relative to plugin/workspace.

### `api.pluginConfig`
The parsed config from `plugins.entries.<id>.config`.

## Our Tool Mapping

| OpenClaw Tool | Hindsight API | Notes |
|---------------|---------------|-------|
| `memory_search(query, {maxResults, minScore})` | `POST /recall` | Format translation needed: facts → {text, path, lines} |
| `memory_get(path, {from, lines})` | Local file read | Keep existing behavior — read workspace Markdown files |
| `memory_reflect(query)` | `POST /reflect` | NEW tool — not in memory-core. Uses Hindsight's reasoning engine |

## Lifecycle Hooks We'll Use

| Hook | Purpose |
|------|---------|
| `before_agent_start` | Could auto-recall relevant context (like memory-lancedb's autoRecall) |
| `agent_end` | Auto-retain conversation content into Hindsight |

## Slot Configuration

```json5
// openclaw.json
{
  plugins: {
    slots: {
      memory: "openclaw-hindsight"  // replaces "memory-core"
    }
  }
}
```

Only one memory plugin can be active at a time (slot is exclusive).
