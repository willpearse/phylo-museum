// Body plans for the statues: a handful of archetypes, each a body profile
// from snout to tail (half-height and half-width as fractions of body length)
// plus fins, flukes, legs or tusks. Which archetype a taxon gets comes from
// its lineage (the most specific clade listed wins); its size from the length
// its Wikipedia article gives, kept within the archetype's plausible range.

import type { MuseumData, Taxon } from "@/lib/types";

/** [t along the body (0 snout .. 1 tail), half-height, half-width]. */
export type Profile = [number, number, number][];

export interface Fin {
  /** Where along the body (0..1) the fin's leading edge starts. */
  at: number;
  /** Base length, height, and how far the tip sweeps back (fractions of length). */
  base: number;
  h: number;
  sweep: number;
}

export interface Archetype {
  name: string;
  /** Typical adult length (m), and the range a parsed length must fall in. */
  length: number;
  range: [number, number];
  profile: Profile;
  /** Centre-line height offsets [t, y], e.g. a raised rostrum or drooping tail. */
  spine?: [number, number][];
  /** Superellipse exponents [t, n] for the cross-section (2 = ellipse, higher = boxier). */
  square?: [number, number][];
  dorsal?: Fin;
  flippers?: { at: number; len: number; width: number };
  fluke?: { span: number; chord: number };
  legs?: { front: { at: number; len: number; r: number }; back: { at: number; len: number; r: number } };
  tusk?: { len: number; down?: boolean; pair?: boolean };
}

const dolphin: Archetype = {
  name: "dolphin",
  length: 2.5,
  range: [1.2, 5],
  profile: [[0, 0.012, 0.012], [0.05, 0.018, 0.02], [0.09, 0.05, 0.045], [0.14, 0.068, 0.06], [0.3, 0.095, 0.085], [0.5, 0.088, 0.078], [0.7, 0.06, 0.045], [0.85, 0.035, 0.018], [0.96, 0.016, 0.01], [1, 0.006, 0.005]],
  spine: [[0, -0.015], [0.09, 0], [1, 0]],
  dorsal: { at: 0.44, base: 0.12, h: 0.1, sweep: 0.08 },
  flippers: { at: 0.2, len: 0.13, width: 0.045 },
  fluke: { span: 0.26, chord: 0.075 },
};

