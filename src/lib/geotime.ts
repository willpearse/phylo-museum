// The geological timescale (Ma, million years ago) for the span the museum
// covers: start and end of each named interval, ICS chart v2023/09. Shared
// by the ingest (to read taxobox fossil ranges written as interval names,
// "{{fossil range|Early Miocene|Recent}}") and the museum (corridor bands).

export interface GeoInterval {
  name: string;
  start: number;
  end: number;
  /** ICS chart colour. */
  color: string;
  level: "period" | "epoch" | "subepoch" | "age";
}

export const EPOCHS: GeoInterval[] = [
  { name: "Holocene", start: 0.0117, end: 0, color: "#FEF2E0", level: "epoch" },
  { name: "Pleistocene", start: 2.58, end: 0.0117, color: "#FFF2AE", level: "epoch" },
  { name: "Pliocene", start: 5.333, end: 2.58, color: "#FFFF99", level: "epoch" },
  { name: "Miocene", start: 23.03, end: 5.333, color: "#FFFF00", level: "epoch" },
  { name: "Oligocene", start: 33.9, end: 23.03, color: "#FEC07A", level: "epoch" },
  { name: "Eocene", start: 56.0, end: 33.9, color: "#FDB46C", level: "epoch" },
  { name: "Paleocene", start: 66.0, end: 56.0, color: "#FDA75F", level: "epoch" },
  { name: "Late Cretaceous", start: 100.5, end: 66.0, color: "#A6D84A", level: "epoch" },
];

const OTHER: GeoInterval[] = [
  // periods / eras
  { name: "Quaternary", start: 2.58, end: 0, color: "#F9F97F", level: "period" },
  { name: "Neogene", start: 23.03, end: 2.58, color: "#FFE619", level: "period" },
  { name: "Paleogene", start: 66.0, end: 23.03, color: "#FD9A52", level: "period" },
  { name: "Cretaceous", start: 145.0, end: 66.0, color: "#7FC64E", level: "period" },
  { name: "Cenozoic", start: 66.0, end: 0, color: "#F2F91D", level: "period" },
  // subepochs
  { name: "Late Pleistocene", start: 0.129, end: 0.0117, color: "#FFF2C7", level: "subepoch" },
  { name: "Middle Pleistocene", start: 0.774, end: 0.129, color: "#FFF2BA", level: "subepoch" },
  { name: "Early Pleistocene", start: 2.58, end: 0.774, color: "#FFEDB3", level: "subepoch" },
  { name: "Late Pliocene", start: 3.6, end: 2.58, color: "#FFFFBF", level: "subepoch" },
  { name: "Early Pliocene", start: 5.333, end: 3.6, color: "#FFFFB3", level: "subepoch" },
  { name: "Late Miocene", start: 11.63, end: 5.333, color: "#FFFF73", level: "subepoch" },
  { name: "Middle Miocene", start: 15.97, end: 11.63, color: "#FFFF4D", level: "subepoch" },
  { name: "Early Miocene", start: 23.03, end: 15.97, color: "#FFFF33", level: "subepoch" },
  { name: "Late Oligocene", start: 27.82, end: 23.03, color: "#FEE6AA", level: "subepoch" },
  { name: "Early Oligocene", start: 33.9, end: 27.82, color: "#FED99A", level: "subepoch" },
  { name: "Late Eocene", start: 37.71, end: 33.9, color: "#FDCDA1", level: "subepoch" },
  { name: "Middle Eocene", start: 47.8, end: 37.71, color: "#FCB487", level: "subepoch" },
  { name: "Early Eocene", start: 56.0, end: 47.8, color: "#FCA773", level: "subepoch" },
  { name: "Late Paleocene", start: 59.2, end: 56.0, color: "#FDBF6F", level: "subepoch" },
  { name: "Middle Paleocene", start: 61.6, end: 59.2, color: "#FDB462", level: "subepoch" },
  { name: "Early Paleocene", start: 66.0, end: 61.6, color: "#FDA75F", level: "subepoch" },
  // ages
  { name: "Tarantian", start: 0.129, end: 0.0117, color: "#FFF2D3", level: "age" },
  { name: "Chibanian", start: 0.774, end: 0.129, color: "#FFF2C7", level: "age" },
  { name: "Ionian", start: 0.774, end: 0.129, color: "#FFF2C7", level: "age" },
  { name: "Calabrian", start: 1.8, end: 0.774, color: "#FFF2BA", level: "age" },
  { name: "Gelasian", start: 2.58, end: 1.8, color: "#FFEDB3", level: "age" },
  { name: "Piacenzian", start: 3.6, end: 2.58, color: "#FFFFBF", level: "age" },
  { name: "Zanclean", start: 5.333, end: 3.6, color: "#FFFFB3", level: "age" },
  { name: "Messinian", start: 7.246, end: 5.333, color: "#FFFF73", level: "age" },
  { name: "Tortonian", start: 11.63, end: 7.246, color: "#FFFF66", level: "age" },
  { name: "Serravallian", start: 13.82, end: 11.63, color: "#FFFF59", level: "age" },
  { name: "Langhian", start: 15.97, end: 13.82, color: "#FFFF4D", level: "age" },
  { name: "Burdigalian", start: 20.44, end: 15.97, color: "#FFFF41", level: "age" },
  { name: "Aquitanian", start: 23.03, end: 20.44, color: "#FFFF33", level: "age" },
  { name: "Chattian", start: 27.82, end: 23.03, color: "#FEE6AA", level: "age" },
  { name: "Rupelian", start: 33.9, end: 27.82, color: "#FED99A", level: "age" },
  { name: "Priabonian", start: 37.71, end: 33.9, color: "#FDCDA1", level: "age" },
  { name: "Bartonian", start: 41.2, end: 37.71, color: "#FDC091", level: "age" },
  { name: "Lutetian", start: 47.8, end: 41.2, color: "#FCB487", level: "age" },
  { name: "Ypresian", start: 56.0, end: 47.8, color: "#FCA773", level: "age" },
  { name: "Thanetian", start: 59.2, end: 56.0, color: "#FDBF6F", level: "age" },
  { name: "Selandian", start: 61.6, end: 59.2, color: "#FEBF65", level: "age" },
  { name: "Danian", start: 66.0, end: 61.6, color: "#FDB462", level: "age" },
  { name: "Maastrichtian", start: 72.1, end: 66.0, color: "#F2FA8C", level: "age" },
];

