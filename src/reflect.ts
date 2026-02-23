// Reflect pipeline: deep reasoning over memories via Hindsight

import type { HindsightConfig } from './config.js';
import type { HindsightReflectResponse } from './format.js';

export interface ReflectOptions {
  query: string;
  budget?: 'low' | 'mid' | 'high';
  maxTokens?: number;
  includeFacts?: boolean;
}

export interface ReflectResult {
  text: string;
  basedOn: Array<{ id: string; text: string; type: string }>;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
}

/**
 * Call Hindsight's reflect API for deep reasoning over memories.
 */
export async function reflect(cfg: HindsightConfig, options: ReflectOptions): Promise<ReflectResult> {
  const { query, budget = 'low', maxTokens, includeFacts = true } = options;

  const body: Record<string, unknown> = {
    query,
    budget,
    max_tokens: maxTokens || cfg.maxTokens,
  };

  if (includeFacts) {
    body.include = { facts: {} };
  }

  const response = await fetch(
    `${cfg.baseUrl}/v1/default/banks/${cfg.bankId}/reflect`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`Hindsight reflect failed: ${response.status} ${response.statusText}`);
  }

  const raw = (await response.json()) as HindsightReflectResponse;

  return {
    text: raw.text,
    basedOn: raw.based_on?.memories ?? [],
    usage: raw.usage ?? undefined,
  };
}
