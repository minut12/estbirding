import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import {
  createClientErrorReporter,
  normalizeClientError,
  shouldIgnoreClientError,
  type ClientErrorPayload,
} from './clientErrors';

describe('shouldIgnoreClientError', () => {
  it('ignores ResizeObserver loop noise', () => {
    expect(shouldIgnoreClientError('ResizeObserver loop limit exceeded', null)).toBe(true);
    expect(shouldIgnoreClientError('ResizeObserver loop completed with undelivered notifications.', null)).toBe(true);
  });

  it('ignores browser-extension stacks', () => {
    expect(shouldIgnoreClientError('TypeError: x', 'TypeError: x\n    at f (chrome-extension://abc/content.js:1:1)')).toBe(true);
    expect(shouldIgnoreClientError('TypeError: x', 'f@moz-extension://abc/content.js:1:1')).toBe(true);
  });

  it('ignores empty and cross-origin "Script error."', () => {
    expect(shouldIgnoreClientError('', null)).toBe(true);
    expect(shouldIgnoreClientError('Script error.', null)).toBe(true);
  });

  it('keeps real app errors', () => {
    expect(shouldIgnoreClientError('TypeError: x is undefined', '    at f (https://estbirds.netlify.app/assets/index.js:1:1)')).toBe(false);
  });
});

describe('normalizeClientError', () => {
  it('handles Error, string and object reasons', () => {
    const e = new TypeError('boom');
    expect(normalizeClientError(e).message).toBe('TypeError: boom');
    expect(normalizeClientError('plain').message).toBe('plain');
    expect(normalizeClientError({ message: 'obj' }).message).toBe('obj');
    expect(normalizeClientError(42)).toEqual({ message: '42', stack: null });
  });
});

describe('createClientErrorReporter', () => {
  it('sends at most max reports per page load and skips filtered ones', () => {
    const sent: ClientErrorPayload[] = [];
    const r = createClientErrorReporter('app', 'b1', (p) => { sent.push(p); }, 5);
    expect(r.report('ResizeObserver loop limit exceeded')).toBe(false);
    for (let i = 0; i < 8; i += 1) r.report(new Error(`e${i}`));
    expect(r.sentCount()).toBe(5);
    expect(sent).toHaveLength(5);
    expect(sent[0].p_surface).toBe('app');
    expect(sent[0].p_build).toBe('b1');
    expect(sent[0].p_message).toBe('Error: e0');
  });

  it('truncates long fields and never throws when the sender rejects', async () => {
    const sent: ClientErrorPayload[] = [];
    const r = createClientErrorReporter('europe', 'b2', (p) => {
      sent.push(p);
      return Promise.reject(new Error('network'));
    });
    expect(r.report({ message: 'm'.repeat(900), stack: 's'.repeat(9000) })).toBe(true);
    await Promise.resolve();
    expect(sent[0].p_message).toHaveLength(500);
    expect(sent[0].p_stack).toHaveLength(4000);
  });
});
