import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-user' },
    isAdmin: true,
    hasPermission: () => true,
  }),
}));

vi.mock('@/lib/avatar-storage', () => ({
  fetchSpeciesList: vi.fn(async () => ['Punakurk-kaur']),
}));

vi.mock('@/lib/speciesPredictionSettings', () => ({
  loadSpeciesPredictionSettings: vi.fn(async () => null),
  saveSpeciesPredictionSettings: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({
  isSpeciesPredictionEnabled: () => true,
  loadSettings: () => ({ enableSpeciesPredictionBeta: true }),
  saveSettings: vi.fn(),
}));

vi.mock('@/config/supabaseConfig', () => ({
  getFunctionsBaseUrl: () => 'https://example.supabase.co/functions/v1',
  getSupabaseAuthHeaders: () => ({ Authorization: 'Bearer test', apikey: 'test' }),
  isDeveloperModeEnabled: () => false,
}));

vi.mock('@/lib/activePredictionSpecies', () => ({
  ACTIVE_PREDICTION_SPECIES_EVENT: 'active-prediction-species',
  getActivePredictionSpecies: () => ({ speciesName: 'Punakurk-kaur' }),
  setActivePredictionSpecies: (_scope: string, speciesName: string) => ({ speciesName }),
}));

vi.mock('@/lib/speciesPredictionDebug', () => ({
  clearSpeciesPredictionDebugMemory: vi.fn(),
  clearSpeciesPredictionDebugStorage: vi.fn(),
  getSpeciesPredictionDebugSnapshot: () => ({
    activeContext: {
      speciesName: '',
      speciesKey: '',
      mapScope: '',
      panelRuntimeMarker: '',
      lastPredictionRequestAt: '',
      lastPredictionResponseAt: '',
      predictionStatus: 'idle',
    },
    rawBackendResponse: {
      responseBody: {
        warnings: null,
        diagnostics: null,
      },
    },
    panelPayload: null,
    panelState: null,
    latestBackendResponseForResync: null,
    transport: {
      requestUrl: '',
      requestTimestamp: '',
      responseTimestamp: '',
      requestId: null,
      invocationMethod: '',
      authSessionPresent: false,
      anonKeyPresent: false,
      intendedHeaders: {
        apikey: false,
        authorization: false,
        contentType: null,
      },
      failedBeforeResponse: false,
      httpStatus: null,
      responseBody: {
        diagnostics: null,
      },
      timeoutMs: null,
      abortedByClientTimeout: false,
      likelyReachedEdgeFunction: false,
      error: null,
      healthCheck: {
        body: {
          configured: true,
        },
      },
    },
  }),
  getSpeciesPredictionDebugStorageSnapshot: () => ({
    localStorage: {},
    sessionStorage: {},
  }),
  setSpeciesPredictionHealthCheckResult: vi.fn(),
  SPECIES_PREDICTION_DEBUG_EVENT: 'species-prediction-debug-updated',
  SPECIES_PREDICTION_DEBUG_HEALTHCHECK_EVENT: 'species-prediction-debug-healthcheck',
  SPECIES_PREDICTION_DEBUG_RERUN_EVENT: 'species-prediction-debug-rerun',
  SPECIES_PREDICTION_DEBUG_RESYNC_EVENT: 'species-prediction-debug-resync',
}));

import SpeciesPredictionSettings, {
  buildRecoveryDebugState,
  deriveSpeciesPredictionDisplayState,
  normalizeBackendStatus,
} from '@/features/settings/SpeciesPredictionSettings';

describe('SpeciesPredictionSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as Window & typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        configured: true,
        webhookConfigured: true,
        webhookValid: true,
        available: true,
        deployed: true,
        statusCode: 'CONFIGURED_AVAILABLE',
        message: 'Prediction backend is configured and available',
      }),
    } as Response);
  });

  it('renders without crashing when status payload is partial and optional fields are missing', async () => {
    expect(() => render(<SpeciesPredictionSettings />)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText('Prediction backend is configured and available')).toBeInTheDocument();
    });

    expect(screen.getByText(/Status mapper debug/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cannot read properties of undefined/i)).not.toBeInTheDocument();
  });

  it('renders the live failing unavailable-shaped payload without runtime exception and keeps configured state', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        configured: true,
        webhookConfigured: true,
        webhookValid: true,
        deployed: true,
        statusCode: 'CONFIGURED_UNAVAILABLE',
        message: 'Partial status payload from backend',
      }),
    } as Response);

    expect(() => render(<SpeciesPredictionSettings />)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText('Prediction backend is configured and available')).toBeInTheDocument();
    });

    expect(screen.getByText(/displayState: CONFIGURED_AVAILABLE/i)).toBeInTheDocument();
    expect(screen.getByText(/summarySourcePath:/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cannot read properties of undefined/i)).not.toBeInTheDocument();
  });

  it('keeps configured payloads available when only optional backend fields are missing', () => {
    const normalized = normalizeBackendStatus({
      ok: false,
      configured: true,
      webhookConfigured: true,
      webhookValid: true,
      available: false,
      runtimeAvailable: false,
      deployed: true,
      statusCode: 'CONFIGURED_AVAILABLE',
      reasonCode: null,
      message: 'partial payload',
    });

    expect(deriveSpeciesPredictionDisplayState(normalized)).toBe('CONFIGURED_AVAILABLE');
  });

  it('handles partial recovery payloads without throwing', () => {
    expect(() => buildRecoveryDebugState({
      code: 'PARTIAL',
      responseBody: {
        aiSummary: null,
        warnings: null,
      },
    })).not.toThrow();

    expect(buildRecoveryDebugState({
      code: 'PARTIAL',
      responseBody: {
        aiSummary: null,
      },
    })).toEqual({
      rawTopLevelCode: 'PARTIAL',
      summarySourcePath: '',
      insightSummaryRecovered: false,
      normalizedPredictionShape: '',
    });
  });
});
