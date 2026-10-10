// Underwater scenery, all procedural (no image or model files): caustic light
// on the seabed and walkway, a seabed with rocks and kelp, shafts of light
// from the surface and drifting particles.

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Instance, Instances } from "@react-three/drei";
import type { Water } from "./environment";
import type { Silhouette } from "@/lib/types";
import { SilhouettePlane } from "./Silhouette";

/** One clock for every animated material. */
export const waterTime = { value: 0 };

export function WaterClock() {
  useFrame((_, dt) => {
    waterTime.value += Math.min(dt, 0.1);
  });
  return null;
}

/** Deterministic random numbers from a string seed (mulberry32). */
export function rng(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = (h << 13) | (h >>> 19);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- caustics -------------------------------------------------------------------
// Two layers of animated Voronoi edges: bright where neighbouring cells meet,
// which reads as the net of light under rippling water.

const CAUSTIC_GLSL = /* glsl */ `
uniform float uTime;
uniform float uCaustics;
uniform vec3 uCausticColor;
varying vec3 vWorldPos;
vec2 cHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float cEdge(vec2 uv, float t) {
  vec2 g = floor(uv);
  vec2 f = fract(uv);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 h = cHash(g + o);
    vec2 pt = o + 0.5 + 0.42 * sin(t + 6.2831 * h);
    float d = length(pt - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return 1.0 - smoothstep(0.0, 0.12, d2 - d1);
}
float caustic(vec2 p, float t) {
  return 0.6 * cEdge(p * 0.55, t * 0.7) + 0.4 * cEdge(p * 0.9 + 3.7, t * 0.9 + 1.3);
}
`;

/** Patch a Lambert/Standard material so it receives caustic light from above. */
export function withCaustics<M extends THREE.Material>(mat: M, strength: number, color = "#ffffff"): M {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.uniforms.uCaustics = { value: strength };
    shader.uniforms.uCausticColor = { value: new THREE.Color(color) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${CAUSTIC_GLSL}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb += uCausticColor * caustic(vWorldPos.xz, uTime) * uCaustics;");
  };
  mat.customProgramCacheKey = () => `caustics-${strength}-${color}`;
  return mat;
}

// ---- backdrop -----------------------------------------------------------------------

/** A sky dome that follows the camera: shallow water above, the depths below,
 *  meeting the fog colour at the horizon. Colours update every frame so an
 *  environment change can fade rather than cut. */
export function Backdrop({ top, horizon, bottom }: { top: THREE.Color; horizon: THREE.Color; bottom: THREE.Color }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: top }, uHorizon: { value: horizon }, uBottom: { value: bottom } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
          varying vec3 vDir;
          void main() {
            float y = vDir.y;
            vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.7)) : mix(uHorizon, uBottom, pow(-y, 0.6));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [top, horizon, bottom]
  );
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[300, 32, 16]} />
    </mesh>
  );
}

// ---- seabed and what grows on it ----------------------------------------------------------

/** Space scenery keeps out of, in corridor coordinates: a room (a disc at
 *  x, z) or a corridor (a capsule from x, z to x2, z2), of radius r. */
export interface Clear {
  x: number;
  z: number;
  x2?: number;
  z2?: number;
  r: number;
}

/** Distance from (x, z) to the edge of the nearest room or corridor (negative inside). */
export function roomDistance(x: number, z: number, clear: Clear[]): number {
  let d = Infinity;
  for (const c of clear) {
    let px = c.x;
    let pz = c.z;
    if (c.x2 !== undefined && c.z2 !== undefined) {
      const dx = c.x2 - c.x;
      const dz = c.z2 - c.z;
      const t = Math.max(0, Math.min(1, ((x - c.x) * dx + (z - c.z) * dz) / (dx * dx + dz * dz || 1)));
      px = c.x + dx * t;
      pz = c.z + dz * t;
    }
    d = Math.min(d, Math.hypot(x - px, z - pz) - c.r);
  }
  return d;
}

/** Seabed under a corridor, in corridor coordinates (corridor runs along -z
 *  from z = -s0 to z = -s1). */