const ALL = [...EPOCHS, ...OTHER];
const BY_NAME = new Map(ALL.map((i) => [i.name.toLowerCase(), i]));
const NOW = new Set(["recent", "present", "holocene", "today", "now", "extant"]);

/** Interval by name, tolerant of "Lower/Upper" for "Early/Late" and of
 *  "earliest"/"latest" prefixes ("latest Eocene" -> Late Eocene). */
export function interval(name: string): GeoInterval | null {
  let k = name.trim().toLowerCase().replace(/\s+/g, " ");
  k = k.replace(/^lower /, "early ").replace(/^upper /, "late ");
  k = k.replace(/^earliest /, "early ").replace(/^latest /, "late ").replace(/^mid(dle)?-? ?/, "middle ");
  return BY_NAME.get(k) ?? BY_NAME.get(k.replace(/^(early|middle|late) /, "")) ?? null;
}

/** Ma of a fossil-range bound: a number, a "now" word (0), or an interval
 *  (its start for the lower bound, its end for the upper). */
export function boundMa(arg: string, which: "start" | "end"): number | null {
  const a = arg.trim().replace(/\[\[|\]\]/g, "").replace(/\s*ma$/i, "");
  if (!a) return null;
  if (/^-?\d+(\.\d+)?$/.test(a)) return parseFloat(a);
  if (NOW.has(a.toLowerCase())) return 0;
  const i = interval(a);
  return i ? i[which] : null;
}

/** Epoch containing `ma` (the most recent one at a boundary). */
export function epochAt(ma: number): GeoInterval {
  return EPOCHS.find((e) => ma <= e.start && ma >= e.end) ?? EPOCHS[EPOCHS.length - 1];
}

/** "34 Ma", "2.6 Ma", "120,000 years ago". */
export function formatMa(ma: number): string {
  if (ma <= 0) return "today";
  if (ma < 0.01) return `${Math.round(ma * 1e6).toLocaleString("en")} years ago`;
  if (ma < 1) return `${Math.round(ma * 1000).toLocaleString("en")},000 years ago`;
  if (ma < 10) return `${Number(ma.toFixed(1))} Ma`;
  return `${Math.round(ma)} Ma`;
}
