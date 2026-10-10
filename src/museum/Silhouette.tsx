// PhyloPic silhouettes: on door signs, and swimming past outside the tunnels.

import { useEffect, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { MuseumData, Silhouette } from "@/lib/types";

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
const cache = new Map<string, Promise<THREE.Texture>>();

export function useSilhouetteTexture(sil: Silhouette | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!sil) return;
    let live = true;
    let p = cache.get(sil.url);
    if (!p) {
      // PhyloPic PNGs are black on transparent: repaint them white (keeping the
      // alpha) so a material colour can tint them
      p = new Promise((res, rej) =>
        loader.load(
          // bundled with the app (see scripts/lib/extras.ts)
          `${import.meta.env.BASE_URL}${sil.url}`,
          (t) => {
            const img = t.image as HTMLImageElement;
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext("2d")!;
            g.drawImage(img, 0, 0);
            g.globalCompositeOperation = "source-in";
            g.fillStyle = "#ffffff";
            g.fillRect(0, 0, c.width, c.height);
            const out = new THREE.CanvasTexture(c);
            out.colorSpace = THREE.SRGBColorSpace;
            res(out);
          },
          undefined,
          rej
        )
      );
      p.catch(() => cache.delete(sil.url));
      cache.set(sil.url, p);
    }
    p.then((t) => {
      if (live) {
        setTex(t);
        invalidate();
      }
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [sil, invalidate]);
  return tex;
}

/** A taxon's silhouette, or failing that its most-read descendant's with one,
 *  or the nearest ancestor's. */
export function silhouetteOf(data: MuseumData, id: string): Silhouette | null {
  const t = data.taxa[id];
  if (t.silhouette) return t.silhouette;
  let best: { sil: Silhouette; views: number } | null = null;
  const walk = (x: string) => {
    const n = data.taxa[x];
    if (n.silhouette && (!best || n.pageviews > best.views)) best = { sil: n.silhouette, views: n.pageviews };
    n.children.forEach(walk);
  };
  t.children.forEach(walk);
  if (best) return (best as { sil: Silhouette }).sil;
  for (let p = t.parent; p; p = data.taxa[p].parent) if (data.taxa[p].silhouette) return data.taxa[p].silhouette;
  return null;
}

/** A silhouette `height` metres tall (or fitted inside maxW x height), facing +z. */
export function SilhouettePlane({ sil, height, maxW = Infinity, color, opacity = 1, fog = true }: { sil: Silhouette; height: number; maxW?: number; color: string; opacity?: number; fog?: boolean }) {
  const tex = useSilhouetteTexture(sil);
  if (!tex) return null;
  const aspect = sil.width / sil.height;
  let h = height;
  let w = h * aspect;
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} color={color} transparent opacity={opacity} depthWrite={false} fog={fog} toneMapped={false} />
    </mesh>
  );
}
