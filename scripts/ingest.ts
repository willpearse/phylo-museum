// Build the museum's tree from Wikipedia.
//
//   node --experimental-strip-types scripts/ingest.ts [--root Whippomorpha] [--extinct 40]
//
// 1. Crawl Template:Taxonomy/* down from the root to genus level: Wikipedia's
//    own (largely phylogenetic) classification behind its automatic taxoboxes.
// 2. Read every taxon's article: taxobox fossil range (-> first appearance in
//    Ma), image, conservation status, intro, pageviews.
// 3. Choose the exhibits: every living genus, plus the most-read extinct ones.
// 4. Prune: keep the root, the chosen genera and every clade where two kept
//    lineages split. A clade on a single kept lineage collapses into the
//    corridor leading to the next room, hung at the time it first appears.
// 5. Hang each living genus's species in its room.
//
// Set WIKI_HTTP_CACHE=data/http-cache to keep API responses on disk.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  getArticles,
  getChildTemplateIds,
  getImages,
  getTaxonomyTemplates,
  parseSpeciesList,
  parseTaxobox,
  speciesInBody,
  type Article,
  type Taxobox,
  type TaxonomyTemplate,
} from "./lib/taxonomy.ts";
import { articleFigures, bodyLength, getSilhouette } from "./lib/extras.ts";
import { wikiPlain } from "./lib/taxonomy.ts";
import type { ImageRef, MuseumData, Species, Taxon, Waypoint } from "../src/lib/types.ts";

const { values: args } = parseArgs({
  options: {
    root: { type: "string", default: "Whippomorpha" },
    extinct: { type: "string", default: "40" },
    out: { type: "string", default: "public/museum.json" },
  },
});
const ROOT = args.root!;
const EXTINCT_GENERA = parseInt(args.extinct!, 10);

const STOP_RANKS = new Set(["genus", "subgenus", "species", "subspecies"]);
const RANK_NAMES: Record<string, string> = {
  regnum: "kingdom", phylum: "phylum", classis: "class", subclassis: "subclass", infraclassis: "infraclass",
  magnordo: "magnorder", superordo: "superorder", grandordo: "grandorder", mirordo: "mirorder", ordo: "order",
  subordo: "suborder", infraordo: "infraorder", parvordo: "parvorder", superfamilia: "superfamily",
  familia: "family", subfamilia: "subfamily", tribus: "tribe", subtribus: "subtribe", genus: "genus", clade: "clade",
};
const rankName = (r: string) => RANK_NAMES[r] ?? (r || "clade");

const log = (m: string) => console.log(m);

// ---- 1. crawl --------------------------------------------------------------

interface Node extends TaxonomyTemplate {
  children: string[];
  article: string | null;
  page?: Article;
  box?: Taxobox | null;
  start?: number;
  end?: number;
  dated?: boolean;
}

async function crawl(root: string): Promise<Map<string, Node>> {
  const nodes = new Map<string, Node>();
  let frontier = [root];
  while (frontier.length) {
    const templates = await getTaxonomyTemplates(frontier);
    const next: string[] = [];
    await Promise.all(
      frontier.map(async (id) => {
        const t = templates.get(id);
        if (!t) return;
        const node: Node = { ...t, children: [] };
        nodes.set(id, node);
        if (STOP_RANKS.has(t.rank)) return;
        const kids = (await getChildTemplateIds(id)).filter((k) => !k.includes("/") && k !== id && !nodes.has(k));
        node.children = kids;
        next.push(...kids);
      })
    );
    // Search can return a template whose parent merely starts with this name;
    // the template itself is the authority.
    frontier = [...new Set(next)];
    log(`  crawled ${nodes.size} taxa, ${frontier.length} to go`);
  }
  for (const n of nodes.values()) n.children = n.children.filter((c) => nodes.get(c)?.parent === n.id);
  return nodes;
}

// ---- helpers -----------------------------------------------------------------

function descendants(nodes: Map<string, Node>, id: string): Node[] {
  const out: Node[] = [];
  const walk = (i: string) => {
    const n = nodes.get(i)!;
    out.push(n);
    n.children.forEach(walk);
  };
  walk(id);
  return out;
}

