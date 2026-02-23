// Retain pipeline: content → Hindsight retain API

import type { HindsightConfig } from './config.js';

export interface RetainItem {
  content: string;
  context?: string;
  documentId: string;
  timestamp?: string;
  tags?: string[];
}

export interface RetainResult {
  success: boolean;
  itemsCount: number;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
}

/**
 * Retain content into Hindsight.
 */
export async function retain(cfg: HindsightConfig, items: RetainItem[]): Promise<RetainResult> {
  const response = await fetch(
    `${cfg.baseUrl}/v1/default/banks/${cfg.bankId}/memories`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(item => ({
          content: item.content,
          context: item.context,
          document_id: item.documentId,
          timestamp: item.timestamp,
          tags: item.tags,
        })),
        async: false,
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Hindsight retain failed: ${response.status} ${response.statusText} ${errText}`);
  }

  const result = await response.json() as {
    success: boolean;
    items_count: number;
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  };

  return {
    success: result.success,
    itemsCount: result.items_count,
    usage: result.usage,
  };
}

/**
 * Retain a memory file into Hindsight with appropriate metadata.
 */
export async function retainFile(
  cfg: HindsightConfig,
  filePath: string,
  content: string,
): Promise<RetainResult> {
  // Extract date from filename if it's a daily note (memory/YYYY-MM-DD.md)
  const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  const timestamp = dateMatch ? `${dateMatch[1]}T00:00:00Z` : undefined;

  // Determine context based on file type
  let context = 'workspace memory file';
  if (filePath.includes('MEMORY.md')) {
    context = 'curated long-term memory';
  } else if (filePath.match(/memory\/\d{4}-\d{2}-\d{2}\.md/)) {
    context = 'daily memory log';
  }

  return retain(cfg, [{
    content,
    context,
    documentId: filePath,
    timestamp,
  }]);
}
