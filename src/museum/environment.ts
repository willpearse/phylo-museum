// What surrounds the visitor: fog, background, and what lies outside the
// corridors (a plain gallery, open water and seabed, ...). Environments are
// set on a clade and inherited by everything below it, so each lineage can
// have its own feel. A corridor takes its child's environment, and the fog
// blends from the parent's to the child's along it: that blend is the hook for
// a corridor that is itself a transition (e.g. going down under water between
// the hippos and the whales).

import * as THREE from "three";
import type { MuseumData } from "@/lib/types";

export interface Water {
  /** Colour near the surface (up) and in the depths (down / far). */
  shallow: string;
  deep: string;
  seabed: string;
  /** Caustic light on the floor and seabed, 0..1. */
  caustics: number;
  /** Drifting particles ("marine snow"). */
  particles: string;
  /** Seagrass / kelp colour, if anything grows on the seabed. */
  vegetation?: string;
}

/** How a lineage's rooms are finished inside: a museum hall. */
export interface Hall {
  /** Main wall colour, the dado below the rail, and the trim (rail, cornice, door frames). */
  wall: string;
  dado: string;
  trim: string;
  /** Polished floor: stone colour, inlaid lines, centre medallion. */
  floor: string;
  inlay: string;
  medallion: string;
  ceiling: string;
  plinth: string;
  /** Warm pools of light behind exhibits. */
  wash: string;
}

export interface Environment {
  name: string;
  hall: Hall;
  /** What corridors look like from inside, and what is beyond their walls. */
  outside: "gallery" | "ocean";
  fog: { color: string; near: number; far: number };
  water?: Water;
}

export const GALLERY: Environment = {
  name: "gallery",
  outside: "gallery",
  fog: { color: "#c9cfcf", near: 30, far: 160 },
  // a classic natural-history hall: warm stone walls, dark wood, pale marble
  hall: { wall: "#c9bca4", dado: "#4a3628", trim: "#6b5038", floor: "#d8d2c6", inlay: "#8f8270", medallion: "#6b5038", ceiling: "#e6dfd2", plinth: "#5a4c40", wash: "#fff0d2" },
};

/** Warm, green-blue shallows: the Tethys Sea of the first whales. */
export const TETHYS: Environment = {
  name: "tethys",
  outside: "ocean",
  fog: { color: "#2e7f86", near: 3, far: 46 },
  hall: { wall: "#2c5a57", dado: "#173634", trim: "#b8975a", floor: "#3c4744", inlay: "#b8975a", medallion: "#7fb8b0", ceiling: "#1f403e", plinth: "#22302f", wash: "#fff3d9" },
  water: { shallow: "#5fc0b8", deep: "#11454f", seabed: "#c8b98f", caustics: 1, particles: "#d9f2e6", vegetation: "#6f8a3a" },
};

/** Open ocean: the baleen whales. */
export const OPEN_OCEAN: Environment = {
  name: "open-ocean",
  outside: "ocean",
  fog: { color: "#14507a", near: 3, far: 50 },
  hall: { wall: "#203d58", dado: "#111f2e", trim: "#b8975a", floor: "#333c45", inlay: "#b8975a", medallion: "#7fa6c9", ceiling: "#16293c", plinth: "#1c2530", wash: "#fff3d9" },
  water: { shallow: "#3d8fc4", deep: "#071d36", seabed: "#8d8f86", caustics: 0.75, particles: "#cfe6f5" },
};

/** Teal coastal water: the toothed whales. */
export const COASTAL: Environment = {
  name: "coastal",
  outside: "ocean",
  fog: { color: "#1d6a7c", near: 3, far: 48 },
  hall: { wall: "#1f4b55", dado: "#112a31", trim: "#b8975a", floor: "#36423f", inlay: "#b8975a", medallion: "#78b4c0", ceiling: "#173a42", plinth: "#1d2a2e", wash: "#fff3d9" },
  water: { shallow: "#47a9b9", deep: "#0a3442", seabed: "#b3a888", caustics: 0.9, particles: "#d4eef0", vegetation: "#4e6b2c" },
};

/** Environment set directly on a clade (by its taxonomy-template id). */
const BY_CLADE: Record<string, Environment> = {
  Whippomorpha: GALLERY,
  Cetaceamorpha: TETHYS,
  Mysticeti: OPEN_OCEAN,
  Odontoceti: COASTAL,
};

export function envOf(data: MuseumData, id: string): Environment {
  for (let t = data.taxa[id]; t; t = t.parent ? data.taxa[t.parent] : (undefined as never)) {
    const e = BY_CLADE[t.id];
    if (e) return e;
    if (!t.parent) break;
  }
  return GALLERY;
}

/** Fog colour/near/far between two environments (k = 0..1). */
export function blendFog(a: Environment, b: Environment, k: number, out: { color: THREE.Color; near: number; far: number }) {
  out.color.set(a.fog.color).lerp(new THREE.Color(b.fog.color), k);
  out.near = a.fog.near + (b.fog.near - a.fog.near) * k;
  out.far = a.fog.far + (b.fog.far - a.fog.far) * k;
  return out;
}
