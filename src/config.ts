// Configuration for openclaw-hindsight

export interface HindsightConfig {
  baseUrl: string;
  bankId: string;
  retainOnWrite: boolean;
  retainDebounceMs: number;
  recallBudget: 'low' | 'mid' | 'high';
  maxTokens: number;
  fallbackToLocal: boolean;
  reflectEnabled: boolean;
  autoRecall: boolean;
  autoRetain: boolean;
}

const defaults: HindsightConfig = {
  baseUrl: process.env.HINDSIGHT_URL || 'http://localhost:8888',
  bankId: process.env.HINDSIGHT_BANK_ID || 'sapphira',
  retainOnWrite: true,
  retainDebounceMs: 30_000,
  recallBudget: 'mid',
  maxTokens: 4096,
  fallbackToLocal: true,
  reflectEnabled: true,
  autoRecall: false,
  autoRetain: true,
};

export function getConfig(overrides?: Partial<HindsightConfig>): HindsightConfig {
  return { ...defaults, ...overrides };
}