const ARCHETYPES: Record<string, Archetype> = {
  dolphin,
  orca: {
    name: "orca",
    length: 8,
    range: [5, 10],
    profile: [[0, 0.03, 0.03], [0.04, 0.06, 0.055], [0.12, 0.095, 0.085], [0.3, 0.125, 0.115], [0.5, 0.115, 0.1], [0.7, 0.08, 0.06], [0.85, 0.045, 0.022], [0.96, 0.02, 0.012], [1, 0.006, 0.005]],
    dorsal: { at: 0.4, base: 0.13, h: 0.2, sweep: 0.025 },
    flippers: { at: 0.22, len: 0.15, width: 0.08 },
    fluke: { span: 0.24, chord: 0.08 },
  },
  pilot: {
    name: "pilot whale",
    length: 5.5,
    range: [2, 7.5],
    profile: [[0, 0.05, 0.045], [0.04, 0.072, 0.065], [0.12, 0.085, 0.075], [0.3, 0.1, 0.09], [0.5, 0.09, 0.08], [0.7, 0.06, 0.045], [0.85, 0.035, 0.02], [0.96, 0.016, 0.01], [1, 0.006, 0.005]],
    dorsal: { at: 0.3, base: 0.16, h: 0.07, sweep: 0.09 },
    flippers: { at: 0.2, len: 0.19, width: 0.04 },
    fluke: { span: 0.24, chord: 0.075 },
  },
  porpoise: {
    name: "porpoise",
    length: 1.8,
    range: [1.2, 2.5],
    profile: [[0, 0.025, 0.025], [0.05, 0.05, 0.048], [0.15, 0.08, 0.075], [0.35, 0.11, 0.1], [0.55, 0.1, 0.09], [0.75, 0.06, 0.045], [0.88, 0.03, 0.016], [1, 0.006, 0.005]],
    dorsal: { at: 0.47, base: 0.14, h: 0.075, sweep: 0.035 },
    flippers: { at: 0.22, len: 0.12, width: 0.045 },
    fluke: { span: 0.27, chord: 0.08 },
  },
  river: {
    name: "river dolphin",
    length: 2.4,
    range: [1.4, 3],
    profile: [[0, 0.006, 0.006], [0.12, 0.012, 0.012], [0.15, 0.05, 0.045], [0.2, 0.065, 0.06], [0.35, 0.085, 0.08], [0.55, 0.075, 0.07], [0.75, 0.05, 0.04], [0.9, 0.025, 0.014], [1, 0.006, 0.005]],
    spine: [[0, -0.03], [0.15, 0], [1, 0]],
    dorsal: { at: 0.56, base: 0.12, h: 0.03, sweep: 0.05 },
    flippers: { at: 0.24, len: 0.15, width: 0.06 },
    fluke: { span: 0.25, chord: 0.075 },
  },
  beaked: {
    name: "beaked whale",
    length: 5.5,
    range: [3.5, 13],
    profile: [[0, 0.01, 0.01], [0.05, 0.02, 0.02], [0.1, 0.055, 0.05], [0.3, 0.085, 0.08], [0.55, 0.08, 0.075], [0.75, 0.055, 0.04], [0.9, 0.025, 0.014], [1, 0.006, 0.005]],
    dorsal: { at: 0.64, base: 0.08, h: 0.05, sweep: 0.05 },
    flippers: { at: 0.22, len: 0.09, width: 0.035 },
    fluke: { span: 0.22, chord: 0.07 },
  },
  beluga: {
    name: "beluga",
    length: 4.5,
    range: [3, 6],
    profile: [[0, 0.045, 0.04], [0.05, 0.075, 0.07], [0.12, 0.085, 0.08], [0.2, 0.08, 0.075], [0.4, 0.11, 0.105], [0.6, 0.1, 0.09], [0.8, 0.055, 0.04], [0.92, 0.025, 0.014], [1, 0.006, 0.005]],
    dorsal: { at: 0.5, base: 0.22, h: 0.012, sweep: 0.1 },
    flippers: { at: 0.2, len: 0.13, width: 0.06 },
    fluke: { span: 0.26, chord: 0.08 },
  },
  sperm: {
    name: "sperm whale",
    length: 15,
    range: [5, 20],
    profile: [[0, 0.1, 0.08], [0.02, 0.115, 0.095], [0.3, 0.12, 0.1], [0.4, 0.115, 0.1], [0.6, 0.095, 0.08], [0.8, 0.055, 0.04], [0.92, 0.025, 0.014], [1, 0.006, 0.005]],
    square: [[0, 3.6], [0.3, 3], [0.45, 2], [1, 2]],
    dorsal: { at: 0.6, base: 0.1, h: 0.03, sweep: 0.05 },
    flippers: { at: 0.36, len: 0.07, width: 0.035 },
    fluke: { span: 0.25, chord: 0.08 },
  },
  kogia: {
    name: "pygmy sperm whale",
    length: 3,
    range: [2, 4],
    profile: [[0, 0.06, 0.055], [0.05, 0.085, 0.08], [0.25, 0.11, 0.1], [0.5, 0.1, 0.09], [0.75, 0.06, 0.045], [0.9, 0.028, 0.015], [1, 0.006, 0.005]],
    square: [[0, 2.6], [0.2, 2], [1, 2]],
    dorsal: { at: 0.52, base: 0.1, h: 0.06, sweep: 0.05 },
    flippers: { at: 0.25, len: 0.1, width: 0.04 },
    fluke: { span: 0.25, chord: 0.08 },
  },
  rorqual: {
    name: "rorqual",
    length: 18,
    range: [5, 30],
    profile: [[0, 0.01, 0.02], [0.04, 0.03, 0.045], [0.15, 0.06, 0.07], [0.3, 0.075, 0.075], [0.5, 0.068, 0.06], [0.7, 0.045, 0.032], [0.86, 0.024, 0.013], [1, 0.006, 0.004]],
    dorsal: { at: 0.7, base: 0.05, h: 0.03, sweep: 0.04 },
    flippers: { at: 0.27, len: 0.12, width: 0.03 },
    fluke: { span: 0.24, chord: 0.07 },
  },
  humpback: {
    name: "humpback whale",
    length: 15,
    range: [11, 18],
    profile: [[0, 0.015, 0.025], [0.04, 0.04, 0.055], [0.15, 0.075, 0.085], [0.3, 0.095, 0.095], [0.5, 0.09, 0.08], [0.7, 0.055, 0.04], [0.86, 0.028, 0.015], [1, 0.006, 0.004]],
    dorsal: { at: 0.66, base: 0.07, h: 0.025, sweep: 0.03 },
    flippers: { at: 0.26, len: 0.3, width: 0.05 },
    fluke: { span: 0.3, chord: 0.08 },
  },
  right: {
    name: "right whale",
    length: 15,
    range: [3, 19],
    profile: [[0, 0.05, 0.03], [0.03, 0.09, 0.06], [0.15, 0.135, 0.1], [0.3, 0.15, 0.13], [0.5, 0.14, 0.13], [0.7, 0.09, 0.08], [0.85, 0.04, 0.025], [0.95, 0.018, 0.01], [1, 0.006, 0.005]],
    spine: [[0, 0.06], [0.15, 0.03], [0.35, 0], [1, 0]],
    flippers: { at: 0.33, len: 0.12, width: 0.07 },
    fluke: { span: 0.32, chord: 0.09 },
  },
  gray: {
    name: "gray whale",
    length: 13,
    range: [3, 15],
    profile: [[0, 0.015, 0.03], [0.05, 0.04, 0.055], [0.2, 0.075, 0.08], [0.4, 0.095, 0.09], [0.6, 0.08, 0.07], [0.8, 0.045, 0.03], [0.92, 0.02, 0.012], [1, 0.006, 0.004]],
    spine: [[0, -0.01], [0.2, 0], [1, 0]],
    dorsal: { at: 0.6, base: 0.08, h: 0.02, sweep: 0.05 },
    flippers: { at: 0.27, len: 0.11, width: 0.04 },
    fluke: { span: 0.27, chord: 0.08 },
  },
  archaicBaleen: {
    name: "early baleen whale",
    length: 6,
    range: [2, 10],
    profile: [[0, 0.015, 0.025], [0.06, 0.04, 0.05], [0.2, 0.075, 0.075], [0.4, 0.09, 0.085], [0.6, 0.075, 0.065], [0.8, 0.04, 0.028], [0.92, 0.02, 0.012], [1, 0.006, 0.004]],
    dorsal: { at: 0.55, base: 0.1, h: 0.06, sweep: 0.06 },
    flippers: { at: 0.24, len: 0.12, width: 0.045 },
    fluke: { span: 0.24, chord: 0.075 },
  },
  dorudon: {
    name: "basilosaurid",
    length: 5,
    range: [3, 10],
    profile: [[0, 0.012, 0.012], [0.08, 0.035, 0.03], [0.13, 0.055, 0.05], [0.3, 0.085, 0.075], [0.5, 0.075, 0.065], [0.7, 0.05, 0.035], [0.88, 0.025, 0.013], [1, 0.006, 0.004]],
    dorsal: { at: 0.48, base: 0.1, h: 0.05, sweep: 0.06 },
    flippers: { at: 0.2, len: 0.1, width: 0.04 },
    fluke: { span: 0.18, chord: 0.06 },
    legs: { front: { at: 0, len: 0, r: 0 }, back: { at: 0.66, len: 0.025, r: 0.005 } },
  },
  basilosaurus: {
    name: "Basilosaurus",
    length: 17,
    range: [10, 21],
    profile: [[0, 0.008, 0.008], [0.05, 0.022, 0.02], [0.08, 0.035, 0.03], [0.2, 0.05, 0.045], [0.6, 0.048, 0.042], [0.85, 0.03, 0.02], [0.97, 0.012, 0.007], [1, 0.005, 0.004]],
    flippers: { at: 0.12, len: 0.06, width: 0.025 },
    fluke: { span: 0.08, chord: 0.04 },
    legs: { front: { at: 0, len: 0, r: 0 }, back: { at: 0.7, len: 0.018, r: 0.004 } },
  },
  protocetid: {
    name: "protocetid",
    length: 2.6,
    range: [1.5, 4],
    profile: [[0, 0.01, 0.01], [0.12, 0.025, 0.022], [0.16, 0.04, 0.035], [0.3, 0.07, 0.06], [0.45, 0.075, 0.065], [0.6, 0.05, 0.04], [0.8, 0.022, 0.014], [1, 0.005, 0.004]],
    legs: { front: { at: 0.28, len: 0.08, r: 0.012 }, back: { at: 0.52, len: 0.1, r: 0.015 } },
  },
  remingtonocetid: {
    name: "remingtonocetid",
    length: 2.5,
    range: [1.5, 4],
    profile: [[0, 0.008, 0.008], [0.18, 0.018, 0.016], [0.22, 0.038, 0.032], [0.35, 0.06, 0.05], [0.5, 0.062, 0.052], [0.65, 0.04, 0.032], [0.82, 0.018, 0.012], [1, 0.005, 0.004]],
    legs: { front: { at: 0.32, len: 0.07, r: 0.011 }, back: { at: 0.55, len: 0.085, r: 0.013 } },
  },
  ambulocetus: {
    name: "Ambulocetus",
    length: 3,
    range: [2, 4],
    profile: [[0, 0.012, 0.016], [0.14, 0.03, 0.035], [0.2, 0.05, 0.05], [0.35, 0.075, 0.07], [0.5, 0.075, 0.07], [0.65, 0.05, 0.045], [0.85, 0.022, 0.018], [1, 0.005, 0.004]],
    legs: { front: { at: 0.3, len: 0.07, r: 0.016 }, back: { at: 0.55, len: 0.08, r: 0.02 } },
  },
  pakicetid: {
    name: "pakicetid",
    length: 1.5,
    range: [0.8, 2.2],
    profile: [[0, 0.012, 0.01], [0.1, 0.03, 0.025], [0.14, 0.045, 0.035], [0.2, 0.04, 0.03], [0.32, 0.07, 0.055], [0.5, 0.075, 0.06], [0.62, 0.06, 0.05], [0.7, 0.025, 0.02], [1, 0.005, 0.004]],
    spine: [[0, 0.05], [0.2, 0.035], [0.4, 0], [0.7, 0], [1, -0.08]],
    legs: { front: { at: 0.3, len: 0.2, r: 0.012 }, back: { at: 0.58, len: 0.2, r: 0.014 } },
  },
  ungulate: {
    name: "even-toed ungulate",
    length: 1,
    range: [0.4, 3],
    profile: [[0, 0.015, 0.012], [0.1, 0.035, 0.03], [0.16, 0.05, 0.04], [0.22, 0.045, 0.035], [0.35, 0.08, 0.065], [0.6, 0.085, 0.07], [0.8, 0.06, 0.05], [0.9, 0.02, 0.015], [1, 0.005, 0.004]],
    spine: [[0, 0.07], [0.2, 0.05], [0.35, 0], [1, 0]],
    legs: { front: { at: 0.32, len: 0.24, r: 0.014 }, back: { at: 0.76, len: 0.24, r: 0.016 } },
  },
  hippo: {
    name: "hippopotamus",
    length: 4,
    range: [1.4, 5.5],
    profile: [[0, 0.08, 0.1], [0.08, 0.1, 0.12], [0.2, 0.11, 0.1], [0.3, 0.13, 0.13], [0.55, 0.2, 0.2], [0.8, 0.19, 0.18], [0.95, 0.12, 0.1], [1, 0.03, 0.03]],
    square: [[0, 3], [0.25, 2.5], [0.35, 2], [1, 2]],
    spine: [[0, -0.02], [0.3, 0], [1, 0]],
    legs: { front: { at: 0.38, len: 0.12, r: 0.04 }, back: { at: 0.82, len: 0.12, r: 0.045 } },
  },
  odobenocetops: {
    name: "Odobenocetops",
    length: 3.5,
    range: [2, 4.5],
    profile: [[0, 0.05, 0.045], [0.06, 0.075, 0.07], [0.15, 0.08, 0.075], [0.4, 0.1, 0.095], [0.6, 0.09, 0.08], [0.8, 0.05, 0.035], [0.92, 0.022, 0.012], [1, 0.006, 0.005]],
    flippers: { at: 0.2, len: 0.12, width: 0.055 },
    fluke: { span: 0.25, chord: 0.08 },
    tusk: { len: 0.25, down: true, pair: true },
  },
};
ARCHETYPES.narwhal = { ...ARCHETYPES.beluga, name: "narwhal", tusk: { len: 0.5 } };

