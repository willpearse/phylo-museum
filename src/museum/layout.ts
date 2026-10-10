// Geometry of the museum. Nothing here is laid out globally: a tree in
// Euclidean space would cross itself. Each room has its own frame (centre at
// the origin, the door back toward the root facing +z) and knows only where
// its neighbours sit relative to it. The scene draws the current room, its
// corridors and the rooms at their far ends; walking into a neighbour
// re-centres the world on it, so the visitor never sees the seams.

import * as THREE from "three";
import type { MuseumData, Taxon } from "@/lib/types";
import { planStatue, type StatuePlan } from "./statue-shapes";
import { envOf } from "./environment";

export const WALL_H = 5.4;
export const CORRIDOR_W = 4.2;
/** Corridor ceiling, and the height of the doorways into it. */
export const CORRIDOR_H = 3.6;
/** Half-width of a corridor's walkway: lecterns and rails stand beyond it. */
export const WALK_HALF = 1.35;
/** The lectern before the statue: panel size (m), and its depth on the floor. */
export const LECTERN = { w: 1.5, h: 1.05, depth: 0.9 };
export const EYE_HEIGHT = 1.65;
export const BODY = 0.35;
/** Corridor metres per million years, and the shortest corridor. */
export const M_PER_MYR = 3;
export const MIN_CORRIDOR = 9;
/** Shortest corridor that changes environment (e.g. going under water). */
export const TRANSITION_MIN = 42;
/** Width of wall an exhibit (image + label) takes. */
export const EXHIBIT_SPAN = 3.4;
/** Corridor wall a collapsed clade (panel + image) takes. */
export const WAYPOINT_SPAN = 4.6;

/** Direction of a door at angle `a` (0 = straight ahead, -z; positive turns right, +x). */
export function dirOf(a: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
}

/** Angular half-width of a doorway in a wall of radius r. */
export function doorHalfAngle(r: number, w = CORRIDOR_W): number {
  return Math.asin(Math.min(0.95, w / 2 / r));
}

export interface Door {
  /** Taxon the door leads to. */
  to: string;
  angle: number;
  kind: "parent" | "child";
}

export interface RoomPlan {
  taxon: Taxon;
  radius: number;
  doors: Door[];
  /** Free wall arcs [a0, a1] (radians, increasing) for exhibits. */
  arcs: [number, number][];
}

/** Things hung on a room's walls: its image, the article's figures, its species. */
export function exhibitCount(t: Taxon): number {
  return (t.image ? 1 : 0) + (t.figures?.length ?? 0) + t.species.length;
}

/** The plinth at the centre (statue on it, long axis along x) and the lectern
 *  between it and the entrance. */
export interface Furniture {
  statue: StatuePlan;
  plinth: { w: number; d: number; h: number };
  /** The lectern stands to one side of the way in, so the statue is in full view. */
  lectern: { x: number; z: number };
}

const furnitureCache = new WeakMap<RoomPlan, Furniture>();

export function furnitureOf(data: MuseumData, plan: RoomPlan): Furniture {
  const hit = furnitureCache.get(plan);
  if (hit) return hit;
  const statue = planStatue(data, plan.taxon.id, plan.radius);
  // keep the plinth's depth to a share of the room, shrinking the statue if need be
  const maxD = plan.radius * 0.5;
  if (statue.footprint[1] + 0.6 > maxD) {
    const k = (maxD - 0.6) / statue.footprint[1];
    statue.shown *= k;
    statue.footprint = [statue.footprint[0] * k, statue.footprint[1] * k];
  }
  const plinth = { w: statue.footprint[0] + 0.7, d: statue.footprint[1] + 0.7, h: statue.standing ? 0.45 : 0.3 };
  const f: Furniture = { statue, plinth, lectern: { x: Math.min(plinth.w / 2, plan.radius * 0.45), z: plinth.d / 2 + 1.3 } };
  furnitureCache.set(plan, f);
  return f;
}

const planCache = new WeakMap<Taxon, RoomPlan>();

