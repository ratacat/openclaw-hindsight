import { describe, it, expect } from 'vitest';
import { formatFact, formatRecallText, type HindsightRecallResponse, type HindsightRecallResult } from '../src/format.js';

describe('formatFact', () => {
  it('formats a world fact with document_id as path', () => {
    const fact: HindsightRecallResult = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      text: 'Jared lives in Missoula, Montana.',
      type: 'world',
      entities: ['Jared', 'Missoula', 'Montana'],
      context: 'user profile',
      occurred_start: null,
      occurred_end: null,
      mentioned_at: null,
      document_id: 'memory/2026-02-22.md',
      metadata: null,
      chunk_id: null,
      tags: [],
      source_fact_ids: null,
    };

    const result = formatFact(fact);
    expect(result.path).toBe('memory/2026-02-22.md');
    expect(result.text).toContain('Jared lives in Missoula');
    expect(result.text).toContain('Entities: Jared, Missoula, Montana');
    expect(result.text).toContain('Context: user profile');
  });

  it('uses synthetic path when document_id has no slash', () => {
    const fact: HindsightRecallResult = {
      id: 'abc12345-0000-0000-0000-000000000000',
      text: 'Some observation',
      type: 'observation',
      entities: null,
      context: null,
      occurred_start: '2026-02-22T10:00:00Z',
      occurred_end: null,
      mentioned_at: null,
      document_id: 'test-001',
      metadata: null,
      chunk_id: null,
      tags: [],
      source_fact_ids: null,
    };

    const result = formatFact(fact);
    expect(result.path).toBe('hindsight://observation/abc12345');
    expect(result.text).toContain('Date:');
  });
});

describe('formatRecallText', () => {
  it('returns "no memories" for empty results', () => {
    const response: HindsightRecallResponse = {
      results: [],
      entities: null,
      chunks: null,
      source_facts: null,
      trace: null,
    };
    expect(formatRecallText(response)).toBe('No relevant memories found.');
  });

  it('formats results with type icons', () => {
    const response: HindsightRecallResponse = {
      results: [
        {
          id: '1',
          text: 'World fact',
          type: 'world',
          entities: ['Alice'],
          context: null,
          occurred_start: null,
          occurred_end: null,
          mentioned_at: null,
          document_id: 'test',
          metadata: null,
          chunk_id: null,
          tags: [],
          source_fact_ids: null,
        },
        {
          id: '2',
          text: 'An observation',
          type: 'observation',
          entities: null,
          context: null,
          occurred_start: null,
          occurred_end: null,
          mentioned_at: null,
          document_id: null,
          metadata: null,
          chunk_id: null,
          tags: [],
          source_fact_ids: null,
        },
      ],
      entities: null,
      chunks: null,
      source_facts: null,
      trace: null,
    };

    const text = formatRecallText(response);
    expect(text).toContain('📌 World fact');
    expect(text).toContain('🔍 An observation');
    expect(text).toContain('[Alice]');
  });
});
