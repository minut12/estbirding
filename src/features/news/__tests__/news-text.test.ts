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
  it("appends the next sentence when the first is shorter than 25 chars", () => {
    expect(firstSentence("Esimene lause. Teine lause.")).toBe("Esimene lause. Teine lause.");
  });

  it("appends after a short question until the text ends", () => {
    expect(firstSentence("Kas nägid? Jah.")).toBe("Kas nägid? Jah.");
  });

  it("does not cut inside a URL", () => {
    expect(firstSentence("Vaata https://birdlife.fi/x lisaks. Teine.")).toBe("Vaata https://birdlife.fi/x lisaks.");
  });

  it("caps long text without punctuation at the last word boundary within 110 chars plus an ellipsis", () => {
    // Index 110 falls inside the 9th word, so the cut backs off to the space after the 8th word.
    const long = "linnuvaatlus ".repeat(20).trim();
    const out = firstSentence(long);
    expect(out).toBe(`${"linnuvaatlus ".repeat(8).trim()}…`);
    expect(out.length).toBe(104);
    expect(out.length).toBeLessThanOrEqual(111);
    expect(out.endsWith("…")).toBe(true);
  });

  it("falls back to a hard 110-char cut when the slice has no whitespace", () => {
    const out = firstSentence("x".repeat(200));
    expect(out).toBe(`${"x".repeat(110)}…`);
    expect(out.length).toBe(111);
  });

  it("extends a very short first sentence and caps at a word boundary", () => {
    const input =
      "MEGA! Tõenäoliselt Poola kuuenda leiuna nägid eile Mokra (opolskie vojevoodkond) piirkonnas liiki kuldtsiitsitaja, " +
      "kes toitus põllu servas koos talvikestega. Lind püsis kohal kogu pärastlõuna.";
    const out = firstSentence(input);
    expect(out).toBe(
      "MEGA! Tõenäoliselt Poola kuuenda leiuna nägid eile Mokra (opolskie vojevoodkond) piirkonnas liiki…",
    );
    expect(out.length).toBeLessThanOrEqual(111);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not end a sentence at an ordinal date range", () => {
    expect(
      firstSentence("Kas tuled kaasa Euroopa suurimale linnuüritusele 3.–4. oktoobril? EuroBirdwatch toimub üle Euroopa."),
    ).toBe("Kas tuled kaasa Euroopa suurimale linnuüritusele 3.–4. oktoobril?");
  });

  it("does not end a sentence at an ordinal day", () => {
    expect(firstSentence("Lind nähti 28. septembril Tartus. Teine lause.")).toBe("Lind nähti 28. septembril Tartus.");
  });

  it("keeps a single short sentence with nothing after it", () => {
    expect(firstSentence("Õnnitlused!")).toBe("Õnnitlused!");
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
