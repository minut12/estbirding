import { describe, expect, it } from 'vitest';
import { engineLabel } from '../../supabase/functions/_shared/engine-label';
import { withoutProviders, type RouteCandidate } from '../../supabase/functions/_shared/llmRoute';

// P188: translation_engine / error prefix = the provider that really answered.
describe('engineLabel', () => {
  it('returns sonnet when llm_provider is missing (real Claude response)', () => {
    expect(engineLabel({})).toBe('sonnet');
  });

  it('returns sonnet for null / undefined responses', () => {
    expect(engineLabel(null)).toBe('sonnet');
    expect(engineLabel(undefined)).toBe('sonnet');
  });

  it('returns the backup provider that answered', () => {
    expect(engineLabel({ llm_provider: 'gemini' })).toBe('gemini');
    expect(engineLabel({ llm_provider: 'mistral' })).toBe('mistral');
  });

  it('treats anthropic or unknown tags as sonnet', () => {
    expect(engineLabel({ llm_provider: 'anthropic' })).toBe('sonnet');
    expect(engineLabel({ llm_provider: 'openai' })).toBe('sonnet');
  });
});

// P188: news translation keeps Mistral out of the backup chain.
describe('withoutProviders', () => {
  const cands: RouteCandidate[] = [
    { provider: 'gemini', model: 'g-pro' },
    { provider: 'mistral', model: 'm-large' },
    { provider: 'gemini', model: 'g-lite' },
    { provider: 'mistral', model: 'm-small' },
  ];

  it('drops every candidate of an excluded provider and keeps the order', () => {
    expect(withoutProviders(cands, ['mistral'])).toEqual([
      { provider: 'gemini', model: 'g-pro' },
      { provider: 'gemini', model: 'g-lite' },
    ]);
  });

  it('returns an equal new array when nothing is excluded', () => {
    const out = withoutProviders(cands, []);
    expect(out).toEqual(cands);
    expect(out).not.toBe(cands);
  });

  it('can exclude several providers', () => {
    expect(withoutProviders(cands, ['gemini', 'mistral'])).toEqual([]);
  });

  it('does not mutate the input', () => {
    const copy = cands.map((c) => ({ ...c }));
    withoutProviders(cands, ['gemini']);
    expect(cands).toEqual(copy);
  });
});
