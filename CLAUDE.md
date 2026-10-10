# CLAUDE.md

## Overview

A walkable 3D museum of a phylogeny in the browser: rooms are taxa,
corridors are lineages, and corridor length is time. Everything (tree,
dates, text, images) comes from English Wikipedia and Wikimedia Commons;
silhouettes come from PhyloPic. The first wing is whales and their relatives
(root: Whippomorpha). Its design closely follows *A Walkable History of Art*
(`art-history-museum/`, kept in this folder for reference and git-ignored).
No code is copied from it; keep it that way, and keep the README's "Origins"
credit. See README.md for what visitors see and where the data comes from.

## Layout

- `scripts/ingest.ts`: builds `public/museum.json` and `public/silhouettes/` from Wikipedia and PhyloPic.
  - `scripts/lib/taxonomy.ts`: Template:Taxonomy crawl, taxobox, fossil-range and species-list parsing, image info.
  - `scripts/lib/extras.ts`: PhyloPic lookup and download (and silhouette facing), article figures, body length.
  - `scripts/lib/http.ts`: polite GETs (User-Agent, pacing, backoff on 429/5xx/maxlag) with an optional on-disk cache.
- `scripts/check-layout.ts`: geometry invariants over every room. Run it after any layout change.
- `scripts/shot.mjs`: dev server plus headless Chrome screenshots (view syntax in README).
- `src/lib/types.ts`: data shapes (`Taxon` = room, `Waypoint` = collapsed clade on a corridor, `Species`, `Silhouette`).
- `src/lib/geotime.ts`: ICS timescale, used for parsing fossil ranges and for epoch colours.
- `src/museum/layout.ts`: all geometry: room plans, door angles, corridor lengths, frames, far rooms, walkable space, furniture.
- `src/museum/Museum.tsx`: canvas, scene graph, walking, turning, picking, re-centring, fog and backdrop, dev hooks.
- `src/museum/Room.tsx`, `Hall.tsx`, `Corridor.tsx`, `ocean.tsx`, `Statue.tsx` and `statue-shapes.ts`, `Silhouette.tsx`, `Exhibit.tsx` and `panels.ts`, `items.ts`.
- `src/museum/environment.ts`: per-clade environments (fog, water, outside scenery, hall palette).
- `src/ui/`: `TreeMap.tsx` (time-scaled cladogram: the entrance and the map) and `InspectPanel.tsx`.

## Workflow

- Dev: `npm run dev`. Build (type-checks first): `npm run build`. Type-check only: `npx tsc --noEmit`.
- Data: `WIKI_HTTP_CACHE=data/http-cache node --import tsx scripts/ingest.ts [--root X --extinct N]`.
  Put `WIKI_USER_AGENT` (project and contact) in `.env.local`; `scripts/lib/http.ts` loads it.
  Responses are cached on disk, so a rerun is fast. A full run without the cache takes about 15 minutes (Wikipedia's search is slow).
- Checks: `node --import tsx scripts/check-layout.ts`. It must report `blocked: 0, overlaps: 0`.
- Visual checks: `node scripts/shot.mjs <outDir> <views…>`, then read the PNGs.
  Dev builds expose `window.__scene`, `__camera`, `__place(x,z,yaw,pitch)` and `__corridor(childId, metres, back)`.

## Components

- **Tree and pruning** (`ingest.ts`): crawl `Template:Taxonomy/*` down to genus. Keep every living genus plus the top-N most-read extinct genera. A node becomes a room if it is the root, a kept genus, or a split between kept lineages; single-lineage chains become corridor `Waypoint`s.
- **Dates**: taxobox `fossil_range` gives the first appearance. A clade is at least as old as its oldest member; an undated taxon starts where its parent does (`dated: false`). Extinct flags come from the template, a fossil range ending before the Holocene, all species being daggered, or fossil categories and short descriptions (`fossilByCategory`).
- **Non-Euclidean layout**: each room has its own frame (entrance door at +z, children fanned ahead, oldest on the left). `childLengths` lays out a room's children together, pushing rooms out along their corridors to avoid collisions. The scene draws the current room, its neighbours, and one door beyond (`farRooms`, which skips far rooms that would overlap something nearer). Walking into a neighbour re-centres the world: the camera and a group matrix move together in one frame, then a layout effect resets the matrix.
- **Corridors**: `Gallery` (walled) or `Tunnel` (glass arch through the sea), chosen by the child's environment. A tunnel whose parent environment is dry is a *descent*: a rising `WaterSurface`, no swimmers, and at least `TRANSITION_MIN` metres long. Epochs, million-year ticks and waypoints are placed by `alongAt`.
- **Rooms**: `HallShell` (bands of dado, rail, wall and cornice; framed doors; stone floor; coffered ceiling with an oculus), a statue on a plinth, a reading desk (`furnitureOf`), wall items (image, figures, species) in `slots`, door signs with silhouettes, and a domed pavilion exterior.
- **Statues**: archetypes in `statue-shapes.ts`, chosen by the most specific clade in `BY_TAXON`. Size comes from the parsed length, kept within the archetype's range, then scaled to fit the room. Marble for living animals, bronze for extinct ones.
- **Environments**: `BY_CLADE` in `environment.ts`, inherited down the tree. Fog and backdrop blend along a corridor from the parent's environment to the child's.

## Conventions and decisions

- Images load at runtime from the thumbnail URL the MediaWiki API returns (`iiurlwidth`, stored as `ImageRef.thumb`); don't build thumbnail URLs by hand. Silhouettes are bundled, because PhyloPic's CDN does not always send CORS headers.
- Fair-use (NonFree) images are excluded. Every image and silhouette carries its credit, shown in the inspect panel; silhouettes are also listed on the entrance page.
- Environment styling (fog, water, outside scenery, hall palette) is always per-clade data in `environment.ts`, never a global; terrestrial wings will reuse `GALLERY`.
- Rooms are opaque, styled halls. The user wants a museum feel, and found transparent interiors too busy.
- Avoid per-room lights: rooms come and go, and a changing light count makes three.js recompile shaders. Use the environment map and light-pool textures instead.
- Body lengths are the median of size figures from the article, filtered by the words around each number. A genus with species takes its longest species' length.
- Controls: W/S and ↑/↓ walk, A/D strafe, ←/→ and Q/E turn, M opens the map. Holding forward runs after 1.5 s (Shift runs at once). Speeds suit corridors up to ~100 m long (constants at the top of `Museum.tsx`).

## Gotchas

- `npx tsx` fails under the Claude Code sandbox (its IPC socket gets EPERM). Use `node --import tsx` instead. In the sandbox, Node's `fetch` also needs `NODE_USE_ENV_PROXY=1`, npm 9 can't install, and headless Chrome can't start.
- Under React Three Fiber, swapping `<meshBasicMaterial>` variants in place keeps the material and resets dropped props to their defaults (for example, colour becomes black). Give the variants distinct `key`s.
- Door angle ±π (the entrance) wraps: any angular-interval code must split intervals that cross ±π (see `planRoom`, `complement`).
- Seabeds must never rise above y = 0, because neighbouring tunnels' scenery overlaps. Scenery must check `roomDistance` against every drawn room and corridor (`clearFor` in Museum.tsx).
- Metal materials with no reflections render black. Keep metalness low unless `scene.environment` is set (it is, via RoomEnvironment).
- CirrusSearch `prefix:` must come last in a query, and regex `insource:` searches silently return partial results. `getChildTemplateIds` uses a phrase search instead.
