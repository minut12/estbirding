// news-translate-v2 / leftover.test.ts
// Imports leftover.ts only -- never index.ts, whose top-level Deno.serve()
// would start a server inside `deno test`.
//
// Run: deno test supabase/functions/news-translate-v2/leftover.test.ts

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.19";
import { leftoverError, leftoverSentences } from "./leftover.ts";

const SRC = "Muuttolintujen havainnot jatkuvat edelleen runsaina koko maassa. " +
  "Hangon lintuasemalla nahtiin aavikkotasku sunnuntaina. " +
  "Lintutilanne julkaistaan jatkossa noin kahden viikon valein. " +
  "Lisatietoja https://www.birdlife.fi/lintutilanne/havainnot-jatkuvat-runsaina";

Deno.test("flags a sentence copied from the source", () => {
  const et = "Lindude ranne jatkub kogu riigis. " +
    "Lintutilanne julkaistaan jatkossa noin kahden viikon valein.";
  assertEquals(leftoverSentences(SRC, et), [
    "Lintutilanne julkaistaan jatkossa noin kahden viikon valein.",
  ]);
});

Deno.test("a real translation sharing names and links passes", () => {
  const et = "Randlindude vaatlusi tuleb kogu maal endiselt rohkesti. " +
    "Hanko linnujaamas nahti puhapaeval korbe-kivitaksi (aavikkotasku). " +
    "Lisainfo https://www.birdlife.fi/lintutilanne/havainnot-jatkuvat-runsaina";
  assertEquals(leftoverSentences(SRC, et), []);
});

Deno.test("parenthesised source words do not count", () => {
  const et = "Nahti haruldast lindu (aavikkotasku havainnot jatkuvat runsaina).";
  assertEquals(leftoverSentences(SRC, et), []);
});

Deno.test("short sentences and capitalised words are not judged", () => {
  assertEquals(leftoverSentences(SRC, "Havainnot jatkuvat edelleen."), []);
  assertEquals(
    leftoverSentences(SRC, "Muuttolintujen Havainnot Jatkuvat Edelleen Runsaina."),
    [],
  );
});

Deno.test("empty inputs give no flags", () => {
  assertEquals(leftoverSentences(null, "Midagi siin on."), []);
  assertEquals(leftoverSentences(SRC, ""), []);
});

Deno.test("error text names the count and the first sentence", () => {
  const msg = leftoverError(["Yksi kaksi kolme nelja.", "Toinen lause"]);
  assertStringIncludes(msg, "leftover source text: 2 sentence(s)");
  assertStringIncludes(msg, "Yksi kaksi kolme nelja.");
});
