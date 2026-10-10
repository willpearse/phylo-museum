// The walkable scene: the current room, its corridors and the rooms at their
// far ends, all in the current room's frame. Walking into a neighbouring
// room re-centres the world on it (camera and scene move together in the
// same frame, so nothing visibly jumps).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { MuseumData, Taxon } from "@/lib/types";
import { CORRIDOR_W, EYE_HEIGHT, lineage, corridorAt, corridorCoords, farRooms, neighbours, planRoom, roomAt, walkable, type Far, type Neighbour } from "./layout";
import { blendFog, envOf, type Environment } from "./environment";
import { Backdrop, WaterClock, type Clear, type SwimmerSpec } from "./ocean";
import { archetypeOf, lifeLength } from "./statue-shapes";
import { Room } from "./Room";
import { Corridor } from "./Corridor";
import type { InspectItem } from "./Exhibit";

// Movement. Corridors here run up to ~100 m, so walking is brisk and holding
// forward breaks into a run fairly soon (Shift runs at once).
const MAX_DT = 0.05; // s: longest step simulated per frame (after a stall)
const WALK_SPEED = 3.4; // m/s
const RUN_SPEED = 8.5;
const RUN_AFTER_MS = 1500;
const TAP_WALK_SPEED = 3; // m/s, walking to a tapped point
const AIM_RANGE = 12; // m: furthest exhibit a click opens
const LOOK_SPEED = 0.005; // rad per px of touch drag
const MAX_PITCH = 1.3; // rad
const TAP_SLOP = 10; // px a touch may move and still be a tap
const TAP_MAX_MS = 400;

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};
/** Turning on the spot: arrow keys and Q / E (radians per second; + is left). */
const TURN_KEYS: Record<string, number> = { ArrowLeft: 1, KeyQ: 1, ArrowRight: -1, KeyE: -1 };
const TURN_SPEED = 1.9;

export interface Arrival {
  id: string;
  /** Bumped to force a teleport to the same room. */
  seq: number;
}

interface Props {
  data: MuseumData;
  arrival: Arrival;
  onRoom: (id: string) => void;
  onInspect: (item: InspectItem) => void;
  paused: boolean;
  onLockChange: (locked: boolean) => void;
}

export function Museum(props: Props) {
  return (
    <Canvas
      camera={{ fov: 62, near: 0.05, far: 400, position: [0, EYE_HEIGHT, 0] }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        // soft studio reflections for bronze, marble and metalwork (generated, no download)
        const pmrem = new THREE.PMREMGenerator(gl);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.55;
        pmrem.dispose();
      }}
      style={{ position: "fixed", inset: 0, touchAction: "none" }}
    >
      <hemisphereLight args={["#ffffff", "#8a8070", 1.6]} />
      <WaterClock />
      <ambientLight intensity={0.6} />
      <World {...props} />
    </Canvas>
  );
}

