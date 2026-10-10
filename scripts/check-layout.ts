// Layout checks over the whole museum: every corridor can be walked from
// room centre to room centre, and no two rooms drawn together overlap.
//   node --import tsx scripts/check-layout.ts

import fs from "node:fs";
import * as THREE from "three";
import { farRooms, neighbours, planRoom, walkable, roomAt } from "../src/museum/layout.ts";
const data = JSON.parse(fs.readFileSync(new URL("../public/museum.json", import.meta.url), "utf8"));
let bad = 0, overlaps = 0, skipped = 0, farTotal = 0, maxLen = 0, longest = "";
for (const id of Object.keys(data.taxa)) {
  const ns = neighbours(data, id);
  const here = planRoom(data, data.taxa[id]);
  for (const n of ns) {
    // walk from just off-centre toward the neighbour's centre
    const c = new THREE.Vector3(0, 0, 0).applyMatrix4(n.matrix);
    const steps = Math.ceil(c.length() / 0.25);
    let entered = false;
    // start near this room's wall (visitors walk around the plinth and lectern)
    for (let i = Math.ceil((here.radius - 1.2) / 0.25); i <= steps; i++) {
      const p = c.clone().multiplyScalar(i / steps);
      if (!walkable(p.x, p.z, data, id, ns)) { console.log(`blocked ${id} -> ${n.plan.taxon.id} at ${(i / steps).toFixed(2)}`); bad++; break; }
      if (roomAt(p.x, p.z, ns) === n) { entered = true; break; }
    }
    if (!entered && bad === 0) console.log(`never entered ${n.plan.taxon.id} from ${id}`);
    if (n.kind === "child" && n.link.length > maxLen) { maxLen = n.link.length; longest = `${id} -> ${n.plan.taxon.id}`; }
  }
  // rooms drawn together: this room, its neighbours, and the far rooms that
  // farRooms() lets through must never overlap
  const cs = [{ id, c: new THREE.Vector3(), r: here.radius }];
  for (const n of ns) cs.push({ id: n.plan.taxon.id, c: new THREE.Vector3().applyMatrix4(n.matrix), r: n.plan.radius });
  for (const f of farRooms(data, id, ns)) {
    if (f.drawRoom) cs.push({ id: f.m.plan.taxon.id, c: new THREE.Vector3().applyMatrix4(f.matrix), r: f.m.plan.radius });
    else skipped++;
    farTotal++;
  }
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++)
      if (cs[i].c.distanceTo(cs[j].c) < cs[i].r + cs[j].r) {
        console.log(`overlap seen from ${id}: ${cs[i].id} / ${cs[j].id}`);
        overlaps++;
      }
}
const radii = Object.values(data.taxa).map((t: any) => planRoom(data, t).radius);
console.log({ rooms: radii.length, blocked: bad, overlaps, farRoomsNotDrawn: `${skipped}/${farTotal}`, longest, maxLen: Math.round(maxLen), radius: [Math.min(...radii).toFixed(1), Math.max(...radii).toFixed(1)] });
