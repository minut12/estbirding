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
