// src/test/probRate.test.ts
// P189: public/maps/shared/prob-rate.js (iframe layer + popup A), loaded like randeajad.js.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type Cell = [number, number, number, number, number, number];
type Layer = { periods: number[]; p0: number; maxEst: number; cells: Cell[] };
type Meta = {
  v: 1; cellSize: number; today: string; currentPeriod: number; seasonMonths: number[];
  seasonLabel: string; monthDays: number[]; w6: Layer; season: Layer;
};
type Stats = { min: number; max: number; withSp: number; count: number };
type ProbRate = {
  hasMeta: (m: unknown) => boolean;
  periodRangeLabel: (p: number[], y: number) => string;
  seasonLabelEt: (m: number[]) => string;
  layerStats: (l: Layer) => Stats;
  classOf: (e: number, s: Stats) => number;
  opacityFor: (n: number) => number;
  confidence: (a: number) => { level: string; bars: number; text: string };
  pct: (s: number, a: number) => number | null;
  estPct: (e: number) => string;
  daysOf: (n: number, m: number) => string;
  cellBounds: (gi: number, gj: number, size: number) => number[][];
  freshKeysFrom: (c: unknown[], size: number) => Record<string, boolean>;
  popupHtml: (o: Record<string, unknown>) => string;
  render: (o: Record<string, unknown>) => Stats;
};

function load(): ProbRate {
  const code = fs.readFileSync(path.resolve(__dirname, '../../public/maps/shared/prob-rate.js'), 'utf8');
  const mod = { exports: {} as ProbRate };
  vm.runInNewContext(code, { module: mod, localStorage: { getItem: () => null, setItem: () => undefined } });
  return mod.exports;
}
const R = load();

const kiisa: Cell = [394, 165, 5, 1, 0.071, 12.3];
const meta: Meta = {
  v: 1, cellSize: 0.15, today: '2026-11-25', currentPeriod: 23,
  seasonMonths: [9, 10, 11, 0, 1, 2, 3], seasonLabel: 'Oct 1 - Apr 30',
  monthDays: [86, 89, 67, 15, 1, 0, 0, 0, 0, 38, 66, 43],
  w6: { periods: [22, 23, 24], p0: 0.01, maxEst: 0.072, cells: [kiisa, [386, 146, 39, 7, 0.072, 80], [300, 160, 0, 0, 0.004, 3]] },
  season: { periods: [0, 1, 2], p0: 0.01, maxEst: 0.05, cells: [[386, 146, 289, 14, 0.05, 400]] },
};

describe('prob-rate labels', () => {
  it('w6 range wraps into a readable Estonian range', () => {
    const s = R.periodRangeLabel([22, 23, 24], 2026);
    expect(s.startsWith('5. nov')).toBe(true);
    expect(s.endsWith('16. dets')).toBe(true);
  });
  it('season label', () => {
    const s = R.seasonLabelEt([9, 10, 11, 0, 1, 2, 3]);
    expect(s.startsWith('oktoober')).toBe(true);
    expect(s.endsWith('aprill')).toBe(true);
    expect(R.seasonLabelEt([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe('aastaringne');
  });
  it('days phrase and percentages', () => {
    expect(R.daysOf(4, 15).endsWith('15-st')).toBe(true);
    expect(R.pct(1, 5)).toBe(20);
    expect(R.pct(0, 0)).toBeNull();
    expect(R.estPct(0.071)).toBe('7.1%');
    expect(R.estPct(0.27)).toBe('27%');
  });
});

describe('prob-rate classes', () => {
  it('meta check', () => {
    expect(R.hasMeta(meta)).toBe(true);
    expect(R.hasMeta(null)).toBe(false);
    expect(R.hasMeta({ v: 1 })).toBe(false);
  });
  it('colour class is relative to the layer, opacity to neighbour effort', () => {
    const st = R.layerStats(meta.w6);
    expect(st.withSp).toBe(2);
    expect(R.classOf(0.072, st)).toBe(4);
    expect(R.classOf(0.004, st)).toBe(0);
    expect(R.opacityFor(0)).toBe(0.25);
    expect(R.opacityFor(40)).toBe(0.9);
  });
  it('confidence levels', () => {
    expect(R.confidence(4).bars).toBe(1);
    expect(R.confidence(12).bars).toBe(2);
    expect(R.confidence(40).bars).toBe(3);
  });
  it('fresh keys map old cells onto the same grid', () => {
    const k = R.freshKeysFrom([{ latMin: 59.1, lonMin: 24.75, markerInCell: true }, { latMin: 58.8, lonMin: 22.8 }], 0.15);
    expect(Object.keys(k)).toEqual(['394|165']);
    expect(R.cellBounds(394, 165, 0.15)[0][0]).toBeCloseTo(59.1, 6);
  });
});

describe('popup A', () => {
  it('cell with own days shows the raw share and the days', () => {
    const h = R.popupHtml({ cell: kiisa, meta, view: 'w6', species: 'Hele-urvalind', fresh: true, year: 2026, nowMonth: 10 });
    expect(h).toContain('>20%<');
    expect(h).toContain('5-st');
    expect(h).toContain('7.1%');
    expect(h).toContain('#0f8a63');
  });
  it('cell without own days shows the neighbour estimate with ~', () => {
    const h = R.popupHtml({ cell: [300, 160, 0, 0, 0.004, 3], meta, view: 'w6', species: 'X', fresh: false, year: 2026, nowMonth: 10 });
    expect(h).toContain('~0.4%');
  });
  it('escapes the species name', () => {
    const h = R.popupHtml({ cell: kiisa, meta, view: 'w6', species: '<b>x</b>', year: 2026, nowMonth: 10 });
    expect(h).not.toContain('<b>x</b>');
  });
});

describe('render', () => {
  it('draws one rectangle per cell plus a dot on fresh cells', () => {
    const added: string[] = [];
    const L = {
      rectangle: () => ({ bindPopup: () => undefined, kind: 'rect' }),
      circleMarker: () => ({ bindPopup: () => undefined, kind: 'dot' }),
    };
    const group = { clearLayers: () => undefined, addLayer: (x: { kind: string }) => added.push(x.kind) };
    const legendEl = { innerHTML: '' };
    R.render({ L, group, meta, species: 'Hele-urvalind', oldCells: [{ latMin: 59.1, lonMin: 24.75, markerInCell: true }], legendEl });
    expect(added.filter((k) => k === 'rect').length).toBe(3);
    expect(added.filter((k) => k === 'dot').length).toBe(1);
    expect(legendEl.innerHTML).toContain('Silutud');
  });
});
