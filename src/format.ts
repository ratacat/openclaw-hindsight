// Format translation: Hindsight facts → OpenClaw memory results
// This is the critical bridge — test thoroughly
// TODO: Implement

export interface HindsightFact {
  id: string;
  text: string;
  type: 'world' | 'experience' | 'observation';
  context?: string;
  metadata?: Record<string, string>;
  entities?: string[];
  occurred_start?: string;
  occurred_end?: string;
  document_id?: string;
}

export interface OpenClawMemoryResult {
  text: string;
  path: string;
  start_line: number;
  end_line: number;
}

export function formatFact(fact: HindsightFact): OpenClawMemoryResult {
  // Use metadata.path if available, otherwise synthetic path
  const path = fact.metadata?.path || `hindsight://facts/${fact.type}/${fact.id}`;

  // Build enriched text with entity context
  let text = fact.text;
  if (fact.entities?.length) {
    text += ` [entities: ${fact.entities.join(', ')}]`;
  }

  return {
    text,
    path,
    start_line: 0,
    end_line: 0,
  };
}
