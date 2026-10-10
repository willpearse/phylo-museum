// A corridor: one lineage, walked from the parent room toward the child.
// Distance is time: it is marked in millions of years and coloured by
// geological epoch, and the clades Wikipedia names along the way (collapsed
// out of the pruned tree) stand where they first appear.
//
// What a corridor is built as depends on its environment (environment.ts):
// a walled gallery, or a glass tunnel through open water.
//
// Coordinates: the group is rotated so the corridor runs along -z, from
// z = -s0 (parent room's doorway) to z = -s1 (child room's doorway); on the
// way toward the child, -x is on your left.

import { useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import * as THREE from "three";
import { EPOCHS, formatMa, type GeoInterval } from "@/lib/geotime";
import type { Waypoint } from "@/lib/types";
import { CORRIDOR_H, CORRIDOR_W, WALK_HALF, WAYPOINT_SPAN, alongAt, type Link } from "./layout";
import { FramedImage, Panel } from "./Exhibit";
import { capital, commonName, isItalic, themeOf, waypointItem } from "./items";
import { markTexture, type PanelSpec } from "./panels";
import type { Environment } from "./environment";
import { Kelp, LightShafts, MarineSnow, Rocks, Seabed, Swimmers, WaterSurface, withCaustics, type Clear, type SwimmerSpec } from "./ocean";

const HALF = CORRIDOR_W / 2;

function mix(a: string, b: string, k: number): string {
  return "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
}

/** Tick step (Myr) giving marks at least ~7 m apart. */
function tickStep(link: Link): number {
  const dt = link.parent.taxon.start - link.child.taxon.start;
  const metres = link.s1 - link.s0;
  if (dt <= 0) return 0;
  const perM = dt / metres;
  return [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].find((s) => s / perM >= 7) ?? 20;
}

/** Along-corridor positions for the waypoints: at their dates where known,
 *  then nudged apart so neighbours on the same side never overlap. */
function waypointPositions(link: Link, ws: Waypoint[]): number[] {
  const lo = link.s0 + 3;
  const hi = link.s1 - 3;
  const n = ws.length;
  if (!n) return [];
  const want = ws.map((w, i) => (w.start != null ? alongAt(link, w.start) : lo + ((hi - lo) * (i + 1)) / (n + 1)));
  const gap = WAYPOINT_SPAN / 2;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) pos.push(Math.max(want[i], i ? pos[i - 1] + gap : lo));
  if (pos[n - 1] > hi) for (let i = 0; i < n; i++) pos[i] = n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (n - 1);
  return pos;
}

interface Band {
  z0: number;
  z1: number;
  epoch: GeoInterval;
}

/** What both kinds of corridor show: epoch bands, boundaries, ticks, waypoints. */
function useTimeline(link: Link) {
  const t0 = link.parent.taxon.start;
  const t1 = link.child.taxon.start;
  return useMemo(() => {
    const bands: Band[] = [];
    for (const e of EPOCHS) {
      if (t0 === t1) {
        if (t0 <= e.start && t0 >= e.end) {
          bands.push({ z0: link.s0, z1: link.s1, epoch: e });
          break;
        }
        continue;
      }
      const a = Math.min(t0, e.start);
      const b = Math.max(t1, e.end);
      if (a <= b) continue;
      const z0 = alongAt(link, a);
      const z1 = alongAt(link, b);
      if (z1 - z0 > 0.01) bands.push({ z0, z1, epoch: e });
    }
    const boundaries = EPOCHS.filter((e) => e.start < t0 && e.start > t1);
    const step = tickStep(link);
    const ticks: number[] = [];
    if (step) for (let m = Math.ceil(t1 / step) * step; m < t0 - step * 0.3; m += step) if (m > t1 + step * 0.3) ticks.push(Number(m.toFixed(3)));
    const ws = link.child.taxon.corridor;
    return { bands, boundaries, ticks, ws, wpos: waypointPositions(link, ws) };
  }, [link, t0, t1]);
}

/** `clear`: rooms drawn nearby, in the parent room's frame (x, z, radius);
 *  the scenery outside a tunnel keeps out of them. */
/** `from`: the parent room's environment. A tunnel leading out of a dry
 *  gallery into the water is the way in: the sea rises over it as you walk. */
