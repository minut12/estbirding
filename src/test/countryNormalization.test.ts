import { describe, expect, it } from "vitest";

import { normalizeCountryToIso2 } from "@/lib/countryNormalization";

describe("normalizeCountryToIso2", () => {
  it("normalizes Latvia aliases to LV", () => {
    expect(normalizeCountryToIso2("Latvia")).toBe("LV");
    expect(normalizeCountryToIso2("Latvija")).toBe("LV");
    expect(normalizeCountryToIso2("Läti")).toBe("LV");
  });

  it("returns uppercase for unknown country names", () => {
    expect(normalizeCountryToIso2("Estonia")).toBe("ESTONIA");
  });
});
