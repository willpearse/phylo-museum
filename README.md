# A Walkable Tree of Life

A museum of evolution you walk through in your browser. **Corridors are
lineages and rooms are groups of organisms.** Walking down a corridor is
walking through time, and each room introduces the group you have reached.
The first wing covers **whales, their ancestors and their closest living
relatives, the hippos**.

## Origins

I have wanted to build an interactive, walkable phylogeny-as-a-museum for some
time, and seeing
[A Walkable History of Art](https://github.com/justdataplease/art-history-museum)
([live museum](https://artmuseum.artfrompixels.com)) by JustDataPlease made me
realise it could really now be done!

This project was inspired by, and closely follows the design of, that museum.
It had the idea of turning Wikipedia into a museum you can walk through for
free, and this one applies that idea to the tree of life. The overall approach
comes from it: building on Wikipedia and Wikimedia Commons, an entrance page
where you choose where to start, drawing only the rooms near you, clickable
labels that open the full text and image credits, and the walking controls. An
early version also reused some of its code for fetching and crediting Wikimedia
content; that code has since been rewritten. The phylogenetic layout, corridors
through time, statues, silhouettes and environments are new.

## How the museum works

- **Rooms** are the nodes of the tree: a family, a superfamily, an unranked
  clade like Delphinida, or a genus. Each room has a **statue** of its animal
  on a plinth in the middle, and a reading desk beside it with the group's
  Wikipedia introduction. A clade's room shows its most-read genus. Statues of
  living animals are white marble and extinct ones are bronze. They are shown
  at life size where the room allows, otherwise at a stated scale.
- **On the walls** hang the group's image and a few of the figures its
  Wikipedia article uses, each with its own caption. Rooms for living genera
  also hang their living species.
- **Doors** ahead of you lead down the descendant lineages, oldest on the left.
  The door behind you leads back toward the root.
- **Corridors** are the branches. Their length is time: about three metres
  per million years, from the first appearance of the parent group to the
  first appearance of the child. They are coloured by geological epoch, and
  the floor is marked in millions of years. In the whale wing the corridors
  are glass tunnels through the sea, like an aquarium's. Silhouettes of the
  lineage's whales swim past outside at life size.
- **Each lineage has its own feel.** An environment (fog, water colour, what
  lies outside the corridors, and how the halls are finished inside: wall,
  dado and trim colours, floor inlay) is set per clade and inherited down the tree.
  A corridor blends from its parent's environment to its child's. The table is
  in [src/museum/environment.ts](src/museum/environment.ts): Tethys shallows
  for the first whales, open ocean for the baleen whales, coastal water for
  the toothed whales.
- **Clades along the way.** The museum keeps only the nodes where two
  exhibited lineages split. Clades on a single lineage between rooms (Ambulocetidae,
  Physeterida, Kogiidae and so on) hang on the corridor walls at the time they first
  appear.
- **Extinct groups** have stone-coloured rooms and dashed branches on the map,
  and their stand says when the lineage ended.

The museum is not laid out on one global floor plan, because a tree would
cross itself. Every room has its own frame of reference, and walking into a
neighbouring room re-centres the world on it. The scene only draws the room
you are in, its corridors and the rooms at their far ends.

On a computer, use **W A S D** to walk and the mouse to look, or turn with
the **← →** arrow keys or **Q E**. Hold **W** (or Shift) to run, and click a label to read it. **M** opens the map. On a
phone, drag to look and tap the floor to walk.

## Where the data comes from

Everything comes from English Wikipedia and Wikimedia Commons:

- **The tree** is Wikipedia's own classification: the
  `Template:Taxonomy/<name>` pages behind every automatic taxobox. Each page
  names the taxon's parent and rank and says whether it is extinct. These pages
  include unranked clades, so the tree is close to a phylogeny rather than a
  bare Linnaean hierarchy.
- **Dates** are the fossil ranges in each article's taxobox, e.g.
  `{{Fossil range|48.7|45.4}}` or `{{fossilrange|Early Miocene|Present}}`.
  Interval names are converted to millions of years with the ICS chart in
  [src/lib/geotime.ts](src/lib/geotime.ts). A clade is never younger than
  anything in it. Where Wikipedia gives no date, a taxon starts where its
  parent does, and its stand says the first appearance is not recorded.
- **Which genera are shown:** every living genus, plus the 40 most-read
  extinct ones by Wikipedia pageviews (`--extinct N` changes the number).
- **Text, images and credits** are each article's introduction, taxobox
  image and up to three figures from its body. Maps, diagrams and charts are
  left out. Each image carries its author and licence from its file page.
- **Silhouettes** come from [PhyloPic](https://www.phylopic.org/), the image
  PhyloPic shows for each taxon's name. A taxon without one borrows its
  closest relative's. They are bundled in `public/silhouettes/` because
  PhyloPic's image server does not always send the CORS headers WebGL needs.
  Each one's author and licence are shown in the museum and listed on the
  entrance page.
- **Statue sizes** come from the body lengths the articles give: the median of
  the figures in sentences about size, so an outlier such as a prey animal or
  a record claim doesn't count. Each body plan has a plausible range, and a
  figure outside it falls back to the plan's typical length. The body plans
  are in [src/museum/statue-shapes.ts](src/museum/statue-shapes.ts).

Wikipedia's classification and fossil ranges are uneven, so the museum is
too. Corrections made on Wikipedia reach the museum the next time the data is
rebuilt.

## Running it

```bash
npm install
npm run dev               # http://localhost:5173
```

The repository includes a built `public/museum.json`. To rebuild it from
Wikipedia:

```bash
# Identify yourself to Wikimedia (see their User-Agent policy):
echo 'WIKI_USER_AGENT="YourMuseum/0.1 (https://example.org; you@example.org)"' > .env.local

# Responses are cached under data/http-cache, so a rerun is quick.
WIKI_HTTP_CACHE=data/http-cache npm run ingest
WIKI_HTTP_CACHE=data/http-cache npm run ingest -- --root Cetacea --extinct 25
```

## Layout of the code

- `scripts/ingest.ts` crawls the taxonomy, reads the articles, chooses and
  prunes the genera, and writes `public/museum.json`. `scripts/lib/taxonomy.ts`
  parses taxonomy templates, taxoboxes, fossil ranges and species lists.
  `scripts/lib/http.ts` handles polite, cached requests to Wikimedia.
- `src/museum/layout.ts` holds the geometry: room sizes, door angles, corridor
  lengths, room-to-room frames and walkable space.
- `src/museum/Room.tsx`, `Corridor.tsx`, `Exhibit.tsx` and `panels.ts` build
  the rooms, corridors, framed images and wall text. `Statue.tsx` and
  `statue-shapes.ts` build the statues. `ocean.tsx` holds the underwater
  scenery: caustics, seabed, kelp, light shafts, particles and swimmers.
  `environment.ts` sets each lineage's surroundings, and `Hall.tsx` finishes the
  inside of each room in its lineage's palette. `Museum.tsx` holds the
  scene, walking, picking, fog and re-centring. The scene draws the room you
  are in, its corridors and neighbours, and the corridors and rooms one door
  beyond those, so nothing appears suddenly as you arrive.
- `src/ui/TreeMap.tsx` draws the time-scaled cladogram used as the entrance and
  the map. `src/ui/InspectPanel.tsx` shows the full text and credits for an
  exhibit.

## Checking it

```bash
node --import tsx scripts/check-layout.ts   # every corridor walkable, no rooms drawn together overlap
node scripts/shot.mjs shots Cetacea "Odontoceti>Delphinida:8" "Eubalaena@0,7,0"
```

`shot.mjs` starts the dev server and a headless Chrome and saves screenshots.
A view can be a room, a point in a room (`Room@x,z,yaw`), or a spot in a
corridor (`Room>Child:metres`).

## Licences

The code is MIT-licensed ([LICENSE](LICENSE)). Text in `public/museum.json`
is quoted from English Wikipedia under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and each entry
links to its article. Images are not bundled: they load from Wikimedia
Commons under the licence on each file page, which the museum credits. Fair-use
images are left out. Silhouettes in `public/silhouettes/` come from PhyloPic
and keep their own licences (public domain, CC0, CC BY or CC BY-SA). Each is
credited in the museum and in `public/museum.json`.

If you enjoy the museum, please
[donate to Wikipedia](https://donate.wikimedia.org/).