export function Seabed({ water, s0, s1, seed, clear, lite }: { water: Water; s0: number; s1: number; seed: string; clear: Clear[]; lite?: boolean }) {
  const len = s1 - s0;
  const geo = useMemo(() => {
    const w = 64;
    const g = new THREE.PlaneGeometry(w, len + 30, 32, Math.max(8, Math.round(len / 3)));
    g.rotateX(-Math.PI / 2);
    const r = rng(seed);
    const phase = [r() * 10, r() * 10, r() * 10];
    // Seabeds of neighbouring tunnels overlap: a slightly different base depth
    // each keeps them from flickering through one another.
    const base = -0.85 - r() * 0.12;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // The tunnel runs along a bank: flat under the walkway, then falling away
      // in rolling hollows. It never rises, so it cannot come up through any
      // floor (rooms and other tunnels sit at floor level, y = 0).
      const wz = z - (s0 + len / 2);
      const out = THREE.MathUtils.smoothstep(Math.abs(x), 3, 16) * THREE.MathUtils.smoothstep(roomDistance(x, wz, clear), 0.5, 6);
      const h = 2.2 + Math.sin(x * 0.21 + phase[0]) * 0.9 + Math.sin(z * 0.17 + phase[1]) * 0.7 + Math.sin((x + z) * 0.09 + phase[2]) * 1.0;
      pos.setY(i, base - out * Math.max(0, h));
    }
    g.computeVertexNormals();
    return g;
  }, [len, seed, s0, clear]);
  const mat = useMemo(() => withCaustics(new THREE.MeshLambertMaterial({ color: water.seabed }), lite ? 0 : water.caustics * 0.55), [water, lite]);
  return <mesh geometry={geo} material={mat} position={[0, 0, -(s0 + len / 2)]} />;
}

/** Rough seabed height away from the walkway (for things standing on it). */
function groundAt(x: number): number {
  return -0.9 - THREE.MathUtils.smoothstep(Math.abs(x), 3, 16) * 2.2;
}

export function Rocks({ water, s0, s1, seed, clear }: { water: Water; s0: number; s1: number; seed: string; clear: Clear[] }) {
  const rocks = useMemo(() => {
    const r = rng(`${seed}:rocks`);
    const n = Math.round((s1 - s0) / 2.2);
    return Array.from({ length: n }, () => {
      const side = r() < 0.5 ? -1 : 1;
      const scale = 0.3 + r() ** 2 * 2.2;
      return {
        pos: [0, 0, 0] as [number, number, number],
        x: side * (3.4 + r() * 14),
        z: -(s0 + r() * (s1 - s0)),
        rot: [r() * 3, r() * 3, r() * 3] as [number, number, number],
        scale: [scale * (0.8 + r() * 0.8), scale * (0.5 + r() * 0.5), scale * (0.8 + r() * 0.8)] as [number, number, number],
        shade: 0.55 + r() * 0.35,
      };
    })
      .filter((k) => roomDistance(k.x, k.z, clear) > k.scale[0] + 1)
      .map((k) => ({ ...k, pos: [k.x, groundAt(k.x) + k.scale[1] * 0.4, k.z] as [number, number, number] }));
  }, [s0, s1, seed, clear]);
  const color = new THREE.Color(water.seabed).multiplyScalar(0.62);
  return (
    <Instances limit={Math.max(1, rocks.length)} frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshLambertMaterial flatShading />
      {rocks.map((k, i) => (
        <Instance key={i} position={k.pos} rotation={k.rot} scale={k.scale} color={color.clone().multiplyScalar(k.shade)} />
      ))}
    </Instances>
  );
}

