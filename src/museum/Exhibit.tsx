// Things on walls: framed Wikimedia images and text panels. Every mesh that
// can be clicked carries userData.pick (an InspectItem).

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { ImageRef, Silhouette } from "@/lib/types";
import { panelTexture, type PanelSpec } from "./panels";

export interface InspectItem {
  title: string;
  italic: boolean;
  subtitle: string;
  meta: string[];
  body: string;
  image: ImageRef | null;
  url: string | null;
  /** Room to jump to from the panel, if any. */
  goto?: string;
  /** Silhouette shown with it (credited in the panel). */
  silhouette?: Silhouette | null;
}

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
const textures = new Map<string, Promise<THREE.Texture>>();

function loadTexture(url: string): Promise<THREE.Texture> {
  let p = textures.get(url);
  if (!p) {
    p = new Promise((resolve, reject) =>
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          resolve(t);
        },
        undefined,
        reject
      )
    );
    // a failed load may succeed later (Wikimedia busy): forget it
    p.catch(() => textures.delete(url));
    textures.set(url, p);
  }
  return p;
}

/** The image's thumbnail as a texture, once it has loaded. */
export function useWikiTexture(image: ImageRef | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const url = image?.thumb ?? null;
  useEffect(() => {
    if (!url) return;
    let live = true;
    loadTexture(url)
      .then((t) => {
        if (live) {
          setTex(t);
          invalidate();
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url, invalidate]);
  return tex;
}

/** Fit an image of aspect `a` (w/h) into a box. */
export function fit(a: number, maxW: number, maxH: number): [number, number] {
  return a > maxW / maxH ? [maxW, maxW / a] : [maxH * a, maxH];
}

export function FramedImage({
  image,
  maxW,
  maxH,
  pick,
  frame = "#2b2620",
}: {
  image: ImageRef;
  maxW: number;
  maxH: number;
  pick: InspectItem;
  frame?: string;
}) {
  const tex = useWikiTexture(image);
  const [w, h] = fit(image.width / image.height || 1.4, maxW, maxH);
  const border = 0.06;
  return (
    <group>
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[w + border * 2, h + border * 2, 0.05]} />
        <meshLambertMaterial color={frame} />
      </mesh>
      <mesh userData={{ pick }}>
        <planeGeometry args={[w, h]} />
        {/* separate keys: re-using the placeholder's material would drop its colour
            prop, which resets to black and blacks out the image */}
        {tex ? <meshBasicMaterial key="image" map={tex} color="#ffffff" toneMapped={false} /> : <meshBasicMaterial key="placeholder" color="#cfc8bb" />}
      </mesh>
    </group>
  );
}

export function Panel({ spec, pick }: { spec: PanelSpec; pick?: InspectItem }) {
  const tex = useMemo(() => panelTexture(spec), [spec]);
  return (
    <mesh userData={pick ? { pick } : undefined}>
      <planeGeometry args={[spec.w, spec.h]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}
