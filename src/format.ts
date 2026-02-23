// Format translation: Hindsight recall results → OpenClaw memory format

export interface HindsightRecallResult {
  id: string;
  text: string;
  type: 'world' | 'experience' | 'observation';
  entities: string[] | null;
  context: string | null;
  occurred_start: string | null;
  occurred_end: string | null;
  mentioned_at: string | null;
  document_id: string | null;
  metadata: Record<string, string> | null;
  chunk_id: string | null;
  tags: string[];
  source_fact_ids: string[] | null;
}

export interface HindsightEntity {
  entity_id: string;
  canonical_name: string;
  observations: Array<{ text: string; mentioned_at: string }>;
}

export interface HindsightRecallResponse {
  results: HindsightRecallResult[];
  entities: Record<string, HindsightEntity> | null;
  chunks: Record<string, { id: string; text: string; chunk_index: number }> | null;
  source_facts: Record<string, HindsightRecallResult> | null;
  trace: Record<string, unknown> | null;
}

export interface HindsightReflectResponse {
  text: string;
  based_on: { memories: Array<{ id: string; text: string; type: string }> } | null;
  structured_output: Record<string, unknown> | null;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
}

export interface OpenClawMemoryResult {
  text: string;
  path: string;
  start_line: number;
  end_line: number;
}

/**
 * Format a single Hindsight fact into OpenClaw's expected memory result format.
 */
export function formatFact(fact: HindsightRecallResult): OpenClawMemoryResult {
  // Use document_id as path if it looks like a file path, otherwise synthetic
  const path = fact.document_id && fact.document_id.includes('/')
    ? fact.document_id
    : `hindsight://${fact.type}/${fact.id.slice(0, 8)}`;

  // Build enriched text
  let text = fact.text;

  // Add entity context
  if (fact.entities?.length) {
    text += `\n  Entities: ${fact.entities.join(', ')}`;
  }

  // Add temporal context
  if (fact.occurred_start) {
    const date = new Date(fact.occurred_start).toLocaleDateString();
    text += `\n  Date: ${date}`;
  }

  // Add context/source
  if (fact.context) {
    text += `\n  Context: ${fact.context}`;
  }

  return {
    text,
    path,
    start_line: 0,
    end_line: 0,
  };
}

/**
 * Format a full recall response into an array of OpenClaw memory results.
 */
export function formatRecallResponse(response: HindsightRecallResponse): OpenClawMemoryResult[] {
  return response.results.map(formatFact);
}

/**
 * Format recall results as a text block for the agent.
 */
export function formatRecallText(response: HindsightRecallResponse): string {
  if (response.results.length === 0) {
    return 'No relevant memories found.';
  }

  const factLines = response.results.map((fact, i) => {
    const typeTag = fact.type === 'observation' ? '🔍' : fact.type === 'experience' ? '💭' : '📌';
    let line = `${i + 1}. ${typeTag} ${fact.text}`;
    if (fact.entities?.length) {
      line += ` [${fact.entities.join(', ')}]`;
    }
    if (fact.document_id) {
      line += `\n   Source: ${fact.document_id}`;
    }
    return line;
  });

  // Add entity observations if present
  const entityLines: string[] = [];
  if (response.entities) {
    for (const [name, entity] of Object.entries(response.entities)) {
      if (entity.observations?.length) {
        entityLines.push(`\n**${name}**: ${entity.observations.map(o => o.text).join('; ')}`);
      }
    }
  }

  let result = factLines.join('\n\n');
  if (entityLines.length) {
    result += '\n\n---\nEntity context:' + entityLines.join('');
  }
  return result;
}