export function planRoom(data: MuseumData, t: Taxon): RoomPlan {
  const cached = planCache.get(t);
  if (cached) return cached;
  const nChild = t.children.length;
  // Spread the child doors across the far side of the room, oldest lineage
  // to the left; the parent door is behind (+z).
  const spread = nChild <= 1 ? 0 : Math.min((200 * Math.PI) / 180, (nChild - 1) * 0.62);
  // Radius: room for the doors, plus wall for the exhibits.
  const doorArc = (nChild + 1) * (CORRIDOR_W + 2.2);
  const exhibitArc = exhibitCount(t) * EXHIBIT_SPAN;
  let radius = Math.max(7, (doorArc + exhibitArc) / (2 * Math.PI) + 0.8);
  if (nChild > 1) radius = Math.max(radius, (CORRIDOR_W + 1.6) / (2 * Math.sin(spread / (nChild - 1) / 2)));
  radius = Math.min(radius, 26);

  const doors: Door[] = [];
  if (t.parent) doors.push({ to: t.parent, angle: Math.PI, kind: "parent" });
  t.children.forEach((c, i) => {
    const a = nChild === 1 ? 0 : -spread / 2 + (spread * i) / (nChild - 1);
    doors.push({ to: c, angle: a, kind: "child" });
  });

  // free arcs between doors, walking around from -π, with clearance beside
  // each doorway for its frame
  const half = doorHalfAngle(radius) + 0.35 / radius;
  const blocked: [number, number][] = [];
  for (const d of doors) {
    const a0 = norm(d.angle) - half;
    const a1 = norm(d.angle) + half;
    // a door across ±π (the entrance) blocks both ends of the range
    if (a1 > Math.PI) blocked.push([a0, Math.PI], [-Math.PI, a1 - 2 * Math.PI]);
    else if (a0 < -Math.PI) blocked.push([a0 + 2 * Math.PI, Math.PI], [-Math.PI, a1]);
    else blocked.push([a0, a1]);
  }
  blocked.sort((a, b) => a[0] - b[0]);
  const arcs: [number, number][] = [];
  let cur = -Math.PI;
  for (const [a0, a1] of blocked) {
    if (a0 > cur + 0.01) arcs.push([cur, a0]);
    cur = Math.max(cur, a1);
  }
  if (cur < Math.PI - 0.01) arcs.push([cur, Math.PI]);
  const plan = { taxon: t, radius, doors, arcs: arcs.map(([a, b]) => [Math.max(a, -Math.PI), Math.min(b, Math.PI)] as [number, number]).filter(([a, b]) => b - a > 0.02) };
  planCache.set(t, plan);
  void data;
  return plan;
}

