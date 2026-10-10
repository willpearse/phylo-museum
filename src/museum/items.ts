// Wording shared by wall labels, door signs and the inspect panel.

import type { Species, Taxon, Waypoint } from "@/lib/types";
import { formatMa } from "@/lib/geotime";
import type { InspectItem } from "./Exhibit";
import { STATUS } from "./panels";

export const isItalic = (rank: string) => rank === "genus" || rank === "species" || rank === "subgenus";

export function displayName(t: { name: string; rank: string; extinct: boolean }): string {
  return `${t.extinct ? "† " : ""}${t.name}`;
}

/** "Rorqual", unless the article is just the scientific name. */
export function commonName(t: { name: string; common: string }): string | null {
  return t.common && t.common.toLowerCase() !== t.name.toLowerCase() ? t.common : null;
}

export function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function timeLine(t: Taxon): string {
  if (t.extinct) return `${formatMa(t.start)} – ${formatMa(t.end)}`;
  return t.dated ? `From ${formatMa(t.start)} to today` : `Living; first appearance not recorded`;
}

export function taxonItem(t: Taxon): InspectItem {
  const meta = [capital(t.rank), timeLine(t)];
  if (t.rangeText) meta.push(`Fossil range: ${t.rangeText}`);
  if (t.status) meta.push(`IUCN: ${STATUS[t.status] ?? t.status}`);
  if (t.generaTotal > 1) meta.push(`${t.generaTotal} genera on Wikipedia`);
  return {
    title: displayName(t),
    italic: isItalic(t.rank),
    subtitle: commonName(t) ?? "",
    meta,
    body: t.extract,
    image: t.image,
    url: t.wikipediaUrl,
    goto: t.id,
    silhouette: t.silhouette,
  };
}

export function speciesItem(s: Species): InspectItem {
  const meta = ["Species"];
  if (s.status) meta.push(`IUCN: ${STATUS[s.status] ?? s.status}`);
  return {
    title: s.name,
    italic: true,
    subtitle: commonName(s) ?? "",
    meta,
    body: s.extract,
    image: s.image,
    url: s.wikipediaUrl,
  };
}

export function waypointItem(w: Waypoint): InspectItem {
  const meta = [capital(w.rank)];
  if (w.start != null) meta.push(`First appears ${formatMa(w.start)}`);
  return {
    title: `${w.extinct ? "† " : ""}${w.name}`,
    italic: isItalic(w.rank),
    subtitle: commonName(w) ?? "",
    meta,
    body: w.extract,
    image: w.image,
    url: w.wikipediaUrl,
    silhouette: w.silhouette,
  };
}

// ---- palette ---------------------------------------------------------------

export interface RoomTheme {
  wall: string;
  floor: string;
  ceiling: string;
  panel: string;
  ink: string;
  muted: string;
  accent: string;
}

export const LIVING: RoomTheme = {
  wall: "#e9eef0",
  floor: "#6f7f86",
  ceiling: "#f4f7f8",
  panel: "#fbfcfc",
  ink: "#1d2a30",
  muted: "#5d6d74",
  accent: "#2f7f9a",
};

export const FOSSIL: RoomTheme = {
  wall: "#e6dccb",
  floor: "#7d6f5d",
  ceiling: "#efe8dc",
  panel: "#f7f1e6",
  ink: "#2e2619",
  muted: "#6f6150",
  accent: "#a0622d",
};

export const themeOf = (t: { extinct: boolean }) => (t.extinct ? FOSSIL : LIVING);