export function Corridor({ link, env, from, clear = [], swimmers = [], lite = false }: { link: Link; env: Environment; from?: Environment; clear?: Clear[]; swimmers?: SwimmerSpec[]; lite?: boolean }) {
  const descent = !!from && from.outside !== "ocean" && env.outside === "ocean";
  // into corridor coordinates (the group below turns by -angle)
  const local = useMemo(() => {
    const cos = Math.cos(link.angle);
    const sin = Math.sin(link.angle);
    const own: Clear[] = [
      { x: 0, z: 0, r: link.parent.radius },
      { x: Math.sin(link.angle) * link.span, z: -Math.cos(link.angle) * link.span, r: link.child.radius },
    ];
    const rot = (x: number, z: number) => [x * cos + z * sin, -x * sin + z * cos];
    return [...own, ...clear].map((c) => {
      const [x, z] = rot(c.x, c.z);
      if (c.x2 === undefined || c.z2 === undefined) return { x, z, r: c.r };
      const [x2, z2] = rot(c.x2, c.z2);
      return { x, z, x2, z2, r: c.r };
    });
  }, [link, clear]);
  return (
    <group rotation-y={-link.angle}>
      {env.outside === "ocean" && env.water ? <Tunnel link={link} env={env} lite={lite} clear={local} swimmers={swimmers} descent={descent} /> : <Gallery link={link} lite={lite} />}
    </group>
  );
}

function waypointSpec(w: Waypoint, w_: number, h: number): PanelSpec {
  const wt = themeOf(w);
  return {
    key: `wp:${w.name}:${w_}x${h}`,
    w: w_,
    h,
    background: wt.panel,
    ink: wt.ink,
    muted: wt.muted,
    accent: wt.accent,
    eyebrow: `${capital(w.rank)}${w.start != null ? ` · from ${formatMa(w.start)}` : ""}`,
    title: `${w.extinct ? "† " : ""}${w.name}`,
    italicTitle: isItalic(w.rank),
    subtitle: commonName(w) ?? undefined,
    body: w.extract,
    titleSize: 0.14,
    bodySize: 0.06,
  };
}