/** Kelp: tall ribbons swaying in the swell (vertex shader). */
export function Kelp({ s0, s1, seed, clear, color = "#3f6b2e" }: { s0: number; s1: number; seed: string; clear: Clear[]; color?: string }) {
  const { geo, mat } = useMemo(() => {
    const r = rng(`${seed}:kelp`);
    const blades: THREE.BufferGeometry[] = [];
    const n = Math.round((s1 - s0) / 1.6);
    for (let i = 0; i < n; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const h = 3 + r() * 6;
      const w = 0.35 + r() * 0.3;
      const turn = r() * Math.PI;
      const x = side * (3.6 + r() * 9);
      const z = -(s0 + r() * (s1 - s0));
      if (roomDistance(x, z, clear) < 1.5) continue;
      const b = new THREE.PlaneGeometry(w, h, 1, 10);
      b.translate(0, h / 2, 0);
      b.rotateY(turn);
      b.translate(x, groundAt(x) - 0.1, z);
      blades.push(b);
    }
    const geo = blades.length ? mergeGeometries(blades) : new THREE.BufferGeometry();
    const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float sway = max(0.0, position.y + 2.5);
           transformed.x += sin(uTime * 0.8 + position.z * 0.5 + position.x) * 0.06 * sway;
           transformed.z += cos(uTime * 0.6 + position.x * 0.4) * 0.04 * sway;`
        );
    };
    mat.customProgramCacheKey = () => "kelp";
    return { geo, mat };
  }, [s0, s1, seed, color, clear]);
  return <mesh geometry={geo} material={mat} />;
}

/** Merge plain (non-indexed or indexed) geometries with the same attributes. */
function mergeGeometries(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of parts) {
      arr.set(g.attributes[name].array as Float32Array, o);
      o += g.attributes[name].count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// ---- light and particles ------------------------------------------------------------------

const shaftTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d")!;
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,255,255,0.55)");
    v.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, "rgba(0,0,0,1)");
    h.addColorStop(0.5, "rgba(0,0,0,0)");
    h.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

/** Slanting shafts of sunlight from the surface. */
export function LightShafts({ water, s0, s1, seed, clear }: { water: Water; s0: number; s1: number; seed: string; clear: Clear[] }) {
  const shafts = useMemo(() => {
    const r = rng(`${seed}:shafts`);
    const n = Math.max(2, Math.round((s1 - s0) / 7));
    return Array.from({ length: n }, () => ({
      pos: [(r() < 0.5 ? -1 : 1) * (4 + r() * 10), 9, -(s0 + r() * (s1 - s0))] as [number, number, number],
      rot: [0.25 + r() * 0.2, r() * Math.PI, 0.1] as [number, number, number],
      w: 1.5 + r() * 2.5,
    })).filter((k) => roomDistance(k.pos[0], k.pos[2], clear) > 5);
  }, [s0, s1, seed, clear]);
  return (
    <group>
      {shafts.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot}>
          <planeGeometry args={[s.w, 22]} />
          <meshBasicMaterial map={shaftTexture()} color={water.shallow} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Marine snow drifting slowly outside the glass. */
export function MarineSnow({ water, s0, s1, seed, clear }: { water: Water; s0: number; s1: number; seed: string; clear: Clear[] }) {
  const { geo, mat } = useMemo(() => {
    const r = rng(`${seed}:snow`);
    const n = Math.round((s1 - s0) * 14);
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (2.8 + r() * 12);
      const y = -0.5 + r() * 9;
      const z = -(s0 + r() * (s1 - s0));
      if (roomDistance(x, z, clear) > 0.5) pts.push(x, y, z);
    }
    const p = new Float32Array(pts);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: waterTime, uColor: { value: new THREE.Color(water.particles) } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vFade;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 0.12 + 1.0, 10.0) - 1.0;
          p.x += sin(uTime * 0.3 + position.z) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vFade = clamp(1.0 - d / 30.0, 0.0, 1.0);
          gl_PointSize = clamp(60.0 / d, 1.0, 6.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vFade;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          gl_FragColor = vec4(uColor, (1.0 - r * 2.0) * 0.6 * vFade);
        }`,
    });
    return { geo, mat };
  }, [water, s0, s1, seed, clear]);
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

// ---- animals swimming past ------------------------------------------------------------------

export interface SwimmerSpec {
  sil: Silhouette;
  /** Body length (m): silhouettes are shown at life size. */
  length: number;
}

/** Silhouettes of the lineage's animals cruising past the tunnel, parallel to
 *  it, head first. A lane that would cross a room's pavilion goes overhead. */
