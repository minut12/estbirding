// P86e: glossary-pass gate and user message
// (supabase/functions/_shared/news-glossary.ts). Sentences follow the shape of
// the real news_items drafts used in bird-names.test.ts.

import { describe, expect, it } from "vitest";
import type {
  GlossaryEntry,
  ItemText,
} from "../../../../supabase/functions/_shared/bird-names.ts";
import {
  acceptGlossaryOutput,
  buildGlossaryUserMsg,
} from "../../../../supabase/functions/_shared/news-glossary.ts";

const GLOSSARY: GlossaryEntry[] = [
  { latin: "Circus macrourus", et: "stepi-loorkull" },
  { latin: "Falco eleonorae", et: "vahemere pistrik" },
];

const item = (title: string, body: string): ItemText => ({ title, body });

describe("acceptGlossaryOutput (AG1-AG9)", () => {
  it("AG1 accepts an inflection fix and trims the output", () => {
    const before = item(
      "Stepi-loorkull Eestis",
      "Eestis algas stepi-loorkull (Circus macrourus) sisseränne.",
    );
    const after = item(
      "  Stepi-loorkulli sisseränne Eestis ",
      " Eestis algas stepi-loorkulli (Circus macrourus) sisseränne.\n",
    );
    expect(acceptGlossaryOutput(before, after, GLOSSARY)).toEqual({
      ok: true,
      item: {
        title: "Stepi-loorkulli sisseränne Eestis",
        body: "Eestis algas stepi-loorkulli (Circus macrourus) sisseränne.",
      },
    });
  });

  it("AG2 rejects a body shorter than 0.7x", () => {
    const before = item("Pealkiri", "a".repeat(100));
    expect(acceptGlossaryOutput(before, item("Pealkiri", "a".repeat(69)), GLOSSARY))
      .toEqual({ ok: false, reason: "body_too_short" });
  });

  it("AG3 rejects a body longer than 1.5x", () => {
    const before = item("Pealkiri", "a".repeat(100));
    expect(acceptGlossaryOutput(before, item("Pealkiri", "a".repeat(151)), GLOSSARY))
      .toEqual({ ok: false, reason: "body_too_long" });
  });

  it("AG4 rejects a glossary binomial that was present before and is gone after", () => {
    const before = item(
      "Vahemere pistrik Poolas",
      "Nähti vahemere pistrik (Falco eleonorae) ja stepi-loorkull.",
    );
    const after = item(
      "Vahemere pistrik Poolas",
      "Nähti vahemere pistrik ja stepi-loorkull Poolas.",
    );
    expect(acceptGlossaryOutput(before, after, GLOSSARY))
      .toEqual({ ok: false, reason: "latin_missing:Falco eleonorae" });
  });

  it("AG5 does not require a glossary binomial that only the source had", () => {
    // Falco eleonorae is in GLOSSARY (collected from the source) but in neither draft.
    const before = item("Stepi-loorkull Eestis", "Eestis nähti stepi-loorkull (Circus macrourus).");
    const after = item("Stepi-loorkull Eestis", "Eestis nähti stepi-loorkulli (Circus macrourus).");
    expect(acceptGlossaryOutput(before, after, GLOSSARY).ok).toBe(true);
  });

  it("AG6 rejects a whitespace-only title", () => {
    const before = item("Pealkiri", "Eestis nähti stepi-loorkull (Circus macrourus).");
    expect(acceptGlossaryOutput(before, item("  \n ", before.body), GLOSSARY))
      .toEqual({ ok: false, reason: "empty_title" });
  });

  it("AG7 matches the Latin name ignoring case and whitespace", () => {
    const before = item("Pistrik", "Nähti vahemere pistrik (Falco eleonorae).");
    const after = item("Pistrik", "Nähti vahemere pistrikku (falco  eleonorae).");
    expect(acceptGlossaryOutput(before, after, GLOSSARY).ok).toBe(true);
  });

  it("AG8 skips the ratio check for an empty before body", () => {
    const before = item("Vahemere pistrik (Falco eleonorae)", "  ");
    const after = item("Vahemere pistrik (Falco eleonorae)", "Pikk uus sisu, mida enne polnud.");
    expect(acceptGlossaryOutput(before, after, GLOSSARY).ok).toBe(true);
  });

  it("AG9 accepts a photo-post title moved into the body", () => {
    const body =
      "Eile õhtul nähti Pärnu lahel vahemere pistrikku (Falco eleonorae), kes jahtis kiile. " +
      "Lind viibis piirkonnas ligi tund aega ja lendas seejärel lõuna suunas. Vaatlejad said head fotod.";
    expect(body.length).toBeGreaterThan(150);
    const before = item("Fotod Jaan Tamme postitusest", body);
    const after = item("Vahemere pistrik Pärnu lahel", "Fotod Jaan Tamme postitusest. " + body);
    expect(acceptGlossaryOutput(before, after, GLOSSARY)).toEqual({
      ok: true,
      item: {
        title: "Vahemere pistrik Pärnu lahel",
        body: "Fotod Jaan Tamme postitusest. " + body,
      },
    });
  });
});

describe("buildGlossaryUserMsg (GM1-GM2)", () => {
  it("GM1 builds the exact message with glossary lines in order", () => {
    const msg = buildGlossaryUserMsg(
      item("Pallid Harrier in Estonia", "A Pallid Harrier (Circus macrourus) arrived."),
      item("Stepi-loorkull Eestis", "Saabus stepi-loorkull (Circus macrourus)."),
      GLOSSARY,
    );
    expect(msg).toBe(
      "Toimeta jargnev tolge. Vasta TAPSELT vormis ###TITLE### ja ###BODY###, ilma muu tekstita.\n\n" +
        "LIIGISONASTIK:\n" +
        "- Circus macrourus = stepi-loorkull\n" +
        "- Falco eleonorae = vahemere pistrik\n\n" +
        "ALGNE PEALKIRI:\nPallid Harrier in Estonia\n\n" +
        "ALGNE SISU:\nA Pallid Harrier (Circus macrourus) arrived.\n\n" +
        "TOLKE PEALKIRI:\nStepi-loorkull Eestis\n\n" +
        "TOLKE SISU:\nSaabus stepi-loorkull (Circus macrourus).",
    );
  });

  it("GM2 renders a null source title/body as '' and not \"null\"", () => {
    // ItemText forbids null; a DB row can still carry one at runtime, so the
    // fixture is parsed JSON narrowed to ItemText (no `any`).
    const nullish = JSON.parse('{"title":null,"body":null}') as ItemText;
    const msg = buildGlossaryUserMsg(nullish, item("T", "B"), GLOSSARY);
    expect(msg).not.toContain("null");
    expect(msg).toContain("ALGNE PEALKIRI:\n\n\nALGNE SISU:\n\n\nTOLKE PEALKIRI:\nT");
  });
});