/** Floor marks every so many million years. */
function Ticks({ link, ticks, ink = "#ffffff" }: { link: Link; ticks: number[]; ink?: string }) {
  return (
    <>
      {ticks.map((m) => {
        const z = -alongAt(link, m);
        const tex = markTexture(`tick:${m}:${ink}`, formatMa(m), ink, "rgba(0,0,0,0)");
        return (
          <group key={m}>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, z]}>
              <planeGeometry args={[WALK_HALF * 2, 0.04]} />
              <meshBasicMaterial color={ink} transparent opacity={0.55} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[-WALK_HALF + 0.65, 0.005, z - 0.28]}>
              <planeGeometry args={[1.1, 0.34]} />
              <meshBasicMaterial map={tex} transparent opacity={0.85} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ---- the walled gallery ---------------------------------------------------------------

function Gallery({ link, lite }: { link: Link; lite: boolean }) {
  const theme = themeOf(link.child.taxon);
  const len = link.s1 - link.s0;
  const { bands, boundaries, ticks, ws, wpos } = useTimeline(link);
  const floorMat = useMemo(() => new THREE.MeshLambertMaterial({ color: mix(theme.floor, "#2a2a2a", 0.15) }), [theme.floor]);
  const ceilMat = useMemo(() => new THREE.MeshLambertMaterial({ color: theme.ceiling, side: THREE.DoubleSide }), [theme.ceiling]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, -(link.s0 + len / 2)]} material={floorMat}>
        <planeGeometry args={[CORRIDOR_W, len + 0.1]} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, CORRIDOR_H, -(link.s0 + len / 2)]} material={ceilMat}>
        <planeGeometry args={[CORRIDOR_W, len + 0.1]} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, CORRIDOR_H - 0.01, -(link.s0 + len / 2)]}>
        <planeGeometry args={[0.5, len]} />
        <meshBasicMaterial color="#fffaf0" />
      </mesh>
      {bands.map((b) =>
        [-1, 1].map((side) => (
          <group key={`${b.epoch.name}${side}`}>
            <mesh position={[side * HALF, CORRIDOR_H / 2, -(b.z0 + b.z1) / 2]} rotation-y={(-side * Math.PI) / 2}>
              <planeGeometry args={[b.z1 - b.z0 + 0.01, CORRIDOR_H]} />
              <meshLambertMaterial color={mix(theme.wall, b.epoch.color, 0.28)} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[side * (HALF - 0.01), CORRIDOR_H - 0.22, -(b.z0 + b.z1) / 2]} rotation-y={(-side * Math.PI) / 2}>
              <planeGeometry args={[b.z1 - b.z0 + 0.01, 0.44]} />
              <meshBasicMaterial color={b.epoch.color} toneMapped={false} />
            </mesh>
          </group>
        ))
      )}
      {!lite && (
        <>
          {boundaries.map((e) => (
            <group key={e.name}>
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -alongAt(link, e.start)]}>
                <planeGeometry args={[CORRIDOR_W, 0.14]} />
                <meshBasicMaterial color={e.color} toneMapped={false} />
              </mesh>
              <group position={[HALF - 0.02, 2.75, -alongAt(link, e.start) - 1.1]} rotation-y={-Math.PI / 2}>
                <Panel spec={{ key: `epoch:${e.name}`, w: 1.9, h: 0.7, background: e.color, ink: "#2b2414", muted: "#5a4b2a", eyebrow: `begins ${formatMa(e.start)}`, title: e.name, titleSize: 0.17, bodySize: 0.07 }} />
              </group>
            </group>
          ))}
          <Ticks link={link} ticks={ticks} />
          {ws.map((w, i) => {
            const side = i % 2 === 0 ? -1 : 1;
            const item = waypointItem(w);
            // on the wall, +x runs toward the child on the left wall and back toward
            // the parent on the right: the panel hangs on the parent side, the image after it
            return (
              <group key={w.name} position={[side * (HALF - 0.03), 0, -wpos[i]]} rotation-y={(-side * Math.PI) / 2}>
                <group position={[w.image ? side * 1.05 : 0, 1.75, 0]}>
                  <Panel pick={item} spec={waypointSpec(w, 1.8, 2.1)} />
                </group>
                {w.image && (
                  <group position={[-side * 1.15, 1.85, 0]}>
                    <FramedImage image={w.image} maxW={1.9} maxH={1.6} pick={item} />
                  </group>
                )}
              </group>
            );
          })}
        </>
      )}
    </group>
  );
}

// ---- the glass tunnel ------------------------------------------------------------------

// The arch: a circular arc through the floor edges (±HALF, 0) and the crown (0, CORRIDOR_H).
const ARCH_C = (CORRIDOR_H * CORRIDOR_H - HALF * HALF) / (2 * CORRIDOR_H); // centre height
const ARCH_R = CORRIDOR_H - ARCH_C;
const ARCH_FOOT = Math.asin(ARCH_C / ARCH_R); // below the centre line at each foot

const glassMat = new THREE.MeshStandardMaterial({
  color: "#dff6fa",
  transparent: true,
  opacity: 0.1,
  roughness: 0.05,
  metalness: 0.4,
  side: THREE.DoubleSide,
  depthWrite: false,
});
// (no environment map to reflect, so nothing here is very metallic: metal
// with nothing to mirror renders black)
const ribMat = new THREE.MeshStandardMaterial({ color: "#3d5560", roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
const railMat = new THREE.MeshStandardMaterial({ color: "#b8c6ca", roughness: 0.35, metalness: 0.2 });
const postMat = new THREE.MeshStandardMaterial({ color: "#2e3f46", roughness: 0.6, metalness: 0.1 });

/** The arch outline, from the left foot over the crown to the right foot. */
function archPoints(n = 40, r = ARCH_R): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const a0 = Math.PI + ARCH_FOOT;
  const a1 = -ARCH_FOOT;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(new THREE.Vector2(r * Math.cos(a), ARCH_C + r * Math.sin(a)));
  }
  return pts;
}

/** A doorway face: the room's rectangular opening around the arch. Built as a
 *  strip of quads, each from a point on the arch out along the ray from the
 *  arch's centre to the edge of the rectangle. */