function trimExtract(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = cut.lastIndexOf(". ");
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

// ---- main ----------------------------------------------------------------------

async function main() {
  log(`Crawling Template:Taxonomy/${ROOT} …`);
  const nodes = await crawl(ROOT);
  const genera = [...nodes.values()].filter((n) => n.rank === "genus");
  log(`${nodes.size} taxa, ${genera.length} genera`);

  // 2. articles
  const titled = [...nodes.values()].filter((n) => n.article);
  log(`Reading ${titled.length} articles …`);
  const pages = await getArticles(titled.map((n) => n.article!));
  for (const n of titled) {
    n.page = pages.get(n.article!);
    n.box = n.page ? parseTaxobox(n.page.wikitext) : null;
    // A taxon whose article is shared with its parent (a monotypic family
    // linking to its genus) must not borrow the genus's dates wholesale, but
    // the taxobox describes the article's subject: accept it.
    if (n.box?.extinct) n.extinct = true;
    if (n.box?.range) {
      n.start = n.box.range.start;
      n.end = n.box.range.end;
      // Many fossil genera's templates lack extinct=yes; a fossil range that
      // stops before the Holocene says it.
      if (n.end > 0.0117) n.extinct = true;
    }
    // ...as do categories such as "Prehistoric cetacean genera" or "Miocene
    // cetaceans" on an article without an "Extant …" category.
    if (n.rank === "genus" && n.page && fossilByCategory(n.page.full)) n.extinct = true;
    if (n.rank === "genus" && n.box) {
      const listed = parseSpeciesList(n.box.params.subdivision);
      if (listed.length && listed.every((s) => s.extinct)) n.extinct = true;
    }
  }
  // A clade is extinct when everything in it is.
  const extinctUp = (id: string): boolean => {
    const n = nodes.get(id)!;
    const kids = n.children.map(extinctUp);
    if (kids.length && kids.every(Boolean)) n.extinct = true;
    return n.extinct;
  };
  extinctUp(ROOT);

  // 3. choose exhibits
  const living = genera.filter((g) => !g.extinct && g.page);
  const fossil = genera
    .filter((g) => g.extinct && g.page)
    .sort((a, b) => (b.page!.pageviews ?? 0) - (a.page!.pageviews ?? 0))
    .slice(0, EXTINCT_GENERA);
  const chosen = new Set([...living, ...fossil].map((g) => g.id));
  log(`Exhibits: ${living.length} living + ${fossil.length} extinct genera`);

  // kept = chosen genera and their ancestors
  const keptCount = new Map<string, number>();
  const count = (id: string): number => {
    const n = nodes.get(id)!;
    const c = (chosen.has(id) ? 1 : 0) + n.children.reduce((a, k) => a + count(k), 0);
    keptCount.set(id, c);
    return c;
  };
  count(ROOT);
  const keptKids = (n: Node) => n.children.filter((c) => (keptCount.get(c) ?? 0) > 0);

  // 4a. dates: a clade is at least as old as anything in it (bottom-up), and
  // an undated taxon starts where its parent does (top-down).
  const dateUp = (id: string): number | undefined => {
    const n = nodes.get(id)!;
    const kids = n.children.map(dateUp).filter((x): x is number => x != null);
    const own = n.start;
    const oldest = kids.length ? Math.max(...kids) : undefined;
    n.dated = own != null;
    if (own == null) n.start = oldest;
    else if (oldest != null && oldest > own) n.start = oldest;
    return n.start;
  };
  dateUp(ROOT);
  const dateDown = (id: string, parentStart: number) => {
    const n = nodes.get(id)!;
    if (n.start == null) n.start = parentStart;
    if (n.end == null) n.end = n.extinct ? n.start : 0;
    if (n.end! > n.start!) n.end = n.start;
    n.children.forEach((c) => dateDown(c, n.start!));
  };
  dateDown(ROOT, nodes.get(ROOT)!.start ?? 60);

  // 4b. prune
  const isRoom = (n: Node) => n.id === ROOT || chosen.has(n.id) || keptKids(n).length >= 2;
  const taxa: Record<string, Taxon> = {};
  const images = new Map<string, string>(); // file -> caption
  const wantImage = (b: Taxobox | null | undefined) => {
    if (b?.imageFile) images.set(b.imageFile, b.caption);
    return b?.imageFile ?? null;
  };
  const imageFileOf = new Map<object, string | null>();
  const figuresOf = new Map<Taxon, string[]>();

  const generaUnder = (id: string) => descendants(nodes, id).filter((d) => d.rank === "genus").length;

  const toTaxon = (n: Node, parent: string | null, corridor: Waypoint[]): Taxon => {
    const t: Taxon = {
      id: n.id,
      name: n.id,
      common: n.page?.title ?? n.linkText,
      rank: rankName(n.rank),
      extinct: n.extinct,
      start: round(n.start!),
      end: round(n.end!),
      dated: !!n.dated,
      rangeText: n.box?.range?.text ?? "",
      extract: trimExtract(n.page?.extract ?? "", 1400),
      image: null,
      status: n.box?.status ?? null,
      wikipediaUrl: n.page?.url ?? null,
      pageviews: n.page?.pageviews ?? 0,
      parent,
      children: [],
      corridor,
      species: [],
      generaTotal: generaUnder(n.id),
      figures: [],
      silhouette: null,
      lengthM: n.page ? bodyLength(sizeText(n.page.full)) : null,
    };
    imageFileOf.set(t, wantImage(n.box));
    if (n.page) {
      const figs = articleFigures(n.page.full, [n.box?.imageFile ?? null]).slice(0, 3);
      for (const f of figs) images.set(f.file, f.caption);
      figuresOf.set(t, figs.map((f) => f.file));
    }
    return t;
  };

  const build = (id: string, parent: string | null, corridor: Waypoint[]) => {
    const n = nodes.get(id)!;
    const t = toTaxon(n, parent, corridor);
    taxa[id] = t;
    for (const k of keptKids(n)) {
      // follow the single kept lineage down to the next room
      const path: Waypoint[] = [];
      let cur = nodes.get(k)!;
      while (!isRoom(cur)) {
        const w: Waypoint = {
          name: cur.id,
          common: cur.page?.title ?? cur.linkText,
          rank: rankName(cur.rank),
          extinct: cur.extinct,
          start: cur.dated ? round(cur.start!) : null,
          extract: trimExtract(cur.page?.extract ?? "", 600),
          image: null,
          wikipediaUrl: cur.page?.url ?? null,
          silhouette: null,
        };
        imageFileOf.set(w, wantImage(cur.box));
        path.push(w);
        cur = nodes.get(keptKids(cur)[0])!;
      }
      t.children.push(cur.id);
      build(cur.id, id, path);
    }
    // oldest lineages to the left as you enter
    t.children.sort((a, b) => taxa[b].start - taxa[a].start);
  };
  build(ROOT, null, []);

  // 5. species of the living genera
  const speciesWanted: { genus: Taxon; name: string; article: string }[] = [];
  for (const t of Object.values(taxa)) {
    const n = nodes.get(t.id)!;
    if (n.rank !== "genus" || t.extinct || !n.box) continue;
    let listed = parseSpeciesList(n.box.params.subdivision);
    if (!listed.length) listed = speciesInBody(n.page!.full, t.name);
    listed = listed.filter((s) => !s.extinct && s.article);
    if (listed.length) for (const s of listed) speciesWanted.push({ genus: t, name: s.name, article: s.article! });
    // monotypic genus whose article is the species article (a speciesbox)
    else if (n.box.params.genus && n.box.params.species)
      speciesWanted.push({ genus: t, name: speciesName(n.box) ?? t.name, article: n.page!.title });
  }
  log(`Reading ${speciesWanted.length} species articles …`);
  const spPages = await getArticles(speciesWanted.map((s) => s.article));
  const speciesImage = new Map<Species, string | null>();
  for (const s of speciesWanted) {
    const p = spPages.get(s.article);
    if (!p) continue;
    const box = parseTaxobox(p.wikitext);
    if (box?.extinct || fossilByCategory(p.full)) continue;
    const sp: Species = {
      name: speciesName(box) ?? s.name,
      common: p.title,
      extinct: false,
      status: box?.status ?? null,
      extract: trimExtract(p.extract, 1000),
      image: null,
      wikipediaUrl: p.url,
      pageviews: p.pageviews,
      lengthM: bodyLength(sizeText(p.full)),
    };
    speciesImage.set(sp, wantImage(box));
    s.genus.species.push(sp);
  }
  for (const t of Object.values(taxa)) t.species.sort((a, b) => b.pageviews - a.pageviews);

  // images
  log(`Reading ${images.size} image records …`);
  const refs = await getImages([...images.keys()], images);
  const ref = (f: string | null | undefined): ImageRef | null => (f ? refs.get(f) ?? null : null);
  for (const [obj, f] of imageFileOf) (obj as Taxon | Waypoint).image = ref(f);
  for (const [sp, f] of speciesImage) sp.image = ref(f);
  // A genus room without its own image borrows its best-read species'.
  for (const t of Object.values(taxa)) if (!t.image) t.image = t.species.find((s) => s.image)?.image ?? null;
  for (const [t, files] of figuresOf) t.figures = files.map(ref).filter((r): r is ImageRef => !!r);
  // A genus with species is as long as its longest species (genus articles
  // also discuss fossil relatives and record claims).
  for (const t of Object.values(taxa)) {
    const sp = t.species.map((s) => s.lengthM ?? 0).filter((x) => x > 0);
    if (sp.length) t.lengthM = Math.max(...sp);
  }

  // silhouettes (PhyloPic)
  const named: (Taxon | Waypoint)[] = [...Object.values(taxa), ...Object.values(taxa).flatMap((t) => t.corridor)];
  log(`Looking up ${named.length} silhouettes on PhyloPic …`);
  // PhyloPic drops the odd connection: retry failures one at a time
  const failed = new Set<Taxon | Waypoint>();
  await Promise.all(
    named.map(async (x) => {
      x.silhouette = await getSilhouette(x.name).catch(() => {
        failed.add(x);
        return null;
      });
    })
  );
  for (let pass = 0; pass < 3 && failed.size; pass++) {
    for (const x of [...failed]) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        x.silhouette = await getSilhouette(x.name);
        failed.delete(x);
      } catch {
        /* next pass */
      }
    }
  }
  if (failed.size) log(`  PhyloPic failed for: ${[...failed].map((x) => x.name).join(", ")}`);

  const data: MuseumData = { root: ROOT, generated: new Date().toISOString(), taxa };
  fs.mkdirSync(path.dirname(args.out!), { recursive: true });
  fs.writeFileSync(args.out!, JSON.stringify(data));
  report(data);
}