function World({ data, arrival, onRoom, onInspect, paused, onLockChange }: Props) {
  const [current, setCurrent] = useState(arrival.id);
  const world = useRef<THREE.Group>(null);
  const switching = useRef(false);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<ComponentRef<typeof PointerLockControls>>(null);

  const ns = useMemo(() => neighbours(data, current), [data, current]);
  const far = useMemo(() => farRooms(data, current, ns), [data, current, ns]);
  const nsRef = useRef<Neighbour[]>(ns);
  const currentRef = useRef(current);

  // A new room is in place: drop the interim transform.
  useLayoutEffect(() => {
    nsRef.current = ns;
    currentRef.current = current;
    world.current?.matrix.identity();
    switching.current = false;
    onRoom(current);
  }, [ns, current, onRoom]);

  // Teleport (map click / start): stand inside the entrance, facing in.
  useEffect(() => {
    const plan = planRoom(data, data.taxa[arrival.id]);
    setCurrent(arrival.id);
    camera.position.set(0, EYE_HEIGHT, plan.radius - 1.6);
    camera.rotation.set(0, 0, 0, "YXZ");
    camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, "YXZ"));
  }, [arrival, data, camera]);

  // Dev hook for scripts/shot.mjs: turn on the spot (mouse look needs pointer lock).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __turn: (deg: number) => void; __place: (x: number, z: number, yawDeg: number, pitchDeg?: number) => void };
    (window as unknown as { __scene: THREE.Scene; __camera: THREE.Camera }).__scene = scene;
    (window as unknown as { __scene: THREE.Scene; __camera: THREE.Camera }).__camera = camera;
    w.__turn = (deg) => {
      camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (-deg * Math.PI) / 180);
    };
    // stand at (x, z) of the current room's frame; yaw 0 faces -z, positive turns right
    w.__place = (x, z, yawDeg, pitchDeg = 0) => {
      camera.position.set(x, EYE_HEIGHT, z);
      camera.quaternion.setFromEuler(new THREE.Euler((pitchDeg * Math.PI) / 180, (-yawDeg * Math.PI) / 180, 0, "YXZ"));
    };
    // stand `along` metres into the corridor to child `to` (or the parent), facing on (or back)
    (window as unknown as { __corridor: (to: string, along: number, back?: boolean) => void }).__corridor = (to, along, back = false) => {
      const n = nsRef.current.find((m) => m.plan.taxon.id === to);
      if (!n) return;
      const d = new THREE.Vector3(Math.sin(n.link.angle), 0, -Math.cos(n.link.angle));
      const p = d.clone().multiplyScalar(n.link.s0 + along).applyMatrix4(n.linkMatrix);
      const ahead = d.clone().multiplyScalar(n.link.s0 + along + (back ? -1 : 1)).applyMatrix4(n.linkMatrix);
      camera.position.set(p.x, EYE_HEIGHT, p.z);
      camera.lookAt(ahead.x, EYE_HEIGHT, ahead.z);
    };
  }, [camera, scene]);

  // ---- keyboard ----
  const keys = useRef(new Set<string>());
  const runSince = useRef<number | null>(null);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (KEYS[e.code] || TURN_KEYS[e.code]) {
        keys.current.add(e.code);
        e.preventDefault();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.add("Shift");
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.delete("Shift");
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // ---- picking ----
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const pick = (ndc: THREE.Vector2): { item: InspectItem | null; point: THREE.Vector3 | null } => {
    ray.setFromCamera(ndc, camera);
    ray.far = 60;
    const hits = ray.intersectObjects(world.current ? [world.current] : [], true);
    const hit = hits[0];
    if (!hit) return { item: null, point: null };
    const item = hit.object.userData.pick as InspectItem | undefined;
    return { item: item && hit.distance < AIM_RANGE ? item : null, point: hit.point };
  };

  // desktop: click to lock; while locked, click to inspect what the crosshair is on
  useEffect(() => {
    const el = gl.domElement;
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || paused) return;
      if (!controls.current?.isLocked) {
        controls.current?.lock();
        return;
      }
      const { item } = pick(new THREE.Vector2(0, 0));
      if (item) {
        controls.current.unlock();
        onInspect(item);
      }
    };
    el.addEventListener("click", click);
    return () => el.removeEventListener("click", click);
  });

  // touch: drag to look, tap the floor to walk there, tap an exhibit to inspect
  const tapTarget = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    const el = gl.domElement;
    let start: { x: number; y: number; t: number; lastX: number; lastY: number; id: number } | null = null;
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || paused) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), lastX: e.clientX, lastY: e.clientY, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      euler.setFromQuaternion(camera.quaternion);
      euler.y += (e.clientX - start.lastX) * LOOK_SPEED;
      euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x + (e.clientY - start.lastY) * LOOK_SPEED));
      camera.quaternion.setFromEuler(euler);
      start.lastX = e.clientX;
      start.lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const tap = Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP_SLOP && performance.now() - start.t < TAP_MAX_MS;
      start = null;
      if (!tap) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const { item, point } = pick(ndc);
      if (item) onInspect(item);
      else if (point && point.y < 0.05) tapTarget.current = new THREE.Vector3(point.x, EYE_HEIGHT, point.z);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  });

  // ---- walking ----
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, rawDt) => {
    if (switching.current || paused) return;
    const dt = Math.min(MAX_DT, rawDt);
    let mx = 0;
    let mz = 0;
    for (const k of keys.current) {
      const v = KEYS[k];
      if (v) {
        mx += v[0];
        mz += v[1];
      }
    }
    // turning (works with or without pointer lock)
    let turn = 0;
    for (const k of keys.current) turn += TURN_KEYS[k] ?? 0;
    if (turn) {
      camera.rotateOnWorldAxis(camera.up, Math.sign(turn) * TURN_SPEED * dt);
      invalidate();
    }

    let speed = WALK_SPEED;
    const forward = keys.current.has("KeyW") || keys.current.has("ArrowUp");
    if (forward) {
      runSince.current ??= performance.now();
      if (performance.now() - runSince.current > RUN_AFTER_MS || keys.current.has("Shift")) speed = RUN_SPEED;
    } else runSince.current = null;

    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    let dx = 0;
    let dz = 0;
    if (mx || mz) {
      const n = Math.hypot(mx, mz);
      dx = ((fwd.x * mz + right.x * mx) / n) * speed * dt;
      dz = ((fwd.z * mz + right.z * mx) / n) * speed * dt;
      tapTarget.current = null;
    } else if (tapTarget.current) {
      const to = tapTarget.current;
      const d = Math.hypot(to.x - camera.position.x, to.z - camera.position.z);
      if (d < 0.15) tapTarget.current = null;
      else {
        const step = Math.min(d, TAP_WALK_SPEED * dt);
        dx = ((to.x - camera.position.x) / d) * step;
        dz = ((to.z - camera.position.z) / d) * step;
      }
    }
    if (!dx && !dz) return;
    const id = currentRef.current;
    const n = nsRef.current;
    const p = camera.position;
    // slide along walls: try the full step, then each axis alone
    if (walkable(p.x + dx, p.z + dz, data, id, n)) p.set(p.x + dx, p.y, p.z + dz);
    else if (walkable(p.x + dx, p.z, data, id, n)) p.x += dx;
    else if (walkable(p.x, p.z + dz, data, id, n)) p.z += dz;
    else tapTarget.current = null;

    const into = roomAt(p.x, p.z, n);
    if (into) {
      // Re-centre on the room just entered. Camera and the still-old scene move
      // together this frame; the layout effect resets the scene once React has
      // rebuilt it in the new frame.
      const toNew = into.matrix.clone().invert();
      p.applyMatrix4(toNew);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(toNew));
      camera.quaternion.premultiply(q);
      if (tapTarget.current) tapTarget.current.applyMatrix4(toNew);
      world.current?.matrix.copy(toNew);
      switching.current = true;
      setCurrent(into.plan.taxon.id);
    }
  });

  // ---- fog and backdrop: follow the visitor through rooms and corridors ----
  const fog = useMemo(() => new THREE.Fog("#888888", 10, 100), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);
  const sky = useMemo(() => ({ top: new THREE.Color(), horizon: new THREE.Color(), bottom: new THREE.Color() }), []);
  const tmp = useMemo(() => ({ color: new THREE.Color(), near: 0, far: 0 }), []);
  useFrame(() => {
    const id = currentRef.current;
    const n = nsRef.current;
    if (switching.current) return;
    const at = corridorAt(camera.position.x, camera.position.z, data, id, n);
    let env: Environment;
    if (!at) {
      env = envOf(data, id);
      roomFog(env, fog);
    } else {
      const link = at.n.link;
      const a = envOf(data, link.parent.taxon.id);
      const b = envOf(data, link.child.taxon.id);
      env = b;
      // the corridor's own fog blends parent -> child environment...
      blendFog(a, b, at.k, tmp);
      // ...and eases into each room's fog within a few metres of its door
      const { along } = corridorCoords(camera.position.x, camera.position.z, at.n);
      const edge = Math.min(along - link.s0, link.s1 - along);
      const t = THREE.MathUtils.smoothstep(edge, -0.5, 4);
      const endEnv = along - link.s0 < link.s1 - along ? a : b;
      const end = roomFog(endEnv, endFog);
      fog.color.copy(end.color).lerp(tmp.color, t);
      fog.near = end.near + (tmp.near - end.near) * t;
      fog.far = end.far + (tmp.far - end.far) * t;
    }
    sky.horizon.copy(fog.color);
    skyOf(env, sky.top, sky.bottom);
    if (at) {
      // through a corridor, the sky blends from the parent's to the child's
      // (on the way into the water: from open sky to the sea)
      skyOf(envOf(data, at.n.link.parent.taxon.id), skyA.top, skyA.bottom);
      sky.top.copy(skyA.top).lerp(sky.top, at.k);
      sky.bottom.copy(skyA.bottom).lerp(sky.bottom, at.k);
    }
  });

  // Footprints of every room drawn, in this room's frame, then in each
  // corridor's own (parent-room) frame: tunnel scenery keeps out of them.
  const clearFor = useMemo(() => {
    type Shape = { a: THREE.Vector3; b?: THREE.Vector3; r: number };
    const shapes: Shape[] = [{ a: new THREE.Vector3(), r: planRoom(data, data.taxa[current]).radius }];
    // a corridor's walkway, door to door, as a capsule
    const strip = (link: Neighbour["link"], toCurrent: THREE.Matrix4): Shape => {
      const d = new THREE.Vector3(Math.sin(link.angle), 0, -Math.cos(link.angle));
      return { a: d.clone().multiplyScalar(link.s0).applyMatrix4(toCurrent), b: d.clone().multiplyScalar(link.s1).applyMatrix4(toCurrent), r: CORRIDOR_W / 2 + 0.4 };
    };
    for (const n of ns) {
      shapes.push({ a: new THREE.Vector3().applyMatrix4(n.matrix), r: n.plan.radius });
      shapes.push(strip(n.link, n.linkMatrix));
    }
    for (const f of far) {
      if (f.drawRoom) shapes.push({ a: new THREE.Vector3().applyMatrix4(f.matrix), r: f.m.plan.radius });
      shapes.push(strip(f.m.link, f.via.matrix.clone().multiply(f.m.linkMatrix)));
    }
    const out = new Map<string, Clear[]>();
    for (const n of ns) {
      const inv = n.linkMatrix.clone().invert();
      out.set(
        n.plan.taxon.id,
        shapes
          // a corridor's own walkway is not an obstacle to its own scenery
          .filter((sh) => !(sh.b && sh.a.distanceTo(new THREE.Vector3(Math.sin(n.link.angle) * n.link.s0, 0, -Math.cos(n.link.angle) * n.link.s0).applyMatrix4(n.linkMatrix)) < 0.01))
          .map(({ a, b, r }) => {
            const p = a.clone().applyMatrix4(inv);
            if (!b) return { x: p.x, z: p.z, r };
            const q = b.clone().applyMatrix4(inv);
            return { x: p.x, z: p.z, x2: q.x, z2: q.z, r };
          })
      );
    }
    return out;
  }, [data, current, ns, far]);

  const plan = planRoom(data, data.taxa[current]);
  return (
    <>
      <PointerLockControls ref={controls} selector="#__never" onLock={() => onLockChange(true)} onUnlock={() => onLockChange(false)} />
      <Backdrop top={sky.top} horizon={sky.horizon} bottom={sky.bottom} />
      <group ref={world} matrixAutoUpdate={false}>
        <Room data={data} plan={plan} openTo={null} />
        {ns.map((n) => (
          <group key={n.plan.taxon.id}>
            <group matrixAutoUpdate={false} matrix={n.linkMatrix}>
              <Corridor link={n.link} env={envOf(data, n.link.child.taxon.id)} from={envOf(data, n.link.parent.taxon.id)} clear={clearFor.get(n.plan.taxon.id)} swimmers={swimmersFor(data, n.link.child.taxon.id)} />
            </group>
            <group matrixAutoUpdate={false} matrix={n.matrix}>
              <Room data={data} plan={n.plan} openTo={null} />
            </group>
          </group>
        ))}
        {/* two rooms ahead: the corridors out of the next rooms, and the rooms at
            their ends as plain shells, so nothing pops in as you arrive */}
        {far.map((f) => (
          <FarRoom key={`${f.via.plan.taxon.id}>${f.m.plan.taxon.id}`} data={data} f={f} />
        ))}
      </group>
    </>
  );
}