const portalGeo = (() => {
  const W = HALF + 0.05;
  const TOP = CORRIDOR_H + 0.05;
  const toRect = (p: THREE.Vector2) => {
    const d = new THREE.Vector2(p.x, p.y - ARCH_C);
    const ts = [d.x > 0 ? W / d.x : d.x < 0 ? -W / d.x : Infinity, d.y > 0 ? (TOP - ARCH_C) / d.y : d.y < 0 ? -ARCH_C / d.y : Infinity];
    const t = Math.min(...ts);
    return new THREE.Vector2(d.x * t, ARCH_C + d.y * t);
  };
  const inner = archPoints(120, ARCH_R);
  const outer = inner.map(toRect);
  const pos: number[] = [];
  for (let i = 0; i < inner.length - 1; i++) {
    const [a, b, c, d] = [inner[i], outer[i], outer[i + 1], inner[i + 1]];
    pos.push(a.x, a.y, 0, b.x, b.y, 0, c.x, c.y, 0, a.x, a.y, 0, c.x, c.y, 0, d.x, d.y, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
})();

const shellGeo = (len: number) => {
  // CylinderGeometry puts theta at (r sin θ, ·, r cos θ); after turning its axis
  // onto z, height is -r cos θ: the right foot is at θ = π/2 - foot, the crown at π.
  const g = new THREE.CylinderGeometry(ARCH_R, ARCH_R, len, 48, 1, true, Math.PI / 2 - ARCH_FOOT, Math.PI + 2 * ARCH_FOOT);
  g.rotateX(Math.PI / 2);
  return g;
};

/** Half-width of the tunnel's arch at height h. */
const archHalf = (h: number) => Math.sqrt(Math.max(0, ARCH_R * ARCH_R - (h - ARCH_C) ** 2));

function Tunnel({ link, env, lite, clear, swimmers, descent }: { link: Link; env: Environment; lite: boolean; clear: Clear[]; swimmers: SwimmerSpec[]; descent: boolean }) {
  const water = env.water!;
  const len = link.s1 - link.s0;
  const mid = -(link.s0 + len / 2);
  const seed = `${link.parent.taxon.id}>${link.child.taxon.id}`;
  const { bands, boundaries, ticks, ws, wpos } = useTimeline(link);
  const shell = useMemo(() => shellGeo(len), [len]);
  const walkMat = useMemo(() => withCaustics(new THREE.MeshLambertMaterial({ color: mix(water.deep, "#5b6a70", 0.55) }), lite ? 0 : water.caustics * 0.35), [water, lite]);
  const ribs = useMemo(() => {
    const out: number[] = [];
    for (let s = link.s0 + 1.5; s < link.s1 - 1; s += 3.2) out.push(s);
    return out;
  }, [link]);
  const ribGeo = useMemo(() => new THREE.TorusGeometry(ARCH_R, 0.05, 6, 40, Math.PI + 2 * ARCH_FOOT), []);

  return (
    <group>
      {/* walkway, glass and ribs */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, mid]} material={walkMat}>
        <planeGeometry args={[CORRIDOR_W, len + 0.1]} />
      </mesh>
      <mesh geometry={shell} material={glassMat} position={[0, ARCH_C, mid]} />
      <Instances geometry={ribGeo} material={ribMat} limit={Math.max(1, ribs.length)} frustumCulled={false}>
        {ribs.map((s) => (
          <Instance key={s} position={[0, ARCH_C, -s]} rotation-z={-ARCH_FOOT} />
        ))}
      </Instances>
      {[link.s0, link.s1].map((s, i) => (
        <mesh key={i} geometry={portalGeo} material={ribMat} position={[0, 0, -s - (i ? -0.02 : 0.02)]} rotation-y={i ? Math.PI : 0} />
      ))}

      {/* epoch light strips along the walkway edges, coloured by epoch */}
      {bands.map((b) =>
        [-1, 1].map((side) => (
          <mesh key={`${b.epoch.name}${side}`} rotation-x={-Math.PI / 2} position={[side * (WALK_HALF + 0.08), 0.006, -(b.z0 + b.z1) / 2]}>
            <planeGeometry args={[0.1, b.z1 - b.z0]} />
            <meshBasicMaterial color={mix(b.epoch.color, water.deep, 0.2)} />
          </mesh>
        ))
      )}

      <Seabed water={water} s0={link.s0} s1={link.s1} seed={seed} clear={clear} lite={lite} />

      {!lite && (
        <>
          {/* handrails */}
          {[-1, 1].map((side) => (
            <mesh key={side} material={railMat} position={[side * (WALK_HALF + 0.1), 0.95, mid]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.03, 0.03, len - 1.2, 8]} />
            </mesh>
          ))}
          <Instances material={postMat} limit={Math.max(1, ribs.length * 2)} frustumCulled={false}>
            <boxGeometry args={[0.04, 0.95, 0.04]} />
            {ribs.flatMap((s) => [-1, 1].map((side) => <Instance key={`${s}${side}`} position={[side * (WALK_HALF + 0.1), 0.475, -s]} />))}
          </Instances>

          {/* epoch boundaries: a glowing rib and the name inlaid in the floor */}
          {boundaries.map((e) => {
            const z = -alongAt(link, e.start);
            return (
              <group key={e.name}>
                <mesh geometry={ribGeo} position={[0, ARCH_C, z]} rotation-z={-ARCH_FOOT}>
                  <meshBasicMaterial color={mix(e.color, water.deep, 0.3)} />
                </mesh>
                <mesh rotation-x={-Math.PI / 2} position={[0, 0.007, z]}>
                  <planeGeometry args={[WALK_HALF * 2, 0.1]} />
                  <meshBasicMaterial color={e.color} toneMapped={false} />
                </mesh>
                <mesh rotation-x={-Math.PI / 2} position={[0, 0.007, z - 0.75]}>
                  <planeGeometry args={[2.4, 0.6]} />
                  <meshBasicMaterial map={markTexture(`epochfloor:${e.name}`, `${e.name.toUpperCase()} · ${formatMa(e.start)}`, e.color, "rgba(0,0,0,0)", 768, 192)} transparent toneMapped={false} />
                </mesh>
              </group>
            );
          })}
          <Ticks link={link} ticks={ticks} />

          {/* the clades along the way, on lecterns against the glass */}
          {ws.map((w, i) => {
            const side = i % 2 === 0 ? -1 : 1;
            const item = waypointItem(w);
            return (
              <group key={w.name} position={[side * (WALK_HALF + 0.55), 0, -wpos[i]]} rotation-y={(-side * Math.PI) / 2}>
                {/* local +z faces the walkway; +x is toward the child on the left side */}
                <mesh material={postMat} position={[0, 0.5, -0.05]}>
                  <boxGeometry args={[0.12, 1.0, 0.12]} />
                </mesh>
                <group position={[0, 1.22, 0.05]} rotation-x={-0.42}>
                  <mesh material={postMat} position={[0, 0, -0.03]}>
                    <boxGeometry args={[1.32, 0.98, 0.04]} />
                  </mesh>
                  <Panel pick={item} spec={waypointSpec(w, 1.26, 0.92)} />
                </group>
                {w.image && (
                  <group position={[side * 1.35, 0, -0.15]}>
                    <mesh material={postMat} position={[0, 0.85, -0.04]}>
                      <boxGeometry args={[0.06, 1.7, 0.06]} />
                    </mesh>
                    <group position={[0, 2.05, 0]}>
                      <FramedImage image={w.image} maxW={1.15} maxH={0.95} pick={item} frame="#1d2a30" />
                    </group>
                  </group>
                )}
              </group>
            );
          })}

          {/* outside the glass */}
          <Rocks water={water} s0={link.s0} s1={link.s1} seed={seed} clear={clear} />
          {water.vegetation && <Kelp s0={link.s0} s1={link.s1} seed={seed} clear={clear} color={water.vegetation} />}
          {descent ? (
            <WaterSurface water={water} s0={link.s0} s1={link.s1} clear={clear} archHalf={archHalf} crown={CORRIDOR_H} />
          ) : (
            <>
              <LightShafts water={water} s0={link.s0} s1={link.s1} seed={seed} clear={clear} />
              <MarineSnow water={water} s0={link.s0} s1={link.s1} seed={seed} clear={clear} />
            </>
          )}
          {/* (none on the way in: near the dry end they would be swimming in air) */}
          {!descent && <Swimmers specs={swimmers} water={water} s0={link.s0} s1={link.s1} seed={seed} clear={clear} />}
        </>
      )}
    </group>
  );
}
