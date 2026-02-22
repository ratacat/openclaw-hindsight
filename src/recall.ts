// Recall pipeline: memory_search → Hindsight recall → format translation
// TODO: Implement once OpenClaw memory plugin interface is understood

export interface RecallOptions {
  query: string;
  maxResults?: number;
  minScore?: number;
}

export interface RecallResult {
  text: string;
  path: string;
  start_line: number;
  end_line: number;
}

export async function recall(options: RecallOptions): Promise<RecallResult[]> {
  // TODO: Implement
  // 1. Translate query to Hindsight recall format
  // 2. Call Hindsight recall API
  // 3. Translate facts back to OpenClaw format
  throw new Error('Not implemented');
}