/** Angle in (-π, π]. */
function norm(a: number): number {
  let x = a;
  while (x <= -Math.PI) x += 2 * Math.PI;
  while (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** Corridor length (m) from a parent room to `child`: time between the two
 *  first appearances, at M_PER_MYR, never shorter than MIN_CORRIDOR. */
export function corridorLength(parent: Taxon, child: Taxon): number {
  const dt = Math.max(0, parent.start - child.start);
  return Math.max(MIN_CORRIDOR, dt * M_PER_MYR);
}

export interface Link {
  /** Parent and child room plans of the corridor. */
  parent: RoomPlan;
  child: RoomPlan;
  angle: number;
  length: number;
  /** Distance between the two room centres. */
  span: number;
  /** Where the corridor leaves the parent room / enters the child room, as
   *  distances from the parent's centre along the door direction. */
  s0: number;
  s1: number;
}

const lengthCache = new WeakMap<MuseumData, Map<string, Map<string, number>>>();

/**
 * Corridor lengths from one room to each of its children, laid out together.
 * Each starts at its time-scaled length (and enough wall for the clades hung
 * in it); then, since the rooms at the far ends are drawn together, any room
 * that would overlap a sibling room, a sibling's corridor, or the room and
 * corridor behind the parent is pushed further out along its own corridor.
 * The doors fan out, so pushing out always opens a gap.
 */
function childLengths(data: MuseumData, parentId: string): Map<string, number> {
  let byParent = lengthCache.get(data);
  if (!byParent) lengthCache.set(data, (byParent = new Map()));
  const hit = byParent.get(parentId);
  if (hit) return hit;
  const parent = planRoom(data, data.taxa[parentId]);
  const kids = parent.doors.filter((d) => d.kind === "child").map((d) => {
    const plan = planRoom(data, data.taxa[d.to]);
    let length = Math.max(corridorLength(parent.taxon, plan.taxon), (plan.taxon.corridor.length * WAYPOINT_SPAN) / 2 + 8);
    // a corridor between two kinds of surroundings (into the water) needs room for the change
    if (envOf(data, parentId).outside !== envOf(data, d.to).outside) length = Math.max(length, TRANSITION_MIN);
    return { id: d.to, plan, angle: d.angle, length };
  });
  // obstacles that do not move: the parent's own parent room and its corridor (behind, +z)
  const fixed: { c: THREE.Vector3; r: number; angle: number; from: number; to: number }[] = [];
  const pp = parent.taxon.parent;
  if (pp) {
    const back = linkOf(data, pp, parentId);
    fixed.push({ c: dirOf(Math.PI).multiplyScalar(back.span), r: back.parent.radius, angle: Math.PI, from: parent.radius, to: back.span });
  }
  const centre = (k: (typeof kids)[number]) => dirOf(k.angle).multiplyScalar(parent.radius + k.length + k.plan.radius);
  /** Distance from point p to the corridor strip leaving at `angle`, if p lies alongside it. */
  const offStrip = (p: THREE.Vector3, angle: number, from: number, to: number) => {
    const d = dirOf(angle);
    const along = p.x * d.x + p.z * d.z;
    if (along < from || along > to) return Infinity;
    return Math.abs(p.x * -d.z + p.z * d.x);
  };
  const MARGIN = 1.5;
  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (const k of kids) {
      const c = centre(k);
      let clash = false;
      for (const o of kids) {
        if (o === k) continue;
        const oc = centre(o);
        // the longer corridor yields, so short (time-faithful) ones stay short
        if (c.distanceTo(oc) < k.plan.radius + o.plan.radius + MARGIN && (k.length > o.length || (k.length === o.length && k.angle > o.angle))) clash = true;
        if (offStrip(c, o.angle, parent.radius, parent.radius + o.length) < k.plan.radius + CORRIDOR_W / 2 + MARGIN) clash = true;
      }
      for (const f of fixed) {
        if (c.distanceTo(f.c) < k.plan.radius + f.r + MARGIN) clash = true;
        if (offStrip(c, f.angle, f.from, f.to) < k.plan.radius + CORRIDOR_W / 2 + MARGIN) clash = true;
      }
      if (clash) {
        k.length += 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const out = new Map(kids.map((k) => [k.id, k.length]));
  byParent.set(parentId, out);
  return out;
}

export function linkOf(data: MuseumData, parentId: string, childId: string): Link {
  const parent = planRoom(data, data.taxa[parentId]);
  const child = planRoom(data, data.taxa[childId]);
  const door = parent.doors.find((d) => d.to === childId)!;
  const length = childLengths(data, parentId).get(childId)!;
  const span = parent.radius + length + child.radius;
  const s0 = Math.sqrt(parent.radius ** 2 - (CORRIDOR_W / 2) ** 2);
  const s1 = span - Math.sqrt(child.radius ** 2 - (CORRIDOR_W / 2) ** 2);
  return { parent, child, angle: door.angle, length, span, s0, s1 };
}

/** Matrix taking the child room's frame into the parent room's frame. */
export function childFrame(link: Link): THREE.Matrix4 {
  const p = dirOf(link.angle).multiplyScalar(link.span);
  return new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -link.angle), new THREE.Vector3(1, 1, 1));
}

/** One neighbouring room as seen from the current room's frame. */
export interface Neighbour {
  plan: RoomPlan;
  /** Neighbour frame -> current frame. */
  matrix: THREE.Matrix4;
  /** The corridor between the current room and this one. */
  link: Link;
  /** Corridor frame (parent room's frame) -> current frame. */
  linkMatrix: THREE.Matrix4;
  kind: "parent" | "child";
}

export function neighbours(data: MuseumData, id: string): Neighbour[] {
  const t = data.taxa[id];
  const out: Neighbour[] = [];
  for (const c of t.children) {
    const link = linkOf(data, id, c);
    out.push({ plan: link.child, matrix: childFrame(link), link, linkMatrix: new THREE.Matrix4(), kind: "child" });
  }
  if (t.parent) {
    const link = linkOf(data, t.parent, id);
    const toCurrent = childFrame(link).invert();
    out.push({ plan: link.parent, matrix: toCurrent, link, linkMatrix: toCurrent.clone(), kind: "parent" });
  }
  return out;
}

/** A room two doors away, as drawn from the current room. */
export interface Far {
  /** The neighbour it lies beyond, and its link from there. */
  via: Neighbour;
  m: Neighbour;
  /** Far room frame -> current frame. */
  matrix: THREE.Matrix4;
  /** False when it would overlap a room drawn nearer: only its corridor is drawn. */
  drawRoom: boolean;
}

/** The rooms one door beyond each neighbour (never back to `id`). The nearer
 *  rooms claim space first; a far room that would overlap any room already
 *  placed is not drawn (its corridor still is, fading into the fog). */
export function farRooms(data: MuseumData, id: string, ns: Neighbour[]): Far[] {
  const placed: { c: THREE.Vector3; r: number }[] = [{ c: new THREE.Vector3(), r: planRoom(data, data.taxa[id]).radius }];
  for (const n of ns) placed.push({ c: new THREE.Vector3().applyMatrix4(n.matrix), r: n.plan.radius });
  const out: Far[] = [];
  for (const via of ns) {
    for (const m of neighbours(data, via.plan.taxon.id)) {
      if (m.plan.taxon.id === id) continue;
      const matrix = via.matrix.clone().multiply(m.matrix);
      const c = new THREE.Vector3().applyMatrix4(matrix);
      const drawRoom = placed.every((p) => p.c.distanceTo(c) >= p.r + m.plan.radius + 0.5);
      if (drawRoom) placed.push({ c, r: m.plan.radius });
      out.push({ via, m, matrix, drawRoom });
    }
  }
  return out;
}

// ---- walking -------------------------------------------------------------------

/** Where a floor point of the current frame lies along a corridor: distance
 *  from the parent room's centre and from the corridor's centre line. */
export function corridorCoords(x: number, z: number, n: Neighbour): { along: number; across: number } {
  const v = new THREE.Vector3(x, 0, z).applyMatrix4(new THREE.Matrix4().copy(n.linkMatrix).invert());
  const d = dirOf(n.link.angle);
  return { along: v.x * d.x + v.z * d.z, across: v.x * -d.z + v.z * d.x };
}

/** Is the floor point (x, z) of the current frame walkable? Inside the
 *  current room, a neighbouring room, or on a corridor's walkway. */
export function walkable(x: number, z: number, data: MuseumData, id: string, ns: Neighbour[]): boolean {
  const here = planRoom(data, data.taxa[id]);
  const f = furnitureOf(data, here);
  if (Math.abs(x) < f.plinth.w / 2 + BODY && Math.abs(z) < f.plinth.d / 2 + BODY) return false;
  if (Math.abs(x - f.lectern.x) < LECTERN.w / 2 + BODY && Math.abs(z - f.lectern.z) < LECTERN.depth / 2 + BODY) return false;
  if (Math.hypot(x, z) < here.radius - BODY) return true;
  const v = new THREE.Vector3();
  for (const n of ns) {
    v.set(x, 0, z).applyMatrix4(new THREE.Matrix4().copy(n.matrix).invert());
    if (Math.hypot(v.x, v.z) < n.plan.radius - BODY) return true;
    const { along, across } = corridorCoords(x, z, n);
    // the walkway widens to the full doorway where it meets each room
    const nearDoor = along < n.link.s0 + 0.6 || along > n.link.s1 - 0.6;
    const half = nearDoor ? CORRIDOR_W / 2 - BODY : WALK_HALF;
    if (along > n.link.s0 - 1.5 && along < n.link.s1 + 1.5 && Math.abs(across) < half) return true;
  }
  return false;
}

/** The corridor a point is in, with how far along it (0 at the parent's
 *  door, 1 at the child's), or null inside a room. */
export function corridorAt(x: number, z: number, data: MuseumData, id: string, ns: Neighbour[]): { n: Neighbour; k: number } | null {
  const here = planRoom(data, data.taxa[id]);
  if (Math.hypot(x, z) < here.radius) return null;
  for (const n of ns) {
    const { along, across } = corridorCoords(x, z, n);
    if (along >= n.link.s0 - 0.5 && along <= n.link.s1 + 0.5 && Math.abs(across) < CORRIDOR_W) {
      return { n, k: Math.min(1, Math.max(0, (along - n.link.s0) / (n.link.s1 - n.link.s0))) };
    }
  }
  return null;
}

/** The neighbour whose room the point is inside (to re-centre on), if any. */
export function roomAt(x: number, z: number, ns: Neighbour[]): Neighbour | null {
  const v = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  for (const n of ns) {
    v.set(x, 0, z).applyMatrix4(inv.copy(n.matrix).invert());
    if (Math.hypot(v.x, v.z) < n.plan.radius - 1.2) return n;
  }
  return null;
}

/** Time (Ma) at distance `s` along a corridor (from the parent's centre). */
export function timeAlong(link: Link, s: number): number {
  const k = (s - link.s0) / (link.s1 - link.s0);
  return link.parent.taxon.start + (link.child.taxon.start - link.parent.taxon.start) * Math.min(1, Math.max(0, k));
}

/** Distance along a corridor at time `ma`. */
export function alongAt(link: Link, ma: number): number {
  const t0 = link.parent.taxon.start;
  const t1 = link.child.taxon.start;
  const k = t0 === t1 ? 0.5 : (t0 - ma) / (t0 - t1);
  return link.s0 + (link.s1 - link.s0) * Math.min(1, Math.max(0, k));
}

/** Path from the root to `id`. */
export function lineage(data: MuseumData, id: string): Taxon[] {
  const out: Taxon[] = [];
  for (let t: Taxon | undefined = data.taxa[id]; t; t = t.parent ? data.taxa[t.parent] : undefined) out.unshift(t);
  return out;
}
