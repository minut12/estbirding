import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/P46-randeajad-fixtures.json";

type Row = number[];
type Win = { a: number; b: number; pk?: number };
type Series = { n: number[]; v: number[]; records: number; birds: number | null; vmax: number };
type Randeajad = {
  analyse: (rows?: Row[], opts?: { resident?: boolean }) => Record<string, unknown>;
  series: (rows?: Row[]) => Series;
  isResident: (name: string) => boolean;
  weekToDoy: (w: number) => number;
  fmtDoy: (doy: number) => string;
  fmtRange: (win: Win) => string;
  monthBuckets: (rows: Row[], result: Record<string, unknown>) => unknown;
  isNow: (win: Win, week: number) => boolean;
  isNowWinter: (win: Win, week: number) => boolean;
};

function loadRandeajad(): { fromWindow: Randeajad; fromModule: Randeajad } {
  const filePath = path.resolve("public/maps/shared/randeajad.js");
  const source = fs.readFileSync(filePath, "utf8");
  const context = { window: {} as Record<string, unknown>, module: { exports: {} as Record<string, unknown> } };
  vm.runInNewContext(source, context, { filename: filePath });
  return {
    fromWindow: context.window.__bmRandeajad as Randeajad,
    fromModule: context.module.exports as unknown as Randeajad,
  };
}

const histograms = fixtures.histograms as unknown as Record<string, Row[]>;
const expected = fixtures.expected as unknown as Record<string, Record<string, unknown>>;
const residentOverride = fixtures.residentOverride as unknown as { species: string[] };
const legacyPairs = fixtures.legacyPairs as unknown as {
  species: string;
  rows: Row[];
  expected: Record<string, unknown>;
};

describe("randeajad module", () => {
  const { fromWindow, fromModule } = loadRandeajad();
  const R = fromWindow;

  it("exposes analyse on both window.__bmRandeajad and module.exports", () => {
    expect(typeof fromWindow.analyse).toBe("function");
    expect(typeof fromModule.analyse).toBe("function");
  });

  it("exposes series on both window.__bmRandeajad and module.exports", () => {
    expect(typeof fromWindow.series).toBe("function");
    expect(typeof fromModule.series).toBe("function");
  });

  describe("analyse() matches fixtures", () => {
    for (const species of Object.keys(expected)) {
      it(species, () => {
        expect(R.analyse(histograms[species])).toEqual(expected[species]);
      });
    }
  });

  describe("curated resident list wins over data", () => {
    for (const species of residentOverride.species) {
      it(species, () => {
        expect(R.analyse(histograms[species], { resident: true })).toEqual({ kind: "resident" });
      });
    }
  });

  it("few still wins over the curated resident list", () => {
    expect(R.analyse(histograms["Roherähn"], { resident: true })).toEqual({ kind: "few" });
  });

  it("two-value rows still reproduce the v3 window (" + legacyPairs.species + ")", () => {
    expect(R.analyse(legacyPairs.rows)).toEqual(legacyPairs.expected);
  });

  describe("series()", () => {
    const rows = histograms["Sookurg"];

    it("records is the sum of row[1]", () => {
      expect(R.series(rows).records).toBe(rows.reduce((acc, row) => acc + row[1], 0));
    });

    it("birds is the sum of row[2]", () => {
      expect(R.series(rows).birds).toBe(rows.reduce((acc, row) => acc + row[2], 0));
    });

    it("vmax is the largest row[3]", () => {
      expect(R.series(rows).vmax).toBe(rows.reduce((acc, row) => Math.max(acc, row[3]), 0));
    });

    it("n and v are 53-long, week-indexed", () => {
      const s = R.series(rows);
      expect(s.n).toHaveLength(53);
      expect(s.v).toHaveLength(53);
      for (const row of rows) {
        expect(s.n[row[0]]).toBe(row[1]);
        expect(s.v[row[0]]).toBe(row[3]);
      }
    });

    it("birds is null when rows carry no count", () => {
      expect(R.series(legacyPairs.rows).birds).toBeNull();
    });

    it("falls back to records as weight for two-value rows", () => {
      const legacy = R.series(legacyPairs.rows);
      for (const row of legacyPairs.rows) {
        expect(legacy.v[row[0]]).toBe(row[1]);
      }
    });
  });

  it("isResident matches the curated list case-insensitively", () => {
    expect(R.isResident("Laanepüü")).toBe(true);
    expect(R.isResident("LAANEPÜÜ")).toBe(true);
    expect(R.isResident("Sookurg")).toBe(false);
  });

  it("isNow is false for a diffuse half", () => {
    expect(R.isNow({ diffuse: true } as unknown as Win, 38)).toBe(false);
  });

  it("returns few for empty or undefined histogram", () => {
    expect(R.analyse([])).toEqual({ kind: "few" });
    expect(R.analyse(undefined)).toEqual({ kind: "few" });
  });

  it("maps weeks to day-of-year", () => {
    expect(R.weekToDoy(1)).toBe(1);
    expect(R.weekToDoy(38)).toBe(260);
  });

  it("formats a week range in Estonian", () => {
    expect(R.fmtRange({ a: 11, b: 17 })).toBe("12. märts – 29. apr");
  });

  it("detects the current week inside a window", () => {
    expect(R.isNow({ a: 34, b: 38 }, 38)).toBe(true);
  });

  it("handles winter windows that wrap the year end", () => {
    expect(R.isNowWinter({ a: 43, b: 15 }, 2)).toBe(true);
    expect(R.isNowWinter({ a: 43, b: 15 }, 30)).toBe(false);
  });
});
