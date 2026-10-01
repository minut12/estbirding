// P86c2: pure news text helpers (src/features/news/newsText.ts) and the
// twin guard for supabase/functions/_shared/news-text.ts. Footer tails are
// verbatim from real news_items rows (body, body_et_v2, content_html).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FEED_FOOTER_EN_RE,
  FEED_FOOTER_TEXT_RE,
  FETCHRSS_ANCHOR_RE,
  firstSentence,
  getCanonicalSourceValue,
  stripFeedFooterHtml,
  stripFeedFooterText,
} from "../newsText";

describe("getCanonicalSourceValue", () => {
  it("prefers source_slug over source_key", () => {
    expect(getCanonicalSourceValue({ source_slug: "eoy", source_key: "eoy:https://example.org/x" })).toBe("eoy");
  });

  it("uses slug for source rows", () => {
    expect(getCanonicalSourceValue({ slug: "eoy", source_key: "eoy" })).toBe("eoy");
  });

  it("takes the source_key prefix before the first colon", () => {
    expect(getCanonicalSourceValue({ source_key: "birdlife_poland:uuid:123" })).toBe("birdlife_poland");
  });

  it("lowercases and trims", () => {
    expect(getCanonicalSourceValue({ slug: "  Birding_Poland " })).toBe("birding_poland");
  });

  it("returns empty string when nothing is set", () => {
    expect(getCanonicalSourceValue({})).toBe("");
  });
});

describe("stripFeedFooterText", () => {
  it("strips the English footer from an original body", () => {
    const body = "Rare gull photographed at Hel peninsula, found by Michał Zawadzki (Birding Poland) and Maciej Kowalski. (Feed generated with FetchRSS )";
    const out = stripFeedFooterText(body);
    expect(out).not.toMatch(/fetchrss/i);
    expect(out.endsWith("Kowalski.")).toBe(true);
    expect(out).toContain("Michał Zawadzki (Birding Poland)");
  });

  it("strips the Estonian 'teenusega' footer", () => {
    const body = "Tõmmukiur on ülemaailmselt ohustatud liik, kelle asurkond on viimaste aastakümnete jooksul kahanenud kuni 95%. (Voog on loodud teenusega FetchRSS.)";
    const out = stripFeedFooterText(body);
    expect(out).not.toMatch(/fetchrss/i);
    expect(out.endsWith("95%.")).toBe(true);
    expect(out).toContain("Tõmmukiur on ülemaailmselt");
  });

  it("strips the Estonian 'FetchRSS-iga' footer", () => {
    const body = "Võistlusel osalesid Samuel Sosnowski, Wojciech Siuda, Franciszek Jurewicz ja Paweł Borys. Õnnitlused! (Voog on loodud FetchRSS-iga.)";
    const out = stripFeedFooterText(body);
    expect(out).not.toMatch(/fetchrss/i);
    expect(out.endsWith("Õnnitlused!")).toBe(true);
    expect(out).toContain("Paweł Borys.");
  });

  it("keeps a FetchRSS parenthetical that is not at the end", () => {
    const text = "(FetchRSS) mid text continues here.";
    expect(stripFeedFooterText(text)).toBe(text);
  });

  it("leaves text without a footer unchanged", () => {
    const text = "Rabapüü (Lagopus lagopus) nähti Kõpu poolsaarel.";
    expect(stripFeedFooterText(text)).toBe(text);
  });

  it("returns empty string for null", () => {
    expect(stripFeedFooterText(null)).toBe("");
  });
});

describe("stripFeedFooterHtml", () => {
  it("removes the FetchRSS footer span with its anchor", () => {
    const html = '<p>Some text.</p><span style="font-size:12px; color: gray;">(Feed generated with <a href="https://fetchrss.com/feedLink?w=69d95c94eedf70148a05e8f2" target="_blank">FetchRSS</a>)</span>';
    const out = stripFeedFooterHtml(html);
    expect(out).not.toMatch(/fetchrss/i);
    expect(out).not.toContain("<span");
    expect(out).toContain("<p>Some text.</p>");
  });
});

describe("firstSentence", () => {
  it("cuts at the first period", () => {
    expect(firstSentence("Esimene lause. Teine lause.")).toBe("Esimene lause.");
  });

  it("cuts at the first question mark", () => {
    expect(firstSentence("Kas nägid? Jah.")).toBe("Kas nägid?");
  });

  it("does not cut inside a URL", () => {
    expect(firstSentence("Vaata https://birdlife.fi/x lisaks. Teine.")).toBe("Vaata https://birdlife.fi/x lisaks.");
  });

  it("caps long text without punctuation at 110 chars plus an ellipsis", () => {
    const long = "linnuvaatlus ".repeat(20).trim();
    const out = firstSentence(long);
    expect(out.length).toBe(111);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns empty string for empty and null", () => {
    expect(firstSentence("")).toBe("");
    expect(firstSentence(null)).toBe("");
  });
});

describe("twin guard: supabase/functions/_shared/news-text.ts", () => {
  const twin = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/news-text.ts"), "utf8");

  it.each([
    ["FEED_FOOTER_TEXT_RE", FEED_FOOTER_TEXT_RE],
    ["FEED_FOOTER_EN_RE", FEED_FOOTER_EN_RE],
    ["FETCHRSS_ANCHOR_RE", FETCHRSS_ANCHOR_RE],
  ])("contains %s verbatim", (name, re) => {
    expect(twin).toContain(re.source);
    expect(twin).toContain(`export const ${name} = /${re.source}/${re.flags};`);
  });
});
