/**
 * openclaw-hindsight: Memory extension powered by Hindsight
 *
 * Replaces OpenClaw's built-in memory-core with Hindsight's fact-centric
 * knowledge graph. Provides memory_search (via recall), memory_get (local
 * file read), and memory_reflect (Hindsight reasoning).
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getConfig, type HindsightConfig } from "./config.js";
import { checkHealth } from "./health.js";

const hindsightPlugin = {
  id: "openclaw-hindsight",
  name: "Memory (Hindsight)",
  description:
    "Hindsight-backed memory with knowledge graph, temporal reasoning, and reflection",
  kind: "memory" as const,

  register(api: OpenClawPluginApi) {
    const cfg = getConfig(api.pluginConfig as Partial<HindsightConfig>);

    api.logger.info(
      `openclaw-hindsight: registered (url: ${cfg.baseUrl}, bank: ${cfg.bankId})`,
    );

    // ========================================================================
    // Tools
    // ========================================================================

    // memory_search → Hindsight recall
    api.registerTool(
      {
        name: "memory_search",
        label: "Memory Search",
        description:
          "Semantically search memory files (MEMORY.md + memory/*.md) via Hindsight knowledge graph. " +
          "Returns facts with entity references and temporal context. " +
          "Use before answering questions about prior work, decisions, dates, people, preferences, or todos.",
        parameters: Type.Object({
          query: Type.String({ description: "Search query" }),
          maxResults: Type.Optional(
            Type.Number({ description: "Maximum results (default: 6)" }),
          ),
          minScore: Type.Optional(
            Type.Number({ description: "Minimum relevance score 0-1 (default: 0.3)" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { query, maxResults = 6, minScore = 0.3 } = params as {
            query: string;
            maxResults?: number;
            minScore?: number;
          };

          // TODO: Implement recall pipeline
          // 1. Check health
          // 2. Call Hindsight recall API
          // 3. Format facts → OpenClaw memory result format
          // 4. Fall back to local grep if Hindsight is down

          return {
            content: [{ type: "text", text: "Not yet implemented" }],
          };
        },
      },
      { name: "memory_search" },
    );

    // memory_get → local file read (unchanged from memory-core behavior)
    api.registerTool(
      {
        name: "memory_get",
        label: "Memory Get",
        description:
          "Read a specific memory file by path with optional line range. " +
          "Use after memory_search to pull full context from a specific file.",
        parameters: Type.Object({
          path: Type.String({ description: "Path to memory file (e.g. MEMORY.md, memory/2026-02-22.md)" }),
          from: Type.Optional(
            Type.Number({ description: "Starting line number (1-indexed)" }),
          ),
          lines: Type.Optional(
            Type.Number({ description: "Number of lines to read" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { path, from, lines } = params as {
            path: string;
            from?: number;
            lines?: number;
          };

          // TODO: Implement local file read
          // This stays as a local file reader — same as memory-core
          // Validates path is within MEMORY.md / memory/ directory

          return {
            content: [{ type: "text", text: "Not yet implemented" }],
          };
        },
      },
      { name: "memory_get" },
    );

    // memory_reflect → Hindsight reflect (NEW — not in memory-core)
    if (cfg.reflectEnabled) {
      api.registerTool(
        {
          name: "memory_reflect",
          label: "Memory Reflect",
          description:
            "Deep reasoning over memories using Hindsight's reflect engine. " +
            "Synthesizes patterns, forms opinions with confidence scores, and discovers connections. " +
            "Use for complex questions that need more than simple fact lookup.",
          parameters: Type.Object({
            query: Type.String({ description: "Question or topic to reflect on" }),
          }),
          async execute(_toolCallId, params) {
            const { query } = params as { query: string };

            // TODO: Implement reflect pipeline
            // 1. Call Hindsight reflect API
            // 2. Return synthesized response

            return {
              content: [{ type: "text", text: "Not yet implemented" }],
            };
          },
        },
        { name: "memory_reflect" },
      );
    }

    // ========================================================================
    // Lifecycle Hooks
    // ========================================================================

    // Auto-retain: capture conversation content after agent ends
    if (cfg.autoRetain) {
      api.on("agent_end", async (event) => {
        // TODO: Implement auto-retain
        // 1. Extract meaningful content from conversation
        // 2. Retain into Hindsight with appropriate metadata
      });
    }

    // Auto-recall: inject relevant memories before agent starts
    if (cfg.autoRecall) {
      api.on("before_agent_start", async (event) => {
        // TODO: Implement auto-recall
        // 1. Embed the user prompt
        // 2. Recall relevant facts from Hindsight
        // 3. Return { prependContext: formattedMemories }
      });
    }

    // ========================================================================
    // CLI
    // ========================================================================

    api.registerCli(
      ({ program }) => {
        const memory = program
          .command("hindsight")
          .description("Hindsight memory plugin commands");

        memory
          .command("status")
          .description("Check Hindsight connection")
          .action(async () => {
            const healthy = await checkHealth(cfg.baseUrl);
            console.log(healthy ? "✅ Hindsight is reachable" : "❌ Hindsight is unreachable");
          });

        memory
          .command("search")
          .description("Search memories via Hindsight recall")
          .argument("<query>", "Search query")
          .option("--limit <n>", "Max results", "6")
          .option("--budget <level>", "Budget (low/mid/high)", "mid")
          .action(async (query, opts) => {
            // TODO: Implement CLI search
            console.log(`Searching for: ${query} (limit: ${opts.limit}, budget: ${opts.budget})`);
          });

        memory
          .command("retain")
          .description("Manually retain content into Hindsight")
          .argument("<file>", "File to retain")
          .action(async (file) => {
            // TODO: Implement CLI retain
            console.log(`Retaining: ${file}`);
          });

        memory
          .command("reflect")
          .description("Reflect on memories")
          .argument("<query>", "Question to reflect on")
          .action(async (query) => {
            // TODO: Implement CLI reflect
            console.log(`Reflecting on: ${query}`);
          });
      },
      { commands: ["hindsight"] },
    );

    // ========================================================================
    // File Watcher Service
    // ========================================================================

    if (cfg.retainOnWrite) {
      api.registerService({
        id: "hindsight-file-watcher",
        start: () => {
          // TODO: Implement file watcher
          // 1. Watch MEMORY.md and memory/*.md
          // 2. On change, debounce 30s, then retain into Hindsight
          // 3. Use document_id = file path for idempotent upserts
          api.logger.info(
            `openclaw-hindsight: file watcher started (debounce: ${cfg.retainDebounceMs}ms)`,
          );
        },
        stop: () => {
          // TODO: Clean up file watcher
          api.logger.info("openclaw-hindsight: file watcher stopped");
        },
      });
    }

    // ========================================================================
    // Health Service
    // ========================================================================

    api.registerService({
      id: "openclaw-hindsight",
      start: () => {
        api.logger.info(
          `openclaw-hindsight: initialized (url: ${cfg.baseUrl}, bank: ${cfg.bankId})`,
        );
      },
      stop: () => {
        api.logger.info("openclaw-hindsight: stopped");
      },
    });
  },
};

export default hindsightPlugin;
