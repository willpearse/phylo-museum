// A rotunda: one room of the tree. The door back toward the root is behind
// you as you enter (+z); doors to the descendant lineages fan out ahead,
// oldest on the left. A double-sided stand in the middle introduces the
// taxon; a genus room hangs its living species around the walls.

import { useMemo } from "react";
import * as THREE from "three";
import type { ImageRef, MuseumData, Species } from "@/lib/types";
import { formatMa } from "@/lib/geotime";
import { CORRIDOR_H, EXHIBIT_SPAN, LECTERN, WALL_H, dirOf, doorHalfAngle, furnitureOf, type RoomPlan } from "./layout";
import { Statue } from "./Statue";
import { HallShell, washTexture } from "./Hall";
import { envOf } from "./environment";
import { SilhouettePlane, silhouetteOf } from "./Silhouette";
import { FramedImage, Panel } from "./Exhibit";
import { commonName, displayName, isItalic, speciesItem, taxonItem, themeOf, timeLine } from "./items";
import { STATUS } from "./panels";

const TAU = Math.PI * 2;

/** Free intervals of [-π, π] once `blocked` (which may wrap past ±π) are removed. */
function complement(blocked: [number, number][]): [number, number][] {
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

/** Plane segments approximating an arc of the wall, from y0 to y1. */
function arcSegments(r: number, a0: number, a1: number, y0: number, y1: number, key: string) {
  const n = Math.max(1, Math.ceil((a1 - a0) / 0.1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const b0 = a0 + ((a1 - a0) * i) / n;
    const b1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const mid = (b0 + b1) / 2;
    const half = (b1 - b0) / 2;
    const p = dirOf(mid).multiplyScalar(r * Math.cos(half));
    out.push({ key: `${key}-${i}`, pos: [p.x, (y0 + y1) / 2, p.z] as const, rotY: -mid, w: 2 * r * Math.sin(half) + 0.02, h: y1 - y0 });
  }
  return out;
}

/** Angles for `n` exhibits spread evenly along the free arcs (padded off the doors). */
function slots(plan: RoomPlan, n: number): number[] {
  if (!n) return [];
  const pad = EXHIBIT_SPAN / 2 / plan.radius;
  const arcs = plan.arcs.map(([a, b]) => [a + pad, b - pad] as [number, number]).filter(([a, b]) => b > a);
  // the entrance wall (around ±π) is split in two at the parent door; skip
  // nothing else
  const total = arcs.reduce((s, [a, b]) => s + (b - a), 0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let d = n === 1 ? total / 2 : (total * i) / (n - 1);
    for (const [a, b] of arcs) {
      if (d <= b - a + 1e-6) {
        out.push(a + d);
        break;
      }
      d -= b - a;
    }
  }
  return out;
}

/** What hangs on a room's walls: its own image and the article's figures
 *  (each with its caption), then its living species. */
type WallItem = { kind: "figure"; image: ImageRef; key: string } | { kind: "species"; species: Species; key: string };

function wallItems(t: RoomPlan["taxon"]): WallItem[] {
  const out: WallItem[] = [];
  if (t.image) out.push({ kind: "figure", image: t.image, key: `img:${t.image.url}` });
  for (const f of t.figures ?? []) out.push({ kind: "figure", image: f, key: `fig:${f.url}` });
  for (const sp of t.species) out.push({ kind: "species", species: sp, key: `sp:${sp.name}` });
  return out;
}

const EXTERIOR = new THREE.MeshStandardMaterial({ color: "#3b5058", roughness: 0.7, metalness: 0.2 });
const EXTERIOR_BAND = new THREE.MeshStandardMaterial({ color: "#c9d6d8", roughness: 0.5, metalness: 0.3 });
const DOME = new THREE.MeshStandardMaterial({ color: "#a6dce4", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false });
const SHELL = 0.18;

/** `openTo`: the one door left open (null: all of them). `lite`: a room two
 *  doors away, seen only down corridors: no images, statue or species. */
export function Room({ data, plan, openTo, lite = false }: { data: MuseumData; plan: RoomPlan; openTo: string | null; lite?: boolean }) {
  const t = plan.taxon;
  const theme = themeOf(t);
  const env = envOf(data, t.id);
  const r = plan.radius;
  const half = doorHalfAngle(r);

  const { outside, jambs } = useMemo(() => {
    const blocked = plan.doors.map((d) => [d.angle - half, d.angle + half] as [number, number]);
    const free = complement(blocked);
    // the pavilion seen from outside: a shell a little larger, facing out
    const outside = [
      ...free.flatMap(([a, b], i) => arcSegments(r + SHELL, a, b, -1.2, WALL_H, `o${i}`)),
      ...plan.doors.flatMap((d, i) => arcSegments(r + SHELL, d.angle - half, d.angle + half, CORRIDOR_H, WALL_H, `ol${i}`)),
    ];
    // door reveals between the inner and outer walls
    const jambs = plan.doors.flatMap((d) =>
      [-1, 1].map((side) => {
        const a = d.angle + side * half;
        const p = dirOf(a).multiplyScalar(r + SHELL / 2);
        return { key: `${d.to}${side}`, pos: [p.x, CORRIDOR_H / 2, p.z] as [number, number, number], rotY: -a + Math.PI / 2 };
      })
    );
    return { outside, jambs };
  }, [plan, r, half]);

  const items = useMemo(() => (lite ? [] : wallItems(t)), [t, lite]);
  const angles = useMemo(() => slots(plan, items.length), [plan, items.length]);

  return (
    <group>
      <HallShell plan={plan} env={env} />

      {/* outside: panelled shell, a pale band under the eaves, a glass dome */}
      {outside.map((s) => (
        <mesh key={s.key} position={s.pos as unknown as [number, number, number]} rotation-y={s.rotY + Math.PI} material={EXTERIOR}>
          <planeGeometry args={[s.w, s.h]} />
        </mesh>
      ))}
      {jambs.map((j) => (
        <mesh key={j.key} position={j.pos} rotation-y={j.rotY} material={EXTERIOR}>
          <planeGeometry args={[SHELL + 0.02, CORRIDOR_H]} />
        </mesh>
      ))}
      <mesh position-y={WALL_H - 0.2} material={EXTERIOR_BAND}>
        <cylinderGeometry args={[r + SHELL + 0.06, r + SHELL + 0.06, 0.4, 72, 1, true]} />
      </mesh>
      <mesh position-y={WALL_H} material={EXTERIOR_BAND} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[r * 0.98, r + SHELL + 0.06, 72]} />
      </mesh>
      <mesh position-y={WALL_H} scale={[1, 0.32, 1]} material={DOME}>
        <sphereGeometry args={[r * 0.98, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>

      {/* doors: signs over them (with a silhouette of what lies beyond);
          doors not toward the visitor's room are veiled */}
      {plan.doors.map((d) => {
        const to = data.taxa[d.to];
        const inward = dirOf(d.angle).multiplyScalar(r * Math.cos(half) - 0.04);
        const signH = WALL_H - CORRIDOR_H - 0.12;
        const child = d.kind === "child";
        const sil = child ? silhouetteOf(data, to.id) : null;
        const inset = sil ? 0.62 : 0;
        const sign = child
          ? {
              key: `door:${t.id}>${to.id}:${inset}`,
              w: 3.9,
              h: signH,
              background: themeOf(to).panel,
              ink: themeOf(to).ink,
              muted: themeOf(to).muted,
              align: "center" as const,
              topInset: inset,
              eyebrow: `${to.rank}${to.generaTotal > 1 ? ` · ${to.generaTotal} genera` : ""}`,
              title: displayName(to),
              italicTitle: isItalic(to.rank),
              subtitle: [commonName(to), to.dated || to.extinct ? `from ${formatMa(to.start)}` : null].filter(Boolean).join(" · "),
              titleSize: 0.18,
              bodySize: 0.07,
            }
          : {
              key: `back:${t.id}>${to.id}`,
              w: 3.9,
              h: signH,
              background: theme.panel,
              ink: theme.ink,
              muted: theme.muted,
              align: "center" as const,
              eyebrow: "Back toward the root",
              title: displayName(to),
              italicTitle: isItalic(to.rank),
              subtitle: commonName(to) ?? undefined,
              titleSize: 0.17,
              bodySize: 0.075,
            };
        const veiled = openTo !== null && d.to !== openTo;
        const outward = dirOf(d.angle).multiplyScalar(r + 0.6);
        const signY = CORRIDOR_H + 0.06 + signH / 2;
        return (
          <group key={d.to}>
            <group position={[inward.x, signY, inward.z]} rotation-y={-d.angle}>
              <Panel spec={sign} pick={child ? taxonItem(to) : undefined} />
              {sil && !lite && (
                <group position={[0, signH / 2 - 0.12 - inset / 2, 0.01]}>
                  <SilhouettePlane sil={sil} height={inset - 0.1} maxW={1.6} color={themeOf(to).ink} />
                </group>
              )}
            </group>
            {veiled && (
              <mesh position={[outward.x, CORRIDOR_H / 2, outward.z]} rotation-y={-d.angle}>
                <planeGeometry args={[4.6, CORRIDOR_H + 0.2]} />
                <meshBasicMaterial color="#0d1418" side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        );
      })}

      <Centre data={data} plan={plan} lite={lite} plinthColor={env.hall.plinth} trim={env.hall.trim} />

      {items.map((it, i) => {
        const a = angles[i];
        if (a == null) return null;
        const p = dirOf(a).multiplyScalar(r * Math.cos(EXHIBIT_SPAN / 2 / r) - 0.06);
        return (
          <group key={it.key} position={[p.x, 0, p.z]} rotation-y={-a}>
            {/* a pool of light on the wall behind */}
            <mesh position={[0, 1.95, -0.02]}>
              <planeGeometry args={[3.3, 3.4]} />
              <meshBasicMaterial map={washTexture()} color={env.hall.wash} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            {it.kind === "figure" ? <FigureExhibit image={it.image} taxon={t} /> : <SpeciesExhibit s={it.species} theme={theme} />}
          </group>
        );
      })}
    </group>
  );
}

function FigureExhibit({ image, taxon }: { image: ImageRef; taxon: RoomPlan["taxon"] }) {
  const theme = themeOf(taxon);
  const item = { ...taxonItem(taxon), image, body: image.caption ? `${image.caption}\n\n${taxon.extract}` : taxon.extract };
  const credit = image.credit ? `${image.credit.author ? `${image.credit.author}, ` : ""}${image.credit.license}` : "";
  return (
    <>
      <group position-y={2.15}>
        <FramedImage image={image} maxW={2.5} maxH={1.75} pick={item} />
      </group>
      <group position-y={0.82}>
        <Panel
          pick={item}
          spec={{
            key: `cap:${image.url}`,
            w: 1.9,
            h: 0.62,
            background: theme.panel,
            ink: theme.ink,
            muted: theme.muted,
            title: "",
            body: image.caption || displayName(taxon),
            footer: credit,
            titleSize: 0.01,
            bodySize: 0.052,
            pxPerM: 320,
          }}
        />
      </group>
    </>
  );
}

function SpeciesExhibit({ s, theme }: { s: Species; theme: ReturnType<typeof themeOf> }) {
  const status = s.status ? STATUS[s.status] ?? s.status : null;
  return (
    <>
      {s.image && (
        <group position-y={2.15}>
          <FramedImage image={s.image} maxW={2.5} maxH={1.75} pick={speciesItem(s)} />
        </group>
      )}
      <group position-y={s.image ? 0.82 : 1.6}>
        <Panel
          pick={speciesItem(s)}
          spec={{
            key: `sp:${s.name}`,
            w: 1.9,
            h: s.image ? 0.62 : 1.6,
            background: theme.panel,
            ink: theme.ink,
            muted: theme.muted,
            title: s.name,
            italicTitle: true,
            subtitle: [commonName(s), status].filter(Boolean).join(" · "),
            body: s.image ? undefined : s.extract,
            titleSize: 0.11,
            bodySize: 0.06,
          }}
        />
      </group>
    </>
  );
}

/** The statue on its plinth, and the lectern before it facing the entrance. */
function Centre({ data, plan, lite, plinthColor, trim }: { data: MuseumData; plan: RoomPlan; lite: boolean; plinthColor: string; trim: string }) {
  const t = plan.taxon;
  const theme = themeOf(t);
  const f = furnitureOf(data, plan);
  const st = f.statue;
  const item = taxonItem(t);
  const scale = st.shown >= st.life * 0.98 ? "life size" : `1:${Math.round(st.life / st.shown)} scale`;
  const subject = st.subject.id === t.id ? "" : ` (${st.subject.name}${commonName(st.subject) ? `, ${commonName(st.subject)}` : ""})`;
  const footer = `Statue${subject}: ${st.archetype.name}, ${scale}, ${Math.round(st.life * 10) / 10} m long${t.extinct ? ` · lineage ended ${formatMa(t.end)}` : ""}`;
  const mats = useMemo(
    () => ({
      plinth: new THREE.MeshStandardMaterial({ color: plinthColor, roughness: 0.45, metalness: 0.1 }),
      trim: new THREE.MeshStandardMaterial({ color: trim, roughness: 0.4, metalness: 0.5 }),
    }),
    [plinthColor, trim]
  );
  return (
    <group>
      <mesh position-y={f.plinth.h / 2} material={mats.plinth}>
        <boxGeometry args={[f.plinth.w, f.plinth.h, f.plinth.d]} />
      </mesh>
      {/* a moulded base and a trim band round the top */}
      <mesh position-y={0.04} material={mats.plinth}>
        <boxGeometry args={[f.plinth.w + 0.16, 0.08, f.plinth.d + 0.16]} />
      </mesh>
      {/* (its top sits just under the plinth's, so only a thin edge shows) */}
      <mesh position-y={f.plinth.h - 0.05} material={mats.trim}>
        <boxGeometry args={[f.plinth.w + 0.04, 0.05, f.plinth.d + 0.04]} />
      </mesh>
      {!lite && (
        <group position-y={f.plinth.h}>
          <Statue plan={st} extinct={st.subject.extinct} />
        </group>
      )}
      {/* lectern */}
      {/* a reading desk to one side, turned a little toward the way in */}
      <group position={[f.lectern.x, 0, f.lectern.z]} rotation-y={-0.35}>
        <mesh material={mats.plinth} position={[0, 0.42, -0.1]}>
          <boxGeometry args={[0.45, 0.84, 0.3]} />
        </mesh>
        <group position={[0, 0.98, 0]} rotation-x={-0.85}>
          <mesh position-z={-0.03} material={LECTERN_TOP}>
            <boxGeometry args={[LECTERN.w + 0.08, LECTERN.h + 0.08, 0.05]} />
          </mesh>
          <Panel
            pick={item}
            spec={{
              key: `lectern:${t.id}`,
              w: LECTERN.w,
              h: LECTERN.h,
              background: theme.panel,
              ink: theme.ink,
              muted: theme.muted,
              accent: theme.accent,
              eyebrow: `${t.rank} · ${timeLine(t)}`,
              title: displayName(t),
              italicTitle: isItalic(t.rank),
              subtitle: commonName(t) ?? undefined,
              body: t.extract,
              footer,
              titleSize: 0.11,
              bodySize: 0.038,
              pxPerM: 520,
            }}
          />
        </group>
      </group>
    </group>
  );
}

const LECTERN_TOP = new THREE.MeshStandardMaterial({ color: "#2b3033", roughness: 0.5, metalness: 0.2 });
