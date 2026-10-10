// The whole museum as a time-scaled cladogram: the entrance page and the
// "where am I" map. Click any node to walk in there.

import { useMemo } from "react";
import type { MuseumData, Taxon } from "@/lib/types";
import { EPOCHS } from "@/lib/geotime";
import { lineage } from "@/museum/layout";

const ROW = 17;
const LABEL_W = 230;
const PAD = { top: 34, left: 14, right: 16, bottom: 14 };

interface Pos {
  x: number;
  y: number;
}

export function TreeMap({
  data,
  current,
  onPick,
  width,
}: {
  data: MuseumData;
  current: string | null;
  onPick: (id: string) => void;
  width: number;
}) {
  const { pos, height, x, t0 } = useMemo(() => {
    const root = data.taxa[data.root];
    const t0 = root.start + 2;
    const plotW = Math.max(240, width - LABEL_W - PAD.left - PAD.right);
    const x = (ma: number) => PAD.left + ((t0 - ma) / t0) * plotW;
    const pos = new Map<string, Pos>();
    let row = 0;
    const place = (id: string): number => {
      const t = data.taxa[id];
      let y: number;
      if (!t.children.length) y = PAD.top + row++ * ROW;
      else {
        const ys = t.children.map(place);
        y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      pos.set(id, { x: x(t.start), y });
      return y;
    };
    place(data.root);
    return { pos, height: PAD.top + row * ROW + PAD.bottom, x, t0 };
  }, [data, width]);

  const path = useMemo(() => new Set(current ? lineage(data, current).map((t) => t.id) : []), [data, current]);
  const all = Object.values(data.taxa);
  const tipX = (t: Taxon) => (t.extinct ? x(t.end) : x(0));
  const ticks = [50, 40, 30, 20, 10, 0].filter((m) => m < t0);

  return (
    <svg width={width} height={height} role="img" aria-label="Tree of the museum's rooms" style={{ display: "block" }}>
      {EPOCHS.filter((e) => e.end < t0).map((e) => {
        const a = x(Math.min(e.start, t0));
        const b = x(e.end);
        return (
          <g key={e.name}>
            <rect x={a} y={PAD.top - 24} width={b - a} height={height - PAD.top + 24} fill={e.color} opacity={0.16} />
            {b - a > 46 && (
              <text x={(a + b) / 2} y={PAD.top - 12} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {e.name}
              </text>
            )}
          </g>
        );
      })}
      {ticks.map((m) => (
        <text key={m} x={x(m)} y={height - 2} textAnchor="middle" fontSize={10} fill="var(--muted)">
          {m ? `${m} Ma` : "today"}
        </text>
      ))}

      {/* branches: elbow from parent to child, then the lineage's span */}
      {all.map((t) => {
        const p = pos.get(t.id)!;
        const on = path.has(t.id);
        const stroke = on ? "var(--accent)" : t.extinct ? "var(--fossil)" : "var(--ink-soft)";
        const parent = t.parent ? pos.get(t.parent)! : null;
        return (
          <g key={t.id}>
            {parent && (
              <path
                d={`M${parent.x},${parent.y} V${p.y} H${p.x}`}
                fill="none"
                stroke={stroke}
                strokeWidth={on ? 2.6 : 1.3}
                strokeDasharray={t.extinct ? "4 3" : undefined}
              />
            )}
            {!t.children.length && (
              <line x1={p.x} y1={p.y} x2={tipX(t)} y2={p.y} stroke={stroke} strokeWidth={on ? 2.6 : 1.3} strokeDasharray={t.extinct ? "4 3" : undefined} />
            )}
          </g>
        );
      })}

      {all.map((t) => {
        const p = pos.get(t.id)!;
        const leaf = !t.children.length;
        const here = t.id === current;
        const on = path.has(t.id);
        return (
          <g key={`n:${t.id}`} className="node" onClick={() => onPick(t.id)} style={{ cursor: "pointer" }}>
            <title>{`${t.extinct ? "† " : ""}${t.name}${t.common !== t.name ? ` (${t.common})` : ""}`}</title>
            <circle cx={p.x} cy={p.y} r={here ? 6 : leaf ? 3 : 4} fill={here ? "var(--accent)" : on ? "var(--accent)" : t.extinct ? "var(--fossil)" : "var(--ink-soft)"} stroke="var(--bg)" strokeWidth={1.5} />
            {leaf ? (
              <text x={tipX(t) + 6} y={p.y + 4} fontSize={12} fill={on ? "var(--accent)" : "var(--ink)"} fontStyle="italic" fontWeight={here ? 700 : 400}>
                {t.extinct ? "† " : ""}
                {t.name}
                {t.common !== t.name && (
                  <tspan fontStyle="normal" fill="var(--muted)">
                    {"  "}
                    {t.common.length > 26 ? t.common.slice(0, 25) + "…" : t.common}
                  </tspan>
                )}
              </text>
            ) : (
              <text x={p.x + 5} y={p.y - 5} fontSize={10.5} fill={on ? "var(--accent)" : "var(--muted)"} fontWeight={here ? 700 : 500}>
                {t.extinct ? "† " : ""}
                {t.name}
              </text>
            )}
            {/* generous hit area */}
            <rect x={p.x - 8} y={p.y - 8} width={leaf ? tipX(t) - p.x + 150 : 16} height={16} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}