/** Clade or genus -> archetype. Looked up from the taxon up its lineage: the
 *  first (most specific) match wins. */
const BY_TAXON: Record<string, string> = {
  // toothed whales
  Orcinus: "orca",
  Globicephala: "pilot",
  Pseudorca: "pilot",
  Feresa: "pilot",
  Peponocephala: "pilot",
  Grampus: "pilot",
  Orcaella: "porpoise",
  Delphinidae: "dolphin",
  Phocoenidae: "porpoise",
  Monodon: "narwhal",
  Monodontidae: "beluga",
  Odobenocetops: "odobenocetops",
  Platanistoidea: "river",
  Inioidea: "river",
  Lipotes: "river",
  Lipotidae: "river",
  Eurhinodelphinidae: "river",
  Ziphiidae: "beaked",
  Kogia: "kogia",
  Physeteroidea: "sperm",
  Odontoceti: "dolphin",
  // baleen whales
  Megaptera: "humpback",
  Balaenopteridae: "rorqual",
  Balaenopteroidea: "rorqual",
  Balaenidae: "right",
  Caperea: "right",
  Eschrichtius: "gray",
  Eschrichtiidae: "gray",
  Mysticeti: "archaicBaleen",
  // archaic whales
  Basilosaurus: "basilosaurus",
  Basilotritus: "basilosaurus",
  Platyosphys: "basilosaurus",
  Basiloterus: "basilosaurus",
  Basilosauridae: "dorudon",
  Protocetidae: "protocetid",
  Kalakocetus: "protocetid",
  Remingtonocetidae: "remingtonocetid",
  Ambulocetidae: "ambulocetus",
  Pakicetidae: "pakicetid",
  Cetacea: "dolphin",
  // relatives
  Raoellidae: "ungulate",
  Hippopotamidae: "hippo",
  Hippopotamoidea: "ungulate",
  Whippomorpha: "ungulate",
};

