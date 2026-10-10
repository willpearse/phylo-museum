// The inside of a room, finished as a museum hall in its lineage's palette
// (environment.ts): dado, rail, wall and cornice in bands round the drum;
// framed doorways; a polished stone floor with an inlaid medallion; a
// coffered ceiling open at the centre, where a water room shows the sea
// above and lets caustic light fall on the floor.

import { useMemo } from "react";
import * as THREE from "three";
import { Instance, Instances } from "@react-three/drei";
import { CORRIDOR_H, WALL_H, dirOf, doorHalfAngle, type RoomPlan } from "./layout";
import type { Environment, Hall } from "./environment";
import { withCaustics } from "./ocean";

const RAIL = 1.0;
const RAIL_H = 0.07;
const CORNICE = 0.42;
const FRAME_W = 0.22;
const TAU = Math.PI * 2;

/** Free intervals of [-π, π] once `blocked` (which may wrap past ±π) are removed. */
export function complement(blocked: [number, number][]): [number, number][] {
  const parts: [number, number][] = [];
  for (const [a, b] of blocked) {
    if (a < -Math.PI) parts.push([a + TAU, Math.PI], [-Math.PI, b]);
    else if (b > Math.PI) parts.push([a, Math.PI], [-Math.PI, b - TAU]);
    else parts.push([a, b]);
  }
  parts.sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let cur = -Math.PI;
  for (const [a, b] of parts) {
    if (a > cur + 1e-4) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < Math.PI - 1e-4) out.push([cur, Math.PI]);
  return out;
}

/** One merged strip of wall facing the centre: radius r, from y0 to y1, over
 *  each of the arcs. */
