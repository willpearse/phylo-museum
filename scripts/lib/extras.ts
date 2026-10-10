// What the museum adds around each taxon beyond its taxobox: a silhouette
// from PhyloPic, the figures an article illustrates its text with, and a body
// length (for the statues) read from the article's own words.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { UA, getJson, pacer } from "./http.ts";
import { wikiPlain } from "./taxonomy.ts";
import type { Silhouette } from "../../src/lib/types.ts";

// ---- PhyloPic -------------------------------------------------------------------

const PHYLOPIC = "https://api.phylopic.org";
/** Where silhouettes are saved: served by the app at silhouettes/<uuid>.png. */
const SILHOUETTE_DIR = path.join(import.meta.dirname, "..", "..", "public", "silhouettes");
const ACCEPT = { accept: "application/vnd.phylopic.v2+json" };
const pace = pacer(2, 250);

let build: number | null = null;
async function phylopicBuild(): Promise<number> {
  if (build) return build;
  const res = await fetch(`${PHYLOPIC}/`, { headers: ACCEPT, redirect: "manual" });
  const m = /build=(\d+)/.exec(res.headers.get("location") ?? "");
  build = m ? Number(m[1]) : Number(((await res.json().catch(() => ({}))) as { build?: number }).build);
  if (!build) throw new Error("PhyloPic: no build number");
  return build;
}

interface PhyloImage {
  _links: {
    self: { href: string; title?: string };
    license: { href: string };
    rasterFiles?: { href: string; sizes: string }[];
  };
  attribution?: string | null;
}

/** The PhyloPic silhouette PhyloPic itself shows for a taxon name, or null. */
export async function getSilhouette(name: string): Promise<Silhouette | null> {
  const b = await phylopicBuild();
  const url = `${PHYLOPIC}/nodes?build=${b}&filter_name=${encodeURIComponent(name.toLowerCase())}&page=0&embed_items=true&embed_primaryImage=true`;
  const data = await getJson<{ _embedded?: { items?: { _embedded?: { primaryImage?: PhyloImage | null } }[] } }>(url, { headers: ACCEPT, pace });
  const im = data?._embedded?.items?.[0]?._embedded?.primaryImage;
  if (!im) return null;
  // the largest raster no wider than 1024 px
  const rasters = (im._links.rasterFiles ?? [])
    .map((r) => {
      const [w, h] = r.sizes.split("x").map(Number);
      return { url: r.href, width: w, height: h };
    })
    .sort((a, b) => b.width - a.width);
  const raster = rasters.find((r) => r.width <= 1024) ?? rasters[rasters.length - 1];
  if (!raster) return null;
  const uuid = /\/images\/([0-9a-f-]+)/.exec(im._links.self.href)?.[1];
  if (!uuid) return null;
  // Bundle the PNG: PhyloPic's CDN does not always send CORS headers, which
  // WebGL textures need.
  const local = path.join(SILHOUETTE_DIR, `${uuid}.png`);
  if (!fs.existsSync(local)) {
    const res = await pace(() => fetch(raster.url, { headers: { "user-agent": UA } }));
    if (!res.ok) throw new Error(`${res.status} for ${raster.url}`);
    fs.mkdirSync(SILHOUETTE_DIR, { recursive: true });
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  }
  return {
    ...raster,
    url: `silhouettes/${uuid}.png`,
    facing: facingOf(fs.readFileSync(local)),
    depicts: im._links.self.title ?? name,
    license: licenseName(im._links.license.href),
    licenseUrl: im._links.license.href,
    author: im.attribution ?? null,
    page: `https://www.phylopic.org/images/${uuid}`,
  };
}

/** Which way an animal in a silhouette faces: its head end carries more of
 *  its bulk than its tail end, so compare how opaque the outer thirds are. */