function lineageIds(data: MuseumData, id: string): string[] {
  const out: string[] = [];
  for (let t: Taxon | undefined = data.taxa[id]; t; t = t.parent ? data.taxa[t.parent] : undefined) out.push(t.id);
  return out;
}

/** The genus a clade room shows: its most-read descendant genus. */
export function representative(data: MuseumData, id: string): Taxon {
  const t = data.taxa[id];
  if (!t.children.length) return t;
  let best: Taxon = t;
  let score = -1;
  const walk = (x: Taxon) => {
    if (!x.children.length && x.pageviews > score) {
      best = x;
      score = x.pageviews;
    }
    x.children.forEach((c) => walk(data.taxa[c]));
  };
  walk(t);
  return best;
}

export function archetypeOf(data: MuseumData, id: string): Archetype {
  for (const a of lineageIds(data, id)) if (BY_TAXON[a]) return ARCHETYPES[BY_TAXON[a]];
  return dolphin;
}

/** Length (m) of the animal: the article's figure if plausible for its body plan. */
export function lifeLength(t: Taxon, a: Archetype): number {
  const l = t.lengthM;
  return l && l >= a.range[0] && l <= a.range[1] ? l : a.length;
}

export interface StatuePlan {
  /** The genus shown (the room's own, or a clade's representative). */
  subject: Taxon;
  archetype: Archetype;
  /** Real length and the length shown (m). */
  life: number;
  shown: number;
  /** Footprint (m): along the body, and across (fins and flukes included). */
  footprint: [number, number];
  /** Standing on legs, rather than mounted swimming. */
  standing: boolean;
}

export function planStatue(data: MuseumData, id: string, roomRadius: number): StatuePlan {
  const subject = representative(data, id);
  const a = archetypeOf(data, subject.id);
  const life = lifeLength(subject, a);
  const maxShown = Math.max(2, 2 * (roomRadius - 3.2));
  const shown = Math.min(life, maxShown);
  const across = Math.max(
    2 * Math.max(...a.profile.map((p) => p[2])),
    a.fluke ? a.fluke.span : 0,
    a.flippers ? 2 * (a.flippers.len * 0.8 + 0.08) : 0
  );
  const standing = !!a.legs && a.legs.front.len > 0.05;
  return { subject, archetype: a, life, shown, footprint: [shown, Math.max(0.6, across * shown)], standing };
}
