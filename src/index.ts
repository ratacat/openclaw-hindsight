/**
 * openclaw-hindsight: Memory extension powered by Hindsight
 *
 * Replaces OpenClaw's built-in memory-core with Hindsight's fact-centric
 * knowledge graph. Provides memory_search (via recall), memory_get (local
 * file read), and memory_reflect (Hindsight reasoning).
 */

import { readFile, readdir, watch } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { Type } from '@sinclair/typebox';
import { getConfig, type HindsightConfig } from './config.js';
import { checkHealth } from './health.js';
import { recall, localFallbackSearch } from './recall.js';
import { retainFile } from './retain.js';
import { reflect } from './reflect.js';
import { formatRecallText } from './format.js';

// ============================================================================
// File Watcher (debounced retain on memory file changes)
// ============================================================================

class FileWatcher {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private abortController: AbortController | null = null;

  constructor(
    private cfg: HindsightConfig,
    private workspacePath: string,
    private logger: { info: (msg: string) => void; warn: (msg: string) => void },
  ) {}

  async start(): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Watch MEMORY.md
    this.watchFile(join(this.workspacePath, 'MEMORY.md'), signal);

    // Watch memory/ directory
    this.watchDir(join(this.workspacePath, 'memory'), signal);
  }

  stop(): void {
    this.abortController?.abort();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private async watchFile(filePath: string, signal: AbortSignal): Promise<void> {
    try {
      const watcher = watch(filePath, { signal });
      for await (const event of watcher) {
        if (event.eventType === 'change') {
          this.scheduleRetain(filePath);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      this.logger.warn(`openclaw-hindsight: watch failed for ${filePath}: ${String(err)}`);
    }
  }

  private async watchDir(dirPath: string, signal: AbortSignal): Promise<void> {
    try {
      const watcher = watch(dirPath, { signal, recursive: false });
      for await (const event of watcher) {
        if (event.filename?.endsWith('.md')) {
          this.scheduleRetain(join(dirPath, event.filename));
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      this.logger.warn(`openclaw-hindsight: watch failed for ${dirPath}: ${String(err)}`);
    }
  }

  private scheduleRetain(filePath: string): void {
    // Debounce: wait cfg.retainDebounceMs before retaining
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      filePath,
      setTimeout(async () => {
        this.debounceTimers.delete(filePath);
        try {
          const content = await readFile(filePath, 'utf-8');
          if (!content.trim()) return;

          const relPath = relative(this.workspacePath, filePath);
          await retainFile(this.cfg, relPath, content);
          this.logger.info(`openclaw-hindsight: retained ${relPath}`);
        } catch (err) {
          this.logger.warn(`openclaw-hindsight: retain failed for ${filePath}: ${String(err)}`);
        }
      }, this.cfg.retainDebounceMs),
    );
  }
}

// ============================================================================
// Plugin Definition
// ============================================================================

const hindsightPlugin = {
  id: 'openclaw-hindsight',
  name: 'Memory (Hindsight)',
  description:
    'Hindsight-backed memory with knowledge graph, temporal reasoning, and reflection',
  kind: 'memory' as const,

  register(api: OpenClawPluginApi) {
    const cfg = getConfig(api.pluginConfig as Partial<HindsightConfig>);
    const workspacePath = api.resolvePath('.');

    api.logger.info(
      `openclaw-hindsight: registered (url: ${cfg.baseUrl}, bank: ${cfg.bankId})`,
    );

    // ========================================================================
    // Tools
    // ========================================================================

    // memory_search → Hindsight recall
    api.registerTool(
      {
        name: 'memory_search',
        label: 'Memory Search (Hindsight)',
        description:
          'Semantically search memory via Hindsight knowledge graph. ' +
          'Returns facts with entity references and temporal context. ' +
          'Use before answering questions about prior work, decisions, dates, people, preferences, or todos.',
        parameters: Type.Object({
          query: Type.String({ description: 'Search query' }),
          maxResults: Type.Optional(
            Type.Number({ description: 'Maximum results (default: 6)' }),
          ),
          minScore: Type.Optional(
            Type.Number({ description: 'Minimum relevance score 0-1 (default: 0.3)' }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { query, maxResults = 6 } = params as {
            query: string;
            maxResults?: number;
            minScore?: number;
          };

          try {
            // Check if Hindsight is up
            const healthy = await checkHealth(cfg.baseUrl);
            if (!healthy && cfg.fallbackToLocal) {
              api.logger.warn('openclaw-hindsight: server unreachable, falling back to local search');
              const results = await localFallbackSearch(workspacePath, query, maxResults);
              if (results.length === 0) {
                return {
                  details: {}, content: [{ type: 'text' as const, text: 'Hindsight is offline. No local results found.' }],
                };
              }
              const text = results.map((r, i) => `${i + 1}. ${r.text}\n   Source: ${r.path}#${r.start_line}`).join('\n\n');
              return {
                details: {},
                content: [{ type: 'text' as const, text: `(Hindsight offline — local fallback)\n\n${text}` }],
              };
            }
            if (!healthy) {
              return {
                details: {},
                content: [{ type: 'text' as const, text: 'Hindsight server is unreachable.' }],
              };
            }

            const result = await recall(cfg, { query, maxResults });

            if (result.results.length === 0) {
              return {
                details: {},
                content: [{ type: 'text' as const, text: 'No relevant memories found.' }],
              };
            }

            // Build response with source paths
            const snippets = result.results.map((r) => ({
              text: r.text,
              path: r.path,
              start_line: r.start_line,
              end_line: r.end_line,
            }));

            return {
              content: [{ type: 'text' as const, text: result.text }],
              details: {
                count: result.results.length,
                snippets,
              },
            };
          } catch (err) {
            api.logger.warn(`openclaw-hindsight: recall error: ${String(err)}`);

            // Fallback
            if (cfg.fallbackToLocal) {
              const results = await localFallbackSearch(workspacePath, query, maxResults);
              const text = results.length > 0
                ? results.map((r, i) => `${i + 1}. ${r.text}\n   Source: ${r.path}#${r.start_line}`).join('\n\n')
                : 'No results found.';
              return {
                details: {},
                content: [{ type: 'text' as const, text: `(Hindsight error — local fallback)\n\n${text}` }],
              };
            }

            return {
              details: {},
              content: [{ type: 'text' as const, text: `Memory search failed: ${String(err)}` }],
            };
          }
        },
      },
      { name: 'memory_search' },
    );

    // memory_get → local file read (same as memory-core)
    api.registerTool(
      {
        name: 'memory_get',
        label: 'Memory Get',
        description:
          'Read a specific memory file by path with optional line range. ' +
          'Use after memory_search to pull full context from a specific file.',
        parameters: Type.Object({
          path: Type.String({
            description: 'Path to memory file (e.g. MEMORY.md, memory/2026-02-22.md)',
          }),
          from: Type.Optional(
            Type.Number({ description: 'Starting line number (1-indexed)' }),
          ),
          lines: Type.Optional(
            Type.Number({ description: 'Number of lines to read' }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { path: filePath, from, lines } = params as {
            path: string;
            from?: number;
            lines?: number;
          };

          try {
            // Security: only allow reading within workspace memory paths
            const normalizedPath = filePath.replace(/^\/+/, '');
            const allowedPrefixes = ['MEMORY.md', 'memory/'];
            const isAllowed = allowedPrefixes.some(
              (p) => normalizedPath === p || normalizedPath.startsWith(p),
            );
            if (!isAllowed) {
              return {
                details: {},
                content: [{
                  type: 'text' as const,
                  text: `Access denied: memory_get only reads MEMORY.md and memory/*.md files. Got: ${filePath}`,
                }],
              };
            }

            const fullPath = join(workspacePath, normalizedPath);
            const content = await readFile(fullPath, 'utf-8');
            const allLines = content.split('\n');

            let outputLines = allLines;
            let startLine = 1;

            if (from !== undefined) {
              startLine = Math.max(1, from);
              const startIdx = startLine - 1;
              const count = lines ?? 50;
              outputLines = allLines.slice(startIdx, startIdx + count);
            }

            const text = outputLines.join('\n');
            const totalLines = allLines.length;

            return {
              content: [{
                type: 'text' as const,
                text: text || '(empty file)',
              }],
              details: {
                path: normalizedPath,
                totalLines,
                from: startLine,
                linesReturned: outputLines.length,
              },
            };
          } catch (err) {
            return {
              details: {},
              content: [{
                type: 'text' as const,
                text: `Failed to read ${filePath}: ${String(err)}`,
              }],
            };
          }
        },
      },
      { name: 'memory_get' },
    );

    // memory_reflect → Hindsight reflect (NEW tool)
    if (cfg.reflectEnabled) {
      api.registerTool(
        {
          name: 'memory_reflect',
          label: 'Memory Reflect',
          description:
            'Deep reasoning over memories using Hindsight\'s reflect engine. ' +
            'Synthesizes patterns, forms opinions, and discovers connections. ' +
            'Use for complex questions that need more than simple fact lookup.',
          parameters: Type.Object({
            query: Type.String({ description: 'Question or topic to reflect on' }),
          }),
          async execute(_toolCallId, params) {
            const { query } = params as { query: string };

            try {
              const result = await reflect(cfg, { query });

              let text = result.text;
              if (result.basedOn.length > 0) {
                text += '\n\n---\nBased on:\n' +
                  result.basedOn.map((f) => `- [${f.type}] ${f.text}`).join('\n');
              }

              return {
                content: [{ type: 'text' as const, text }],
                details: {
                  basedOnCount: result.basedOn.length,
                  usage: result.usage,
                },
              };
            } catch (err) {
              return {
                details: {},
                content: [{
                  type: 'text' as const,
                  text: `Reflect failed: ${String(err)}`,
                }],
              };
            }
          },
        },
        { name: 'memory_reflect' },
      );
    }

    // ========================================================================
    // Lifecycle Hooks
    // ========================================================================

    // Auto-retain: capture conversation content after agent ends
    if (cfg.autoRetain) {
      api.on('agent_end', async (event) => {
        if (!event.success || !event.messages || event.messages.length === 0) {
          return;
        }

        try {
          // Extract user messages
          const userTexts: string[] = [];
          for (const msg of event.messages) {
            if (!msg || typeof msg !== 'object') continue;
            const msgObj = msg as Record<string, unknown>;
            if (msgObj.role !== 'user') continue;

            const content = msgObj.content;
            if (typeof content === 'string' && content.length > 20) {
              userTexts.push(content);
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block &&
                  typeof block === 'object' &&
                  'type' in block &&
                  (block as Record<string, unknown>).type === 'text' &&
                  'text' in block
                ) {
                  const text = (block as Record<string, unknown>).text as string;
                  if (text.length > 20) userTexts.push(text);
                }
              }
            }
          }

          if (userTexts.length === 0) return;

          // Combine and retain as conversation context
          const combined = userTexts.slice(0, 5).join('\n\n');
          const timestamp = new Date().toISOString();

          await retainFile(cfg, `conversation/${timestamp.slice(0, 10)}`, combined);
          api.logger.info(`openclaw-hindsight: auto-retained ${userTexts.length} user messages`);
        } catch (err) {
          api.logger.warn(`openclaw-hindsight: auto-retain failed: ${String(err)}`);
        }
      });
    }

    // Auto-recall: inject relevant memories before agent starts
    if (cfg.autoRecall) {
      api.on('before_agent_start', async (event) => {
        if (!event.prompt || event.prompt.length < 10) return;

        try {
          const healthy = await checkHealth(cfg.baseUrl);
          if (!healthy) return;

          const result = await recall(cfg, {
            query: event.prompt,
            maxResults: 3,
            budget: 'low',
          });

          if (result.results.length === 0) return;

          api.logger.info(
            `openclaw-hindsight: injecting ${result.results.length} memories into context`,
          );

          return {
            prependContext: `<relevant-memories>\n${result.text}\n</relevant-memories>`,
          };
        } catch (err) {
          api.logger.warn(`openclaw-hindsight: auto-recall failed: ${String(err)}`);
        }
      });
    }

    // ========================================================================
    // CLI Commands
    // ========================================================================

    api.registerCli(
      ({ program }) => {
        const hindsight = program
          .command('hindsight')
          .description('Hindsight memory plugin commands');

        hindsight
          .command('status')
          .description('Check Hindsight connection')
          .action(async () => {
            const healthy = await checkHealth(cfg.baseUrl);
            console.log(healthy ? '✅ Hindsight is reachable' : '❌ Hindsight is unreachable');
            if (healthy) {
              console.log(`  URL: ${cfg.baseUrl}`);
              console.log(`  Bank: ${cfg.bankId}`);
            }
          });

        hindsight
          .command('search')
          .description('Search memories via Hindsight recall')
          .argument('<query>', 'Search query')
          .option('--limit <n>', 'Max results', '6')
          .option('--budget <level>', 'Budget (low/mid/high)', 'mid')
          .action(async (query: string, opts: { limit: string; budget: string }) => {
            try {
              const result = await recall(cfg, {
                query,
                maxResults: parseInt(opts.limit),
                budget: opts.budget as 'low' | 'mid' | 'high',
              });
              console.log(result.text);
            } catch (err) {
              console.error(`Search failed: ${String(err)}`);
            }
          });

        hindsight
          .command('retain')
          .description('Manually retain a file into Hindsight')
          .argument('<file>', 'File to retain')
          .action(async (file: string) => {
            try {
              const content = await readFile(join(workspacePath, file), 'utf-8');
              const result = await retainFile(cfg, file, content);
              console.log(result.success ? `✅ Retained ${file}` : `❌ Failed to retain ${file}`);
              if (result.usage) {
                console.log(`  Tokens: ${result.usage.total_tokens}`);
              }
            } catch (err) {
              console.error(`Retain failed: ${String(err)}`);
            }
          });

        hindsight
          .command('reflect')
          .description('Deep reasoning over memories')
          .argument('<query>', 'Question to reflect on')
          .action(async (query: string) => {
            try {
              const result = await reflect(cfg, { query });
              console.log(result.text);
            } catch (err) {
              console.error(`Reflect failed: ${String(err)}`);
            }
          });
      },
      { commands: ['hindsight'] },
    );

    // ========================================================================
    // Services
    // ========================================================================

    let fileWatcher: FileWatcher | null = null;

    if (cfg.retainOnWrite) {
      api.registerService({
        id: 'hindsight-file-watcher',
        start: () => {
          fileWatcher = new FileWatcher(cfg, workspacePath, api.logger);
          fileWatcher.start();
          api.logger.info(
            `openclaw-hindsight: file watcher started (debounce: ${cfg.retainDebounceMs}ms)`,
          );
        },
        stop: () => {
          fileWatcher?.stop();
          api.logger.info('openclaw-hindsight: file watcher stopped');
        },
      });
    }

    api.registerService({
      id: 'openclaw-hindsight',
      start: () => {
        api.logger.info(
          `openclaw-hindsight: initialized (url: ${cfg.baseUrl}, bank: ${cfg.bankId})`,
        );
      },
      stop: () => {
        api.logger.info('openclaw-hindsight: stopped');
      },
    });
  },
};

export default hindsightPlugin;