export function facingOf(png: Buffer): "left" | "right" {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const depth = png[24];
  const type = png[25];
  const chunks: Buffer[] = [];
  for (let i = 8; i < png.length; ) {
    const len = png.readUInt32BE(i);
    if (png.toString("ascii", i + 4, i + 8) === "IDAT") chunks.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const bpp = ({ 6: 4, 4: 2, 2: 3, 0: 1, 3: 1 } as Record<number, number>)[type] * (depth / 8);
  if (type !== 6 && type !== 4) return "left";
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  let left = 0;
  let right = 0;
  for (let y = 0, p = 0; y < h; y++) {
    const filter = raw[p];
    const line = Buffer.from(raw.subarray(p + 1, p + 1 + stride));
    p += 1 + stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    prev = line;
    for (let x = 0; x < w; x++) {
      if (line[x * bpp + bpp - 1] <= 128) continue;
      if (x < w / 3) left++;
      else if (x >= (2 * w) / 3) right++;
    }
  }
  return left >= right ? "left" : "right";
}

function licenseName(url: string): string {
  if (/publicdomain\/zero/.test(url)) return "CC0 1.0";
  if (/publicdomain\/mark/.test(url)) return "Public domain";
  const m = /licenses\/([a-z-]+)\/([\d.]+)/.exec(url);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : url;
}

// ---- figures ----------------------------------------------------------------------

const NOT_A_FIGURE = /\b(map|range|distribution|cladogram|phylogen\w*|diagram|logo|icon|flag|chart|graph|stamp|coin|size|sizes|scale|comparison|compared|silhouette|timeline)\b|\.svg$|\.gif$|\.tiff?$|\.pdf$|\.djvu$|\.ogg$|\.webm$|\.ogv$/i;

export interface Figure {
  file: string;
  caption: string;
}

/** Images the article body shows ([[File:…|thumb|caption]] and <gallery>
 *  lines), in order, with their captions; maps, diagrams and the like are
 *  left out. */
export function articleFigures(full: string, exclude: (string | null)[]): Figure[] {
  const out: Figure[] = [];
  const seen = new Set(exclude.filter(Boolean).map((f) => norm(f!)));
  const push = (file: string, caption: string) => {
    const f = file.trim().replace(/_/g, " ");
    if (!f || seen.has(norm(f)) || NOT_A_FIGURE.test(f) || NOT_A_FIGURE.test(caption)) return;
    seen.add(norm(f));
    out.push({ file: f, caption: caption.trim() });
  };
  // [[File:Name.jpg|thumb|left|upright=1.2|Caption with [[links]]]]
  const re = /\[\[\s*(?:File|Image)\s*:/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(full))) {
    let depth = 0;
    let end = m.index;
    for (let i = m.index; i < full.length - 1; i++) {
      if (full.startsWith("[[", i)) { depth++; i++; }
      else if (full.startsWith("]]", i)) { depth--; i++; if (depth === 0) { end = i + 1; break; } }
    }
    const body = full.slice(m.index + 2, end - 2);
    const parts = splitTop(body);
    const file = parts[0].replace(/^\s*(File|Image)\s*:/i, "");
    const caption = parts.length > 1 ? parts[parts.length - 1] : "";
    const isOption = /^(thumb|thumbnail|frame|frameless|left|right|center|none|upright(=.*)?|\d+px|x?\d+px|alt=.*|link=.*|class=.*)$/i.test(caption.trim());
    push(file, isOption ? "" : wikiPlain(caption));
  }
  // <gallery> File:Name.jpg|Caption </gallery>
  for (const g of full.matchAll(/<gallery[^>]*>([\s\S]*?)<\/gallery>/gi)) {
    for (const line of g[1].split("\n")) {
      const [file, ...cap] = line.split("|");
      if (/\.(jpe?g|png|webp)\s*$/i.test(file.replace(/^\s*(File|Image)\s*:/i, ""))) push(file.replace(/^\s*(File|Image)\s*:/i, ""), wikiPlain(cap.join("|")));
    }
  }
  return out;
}

const norm = (f: string) => f.replace(/_/g, " ").trim().toLowerCase();

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") { depth++; cur += two; i++; continue; }
    if (two === "]]" || two === "}}") { depth--; cur += two; i++; continue; }
    if (s[i] === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

// ---- body length ----------------------------------------------------------------------

/** A typical adult body length from the text, in metres: the median of the
 *  sizes given in sentences about length ("Males typically range from 6–8 m
 *  long", "recorded at 10 m"), each range counting as its upper end. The
 *  median shrugs off the odd outlier (a prey animal, a record claim). */
export function bodyLength(text: string): number | null {
  const found: number[] = [];
  for (const sentence of text.split(/(?<=[.;])\s+/)) {
    if (!/\b(long|length|lengths|reach|reaches|reaching|grow|grows|measur\w*|sizes?|sized|largest|up to|adults?|attain\w*|recorded|typically)\b/i.test(sentence)) continue;
    // whole sentences about something other than the body's length
    if (/\b(penis|intestin\w*|blow|speeds?|swim\w*|dives?|depths?|brain|heart|footprints?|tracks?|wingspan|km)\b|m\/s/i.test(sentence)) continue;
    for (const m of sentence.matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:–|-|to|and)\s*(\d+(?:\.\d+)?))?\s*(m|metres|meters|cm|centimetres|centimeters)\b(?![\/²³])/gi)) {
      // ...and single figures about a part, a calf, or a height
      const before = sentence.slice(Math.max(0, m.index! - 45), m.index);
      const after = sentence.slice(m.index! + m[0].length, m.index! + m[0].length + 30);
      if (/\b(tall|high|wide|across|in diameter|deep|at the shoulder)\b/i.test(after)) continue;
      if (/\b(tail|fins?|flippers?|flukes?|calf|calves|newborns?|birth|neonates?|skull|tooth|teeth|tusks?|jaw\w*|baleen|head|snout|rostrum|eyes?|eggs?|prey)\b[^.]*$/i.test(before)) continue;
      const v = Math.max(parseFloat(m[1]), m[2] ? parseFloat(m[2]) : 0);
      const metres = /^c/i.test(m[3]) ? v / 100 : v;
      if (metres >= 0.3 && metres <= 34) found.push(metres);
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => a - b);
  const mid = found.length >> 1;
  const median = found.length % 2 ? found[mid] : (found[mid - 1] + found[mid]) / 2;
  return Math.round(median * 100) / 100;
}
