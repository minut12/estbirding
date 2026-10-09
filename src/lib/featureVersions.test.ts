// src/lib/featureVersions.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  FEATURE_AREAS,
  currentVersion,
  featureVersionParam,
  getFeature,
  lastChanged,
  versionHistory,
  type Feature,
} from './featureVersions';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe('featureVersions registry', () => {
  it('source file stays ASCII (Estonian letters as \\u escapes)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/featureVersions.ts'), 'utf8');
    const bad = [...src].filter((ch) => ch.charCodeAt(0) > 127);
    expect(bad).toEqual([]);
  });

  it('has unique ids and known areas', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const areas = new Set(FEATURE_AREAS.map((a) => a.id));
    for (const f of FEATURES) expect(areas.has(f.area)).toBe(true);
  });

  it('every feature starts with a major change and lists changes oldest first', () => {
    for (const f of FEATURES) {
      expect(f.changes.length, f.id).toBeGreaterThan(0);
      expect(f.changes[0].kind, f.id).toBe('major');
      for (let i = 0; i < f.changes.length; i += 1) {
        const c = f.changes[i];
        expect(c.date, `${f.id} #${i}`).toMatch(DATE_RE);
        expect(c.ref.trim().length, `${f.id} #${i} ref`).toBeGreaterThan(0);
        expect(c.text.trim().length, `${f.id} #${i} text`).toBeGreaterThan(0);
        if (i > 0) expect(c.date >= f.changes[i - 1].date, `${f.id} #${i} date order`).toBe(true);
      }
    }
  });

  it('derives semver from the change kinds', () => {
    const sample: Feature = {
      id: 'trektellen',
      area: 'kaart',
      name: 'x',
      changes: [
        { date: '2026-01-01', ref: 'a', kind: 'major', text: 'a' },
        { date: '2026-01-02', ref: 'b', kind: 'patch', text: 'b' },
        { date: '2026-01-03', ref: 'c', kind: 'minor', text: 'c' },
        { date: '2026-01-04', ref: 'd', kind: 'patch', text: 'd' },
        { date: '2026-01-05', ref: 'e', kind: 'major', text: 'e' },
        { date: '2026-01-06', ref: 'f', kind: 'minor', text: 'f' },
      ],
    };
    expect(versionHistory(sample).map((c) => c.version)).toEqual(['1.0.0', '1.0.1', '1.1.0', '1.1.1', '2.0.0', '2.1.0']);
    expect(currentVersion(sample)).toBe('2.1.0');
    expect(lastChanged(sample)).toBe('2026-01-06');
  });

  it('builds the iframe ?fv= parameter', () => {
    const linnuliigid = getFeature('linnuliigid');
    expect(linnuliigid).toBeDefined();
    const param = featureVersionParam(['linnuliigid', 'trektellen']);
    expect(param).toBe(`linnuliigid:${currentVersion(linnuliigid as Feature)},trektellen:1.0.0`);
  });
});
