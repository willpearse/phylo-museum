# TO-DO

## Prior to publication
- [Blocker] Tell the author of A Walkable History of Art (JustDataPlease, https://github.com/justdataplease/art-history-museum) about this project and how it credits them (README "Origins"), before blogging about it

## Project
- [Should] Set up the git repository and make a first commit (`.gitignore` already excludes node_modules, dist, data/http-cache and art-history-museum)
- [Should] Confirm the copyright holder name in `LICENSE` ("Will Pearse" was assumed)
- [Should] Make a way to walk through the museum while in sandbox mode (headless chrome works, sometimes...)

## Testing
- [Should] Test on real hardware: frame rate on a GPU with up to 8 tunnels in view (only headless SwiftShader has been checked), and whether the walk/run speeds in `Museum.tsx` feel right
- [Should] Test touch controls on a phone (drag to look, tap to walk, tap to inspect), never exercised so far
- [Should] Check the PhyloPic credits list on the entrance page and the silhouette credit in the inspect panel render correctly

## Data
- [Should] Date the 29 undated rooms (`dated: false`; mostly living dolphin genera, Mysticeti, Platanistoidea, Inioidea), e.g. from TimeTree or Open Tree divergence times
- [Should] Parse species lists in tables or other formats: *Balaenoptera* gets 1 of 8 species, *Mesoplodon* and *Grampus* none (`parseSpeciesList`, `speciesInBody` in `scripts/lib/taxonomy.ts`)
- [Should] Rooms without their own image (11/120) or silhouette (27/120): consider extra Commons or PhyloPic lookups (by common name, or the type species)
- [Idea] Expand beyond whales (e.g. all mammals); `GALLERY` hall and gallery corridors are ready for terrestrial wings

## Layout
- [Should] Plan presentation of larger taxonomic groups (many children or many genera): different room shapes (e.g. long halls, multi-level or wings off a rotunda instead of one round room capped at radius 26 in `planRoom`) and/or subsampling taxa (stricter pruning in `scripts/ingest.ts`, e.g. by pageviews per clade)
- [Should] Decide how to handle corridors stretched by `childLengths` collision-pushing, which breaks "metres = time" across corridors
- [Idea] Draw the 17/626 far rooms that `farRooms` currently skips for overlap (hidden by fog, low priority)

## Statues
- [Idea] More detail per archetype: mouth line, rorqual throat grooves, the right whale's arched rostrum, the orca's broad paddles, which still read a little like plates

## Features
- [Idea] "How am I related to…?" tours: walk from one taxon to another via their common ancestor
- [Idea] Ambient sound per lineage (e.g. public-domain whale song on Commons), as in the art museum
- [Idea] Life-size outline of the animal on the room floor beside a human silhouette
