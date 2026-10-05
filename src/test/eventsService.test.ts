import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/supabaseClient", () => ({ supabase: {} }));

import {
  EventFromUrlError,
  normalizeType,
  parseEventFromUrlResponse,
} from "@/features/events/eventsService";

describe("normalizeType", () => {
  it("keeps eoy and muud", () => {
    expect(normalizeType("eoy")).toBe("eoy");
    expect(normalizeType("muud")).toBe("muud");
  });

  it("is case-insensitive", () => {
    expect(normalizeType("EOY")).toBe("eoy");
    expect(normalizeType("Muud")).toBe("muud");
  });

  it("maps estbirding, unknown, null and undefined to estbirding", () => {
    expect(normalizeType("estbirding")).toBe("estbirding");
    expect(normalizeType("muu")).toBe("estbirding");
    expect(normalizeType("something")).toBe("estbirding");
    expect(normalizeType(null)).toBe("estbirding");
    expect(normalizeType(undefined)).toBe("estbirding");
  });
});

const fullResponse = {
  ok: true,
  url: "https://eoy.ee/syndmus/123",
  host: "eoy.ee",
  source_hint: "eoy",
  extraction: "jsonld",
  fields: {
    title: "Linnuretk Matsalus",
    starts_at: "2026-10-12T09:00:00+03:00",
    ends_at: "2026-10-12T14:00:00+03:00",
    location_name: "Penijoe mois",
    lat: 58.736,
    lon: 23.814,
    description: "Sugisrande vaatlus.",
    image_url: "https://eoy.ee/img/123.jpg",
  },
  warnings: ["body_truncated"],
};

describe("parseEventFromUrlResponse", () => {
  it("parses a valid full response", () => {
    const result = parseEventFromUrlResponse(fullResponse);
    expect(result.ok).toBe(true);
    expect(result.source_hint).toBe("eoy");
    expect(result.extraction).toBe("jsonld");
    expect(result.fields).toEqual(fullResponse.fields);
    expect(result.warnings).toEqual(["body_truncated"]);
    expect(result.url).toBe("https://eoy.ee/syndmus/123");
  });

  it("parses a response with all-null fields", () => {
    const result = parseEventFromUrlResponse({
      ok: true,
      url: "https://www.facebook.com/events/1",
      host: "www.facebook.com",
      source_hint: "muu",
      extraction: "og-only",
      fields: {
        title: null,
        starts_at: null,
        ends_at: null,
        location_name: null,
        lat: null,
        lon: null,
        description: null,
        image_url: null,
      },
      warnings: ["facebook_og_only"],
    });
    expect(result.source_hint).toBe("muu");
    expect(result.extraction).toBe("og-only");
    expect(Object.values(result.fields).every((v) => v === null)).toBe(true);
    expect(result.warnings).toEqual(["facebook_og_only"]);
  });

  it("accepts the facebook extraction with page coordinates", () => {
    const result = parseEventFromUrlResponse({
      ...fullResponse,
      extraction: "facebook",
      fields: { ...fullResponse.fields, lat: 59.42003, lon: 24.80479 },
      warnings: ["facebook_full"],
    });
    expect(result.extraction).toBe("facebook");
    expect(result.fields.lat).toBe(59.42003);
    expect(result.warnings).toEqual(["facebook_full"]);
  });

  it("drops non-string warnings and defaults a missing warnings array to []", () => {
    expect(parseEventFromUrlResponse({ ...fullResponse, warnings: ["a", 1, null] }).warnings).toEqual(["a"]);
    const { warnings: _omit, ...noWarnings } = fullResponse;
    expect(parseEventFromUrlResponse(noWarnings).warnings).toEqual([]);
  });

  it("rejects malformed input", () => {
    expect(() => parseEventFromUrlResponse(null)).toThrow(EventFromUrlError);
    expect(() => parseEventFromUrlResponse("nope")).toThrow(EventFromUrlError);
    expect(() => parseEventFromUrlResponse({ ok: false, error: "forbidden" })).toThrow(EventFromUrlError);
    expect(() => parseEventFromUrlResponse({ ...fullResponse, extraction: "magic" })).toThrow(/extraction/);
    expect(() => parseEventFromUrlResponse({ ...fullResponse, source_hint: "muud" })).toThrow(/source_hint/);
    expect(() => parseEventFromUrlResponse({ ...fullResponse, fields: null })).toThrow(/fields/);
    expect(() =>
      parseEventFromUrlResponse({ ...fullResponse, fields: { ...fullResponse.fields, lat: "58.7" } }),
    ).toThrow(/lat/);
    expect(() =>
      parseEventFromUrlResponse({ ...fullResponse, fields: { ...fullResponse.fields, title: 42 } }),
    ).toThrow(/title/);
  });

  it("carries a status on EventFromUrlError", () => {
    const err = new EventFromUrlError(403, "forbidden");
    expect(err.status).toBe(403);
    expect(err.message).toBe("forbidden");
    expect(err).toBeInstanceOf(Error);
  });
});
