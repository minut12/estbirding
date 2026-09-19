import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/P46-randeajad-fixtures.json";

type Pair = [number, number];
type Win = { a: number; b: number; pk?: number };
type Randeajad = {
  analyse: (pairs?: Pair[], opts?: { resident?: boolean }) => Record<string, unknown>;
  isResident: (name: string) => boolean;
  weekToDoy: (w: number) => number;
  fmtDoy: (doy: number) => string;
  fmtRange: (win: Win) => string;
  monthBuckets: (pairs: Pair[], result: Record<string, unknown>) => unknown;
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

const histograms = fixtures.histograms as unknown as Record<string, Pair[]>;
const expected = fixtures.expected as unknown as Record<string, Record<string, unknown>>;

describe("randeajad module", () => {
  const { fromWindow, fromModule } = loadRandeajad();
  const R = fromWindow;

  it("exposes analyse on both window.__bmRandeajad and module.exports", () => {
    expect(typeof fromWindow.analyse).toBe("function");
    expect(typeof fromModule.analyse).toBe("function");
  });

  describe("analyse() matches fixtures", () => {
    for (const species of Object.keys(expected)) {
      it(species, () => {
        expect(R.analyse(histograms[species])).toEqual(expected[species]);
      });
    }
  });

  it("curated resident list wins over data", () => {
    expect(R.analyse(histograms["Laanepüü"], { resident: true })).toEqual({ kind: "resident" });
  });

  it("few still wins over the curated resident list", () => {
    expect(R.analyse(histograms["Roherähn"], { resident: true })).toEqual({ kind: "few" });
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
