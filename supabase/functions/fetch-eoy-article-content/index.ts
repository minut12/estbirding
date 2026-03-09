import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Tags we keep in the sanitized output ──────── */
const ALLOWED_TAGS = new Set([
  "p", "a", "ul", "ol", "li", "strong", "em", "img",
  "h1", "h2", "h3", "blockquote", "br", "figure", "figcaption",
  "div", "iframe", "video", "source", "embed", "object",
]);

/* ── Footer headings that signal end of article ── */
const STOP_HEADINGS = [
  "märksõnad", "meist", "kasulikku", "toeta",
  "sündmus", "liitu uudiskirjaga", "jaga",
];

function isStopHeading(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return STOP_HEADINGS.some((s) => lower.includes(s));
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeUrl(value: string | null | undefined): boolean {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("/")) return true;
  return /^https?:\/\//i.test(trimmed);
}

function keepClassAttr(node: Element): string {
  const className = node.getAttribute("class");
  return className ? ` class="${escapeAttribute(className)}"` : "";
}

/* ── Sanitize: keep only allowed tags ──────────── */
function sanitizeNode(node: Element): string {
  const tag = node.tagName.toLowerCase();

  // Skip dangerous tags entirely
  if (["script", "style", "nav", "header", "footer", "form"].includes(tag)) {
    return "";
  }

  // For allowed tags, render them; otherwise just render children
  const childrenHtml = Array.from(node.childNodes)
    .map((child) => {
      if (child.nodeType === 3) return child.textContent || ""; // text node
      if (child.nodeType === 1) return sanitizeNode(child as Element);
      return "";
    })
    .join("");

  if (ALLOWED_TAGS.has(tag)) {
    // Keep only safe, explicit attributes for supported content tags.
    let attrs = "";
    if (tag === "a") {
      const href = (node as Element).getAttribute("href");
      if (isSafeUrl(href)) attrs = ` href="${escapeAttribute(href!)}" target="_blank" rel="noopener noreferrer"`;
    } else if (tag === "img") {
      const src = (node as Element).getAttribute("src");
      const alt = (node as Element).getAttribute("alt") || "";
      if (isSafeUrl(src)) attrs = ` src="${escapeAttribute(src!)}" alt="${escapeAttribute(alt)}" loading="lazy"`;
      else return ""; // skip images without src
    } else if (tag === "iframe") {
      const src = node.getAttribute("src");
      if (!isSafeUrl(src)) return "";
      const title = node.getAttribute("title") || "Embedded media";
      const allow = node.getAttribute("allow");
      const loading = node.getAttribute("loading") || "lazy";
      const referrerPolicy = node.getAttribute("referrerpolicy");
      const allowFullscreen = node.getAttribute("allowfullscreen") !== null ? " allowfullscreen" : "";
      attrs = ` src="${escapeAttribute(src!)}" title="${escapeAttribute(title)}" loading="${escapeAttribute(loading)}"${allow ? ` allow="${escapeAttribute(allow)}"` : ""}${referrerPolicy ? ` referrerpolicy="${escapeAttribute(referrerPolicy)}"` : ""}${allowFullscreen}${keepClassAttr(node)}`;
    } else if (tag === "video") {
      const src = node.getAttribute("src");
      const poster = node.getAttribute("poster");
      const preload = node.getAttribute("preload");
      const controls = " controls";
      const playsInline = " playsinline";
      const muted = node.getAttribute("muted") !== null ? " muted" : "";
      const loop = node.getAttribute("loop") !== null ? " loop" : "";
      attrs = `${src && isSafeUrl(src) ? ` src="${escapeAttribute(src)}"` : ""}${poster && isSafeUrl(poster) ? ` poster="${escapeAttribute(poster)}"` : ""}${preload ? ` preload="${escapeAttribute(preload)}"` : ""}${controls}${playsInline}${muted}${loop}${keepClassAttr(node)}`;
    } else if (tag === "source") {
      const src = node.getAttribute("src");
      if (!isSafeUrl(src)) return "";
      const type = node.getAttribute("type");
      attrs = ` src="${escapeAttribute(src!)}"${type ? ` type="${escapeAttribute(type)}"` : ""}`;
    } else if (tag === "embed") {
      const src = node.getAttribute("src");
      if (!isSafeUrl(src)) return "";
      const type = node.getAttribute("type");
      attrs = ` src="${escapeAttribute(src!)}"${type ? ` type="${escapeAttribute(type)}"` : ""}${keepClassAttr(node)}`;
    } else if (tag === "object") {
      const data = node.getAttribute("data");
      if (!isSafeUrl(data)) return "";
      const type = node.getAttribute("type");
      attrs = ` data="${escapeAttribute(data!)}"${type ? ` type="${escapeAttribute(type)}"` : ""}${keepClassAttr(node)}`;
    } else if (["div", "figure", "blockquote"].includes(tag)) {
      attrs = keepClassAttr(node);
    }

    // Self-closing tags
    if (tag === "br" || tag === "img" || tag === "source" || tag === "embed") return `<${tag}${attrs} />`;
    return `<${tag}${attrs}>${childrenHtml}</${tag}>`;
  }

  // Not allowed tag — just return children text
  return childrenHtml;
}

