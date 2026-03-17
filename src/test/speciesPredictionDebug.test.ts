import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSpeciesPredictionDebugMemory,
  clearSpeciesPredictionDebugStorage,
  getSpeciesPredictionDebugSnapshot,
  getSpeciesPredictionDebugStorageSnapshot,
  setSpeciesPredictionDebugBackendResponse,
  setSpeciesPredictionDebugPanelPayload,
  setSpeciesPredictionDebugPanelState,
  updateSpeciesPredictionDebugContext,
} from '@/lib/speciesPredictionDebug';

describe('speciesPredictionDebug', () => {
  beforeEach(() => {
    clearSpeciesPredictionDebugMemory();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('stores the latest backend, payload, panel state, and active context snapshot', () => {
    const emitSpy = vi.fn();
    window.addEventListener('species-prediction-debug-updated', emitSpy);

    updateSpeciesPredictionDebugContext({
      speciesName: 'Barn Swallow',
      speciesKey: 'barn-swallow',
      mapScope: 'linnuliigid',
      predictionStatus: 'loading',
    });
    setSpeciesPredictionDebugBackendResponse({ insightSummary: 'backend summary' });
    setSpeciesPredictionDebugPanelPayload({ insightSummary: 'payload summary' });
    setSpeciesPredictionDebugPanelState({ insightSummary: 'panel summary' });

    const snapshot = getSpeciesPredictionDebugSnapshot();
    expect(snapshot.activeContext.speciesName).toBe('Barn Swallow');
    expect(snapshot.activeContext.speciesKey).toBe('barn-swallow');
    expect(snapshot.activeContext.mapScope).toBe('linnuliigid');
    expect(snapshot.activeContext.predictionStatus).toBe('loading');
    expect(snapshot.rawBackendResponse).toEqual({ insightSummary: 'backend summary' });
    expect(snapshot.panelPayload).toEqual({ insightSummary: 'payload summary' });
    expect(snapshot.panelState).toEqual({ insightSummary: 'panel summary' });
    expect(snapshot.latestBackendResponseForResync).toEqual({ insightSummary: 'backend summary' });
    expect(snapshot.transport.invocationMethod).toBe('');
    expect(snapshot.transport.authSessionPresent).toBe(false);
    expect(snapshot.transport.anonKeyPresent).toBe(false);
    expect(snapshot.transport.failedBeforeResponse).toBe(false);
    expect(emitSpy).toHaveBeenCalled();

    window.removeEventListener('species-prediction-debug-updated', emitSpy);
  });

  it('reads and clears only prediction-related storage keys', () => {
    window.localStorage.setItem('speciesPrediction.activeSpecies.linnuliigid', '{"species":"swift"}');
    window.localStorage.setItem('speciesPredictionDefaults.linnuliigid.swift', '{"enabled":true}');
    window.localStorage.setItem('unrelated.key', 'keep-me');
    window.sessionStorage.setItem('prediction.temp.panel', '{"ok":true}');
    window.sessionStorage.setItem('another.key', 'keep-me-too');

    const before = getSpeciesPredictionDebugStorageSnapshot();
    expect(before.localStorage['speciesPrediction.activeSpecies.linnuliigid']).toBeTruthy();
    expect(before.localStorage['speciesPredictionDefaults.linnuliigid.swift']).toBeTruthy();
    expect(before.localStorage['unrelated.key']).toBeUndefined();
    expect(before.sessionStorage['prediction.temp.panel']).toBeTruthy();
    expect(before.sessionStorage['another.key']).toBeUndefined();

    clearSpeciesPredictionDebugStorage();

    const after = getSpeciesPredictionDebugStorageSnapshot();
    expect(after.localStorage['speciesPrediction.activeSpecies.linnuliigid']).toBeUndefined();
    expect(after.localStorage['speciesPredictionDefaults.linnuliigid.swift']).toBeUndefined();
    expect(window.localStorage.getItem('unrelated.key')).toBe('keep-me');
    expect(after.sessionStorage['prediction.temp.panel']).toBeUndefined();
    expect(window.sessionStorage.getItem('another.key')).toBe('keep-me-too');
  });
});
