// Wall text drawn onto canvases: room panels, wall labels, door signs and
// corridor plaques. One CanvasTexture per distinct panel, cached by key.

import * as THREE from "three";

export const PX_PER_M = 220;

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface PanelSpec {
  key: string;
  /** Size in metres. */
  w: number;
  h: number;
  background: string;
  ink: string;
  muted: string;
  accent?: string;
  eyebrow?: string;
  title: string;
  italicTitle?: boolean;
  subtitle?: string;
  body?: string;
  footer?: string;
  /** Title size in metres of cap height (roughly). */
  titleSize?: number;
  bodySize?: number;
  align?: "left" | "center";
  /** Space (m) left empty at the top, e.g. for a silhouette drawn over the panel. */
  topInset?: number;
  /** Canvas resolution (default PX_PER_M): more for text read up close. */
  pxPerM?: number;
}

const cache = new Map<string, THREE.CanvasTexture>();

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    out.push("");
  }
  out.pop();
  return out;
}

export function panelTexture(s: PanelSpec): THREE.CanvasTexture {
  const hit = cache.get(s.key);
  if (hit) return hit;
  const ppm = s.pxPerM ?? PX_PER_M;
  const W = Math.round(s.w * ppm);
  const H = Math.round(s.h * ppm);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, W, H);
  const pad = Math.round(Math.min(W, H) * 0.08);
  const maxW = W - pad * 2;
  const centre = s.align === "center";
  ctx.textAlign = centre ? "center" : "left";
  const x = centre ? W / 2 : pad;
  let y = pad + (s.topInset ?? 0) * ppm;
  ctx.textBaseline = "top";

  if (s.accent) {
    ctx.fillStyle = s.accent;
    ctx.fillRect(centre ? W / 2 - pad : pad, y, pad * 2, Math.max(4, pad * 0.12));
    y += pad * 0.45;
  }
  if (s.eyebrow) {
    const sz = Math.round((s.bodySize ?? 0.09) * ppm * 0.85);
    ctx.font = `600 ${sz}px ${SANS}`;
    ctx.fillStyle = s.muted;
    ctx.fillText(s.eyebrow.toUpperCase(), x, y, maxW);
    y += sz * 1.6;
  }
  const tsz = Math.round((s.titleSize ?? 0.22) * ppm);
  ctx.font = `${s.italicTitle ? "italic " : ""}600 ${tsz}px ${SERIF}`;
  ctx.fillStyle = s.ink;
  for (const line of wrap(ctx, s.title, maxW)) {
    ctx.fillText(line, x, y, maxW);
    y += tsz * 1.15;
  }
  if (s.subtitle) {
    const sz = Math.round(tsz * 0.5);
    ctx.font = `${sz}px ${SANS}`;
    ctx.fillStyle = s.muted;
    y += sz * 0.3;
    for (const line of wrap(ctx, s.subtitle, maxW)) {
      ctx.fillText(line, x, y, maxW);
      y += sz * 1.3;
    }
  }
  const footSize = Math.round((s.bodySize ?? 0.09) * ppm * 0.8);
  const bottom = H - pad - (s.footer ? footSize * 1.5 : 0);
  if (s.body) {
    const sz = Math.round((s.bodySize ?? 0.09) * ppm);
    ctx.font = `${sz}px ${SERIF}`;
    ctx.fillStyle = s.ink;
    y += sz * 0.8;
    const lines = wrap(ctx, s.body, maxW);
    for (let i = 0; i < lines.length; i++) {
      if (y + sz * 1.4 > bottom) {
        // out of wall: end on an ellipsis
        if (i > 0) {
          const prevY = y - sz * 1.4;
          ctx.fillStyle = s.background;
          ctx.fillRect(0, prevY, W, sz * 1.4);
          ctx.fillStyle = s.ink;
          ctx.fillText(lines[i - 1].replace(/\s*\S*$/, "") + " …", x, prevY, maxW);
        }
        break;
      }
      ctx.fillText(lines[i], x, y, maxW);
      y += sz * 1.4;
    }
  }
  if (s.footer) {
    ctx.font = `${footSize}px ${SANS}`;
    ctx.fillStyle = s.muted;
    ctx.fillText(s.footer, x, H - pad - footSize, maxW);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(s.key, tex);
  return tex;
}

/** A plain block of colour with a large number/word (floor and wall time marks). */
export function markTexture(key: string, text: string, ink: string, bg: string, wPx = 512, hPx = 160): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = wPx;
  c.height = hPx;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, wPx, hPx);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(hPx * 0.5)}px ${SANS}`;
  ctx.fillText(text, wPx / 2, hPx / 2, wPx * 0.92);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** IUCN code -> words. */
export const STATUS: Record<string, string> = {
  LC: "Least Concern",
  NT: "Near Threatened",
  VU: "Vulnerable",
  EN: "Endangered",
  CR: "Critically Endangered",
  EW: "Extinct in the Wild",
  EX: "Extinct",
  DD: "Data Deficient",
  CD: "Conservation Dependent",
  LR: "Lower Risk",
};