const endFog = new THREE.Fog("#000", 0, 1);
const skyA = { top: new THREE.Color(), bottom: new THREE.Color() };

/** Backdrop above and below: the water's colours, or a pale sky over darker ground. */
function skyOf(env: Environment, top: THREE.Color, bottom: THREE.Color) {
  if (env.water) {
    top.set(env.water.shallow);
    bottom.set(env.water.deep);
  } else {
    top.set("#d9e7ee");
    bottom.set(env.fog.color).offsetHSL(0, 0, -0.25);
  }
}

const swimmerCache = new Map<string, SwimmerSpec[]>();

/** Up to three of the best-read whales down a lineage that have their own
 *  silhouette, at life size, to swim past its tunnel. */
function swimmersFor(data: MuseumData, id: string): SwimmerSpec[] {
  const hit = swimmerCache.get(id);
  if (hit) return hit;
  const inWhales = (x: string) => lineage(data, x).some((t) => t.id === "Cetacea");
  const found: Taxon[] = [];
  const walk = (x: string) => {
    const t = data.taxa[x];
    if (t.silhouette && !t.children.length && inWhales(x)) found.push(t);
    t.children.forEach(walk);
  };
  walk(id);
  found.sort((a, b) => b.pageviews - a.pageviews);
  const seen = new Set<string>();
  const out: SwimmerSpec[] = [];
  for (const t of found) {
    if (seen.has(t.silhouette!.url) || out.length >= 3) continue;
    seen.add(t.silhouette!.url);
    out.push({ sil: t.silhouette!, length: lifeLength(t, archetypeOf(data, t.id)) });
  }
  swimmerCache.set(id, out);
  return out;
}

/** Rooms are dry halls: their fog is the environment's colour, but thin. */
function roomFog(env: Environment, out: THREE.Fog): THREE.Fog {
  out.color.set(env.fog.color);
  out.near = env.outside === "ocean" ? 22 : env.fog.near;
  out.far = env.outside === "ocean" ? 120 : env.fog.far;
  return out;
}

function FarRoom({ data, f }: { data: MuseumData; f: Far }) {
  const corridor = useMemo(() => f.via.matrix.clone().multiply(f.m.linkMatrix), [f]);
  return (
    <>
      <group matrixAutoUpdate={false} matrix={corridor}>
        <Corridor link={f.m.link} env={envOf(data, f.m.link.child.taxon.id)} from={envOf(data, f.m.link.parent.taxon.id)} lite />
      </group>
      {f.drawRoom && (
        <group matrixAutoUpdate={false} matrix={f.matrix}>
          <Room data={data} plan={f.m.plan} openTo={f.via.plan.taxon.id} lite />
        </group>
      )}
    </>
  );
}
