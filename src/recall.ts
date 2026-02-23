// Recall pipeline: memory_search → Hindsight recall API → format translation

import type { HindsightConfig } from './config.js';
import { type HindsightRecallResponse, formatRecallText, formatRecallResponse, type OpenClawMemoryResult } from './format.js';
import { checkHealth } from './health.js';

export interface RecallOptions {
  query: string;
  maxResults?: number;
  minScore?: number;
  budget?: 'low' | 'mid' | 'high';
  maxTokens?: number;
}

export interface RecallResult {
  text: string;
  results: OpenClawMemoryResult[];
  raw: HindsightRecallResponse;
}

/**
 * Query Hindsight's recall API and format results for OpenClaw.
 */
export async function recall(cfg: HindsightConfig, options: RecallOptions): Promise<RecallResult> {
  const { query, maxResults = 10, budget, maxTokens } = options;

  const response = await fetch(
    `${cfg.baseUrl}/v1/default/banks/${cfg.bankId}/memories/recall`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        budget: budget || cfg.recallBudget,
        max_tokens: maxTokens || cfg.maxTokens,
        types: ['world', 'experience', 'observation'],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Hindsight recall failed: ${response.status} ${response.statusText}`);
  }

  const raw = (await response.json()) as HindsightRecallResponse;

  // Limit results
  if (raw.results.length > maxResults) {
    raw.results = raw.results.slice(0, maxResults);
  }

  return {
    text: formatRecallText(raw),
    results: formatRecallResponse(raw),
    raw,
  };
}

/**
 * Fallback: simple grep-based search over local memory files.
 */
export async function localFallbackSearch(
  workspacePath: string,
  query: string,
  maxResults: number,
): Promise<OpenClawMemoryResult[]> {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const results: OpenClawMemoryResult[] = [];
  const queryLower = query.toLowerCase();

  // Search MEMORY.md
  try {
    const memoryContent = await readFile(join(workspacePath, 'MEMORY.md'), 'utf-8');
    const lines = memoryContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length - 1, i + 2);
        results.push({
          text: lines.slice(start, end + 1).join('\n'),
          path: 'MEMORY.md',
          start_line: start + 1,
          end_line: end + 1,
        });
      }
    }
  } catch { /* file may not exist */ }

  // Search memory/*.md files
  try {
    const memoryDir = join(workspacePath, 'memory');
    const files = await readdir(memoryDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = await readFile(join(memoryDir, file), 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            const start = Math.max(0, i - 2);
            const end = Math.min(lines.length - 1, i + 2);
            results.push({
              text: lines.slice(start, end + 1).join('\n'),
              path: `memory/${file}`,
              start_line: start + 1,
              end_line: end + 1,
            });
          }
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* memory dir may not exist */ }

  return results.slice(0, maxResults);
}
