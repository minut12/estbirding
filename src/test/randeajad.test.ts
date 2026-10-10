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
  fillGaps: (result: Record<string, unknown>, curated: Curated | null) => Record<string, unknown>;
};

type Half = number[] | null;
type Nb = { spring: Half; autumn: Half; springCc?: string; autumnCc?: string };
type Curated = { spring: Half; autumn: Half; ee?: { spring: Half; autumn: Half }; src?: string; nb?: Nb };

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

describe("P116 fillGaps (curated windows fill what the data cannot show)", () => {
  const R = loadRandeajad().fromWindow;
  const dataSpring = { a: 18, b: 21, pk: 20 };

  it("fills a missing autumn and keeps the data spring", () => {
    const res = R.fillGaps({ kind: "migrant", spring: dataSpring, autumn: null }, { spring: [10, 12], autumn: [39, 40] });
    expect(res).toEqual({ kind: "migrant", spring: dataSpring, autumn: { a: 39, b: 40, manual: true } });
  });

  it("fills a diffuse half", () => {
    const res = R.fillGaps({ kind: "migrant", spring: dataSpring, autumn: { diffuse: true } }, { spring: null, autumn: [40, 44] });
    expect(res.autumn).toEqual({ a: 40, b: 44, manual: true });
  });

  it("never replaces a data window", () => {
    const input = { kind: "migrant", spring: dataSpring, autumn: { a: 36, b: 39, pk: 37 } };
    expect(R.fillGaps(input, { spring: [10, 12], autumn: [40, 41] })).toBe(input);
  });

  it("keeps a gap when the curated half is null", () => {
    const input = { kind: "migrant", spring: dataSpring, autumn: null };
    expect(R.fillGaps(input, { spring: [10, 12], autumn: null })).toBe(input);
  });

  it("keeps few for a curated entry without ee (vagrants)", () => {
    const few = { kind: "few" };
    expect(R.fillGaps(few, { spring: [17, 24], autumn: null })).toBe(few);
  });

  it("turns few into a migrant from the ee windows only (not the top-level Euroopa ones)", () => {
    expect(R.fillGaps({ kind: "few" }, { spring: [15, 22], autumn: [36, 42], ee: { spring: null, autumn: [40, 41] } })).toEqual({
      kind: "migrant",
      spring: null,
      autumn: { a: 40, b: 41, manual: true },
      fromFew: true,
    });
  });

  it("leaves resident and winter results alone", () => {
    const resident = { kind: "resident" };
    const winter = { kind: "winter", winter: { a: 45, b: 10 } };
    expect(R.fillGaps(resident, { spring: [10, 12], autumn: [40, 41] })).toBe(resident);
    expect(R.fillGaps(winter, { spring: [10, 12], autumn: [40, 41] })).toBe(winter);
  });

  it("ignores missing or malformed curated entries", () => {
    const few = { kind: "few" };
    expect(R.fillGaps(few, null)).toBe(few);
    expect(R.fillGaps(few, { spring: null, autumn: null, ee: { spring: [12, 10], autumn: [40, 60] } })).toBe(few);
  });

  it("manual windows format and count as now like data windows", () => {
    const win = { a: 40, b: 41 };
    expect(R.fmtRange(win)).toBe("1. okt \u2013 14. okt");
    expect(R.isNow(win, 41)).toBe(true);
  });
});

describe("P117 neighbour-country eBird windows (nb)", () => {
  const R = loadRandeajad().fromWindow;
  const nb = { spring: null, autumn: [39, 41], autumnCc: "FI" };

  it("fills a migrant gap last, tagged src ebird with the countries", () => {
    const res = R.fillGaps({ kind: "migrant", spring: { a: 18, b: 21, pk: 20 }, autumn: null }, { spring: null, autumn: null, nb });
    expect(res.autumn).toEqual({ a: 39, b: 41, manual: true, src: "ebird", cc: "FI" });
  });

  it("Estonian curated windows win over nb", () => {
    const res = R.fillGaps({ kind: "migrant", spring: null, autumn: null }, { spring: null, autumn: [36, 38], nb });
    expect(res.autumn).toEqual({ a: 36, b: 38, manual: true });
  });

  it("ee wins over nb for few; nb fills the empty ee half", () => {
    const res = R.fillGaps({ kind: "few" }, { spring: null, autumn: null, ee: { spring: [17, 20], autumn: null }, nb });
    expect(res.spring).toEqual({ a: 17, b: 20, manual: true });
    expect(res.autumn).toEqual({ a: 39, b: 41, manual: true, src: "ebird", cc: "FI" });
  });

  it("turns a vagrant few into a migrant only from nb", () => {
    const res = R.fillGaps({ kind: "few" }, { spring: [15, 22], autumn: null, nb: { spring: null, autumn: [43, 46], autumnCc: "FI+SE" } });
    expect(res).toEqual({ kind: "migrant", spring: null, autumn: { a: 43, b: 46, manual: true, src: "ebird", cc: "FI+SE" }, fromFew: true });
  });

  it("drops a malformed country list (it is inserted into HTML)", () => {
    const res = R.fillGaps({ kind: "few" }, { spring: null, autumn: null, nb: { spring: null, autumn: [40, 41], autumnCc: "<b>FI" } });
    expect(res.autumn).toMatchObject({ src: "ebird", cc: "" });
  });
});

describe("P116 migration-windows.json", () => {
  const raw = JSON.parse(fs.readFileSync(path.resolve("public/maps/shared/migration-windows.json"), "utf8")) as {
    species: Record<string, Curated>;
  };
  const entries = Object.entries(raw.species);

  it("every window is [a, b] with 1 <= a <= b <= 52", () => {
    const bad = entries.flatMap(([name, e]) =>
      (["spring", "autumn"] as const)
        .map((half) => ({ name, half, w: e[half] }))
        .filter(({ w }) => w !== null && !(Array.isArray(w) && w.length === 2 && w[0] >= 1 && w[0] <= w[1] && w[1] <= 52)),
    );
    expect(bad).toEqual([]);
  });

  it("holds Kristian's examples", () => {
    expect(raw.species["Koldvint"].autumn).toEqual([39, 40]);
    expect(raw.species["K\u00e4blik"].autumn).toEqual([40, 44]);
    expect(raw.species["Liiv-kivit\u00e4ks"].autumn).toEqual([40, 41]);
    expect(raw.species["Liiv-kivit\u00e4ks"].ee).toEqual({ spring: null, autumn: [40, 41] });
  });

  it("Linnuliigid estimates are at most 4 weeks (K\u00e4blik October is Kristian's own)", () => {
    const allow = new Set(["K\u00e4blik"]);
    const wide = entries.flatMap(([name, e]) => {
      const halves: Half[] = [
        ...(e.ee ? [e.ee.spring, e.ee.autumn] : []),
        ...(e.nb ? [e.nb.spring, e.nb.autumn] : []),
        ...(e.src === "elurikkus" ? [e.spring, e.autumn] : []),
      ];
      return halves.filter((w): w is number[] => Array.isArray(w) && w[1] - w[0] + 1 > 4 && !allow.has(name)).map((w) => `${name} ${w.join("-")}`);
    });
    expect(wide).toEqual([]);
  });
});
