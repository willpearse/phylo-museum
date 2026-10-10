/** Credit line of an image, from its file description page on Wikimedia
 *  Commons or English Wikipedia. CC BY / CC BY-SA require it wherever the
 *  image is shown. */
export interface ImageCredit {
  author: string | null;
  license: string;
  licenseUrl: string | null;
  page: string;
}

export interface ImageRef {
  /** upload.wikimedia.org original. */
  url: string;
  /** A ~960 px thumbnail as the MediaWiki API gives it (the original when smaller). */
  thumb: string;
  width: number;
  height: number;
  caption: string;
  credit: ImageCredit | null;
}

/** A PhyloPic silhouette (transparent PNG) and its credit. */
export interface Silhouette {
  url: string;
  width: number;
  height: number;
  /** The taxon PhyloPic files the image under. */
  depicts: string;
  /** Which way the animal faces (its head end), estimated from the image. */
  facing: "left" | "right";
  license: string;
  licenseUrl: string;
  author: string | null;
  page: string;
}

/** A species hung in a genus room. */
export interface Species {
  name: string;
  /** Title of its Wikipedia article (usually the common name). */
  common: string;
  extinct: boolean;
  /** IUCN Red List code (LC, NT, VU, EN, CR, EW, EX, DD), when the taxobox gives one. */
  status: string | null;
  extract: string;
  image: ImageRef | null;
  wikipediaUrl: string;
  pageviews: number;
  /** Largest body length the article gives, metres. */
  lengthM: number | null;
}

/** A clade the pruned tree collapsed into a corridor: it hangs on the walls
 *  at the time it first appears. */
export interface Waypoint {
  name: string;
  common: string;
  rank: string;
  extinct: boolean;
  /** First appearance (Ma); null when Wikipedia gives none. */
  start: number | null;
  extract: string;
  image: ImageRef | null;
  wikipediaUrl: string | null;
  silhouette: Silhouette | null;
}

/** A room: a node of the pruned tree. */
export interface Taxon {
  /** Name of its Wikipedia taxonomy template (Template:Taxonomy/<id>). */
  id: string;
  name: string;
  common: string;
  rank: string;
  extinct: boolean;
  /** First and last appearance (Ma) from the taxobox's fossil range. */
  start: number;
  end: number;
  /** False when `start` was inferred from relatives rather than read. */
  dated: boolean;
  /** Fossil range as Wikipedia states it, for the room's label. */
  rangeText: string;
  extract: string;
  image: ImageRef | null;
  status: string | null;
  wikipediaUrl: string | null;
  pageviews: number;
  parent: string | null;
  children: string[];
  /** Collapsed clades between the parent room and this one, oldest first. */
  corridor: Waypoint[];
  /** Species shown in a genus room. */
  species: Species[];
  /** Number of genera below this node in the full Wikipedia tree (shown
   *  on doors: "through here: 37 genera"). */
  generaTotal: number;
  /** Images the article's body illustrates its text with (a few, captioned). */
  figures: ImageRef[];
  silhouette: Silhouette | null;
  /** Largest body length the article (or a species' article) gives, metres. */
  lengthM: number | null;
}

export interface MuseumData {
  root: string;
  generated: string;
  taxa: Record<string, Taxon>;
}
