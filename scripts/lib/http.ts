// HTTP for the ingest, following Wikimedia's API etiquette
// (https://www.mediawiki.org/wiki/API:Etiquette and the User-Agent policy,
// https://meta.wikimedia.org/wiki/User-Agent_policy): say who you are, keep
// requests few and serial-ish, and back off when asked (HTTP 429/503 with
// Retry-After, or the API's `maxlag` error).
//
// WIKI_USER_AGENT (environment or .env.local) should name your project and a
// contact. WIKI_HTTP_CACHE=<dir> keeps every GET response on disk, one file
// per URL, so reruns ask the servers nothing they have already answered.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..");
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const UA = process.env.WIKI_USER_AGENT ?? "PhyloMuseum/0.1 (set WIKI_USER_AGENT to identify yourself)";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run tasks at most `concurrent` at a time, starting them at least `gapMs` apart. */
export function pacer(concurrent: number, gapMs: number) {
  let running = 0;
  let lastStart = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    while (running >= concurrent) await new Promise<void>((r) => waiting.push(r));
    running++;
    const now = Date.now();
    const start = Math.max(now, lastStart + gapMs);
    lastStart = start;
    if (start > now) await wait(start - now);
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

function cachePath(url: string): string | null {
  const dir = process.env.WIKI_HTTP_CACHE;
  return dir ? path.join(dir, `${createHash("sha1").update(url).digest("hex")}.json`) : null;
}

/** Seconds (or an HTTP date) from a Retry-After header, as milliseconds. */
function retryAfter(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return secs * 1000;
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/**
 * GET a JSON document (null for a 404), from the disk cache when there is
 * one. Network errors, 429s, 5xxs and `maxlag` are retried with growing waits.
 */
export async function getJson<T>(url: string, opts: { headers?: Record<string, string>; pace?: ReturnType<typeof pacer>; attempts?: number } = {}): Promise<T | null> {
  const file = cachePath(url);
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T | null;
  const attempts = opts.attempts ?? 6;
  const once = async (): Promise<T | null> => {
    for (let i = 1; ; i++) {
      const backoff = Math.min(30_000, 500 * 2 ** i);
      let res: Response;
      try {
        res = await fetch(url, { headers: { "user-agent": UA, "api-user-agent": UA, accept: "application/json", ...opts.headers }, signal: AbortSignal.timeout(60_000) });
      } catch (err) {
        if (i >= attempts) throw err;
        await wait(backoff);
        continue;
      }
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        if (i >= attempts) throw new Error(`HTTP ${res.status} (gave up after ${attempts} tries): ${url}`);
        await wait(retryAfter(res) ?? backoff);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      const body = (await res.json()) as T & { error?: { code?: string } };
      if (body?.error?.code === "maxlag") {
        if (i >= attempts) throw new Error(`Server lagged (gave up after ${attempts} tries): ${url}`);
        await wait(retryAfter(res) ?? 5000);
        continue;
      }
      return body;
    }
  };
  const body = await (opts.pace ? opts.pace(once) : once());
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(body));
  }
  return body;
}