/** Article wikitext as plain text for reading sizes: {{convert|9.8|m|ft}}
 *  becomes "9.8 m", {{convert|5|-|8|m}} "5–8 m". */
function sizeText(full: string): string {
  const converted = full.replace(/\{\{\s*(?:convert|cvt)\s*\|([^{}]*)\}\}/gi, (_, a: string) => {
    const p = a.split("|").map((x) => x.trim());
    return ["-", "–", "to", "and"].includes(p[1]) ? `${p[0]}–${p[2]} ${p[3] ?? ""}` : `${p[0]} ${p[1] ?? ""}`;
  });
  return wikiPlain(converted);
}

function fossilByCategory(wikitext: string): boolean {
  if (/\[\[Category:Extant /i.test(wikitext)) return false;
  if (/\{\{\s*short description\s*\|\s*(an )?extinct\b/i.test(wikitext)) return true;
  return /\[\[Category:([^\]|]*\bprehistoric |Fossil taxa described|(Early |Middle |Late )?(Paleocene|Eocene|Oligocene|Miocene|Pliocene) )/i.test(wikitext);
}

function speciesName(box: Taxobox | null | undefined): string | null {
  const p = box?.params;
  if (!p) return null;
  if (p.genus && p.species) return `${p.genus.trim()} ${p.species.trim()}`.replace(/'/g, "");
  if (p.taxon && p.taxon.includes(" ")) return p.taxon.trim().replace(/'/g, "");
  return null;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

function report(d: MuseumData) {
  const all = Object.values(d.taxa);
  const leaves = all.filter((t) => !t.children.length);
  const undated = all.filter((t) => !t.dated);
  log(`\n${all.length} rooms (${leaves.length} genera), ${all.reduce((a, t) => a + t.corridor.length, 0)} corridor waypoints, ${all.reduce((a, t) => a + t.species.length, 0)} species`);
  log(`${all.filter((t) => t.silhouette).length}/${all.length} rooms have a silhouette, ${all.reduce((a, t) => a + t.figures.length, 0)} figures, ${all.filter((t) => t.lengthM).length} lengths`);
  log(`${all.filter((t) => t.image).length}/${all.length} rooms have an image; ${undated.length} undated: ${undated.map((t) => t.id).join(", ")}`);
  const print = (id: string, depth: number) => {
    const t = d.taxa[id];
    const via = t.corridor.map((w) => w.name).join(" › ");
    log(`${"  ".repeat(depth)}${t.extinct ? "†" : ""}${t.name} [${t.rank}] ${t.start} Ma${via ? `  (via ${via})` : ""}${t.species.length ? `  ${t.species.length} spp.` : ""}${t.lengthM ? `  ${t.lengthM} m` : ""}${t.silhouette ? "" : "  (no silhouette)"}`);
    t.children.forEach((c) => print(c, depth + 1));
  };
  print(d.root, 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
