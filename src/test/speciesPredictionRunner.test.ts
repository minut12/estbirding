import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invokeMock,
  getSessionMock,
  updateTransportMock,
  setTransportErrorMock,
  setBackendResponseMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getSessionMock: vi.fn(),
  updateTransportMock: vi.fn(),
  setTransportErrorMock: vi.fn(),
  setBackendResponseMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

vi.mock('@/config/supabaseConfig', () => ({
  getFunctionsBaseUrl: () => 'https://example.supabase.co/functions/v1',
  getSupabaseAnonKey: () => 'anon-key',
  isDeveloperModeEnabled: () => false,
}));

vi.mock('@/lib/speciesPredictionDebug', () => ({
  setSpeciesPredictionDebugBackendResponse: setBackendResponseMock,
  setSpeciesPredictionTransportError: setTransportErrorMock,
  updateSpeciesPredictionTransport: updateTransportMock,
}));

vi.mock('@/lib/speciesPrediction', () => ({
  hasUsableSpeciesPredictionResult: () => true,
  isPredictionRequestType: (value: unknown) => value === 'prediction' || value === 'insight' || value === 'prediction_and_insight',
  normalizeSpeciesPredictionResult: (raw: unknown) => raw,
  resolveSpeciesPredictionSource: () => ({ insightSummary: '' }),
}));

import { runSpeciesPredictionRequest } from '@/lib/speciesPredictionRunner';

describe('speciesPredictionRunner', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns normalized success diagnostics for direct invoke responses', async () => {
    invokeMock.mockResolvedValue({
      data: {
        speciesKey: 'must-toonekurg',
        speciesName: 'Must-toonekurg',
        generatedAt: '2026-03-30T12:00:00.000Z',
        topPredictedPoints: [],
        insightSummary: 'Fresh direct result',
      },
      error: null,
    });

    const response = await runSpeciesPredictionRequest({
      requestType: 'prediction_and_insight',
      species: {
        key: 'must-toonekurg',
        name: 'Must-toonekurg',
        latinName: 'Ciconia nigra',
      },
      settings: {},
    } as never, 'linnuliigid');

    expect(response.ok).toBe(true);
    expect(response.diagnostics.terminalState).toBe('success');
    expect(response.diagnostics.transport.ok).toBe(true);
    expect(response.diagnostics.transport.status).toBe(200);
    expect(response.diagnostics.transport.receivedAt).toBeTruthy();
  });

  it('finishes in timeout state when invoke never resolves', async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation(() => new Promise(() => {}));

    const promise = runSpeciesPredictionRequest({
      requestType: 'prediction_and_insight',
      species: {
        key: 'must-toonekurg',
        name: 'Must-toonekurg',
        latinName: 'Ciconia nigra',
      },
      settings: {},
    } as never, 'linnuliigid');

    await vi.advanceTimersByTimeAsync(180001);
    const response = await promise;

    expect(response.ok).toBe(false);
    expect(response.diagnostics.terminalState).toBe('timeout');
    expect(response.diagnostics.transport.timedOut).toBe(true);
    expect(response.diagnostics.transport.error).toContain('timed out');
    expect(response.diagnostics.responseTimestamp).toBeTruthy();
  });
});