/* ── Extract article body from EOÜ page HTML ───── */
function extractArticleBody(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return null;

  // EOÜ structure: div.entry.clearfix > div.small-thumbs > [entry-title with H1, entry-image, p, p, ...]
  // Find the main content container
  const entry = doc.querySelector("div.entry.clearfix") || doc.querySelector("div.small-thumbs");
  if (!entry) {
    // Fallback: just find H1
    const h1 = doc.querySelector("h1");
    if (!h1) return null;
    return `<h1>${h1.textContent?.trim()}</h1>`;
  }

  const parts: string[] = [];

  // Walk all child nodes of the entry container (or its inner small-thumbs)
  const container = entry.querySelector("div.small-thumbs") || entry;
  const children = Array.from(container.children);

  for (const child of children) {
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    const text = el.textContent || "";

    // Extract title from entry-title div
    if (el.className?.includes?.("entry-title") || el.classList?.contains?.("entry-title")) {
      const h1 = el.querySelector("h1");
      if (h1) parts.push(`<h1>${h1.textContent?.trim()}</h1>`);
      continue;
    }

    // Skip entry-image div (we already have image_url from listing)
    if (el.className?.includes?.("entry-image")) continue;

    // Skip portfolio/related content sections
    if (el.className?.includes?.("portfolio") || el.id === "portfolio") continue;

    // Stop at "Samal teemal" or other footer headings
    if (["h2", "h3", "h4"].includes(tag) || el.querySelector?.("h2,h3")) {
      const headingText = text.toLowerCase();
      if (isStopHeading(headingText) || headingText.includes("samal teemal")) break;
    }
    if (el.className?.includes?.("entry-title") && text.toLowerCase().includes("samal teemal")) break;

    // Skip contact blocks
    if (text.includes("eoy@eoy.ee") || text.includes("Veski 4")) continue;

    // Process content elements (p, ul, ol, blockquote, etc.)
    if (["p", "ul", "ol", "blockquote", "h2", "h3", "figure", "iframe", "video", "embed", "object"].includes(tag) || (tag === "div" && hasEmbeddableMedia(el))) {
      const sanitized = sanitizeNode(el);
      if (sanitized.trim() && sanitized.trim() !== "<p></p>") parts.push(sanitized);
    } else if (tag === "div") {
      // Check for nested headings that signal end
      const innerHeading = el.querySelector("h2, h3");
      if (innerHeading) {
        const ht = innerHeading.textContent?.toLowerCase() || "";
        if (isStopHeading(ht) || ht.includes("samal teemal")) break;
      }
      // Extract paragraphs from generic divs
      const innerPs = el.querySelectorAll("p");
      for (const p of innerPs) {
        const sanitized = sanitizeNode(p as Element);
        if (sanitized.trim() && sanitized.trim() !== "<p></p>") parts.push(sanitized);
      }
    }
  }

  // Must have more than just the title
  if (parts.length <= 1) return null;

  return parts.join("\n");
}

function hasEmbeddableMedia(el: Element): boolean {
  return Boolean(el.querySelector("iframe, video, embed, object, blockquote"))
    || ["iframe", "video", "embed", "object", "blockquote"].includes(el.tagName.toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { news_item_id } = await req.json();
    if (!news_item_id) {
      return new Response(
        JSON.stringify({ error: "news_item_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get the news item
    const { data: item, error: itemErr } = await supabase
      .from("news_items")
      .select("id, url, content_html, content_fetched_at")
      .eq("id", news_item_id)
      .single();

    if (itemErr || !item) {
      return new Response(
        JSON.stringify({ error: "News item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If already fetched, return cached
    if (item.content_html && item.content_fetched_at) {
      return new Response(
        JSON.stringify({ content_html: item.content_html }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch the article page
    console.log("Fetching article:", item.url);
    const res = await fetch(item.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" },
    });

    if (!res.ok) {
      const errMsg = `Failed to fetch article: ${res.status}`;
      await supabase.from("news_items").update({
        content_fetch_error: errMsg,
        content_fetched_at: new Date().toISOString(),
      }).eq("id", news_item_id);

      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const html = await res.text();
    const content_html = extractArticleBody(html);

    if (!content_html) {
      const errMsg = "Could not extract article body (no H1 found or empty content)";
      await supabase.from("news_items").update({
        content_fetch_error: errMsg,
        content_fetched_at: new Date().toISOString(),
      }).eq("id", news_item_id);

      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Store the extracted content
    await supabase.from("news_items").update({
      content_html,
      content_fetched_at: new Date().toISOString(),
      content_fetch_error: null,
    }).eq("id", news_item_id);

    console.log("Article content extracted successfully for:", news_item_id);

    return new Response(
      JSON.stringify({ content_html }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("fetch-eoy-article-content error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
