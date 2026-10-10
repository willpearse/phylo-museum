// Reading Wikipedia's taxonomy: the Template:Taxonomy/<name> pages behind
// every automatic taxobox (each names its parent, rank and whether it is
// extinct), and the taxobox of each taxon's article (fossil range, image,
// conservation status, species list).

import { boundMa } from "../../src/lib/geotime.ts";
import { getJson, pacer } from "./http.ts";
import type { ImageRef } from "../../src/lib/types.ts";

const API = "https://en.wikipedia.org/w/api.php";
const pace = pacer(3, 150);

function apiUrl(params: Record<string, string>): string {
  return `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
}

async function api<T>(params: Record<string, string>): Promise<T> {
  const body = await getJson<T>(apiUrl(params), { pace });
  if (!body) throw new Error(`Wikipedia API returned nothing for ${JSON.stringify(params)}`);
  return body;
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

// ---- wikitext templates ------------------------------------------------

/** Top-level `|key=value` parameters of the template starting at `from`
 *  (index of its "{{"), split on pipes outside nested {{…}} and [[…]]. */
export function templateParams(text: string, from: number): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0;
  let link = 0;
  let cur = "";
  const parts: string[] = [];
  for (let i = from; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === "{{") { depth++; i++; if (depth > 1) cur += two; continue; }
    if (two === "}}") { depth--; i++; if (depth === 0) { parts.push(cur); break; } cur += two; continue; }
    if (two === "[[") { link++; i++; cur += two; continue; }
    if (two === "]]") { link = Math.max(0, link - 1); i++; cur += two; continue; }
    if (text[i] === "|" && depth === 1 && link === 0) { parts.push(cur); cur = ""; continue; }
    cur += text[i];
  }
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) out[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return out;
}

/** Positional arguments of a small template body ("fossil range|48.7|45.4|ref=…"). */
function positional(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth--; cur += two; i++; continue; }
    if (body[i] === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += body[i];
  }
  out.push(cur);
  return out.slice(1).filter((a) => !a.includes("=")).map((a) => a.trim());
}

/** Inner text of every {{name …}} (case-insensitive, nested-aware). */
function templatesNamed(text: string, name: RegExp): string[] {
  const out: string[] = [];
  const re = /\{\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const head = text.slice(m.index + 2, m.index + 60);
    if (!name.test(head)) continue;
    let depth = 0;
    for (let i = m.index; i < text.length; i++) {
      if (text.startsWith("{{", i)) { depth++; i++; }
      else if (text.startsWith("}}", i)) { depth--; i++; if (depth === 0) { out.push(text.slice(m.index + 2, i - 1)); break; } }
    }
  }
  return out;
}

/** Strip refs, comments and markup to readable text. */
export function wikiPlain(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- fossil ranges -----------------------------------------------------

export interface FossilRange {
  start: number;
  end: number;
  text: string;
}

const RANGE_NAMES =
  /\b((?:early|middle|late|lower|upper|latest|earliest)\s+)?(Holocene|Pleistocene|Pliocene|Miocene|Oligocene|Eocene|Paleocene|Cretaceous|Quaternary|Neogene|Paleogene|Tarantian|Chibanian|Calabrian|Gelasian|Piacenzian|Zanclean|Messinian|Tortonian|Serravallian|Langhian|Burdigalian|Aquitanian|Chattian|Rupelian|Priabonian|Bartonian|Lutetian|Ypresian|Thanetian|Selandian|Danian|Maastrichtian|Recent|Present)\b/gi;

/** A taxobox `fossil_range` value -> first and last appearance (Ma).
 *  Prefers {{fossil range|a|b}}; falls back to the interval names in the text. */
export function parseFossilRange(raw: string | undefined): FossilRange | null {
  if (!raw) return null;
  const text = wikiPlain(raw.replace(/\{\{\s*(?:period )?fossil ?range[\s\S]*?\}\}/gi, "")).replace(/[,;(]\s*$/, "");
  for (const body of templatesNamed(raw, /^\s*fossil ?range\s*\|/i)) {
    const args = positional(body);
    const start = args[0] ? boundMa(args[0], "start") : null;
    if (start == null) continue;
    const end = args[1] ? boundMa(args[1], "end") : boundMa(args[0], "end");
    return { start, end: end ?? 0, text: text || rangeLabel(start, end ?? 0) };
  }
  const names = [...wikiPlain(raw).matchAll(RANGE_NAMES)].map((m) => m[0]);
  if (!names.length) return null;
  const start = boundMa(names[0], "start");
  const end = boundMa(names[names.length - 1], "end");
  if (start == null) return null;
  return { start, end: end ?? 0, text: text || names.join("–") };
}

function rangeLabel(start: number, end: number): string {
  return end > 0 ? `${start}–${end} Ma` : `${start} Ma – present`;
}

// ---- taxonomy templates --------------------------------------------------

export interface TaxonomyTemplate {
  id: string;
  rank: string;
  /** Article the taxon links to, and the text shown for it. */
  article: string | null;
  linkText: string;
  parent: string | null;
  extinct: boolean;
}

/** Fetch and parse Template:Taxonomy/<id> for each id (50 per request). */
export async function getTaxonomyTemplates(ids: string[]): Promise<Map<string, TaxonomyTemplate>> {
  const out = new Map<string, TaxonomyTemplate>();
  for (const batch of chunks(ids, 50)) {
    const data = await api<{ query: { pages: { title: string; missing?: boolean; revisions?: { slots: { main: { content: string } } }[] }[] } }>({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      titles: batch.map((id) => `Template:Taxonomy/${id}`).join("|"),
    });
    for (const p of data.query.pages) {
      const content = p.revisions?.[0]?.slots.main.content;
      if (!content) continue;
      const id = p.title.replace(/^Template:Taxonomy\//, "");
      const at = content.indexOf("{{");
      const params = at >= 0 ? templateParams(content, at) : {};
      // |link=Target|Shown splits into link=Target and an unnamed "Shown".
      const linkRaw = /\|\s*link\s*=\s*([^\n]*)/.exec(content)?.[1]?.trim() ?? "";
      const [target, shown] = linkRaw.split("|").map((s) => s.trim());
      out.set(id, {
        id,
        rank: (params.rank ?? "").toLowerCase(),
        article: target || null,
        linkText: shown || target || id,
        parent: params.parent?.trim() || null,
        extinct: /^(yes|true|y|1)$/i.test(params.extinct ?? ""),
      });
    }
  }
  return out;
}

/** Ids of the taxonomy templates whose parent may be `id`. A phrase search
 *  over template source ("parent" next to the name, whatever the spacing):
 *  CirrusSearch answers it from the index, so unlike a regex search it never
 *  times out into partial results. Callers confirm against each template's
 *  own parent. */
export async function getChildTemplateIds(id: string): Promise<string[]> {
  const out: string[] = [];
  let offset = "0";
  for (;;) {
    const data = await api<{ continue?: { sroffset: number }; query: { search: { title: string }[] } }>({
      action: "query",
      list: "search",
      srnamespace: "10",
      srlimit: "500",
      sroffset: offset,
      srprop: "",
      srsearch: `insource:"parent ${id.replace(/"/g, "")}" prefix:Template:Taxonomy/`, // prefix: must come last
    });
    out.push(...data.query.search.map((r) => r.title).filter((t) => t.startsWith("Template:Taxonomy/")).map((t) => t.replace(/^Template:Taxonomy\//, "")));
    if (!data.continue) break;
    offset = String(data.continue.sroffset);
  }
  return out;
}

// ---- articles ---------------------------------------------------------------

export interface Article {
  /** Title asked for, and the article it resolved to. */
  asked: string;
  title: string;
  url: string;
  /** Lead section (taxobox and intro). */
  wikitext: string;
  /** Whole article, for species lists kept out of the taxobox ("See text"). */
  full: string;
  pageviews: number;
  extract: string;
}

/** Lead wikitext, 60-day pageviews and plain-text intro of each article
 *  (redirects followed). Keyed by the title asked for. */
export async function getArticles(titles: string[]): Promise<Map<string, Article>> {
  const out = new Map<string, Article>();
  const unique = [...new Set(titles)];
  type Q = {
    query: {
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
      pages: { title: string; missing?: boolean; revisions?: { slots: { main: { content: string } } }[]; pageviews?: Record<string, number | null>; extract?: string }[];
    };
  };
  const resolve = (q: Q["query"], t: string) => {
    const n = q.normalized?.find((x) => x.from === t)?.to ?? t;
    return q.redirects?.find((x) => x.from === n)?.to ?? n;
  };
  // Lead section: rvsection works for one page at a time only, so whole
  // revisions in batches of 50, then cut at the first heading.
  for (const batch of chunks(unique, 25)) {
    const data = await api<Q>({
      action: "query",
      prop: "revisions|pageviews",
      rvprop: "content",
      rvslots: "main",
      pvipdays: "60",
      redirects: "1",
      titles: batch.join("|"),
    });
    const pages = new Map(data.query.pages.map((p) => [p.title, p]));
    for (const t of batch) {
      const p = pages.get(resolve(data.query, t));
      const content = p?.revisions?.[0]?.slots.main.content;
      if (!p || p.missing || !content) continue;
      const lead = content.split(/\n==[^=]/)[0];
      out.set(t, {
        asked: t,
        title: p.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
        wikitext: lead,
        full: content,
        pageviews: Object.values(p.pageviews ?? {}).reduce<number>((a, v) => a + (v ?? 0), 0),
        extract: "",
      });
    }
  }
  // Plain-text intros: the extracts API serves at most 20 per request.
  for (const batch of chunks([...out.values()], 20)) {
    const data = await api<Q>({
      action: "query",
      prop: "extracts",
      exintro: "1",
      explaintext: "1",
      exlimit: "20",
      titles: batch.map((a) => a.title).join("|"),
    });
    const pages = new Map(data.query.pages.map((p) => [p.title, p]));
    for (const a of batch) a.extract = (pages.get(a.title)?.extract ?? "").trim();
  }
  return out;
}

export interface Taxobox {
  params: Record<string, string>;
  range: FossilRange | null;
  imageFile: string | null;
  caption: string;
  status: string | null;
  extinct: boolean;
}

/** The article's automatic taxobox / speciesbox / taxobox, parsed. */
export function parseTaxobox(wikitext: string): Taxobox | null {
  const m = /\{\{\s*(automatic taxobox|speciesbox|subspeciesbox|taxobox|infraspeciesbox)\s*[\n|]/i.exec(wikitext);
  if (!m) return null;
  const params = templateParams(wikitext, m.index);
  const image = (params.image ?? "").replace(/^(file|image):/i, "").split("|")[0].trim();
  const status = (params.status ?? "").replace(/[^A-Za-z]/g, "").toUpperCase() || null;
  return {
    params,
    range: parseFossilRange(params.fossil_range),
    imageFile: image && /\.(jpe?g|png|gif|webp|tiff?|svg)$/i.test(image) ? image : null,
    caption: wikiPlain(params.image_caption ?? ""),
    status: status && /^(LC|NT|VU|EN|CR|EW|EX|DD|CD|LR)/.test(status) ? status.slice(0, 2) : null,
    extinct: /^(yes|true)$/i.test(params.extinct ?? "") || status === "EX" || status === "FOSSIL",
  };
}

export interface SpeciesLink {
  name: string;
  article: string | null;
  extinct: boolean;
}

const SPECIES_LINK = /(†\s*|\{\{\s*extinct\s*\}\}\s*)?'{2,3}\[\[([^|\]]+)(?:\|([^\]]+))?\]\]'{2,3}/g;

/** Species linked in a genus taxobox's `subdivision` ({{Species list}},
 *  bullets or <br />-separated lines): every italic link, † marking the
 *  extinct ones. "See text" lists come from the article body instead
 *  (speciesInBody). */
export function parseSpeciesList(subdivision: string | undefined): SpeciesLink[] {
  if (!subdivision) return [];
  const out: SpeciesLink[] = [];
  for (const m of subdivision.matchAll(SPECIES_LINK)) {
    const name = wikiPlain(m[3] ?? m[2]).replace(/^†\s*/, "");
    if (!/^[A-Z][a-z]*\.? [a-z]/.test(name)) continue;
    out.push({ name, article: m[2].trim(), extinct: !!m[1] });
  }
  return dedupe(out);
}

/** Species of `genus` linked in the article body: italic links shown as
 *  "Genus species" or "G. species". */
export function speciesInBody(full: string, genus: string): SpeciesLink[] {
  const out: SpeciesLink[] = [];
  const re = new RegExp(`^(${genus}|${genus[0]}\\.) [a-z]+$`);
  for (const m of full.matchAll(SPECIES_LINK)) {
    const shown = wikiPlain(m[3] ?? m[2]).replace(/^†\s*/, "");
    const target = m[2].trim();
    if (!re.test(shown) && !re.test(target)) continue;
    out.push({ name: re.test(shown) ? shown : target, article: target, extinct: !!m[1] });
  }
  return dedupe(out);
}

function dedupe(xs: SpeciesLink[]): SpeciesLink[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.article ?? x.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---- images -----------------------------------------------------------------

/** Width (px) of the thumbnail the museum hangs and the inspect panel shows. */
const THUMB_WIDTH = 960;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Commons' extmetadata values are HTML: strip tags and hidden spans, decode
 *  entities, collapse whitespace, and cut to `max` characters if given. */
function htmlToText(html: string, max = 0): string {
  const text = html
    .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
  return max && text.length > max ? text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : text;
}

/** URL, size and credit line of each file (File: names, 50 per request). */
export async function getImages(files: string[], captions: Map<string, string>): Promise<Map<string, ImageRef>> {
  const out = new Map<string, ImageRef>();
  for (const batch of chunks([...new Set(files)], 50)) {
    const data = await api<{
      query: {
        normalized?: { from: string; to: string }[];
        pages: {
          title: string;
          imageinfo?: { url: string; width: number; height: number; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: unknown }> }[];
        }[];
      };
    }>({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      // the server's own thumbnail URL at this width (or the original, if smaller)
      iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|NonFree",
      iiextmetadatalanguage: "en",
      titles: batch.map((f) => `File:${f}`).join("|"),
    });
    const pages = new Map(data.query.pages.map((p) => [p.title, p]));
    for (const f of batch) {
      const t = data.query.normalized?.find((n) => n.from === `File:${f}`)?.to ?? `File:${f}`;
      const p = pages.get(t);
      const ii = p?.imageinfo?.[0];
      if (!p || !ii) continue;
      const em = ii.extmetadata ?? {};
      const v = (k: string) => (em[k]?.value == null ? "" : String(em[k].value));
      // Fair-use images on English Wikipedia stay out of the museum.
      if (v("NonFree") && v("NonFree") !== "false") continue;
      out.set(f, {
        url: ii.url.split("?")[0],
        thumb: (ii.thumburl ?? ii.url).split("?")[0],
        width: ii.width,
        height: ii.height,
        caption: captions.get(f) ?? "",
        credit: {
          author: htmlToText(v("Artist"), 120) || null,
          license: htmlToText(v("LicenseShortName")) || "Unknown",
          licenseUrl: v("LicenseUrl").trim() || null,
          page: ii.descriptionurl,
        },
      });
    }
  }
  return out;
}
