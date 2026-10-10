// A stylised statue of a room's animal, built from its archetype
// (statue-shapes.ts): a lofted body with fins, flukes, legs or tusks. Living
// animals are carved in white marble, extinct ones cast in bronze. Swimmers
// are mounted on a rod above the plinth; walkers stand on it.

import { useMemo } from "react";
import * as THREE from "three";
import type { Archetype, StatuePlan } from "./statue-shapes";

// ---- profile sampling ------------------------------------------------------------

/** Catmull-Rom through [t, v] control points, clamped at the ends. */
function sample(points: [number, number][], t: number): number {
  if (t <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (t >= last[0]) return last[1];
  let k = 0;
  while (k < points.length - 2 && t > points[k + 1][0]) k++;
  const p0 = points[Math.max(0, k - 1)][1];
  const p1 = points[k][1];
  const p2 = points[k + 1][1];
  const p3 = points[Math.min(points.length - 1, k + 2)][1];
  const u = (t - points[k][0]) / (points[k + 1][0] - points[k][0]);
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

export interface Body {
  /** Half-height, half-width and centre-line height at t (0 snout .. 1 tail). */
  h: (t: number) => number;
  w: (t: number) => number;
  y: (t: number) => number;
  n: (t: number) => number;
}

export function bodyOf(a: Archetype): Body {
  const hs = a.profile.map(([t, h]) => [t, h] as [number, number]);
  const ws = a.profile.map(([t, , w]) => [t, w] as [number, number]);
  const ys = a.spine ?? [[0, 0], [1, 0]];
  const ns = a.square ?? [[0, 2], [1, 2]];
  return {
    h: (t) => Math.max(0.002, sample(hs, t)),
    w: (t) => Math.max(0.002, sample(ws, t)),
    y: (t) => sample(ys, t),
    n: (t) => Math.max(2, sample(ns, t)),
  };
}

/** Share of the body length over which snout and tail tips are rounded. */
const NOSE = 0.035;
const TAIL = 0.02;

/** x of body position t: snout at +0.5, tail at -0.5 (body length 1). */
const xOf = (t: number) => 0.5 - t;

function bodyGeometry(b: Body, segs = 84, around = 32): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (1 - Math.cos((Math.PI * i) / segs)) / 2; // denser at snout and tail
    // round off the snout and tail tips: a quarter-circle over the last stretch
    const tip = Math.min(1, t / NOSE, (1 - t) / TAIL);
    const round = Math.sqrt(1 - (1 - tip) ** 2);
    const h = b.h(t) * round;
    const w = b.w(t) * round;
    const y0 = b.y(t);
    const e = 2 / b.n(t);
    for (let j = 0; j < around; j++) {
      const th = (2 * Math.PI * j) / around;
      const c = Math.cos(th);
      const s = Math.sin(th);
      pos.push(xOf(t), y0 + h * Math.sign(s) * Math.abs(s) ** e, w * Math.sign(c) * Math.abs(c) ** e);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b2 = i * around + ((j + 1) % around);
      const c = a + around;
      const d = b2 + around;
      idx.push(a, c, b2, b2, c, d);
    }
  // caps
  const tip = pos.length / 3;
  pos.push(xOf(0) + 0.002, b.y(0), 0);
  const tail = tip + 1;
  pos.push(xOf(1) - 0.002, b.y(1), 0);
  for (let j = 0; j < around; j++) {
    idx.push(tip, j, (j + 1) % around);
    idx.push(tail, segs * around + ((j + 1) % around), segs * around + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function extrude(shape: THREE.Shape, thickness: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.5,
    bevelSize: thickness * 0.45,
    bevelSegments: 2,
    curveSegments: 14,
  });
  g.translate(0, 0, -thickness / 2);
  g.computeVertexNormals();
  return g;
}

/** All the parts of a statue, in body units (length 1), feet or belly at y = 0. */
export function statueGeometry(a: Archetype): { parts: THREE.BufferGeometry[]; height: number } {
  const b = bodyOf(a);
  const parts: THREE.BufferGeometry[] = [bodyGeometry(b)];

  if (a.dorsal && a.dorsal.h > 0) {
    const { at, base, h, sweep } = a.dorsal;
    const xl = xOf(at);
    const top = b.y(at + base / 2) + b.h(at + base / 2) * 0.92;
    const s = new THREE.Shape();
    s.moveTo(xl, -0.02);
    s.quadraticCurveTo(xl - base * 0.05, h * 0.75, xl - sweep - base * 0.35, h);
    s.quadraticCurveTo(xl - base * 0.75, h * 0.45, xl - base, -0.02);
    s.lineTo(xl, -0.02);
    const g = extrude(s, Math.min(0.014, base * 0.12));
    g.translate(0, top, 0);
    parts.push(g);
  }

  if (a.flippers) {
    const { at, len, width } = a.flippers;
    for (const side of [-1, 1]) {
      // a teardrop paddle: narrow at the root, broadest two-thirds out, rounded tip
      const s = new THREE.Shape();
      const hw = width / 2;
      const pts = [[0.35, -0.85], [0.68, -1], [0.92, -0.6], [1, 0], [0.92, 0.6], [0.68, 1], [0.35, 0.85], [0, 0.4]].map(([x, y]) => new THREE.Vector2(x * len, y * hw));
      s.moveTo(0, -0.4 * hw);
      s.splineThru(pts);
      s.lineTo(0, -0.4 * hw);
      const g = extrude(s, Math.min(0.012, width * 0.25));
      g.rotateX(Math.PI / 2); // lie flat: length along x, width along z, thickness along y
      // point out, down and back, with the blade kept nearly flat (its face
      // tilted only a little outward), as a whale holds its flippers
      const u = new THREE.Vector3(-0.55, -0.45, 0.7 * side).normalize();
      const n = new THREE.Vector3(0, 1, 0.12 * side).addScaledVector(u, -new THREE.Vector3(0, 1, 0.12 * side).dot(u)).normalize();
      const w = new THREE.Vector3().crossVectors(u, n);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(u, n, w));
      g.translate(xOf(at), b.y(at) - b.h(at) * 0.45, side * b.w(at) * 0.75);
      parts.push(g);
    }
  }

  if (a.fluke) {
    const { span: sp, chord: c } = a.fluke;
    const s = new THREE.Shape();
    const pts = [
      [0, -0.015], [-0.35 * c, -0.33 * sp], [-0.78 * c, -0.5 * sp], [-0.98 * c, -0.43 * sp], [-0.8 * c, -0.16 * sp],
      [-0.64 * c, 0], [-0.8 * c, 0.16 * sp], [-0.98 * c, 0.43 * sp], [-0.78 * c, 0.5 * sp], [-0.35 * c, 0.33 * sp], [0, 0.015],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    s.moveTo(pts[0].x, pts[0].y);
    s.splineThru(pts.slice(1));
    s.lineTo(pts[0].x, pts[0].y);
    const g = extrude(s, Math.min(0.012, c * 0.12));
    g.rotateX(Math.PI / 2);
    g.translate(xOf(1) + c * 0.2, b.y(1), 0);
    parts.push(g);
  }

  let feet = Infinity;
  if (a.legs) {
    for (const leg of [a.legs.front, a.legs.back]) {
      if (leg.len <= 0) continue;
      for (const side of [-1, 1]) {
        const top = b.y(leg.at) - b.h(leg.at) * 0.4;
        const length = leg.len + b.h(leg.at) * 0.4;
        const g = new THREE.CylinderGeometry(leg.r, leg.r * 0.75, length, 10);
        g.translate(xOf(leg.at), top - length / 2, side * b.w(leg.at) * 0.6);
        parts.push(g);
        const foot = new THREE.SphereGeometry(leg.r * 1.05, 10, 6);
        foot.scale(1.3, 0.45, 1);
        foot.translate(xOf(leg.at) + leg.r * 0.6, top - length, side * b.w(leg.at) * 0.6);
        parts.push(foot);
        feet = Math.min(feet, top - length - leg.r * 0.7);
      }
    }
  }

  if (a.tusk) {
    const { len, down, pair } = a.tusk;
    for (const side of pair ? [-1, 1] : [1]) {
      const g = new THREE.ConeGeometry(0.008, len, 10);
      // cone points +y: turn it to point forward (or down and back)
      const dir = down ? new THREE.Vector3(-0.35, -1, 0).normalize() : new THREE.Vector3(1, 0.05, 0).normalize();
      g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      g.translate(xOf(0.02), b.y(0.02) - (down ? b.h(0.02) * 0.6 : 0), pair ? side * 0.025 : 0.012);
      parts.push(g);
    }
  }

  // drop the statue onto y = 0: feet, or the lowest point of the body and fins
  let low = feet;
  if (!Number.isFinite(low)) {
    low = Infinity;
    for (const g of parts) {
      g.computeBoundingBox();
      low = Math.min(low, g.boundingBox!.min.y);
    }
  }
  let high = -Infinity;
  for (const g of parts) {
    g.translate(0, -low, 0);
    g.computeBoundingBox();
    high = Math.max(high, g.boundingBox!.max.y);
  }
  return { parts, height: high };
}

const MARBLE = new THREE.MeshStandardMaterial({ color: "#eeebe4", roughness: 0.42, metalness: 0 });
const BRONZE = new THREE.MeshStandardMaterial({ color: "#9a7448", roughness: 0.38, metalness: 0.75 });
const ROD = new THREE.MeshStandardMaterial({ color: "#3a3a3a", roughness: 0.4, metalness: 0.6 });

/** The statue, scaled to plan.shown, standing (or mounted) on y = 0. */
export function Statue({ plan, extinct }: { plan: StatuePlan; extinct: boolean }) {
  const { parts, height } = useMemo(() => statueGeometry(plan.archetype), [plan.archetype]);
  const s = plan.shown;
  // swimmers ride a rod, belly at about waist height (lower for giants)
  const lift = plan.standing ? 0 : Math.max(0.35, Math.min(0.95, 1.6 - s * 0.08));
  const mat = extinct ? BRONZE : MARBLE;
  return (
    <group>
      {lift > 0 && (
        <mesh material={ROD} position={[0, lift / 2 + 0.05, 0]}>
          <cylinderGeometry args={[0.035, 0.05, lift + 0.1, 10]} />
        </mesh>
      )}
      <group position-y={lift} scale={s}>
        {parts.map((g, i) => (
          <mesh key={i} geometry={g} material={mat} castShadow />
        ))}
      </group>
      <group userData={{ height: lift + height * s }} />
    </group>
  );
}