export function Swimmers({ specs, water, s0, s1, seed, clear }: { specs: SwimmerSpec[]; water: Water; s0: number; s1: number; seed: string; clear: Clear[] }) {
  const lanes = useMemo(() => {
    const r = rng(`${seed}:swim`);
    const out: { spec: SwimmerSpec; x: number; y: number; dir: number; speed: number; z0: number; phase: number; rotY: number }[] = [];
    specs.forEach((spec, i) => {
      for (let k = 0; k < (spec.length < 4 ? 2 : 1); k++) {
        const side = (i + k) % 2 === 0 ? -1 : 1;
        const x = side * (5.5 + r() * 9 + spec.length * 0.2);
        // a low lane must keep clear of every room along its whole run
        let low = true;
        for (let s = s0 - 20; s <= s1 + 20; s += 2) if (roomDistance(x, -s, clear) < spec.length * 0.5 + 2) low = false;
        const y = low ? 4.5 + r() * 2.5 : 10 + r() * 3;
        // planes face the tunnel; which way is "forward" depends on the side and on the image
        const rotY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        const headPlusX = spec.sil.facing === "right";
        const dir = side < 0 ? (headPlusX ? -1 : 1) : headPlusX ? 1 : -1;
        out.push({ spec, x, y, dir, speed: 0.8 + r() * 1.2 + spec.length * 0.03, z0: r(), phase: r() * 10, rotY });
      }
    });
    return out;
  }, [specs, s0, s1, seed, clear]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const color = useMemo(() => "#" + new THREE.Color(water.deep).multiplyScalar(0.3).getHexString(), [water.deep]);
  useFrame(() => {
    const t = waterTime.value;
    const span = s1 - s0 + 60;
    lanes.forEach((l, i) => {
      const g = refs.current[i];
      if (!g) return;
      // distance travelled, wrapped into [s0 - 30, s1 + 30]
      const d = (((l.z0 * span + t * l.speed) % span) + span) % span;
      const along = l.dir < 0 ? s0 - 30 + d : s1 + 30 - d;
      g.position.set(l.x, l.y + Math.sin(t * 0.4 + l.phase) * 0.35, -along);
    });
  });
  return (
    <group>
      {lanes.map((l, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} rotation-y={l.rotY}>
          <SilhouettePlane sil={l.spec.sil} height={(l.spec.length * l.spec.sil.height) / l.spec.sil.width} color={color} opacity={0.92} />
        </group>
      ))}
    </group>
  );
}

// ---- the way in: a water surface rising over the tunnel -----------------------------------------

/** Height of the water surface `along` a descent tunnel: just under the
 *  walkway at the dry end, well over the glass at the far end. */
export function surfaceAt(along: number, s0: number, s1: number): number {
  const k = THREE.MathUtils.clamp((along - s0) / (s1 - s0), 0, 1);
  return -0.5 + THREE.MathUtils.smoothstep(k, 0, 1) * 14;
}

/**
 * The sea's surface over a descent tunnel, rising from the dry end to the
 * wet: as you walk, the water climbs the glass and closes over your head.
 * Built row by row (corridor coordinates) so it stops at the outside of the
 * glass (`archHalf(h)`: the tunnel's half-width at height h) and skips any
 * nearby room or corridor.
 */
export function WaterSurface({ water, s0, s1, clear, archHalf, crown }: { water: Water; s0: number; s1: number; clear: Clear[]; archHalf: (h: number) => number; crown: number }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    // finer cells near the tunnel, where the surface meets glass and rooms
    const xs = (inner: number) => {
      const out: number[] = [];
      for (let x = inner; x < 40; x += x < 16 ? 0.5 : 2) out.push(x);
      out.push(40);
      return out;
    };
    for (let s = s0 - 12; s < s1 + 12; s += 1) {
      const h0 = surfaceAt(s, s0, s1);
      const h1 = surfaceAt(s + 1, s0, s1);
      const hMin = Math.min(h0, h1);
      const inner = hMin > crown + 0.05 ? 0 : (hMin < 0 ? CORRIDOR_HALF : archHalf(hMin)) + 0.06;
      const cols = xs(inner);
      for (const side of [-1, 1]) {
        for (let i = 0; i < cols.length - 1; i++) {
          const xa = side * cols[i];
          const xb = side * cols[i + 1];
          // keep out of rooms and corridors, but only below their roofs (domes top out near 9.5 m)
          if (hMin < ROOF && roomDistance((xa + xb) / 2, -(s + 0.5), clear) < 0.3) continue;
          const z0 = -s;
          const z1 = -(s + 1);
          pos.push(xa, h0, z0, xb, h0, z0, xa, h1, z1, xb, h0, z0, xb, h1, z1, xa, h1, z1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }, [s0, s1, clear, archHalf, crown]);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: water.shallow,
        transparent: true,
        opacity: 0.55,
        roughness: 0.12,
        metalness: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [water.shallow]
  );
  return <mesh geometry={geo} material={mat} />;
}

const CORRIDOR_HALF = 2.1;
const ROOF = 9.5;
