import { useCallback, useEffect, useState } from "react";
import type { MuseumData, Silhouette } from "@/lib/types";
import { Museum, type Arrival } from "@/museum/Museum";
import type { InspectItem } from "@/museum/Exhibit";
import { lineage } from "@/museum/layout";
import { taxonItem } from "@/museum/items";
import { TreeMap } from "@/ui/TreeMap";
import { InspectPanel } from "@/ui/InspectPanel";

function roomFromHash(data: MuseumData): string | null {
  const m = /^#\/room\/(.+)$/.exec(location.hash);
  const id = m ? decodeURIComponent(m[1]) : null;
  return id && data.taxa[id] ? id : null;
}

export function App() {
  const [data, setData] = useState<MuseumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [item, setItem] = useState<InspectItem | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}museum.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: MuseumData) => {
        setData(d);
        const id = roomFromHash(d);
        if (id) setArrival({ id, seq: 0 });
      })
      .catch((e) => setError(String(e)));
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const go = useCallback((id: string) => {
    setItem(null);
    setMapOpen(false);
    setArrival((a) => ({ id, seq: (a?.seq ?? 0) + 1 }));
  }, []);

  const onRoom = useCallback((id: string) => {
    setRoom(id);
    history.replaceState(null, "", `#/room/${encodeURIComponent(id)}`);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!arrival) return;
      if (e.code === "KeyM") setMapOpen((o) => !o);
      if (e.code === "Escape") {
        setItem(null);
        setMapOpen(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [arrival]);

  if (error) return <div className="splash">Could not load the museum ({error}). Run <code>npm run ingest</code> first.</div>;
  if (!data) return <div className="splash">Opening the doors…</div>;

  const mapWidth = Math.min(1100, width - 32);

  if (!arrival)
    return (
      <main className="entrance">
        <header>
          <p className="eyebrow">A walkable tree of life</p>
          <h1>The Whale Museum</h1>
          <p className="lede">
            Every corridor is a lineage and every room a group of whales, their relatives or their ancestors. The longer
            the corridor, the more time passes as you walk it: about three metres for every million years. Its walls
            change colour with the geological epochs, and the groups Wikipedia names along the way hang where they first
            appear in the fossil record.
          </p>
          <div className="cta">
            <button className="primary" onClick={() => go(data.root)}>
              Enter at the beginning
            </button>
            <span className="hint">or pick any room on the tree below</span>
          </div>
          <p className="keys">
            <b>W A S D</b> to walk and the mouse to look; <b>← →</b> or <b>Q E</b> to turn; hold <b>W</b> (or Shift) to run. Click a label to read it.{" "}
            <b>M</b> opens the map. On a phone, drag to look and tap the floor to walk.
          </p>
        </header>
        <div className="map-scroll">
          <TreeMap data={data} current={null} onPick={go} width={mapWidth} />
        </div>
        <Footer data={data} />
      </main>
    );

  const path = room ? lineage(data, room) : [];
  return (
    <>
      <Museum
        data={data}
        arrival={arrival}
        onRoom={onRoom}
        onInspect={setItem}
        paused={!!item || mapOpen}
        onLockChange={setLocked}
      />
      <nav className="hud">
        <ol className="crumbs">
          {path.map((t) => (
            <li key={t.id}>
              <button onClick={() => setItem(taxonItem(t))} className={t.rank === "genus" ? "italic" : undefined}>
                {t.extinct ? "† " : ""}
                {t.name}
              </button>
            </li>
          ))}
        </ol>
        <button className="map-btn" onClick={() => setMapOpen(true)}>
          Map <kbd>M</kbd>
        </button>
      </nav>
      {locked && !item && !mapOpen && <div className="crosshair" />}
      {!locked && !item && !mapOpen && <div className="look-hint">Click to look around · W A S D to walk · ← → or Q E to turn · M for the map</div>}
      {item && <InspectPanel item={item} onClose={() => setItem(null)} onGoto={go} />}
      {mapOpen && (
        <div className="map-overlay" onClick={() => setMapOpen(false)}>
          <div className="map-card" onClick={(e) => e.stopPropagation()}>
            <div className="map-head">
              <h2>Where you are</h2>
              <button onClick={() => setMapOpen(false)} aria-label="Close map">
                ×
              </button>
            </div>
            <div className="map-scroll">
              <TreeMap data={data} current={room} onPick={go} width={Math.min(1060, width - 64)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Footer({ data }: { data: MuseumData }) {
  // every silhouette shown anywhere, credited once
  const sils = new Map<string, Silhouette>();
  for (const t of Object.values(data.taxa)) for (const s of [t.silhouette, ...t.corridor.map((w) => w.silhouette)]) if (s) sils.set(s.url, s);
  return (
    <footer>
      Text, images and the classification come from{" "}
      <a href="https://en.wikipedia.org/" target="_blank" rel="noreferrer">
        Wikipedia
      </a>{" "}
      and{" "}
      <a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">
        Wikimedia Commons
      </a>
      ; dates are the fossil ranges in Wikipedia's taxoboxes. Built on{" "}
      <a href="https://github.com/justdataplease/art-history-museum" target="_blank" rel="noreferrer">
        A Walkable History of Art
      </a>
      . If you enjoy it, please{" "}
      <a href="https://donate.wikimedia.org/" target="_blank" rel="noreferrer">
        donate to Wikipedia
      </a>
      .
      <details className="credits">
        <summary>Silhouette credits ({sils.size}, from PhyloPic)</summary>
        <ul>
          {[...sils.values()]
            .sort((a, b) => a.depicts.localeCompare(b.depicts))
            .map((s) => (
              <li key={s.url}>
                <i>{s.depicts}</i>:{" "}
                <a href={s.page} target="_blank" rel="noreferrer">
                  {s.author ? `${s.author}, ` : ""}
                  {s.license}
                </a>
              </li>
            ))}
        </ul>
      </details>
    </footer>
  );
}
