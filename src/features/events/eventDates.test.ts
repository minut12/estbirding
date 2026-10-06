import { describe, it, expect } from "vitest";
import { buildDateLines } from "@/features/events/eventDates";

const EN_DASH = String.fromCharCode(0x2013);

describe("buildDateLines", () => {
  it("formats a same-day range as a time span", () => {
    const result = buildDateLines("2026-10-10T09:00:00+03:00", "2026-10-10T12:30:00+03:00");
    expect(result).not.toBeNull();
    expect(result?.secondary).toContain(`09:00${EN_DASH}12:30`);
    expect(result?.times).toBe(`09:00${EN_DASH}12:30`);
  });

  it("formats a multi-day range as a date span", () => {
    const result = buildDateLines("2026-10-10T09:00:00+03:00", "2026-10-12T18:00:00+03:00");
    expect(result).not.toBeNull();
    const primary = result?.primary ?? "";
    expect(primary).toMatch(/10\./);
    expect(primary).toMatch(/12\./);
    expect(primary).toContain(EN_DASH);
  });

  it("returns null for an invalid start", () => {
    expect(buildDateLines("nope", undefined)).toBeNull();
  });
});
