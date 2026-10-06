import { describe, expect, it } from "vitest";
import type { EventItem } from "@/data/events";
import { buildEventIcs } from "./ics";

const NOW = new Date("2026-10-06T08:00:00.000Z");

function makeEvent(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: "evt-1",
    title: "Linnuretk",
    startAt: "2026-10-10T07:30:00.000Z",
    locationName: "Matsalu",
    lat: 58.7,
    lng: 23.6,
    category: "EstBirding",
    imageUrl: "",
    ...overrides,
  };
}

function octets(line: string): number {
  return new TextEncoder().encode(line).length;
}

function physicalLines(ics: string): string[] {
  return ics.split("\r\n").filter((line) => line.length > 0);
}

function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

function propertyValue(ics: string, name: string): string | undefined {
  const line = unfold(ics)
    .split("\r\n")
    .find((l) => l.startsWith(`${name}:`));
  return line?.slice(name.length + 1);
}

describe("buildEventIcs", () => {
  it("escapes comma, semicolon, newline and backslash in TEXT values", () => {
    const ics = buildEventIcs(
      makeEvent({ title: "A, B; C\\D", description: "rida 1\nrida 2\r\nrida 3" }),
      NOW,
    );
    expect(propertyValue(ics, "SUMMARY")).toBe("A\\, B\\; C\\\\D");
    expect(propertyValue(ics, "DESCRIPTION")).toBe("rida 1\\nrida 2\\nrida 3");
  });

  it("defaults DTEND to start + 2 h when endAt is missing", () => {
    const ics = buildEventIcs(makeEvent(), NOW);
    expect(propertyValue(ics, "DTSTART")).toBe("20261010T073000Z");
    expect(propertyValue(ics, "DTEND")).toBe("20261010T093000Z");
    expect(propertyValue(ics, "DTSTAMP")).toBe("20261006T080000Z");
  });

  it("uses endAt when it is after the start", () => {
    const ics = buildEventIcs(makeEvent({ endAt: "2026-10-10T12:00:00.000Z" }), NOW);
    expect(propertyValue(ics, "DTEND")).toBe("20261010T120000Z");
  });

  it("writes UID, URL and CRLF line endings", () => {
    const ics = buildEventIcs(makeEvent({ url: "https://example.com/e" }), NOW);
    expect(propertyValue(ics, "UID")).toBe("evt-1@estbirds");
    expect(propertyValue(ics, "URL")).toBe("https://example.com/e");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("truncates DESCRIPTION to the first 1000 characters", () => {
    const ics = buildEventIcs(makeEvent({ description: "x".repeat(1500) }), NOW);
    expect(propertyValue(ics, "DESCRIPTION")).toHaveLength(1000);
  });

  it("folds ASCII lines at 75 octets and unfolding restores the value", () => {
    const description = "a".repeat(300);
    const ics = buildEventIcs(makeEvent({ description }), NOW);
    for (const line of physicalLines(ics)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(propertyValue(ics, "DESCRIPTION")).toBe(description);
  });

  it("folds multi-byte text by octets without splitting a character", () => {
    const description = "\u00d5htune vaatlus \u00e4\u00e4realal, \u00fcle \u00f6\u00f6 \u0161okolaadiga ".repeat(8) + "\u{1F426}".repeat(30);
    const ics = buildEventIcs(makeEvent({ description, title: "\u00d6\u00f6biku \u00f6\u00f6 ".repeat(12) }), NOW);
    const lines = physicalLines(ics);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    for (const line of lines) {
      expect(octets(line)).toBeLessThanOrEqual(75);
      expect(line).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(line).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(propertyValue(ics, "DESCRIPTION")).toBe(description.replace(/,/g, "\\,"));
    expect(propertyValue(ics, "SUMMARY")).toBe("\u00d6\u00f6biku \u00f6\u00f6 ".repeat(12));
  });
});