function band(r: number, arcs: [number, number][], y0: number, y1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (const [a0, a1] of arcs) {
    const n = Math.max(1, Math.ceil((a1 - a0) / 0.06));
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const d = dirOf(a);
      pos.push(d.x * r, y0, d.z * r, d.x * r, y1, d.z * r);
      nrm.push(-d.x, 0, -d.z, -d.x, 0, -d.z);
    }
    for (let i = 0; i < n; i++) {
      const v = base + i * 2;
      // wound to face the centre
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** The floor: polished stone in rings and radial slabs round an inlaid medallion. */
function floorTexture(h: Hall): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const R = S / 2;
  g.fillStyle = h.floor;
  g.fillRect(0, 0, S, S);
  // a faint mottling, so it reads as stone
  for (let i = 0; i < 1400; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 12543.123) % 1;
    g.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},0.035)`;
    g.beginPath();
    g.arc(R + x * R, R + y * R, 6 + (i % 13) * 2, 0, TAU);
    g.fill();
  }
  g.strokeStyle = h.inlay;
  g.globalAlpha = 0.75;
  for (const [f, w] of [[0.98, 10], [0.9, 3], [0.62, 6], [0.58, 2], [0.3, 4]] as const) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(R, R, R * f, 0, TAU);
    g.stroke();
  }
  // radial joints between the slabs
  g.lineWidth = 2;
  g.globalAlpha = 0.45;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    for (const [f0, f1] of [[0.62, 0.9], [0.3, 0.58]] as const) {
      if (f0 === 0.3 && i % 2) continue;
      g.beginPath();
      g.moveTo(R + Math.cos(a) * R * f0, R + Math.sin(a) * R * f0);
      g.lineTo(R + Math.cos(a) * R * f1, R + Math.sin(a) * R * f1);
      g.stroke();
    }
  }
  // the medallion: an eight-pointed star in a ring
  g.globalAlpha = 0.9;
  g.fillStyle = h.medallion;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - Math.PI / 2;
    const rr = R * (i % 2 ? 0.1 : 0.26);
    g.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = h.inlay;
  g.lineWidth = 5;
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const floorTextures = new Map<string, THREE.CanvasTexture>();

/** A soft pool of light for the wall behind an exhibit. */
export const washTexture = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 90, 0, 128, 110, 128);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

export function HallShell({ plan, env }: { plan: RoomPlan; env: Environment }) {
  const h = env.hall;
  const r = plan.radius;
  const half = doorHalfAngle(r);
  const oculus = Math.min(3.2, r * 0.32);

  const { geo, doorArcs } = useMemo(() => {
    const doorArcs = plan.doors.map((d) => [d.angle - half, d.angle + half] as [number, number]);
    const free = complement(doorArcs);
    const all: [number, number][] = [[-Math.PI, Math.PI]];
    return {
      doorArcs,
      geo: {
        dado: band(r, free, 0, RAIL),
        rail: band(r - 0.03, free, RAIL, RAIL + RAIL_H),
        wall: band(r, free, RAIL + RAIL_H, WALL_H - CORNICE),
        over: band(r, doorArcs, CORRIDOR_H + FRAME_W, WALL_H - CORNICE),
        lintel: band(r - 0.05, doorArcs.map(([a, b]) => [a - FRAME_W / r, b + FRAME_W / r] as [number, number]), CORRIDOR_H, CORRIDOR_H + FRAME_W),
        cornice: band(r - 0.06, all, WALL_H - CORNICE, WALL_H),
        corniceLip: band(r - 0.16, all, WALL_H - CORNICE - 0.06, WALL_H - CORNICE + 0.04),
      },
    };
  }, [plan, r, half]);

  const mats = useMemo(() => {
    let floorTex = floorTextures.get(h.floor + h.inlay + h.medallion);
    if (!floorTex) floorTextures.set(h.floor + h.inlay + h.medallion, (floorTex = floorTexture(h)));
    const floor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.05 });
    if (env.water) withCaustics(floor, env.water.caustics * 0.12, env.water.shallow);
    return {
      wall: new THREE.MeshStandardMaterial({ color: h.wall, roughness: 0.85 }),
      dado: new THREE.MeshStandardMaterial({ color: h.dado, roughness: 0.6 }),
      trim: new THREE.MeshStandardMaterial({ color: h.trim, roughness: 0.4, metalness: env.water ? 0.6 : 0.1 }),
      ceiling: new THREE.MeshStandardMaterial({ color: h.ceiling, roughness: 0.8, side: THREE.DoubleSide }),
      floor,
    };
  }, [h, env.water]);

  const beams = 12;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} material={mats.floor}>
        <circleGeometry args={[r + 0.05, 96]} />
      </mesh>

      <mesh geometry={geo.dado} material={mats.dado} />
      <mesh geometry={geo.rail} material={mats.trim} />
      <mesh geometry={geo.wall} material={mats.wall} />
      <mesh geometry={geo.over} material={mats.wall} />
      <mesh geometry={geo.lintel} material={mats.trim} />
      <mesh geometry={geo.cornice} material={mats.trim} />
      <mesh geometry={geo.corniceLip} material={mats.trim} />

      {/* door frames: posts either side of each doorway */}
      <Instances material={mats.trim} limit={Math.max(1, doorArcs.length * 2)}>
        <boxGeometry args={[FRAME_W, CORRIDOR_H + FRAME_W, 0.1]} />
        {doorArcs.flatMap(([a, b], i) =>
          [a - FRAME_W / 2 / r, b + FRAME_W / 2 / r].map((ang, k) => {
            const p = dirOf(ang).multiplyScalar(r - 0.05);
            return <Instance key={`${i}${k}`} position={[p.x, (CORRIDOR_H + FRAME_W) / 2, p.z]} rotation-y={-ang} />;
          })
        )}
      </Instances>

      {/* coffered ceiling, open at the centre */}
      <mesh rotation-x={Math.PI / 2} position-y={WALL_H} material={mats.ceiling}>
        <ringGeometry args={[oculus, r + 0.05, 96, 1]} />
      </mesh>
      <Instances material={mats.trim} limit={beams}>
        <boxGeometry args={[r - oculus, 0.16, 0.1]} />
        {Array.from({ length: beams }, (_, i) => {
          const a = (i / beams) * TAU;
          const p = dirOf(a).multiplyScalar((r + oculus) / 2);
          return <Instance key={i} position={[p.x, WALL_H - 0.11, p.z]} rotation-y={-a + Math.PI / 2} />;
        })}
      </Instances>
      {[oculus, (r + oculus) / 2].map((rr) => (
        <mesh key={rr} position-y={WALL_H - 0.11} rotation-x={Math.PI / 2} material={mats.trim}>
          <torusGeometry args={[rr, 0.06, 6, 96]} />
        </mesh>
      ))}
    </group>
  );
}
