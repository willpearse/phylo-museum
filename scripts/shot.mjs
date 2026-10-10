// Screenshots of the museum: starts Vite and a headless Chrome in this one
// process, opens the entrance and then each view asked for.
//
//   node scripts/shot.mjs <outDir> <view> ...
//
// A view is one of
//   Room                     the room, standing inside its entrance
//   Room@x,z,yaw[,pitch]     standing at (x, z) of the room's frame (yaw 0 = -z)
//   Room>Child:along[:back]  `along` metres into the corridor toward Child
//                            (or toward the parent, giving the parent's id)
//
// Uses the system Chrome (CHROME=/path to override). Honours HTTPS_PROXY,
// including credentials, for the images from upload.wikimedia.org.

import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const [outDir = "shots", ...views] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: "error" });
await server.listen();
const base = "http://localhost:5199/";

let proxy;
const env = process.env.HTTPS_PROXY || process.env.https_proxy;
if (env) {
  const u = new URL(env);
  proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: "localhost,127.0.0.1" };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/opt/google/chrome/chrome",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  proxy,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outDir, "entrance.png") });
  console.log("entrance.png");
  let loaded = null;
  for (const view of views) {
    const room = view.split(/[@>]/)[0];
    if (room !== loaded) {
      await page.goto(`${base}#/room/${encodeURIComponent(room)}`, { waitUntil: "load" });
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("canvas", { timeout: 20000 });
      await page.waitForTimeout(4000);
      loaded = room;
    }
    if (view.includes("@")) {
      const [x, z, yaw, pitch = 0] = view.split("@")[1].split(",").map(Number);
      await page.evaluate(([x, z, yaw, pitch]) => window.__place(x, z, yaw, pitch), [x, z, yaw, pitch]);
    } else if (view.includes(">")) {
      const [to, along, back] = view.split(">")[1].split(":");
      await page.evaluate(([to, along, back]) => window.__corridor(to, along, back), [to, Number(along), back === "back"]);
    }
    await page.waitForTimeout(2500);
    const name = view.replace(/[^A-Za-z0-9.,-]+/g, "_") + ".png";
    await page.screenshot({ path: path.join(outDir, name) });
    console.log(name);
  }
} finally {
  if (errors.length) console.log("console errors:\n" + [...new Set(errors)].slice(0, 15).join("\n"));
  await browser.close();
  await server.close();
}
