// When was this site first archived, and when did its content last change? (archive.org CDX API)
// The CDX API is slow (often 10-50 s) and sheds load with 429/503 when pushed, so: one request at a
// time across the whole process, a shared backoff that decays on success, a long timeout, and only
// real answers are cached. A timeout or an error page cached as "no archive" would lock that site
// out of every later run, so transport failures return null and are retried next time.
import fs from 'node:fs';
import path from 'node:path';
import { rawFetch, httpSettings } from './http.mjs';
import { hostname, classifyUrl } from './normalize.mjs';
import { sleep, readJSON, writeJSON } from './io.mjs';

const state = { chain: Promise.resolve(), next: 0, backoff: 0, fails: 0, cache: null, cacheFile: null };
const GIVE_UP = 12;   // consecutive transport failures that mean archive.org is down for this run

const cacheFileFor = dir => dir && path.join(dir, 'wayback.json');
function cache(dir) {
  const f = cacheFileFor(dir);
  if (state.cacheFile !== f) { state.cacheFile = f; state.cache = f && fs.existsSync(f) ? (() => { try { return readJSON(f); } catch { return {}; } })() : {}; }
  return state.cache;
}
const ymd = ts => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
export const waybackAvailable = () => state.fails < GIVE_UP;

// One polite CDX call: { rows } on a real answer, null on transport failure / load shedding.
async function cdx(endpoint, params, { timeout, gap }) {
  const run = state.chain.then(async () => {
    for (let a = 0; a < 3 && state.fails < GIVE_UP; a++) {
      const wait = Math.max(state.next - Date.now(), state.backoff);
      if (wait > 0) await sleep(wait);
      state.next = Date.now() + gap;
      const r = await rawFetch(`${endpoint}?${new URLSearchParams(params)}`, { timeout, headers: { accept: 'application/json' } });
      if (r.status === 429 || r.status === 503 || r.status === 502 || r.status === 504) { state.backoff = Math.min(Math.max(state.backoff * 2, 2000), 30000); continue; }
      if (!r.status) { state.fails++; continue; }
      const body = String(r.body || '').trim();
      if (r.status !== 200) { state.fails++; return null; }
      if (!body) return { rows: [] };          // CDX answers an empty body when there are no captures
      let j; try { j = JSON.parse(body); } catch { state.fails++; return null; }   // an HTML error page is not an answer
      state.fails = 0; state.backoff = Math.floor(state.backoff * 0.6);
      return { rows: Array.isArray(j) ? j.slice(1) : [] };
    }
    return null;
  });
  state.chain = run.catch(() => {});
  return run;
}

// waybackDates('https://northwind.example') → { first_seen: 'YYYY-MM-DD'|null, last_change: 'YYYY-MM-DD'|null, captures } or null (unknown, try later).
export async function waybackDates(url, { endpoint = 'https://web.archive.org/cdx/search/cdx', timeout = 60000, gap = 1500, cacheDir = httpSettings().cacheDir, refresh = false } = {}) {
  const host = hostname(url);
  // A platform's archive history says nothing about the business that has a page on it.
  if (!host || classifyUrl(url) !== 'site') return { first_seen: null, last_change: null, captures: 0, skipped: 'not an own website' };
  const c = cache(cacheDir);
  if (!refresh && c[host]) return c[host];
  const o = { timeout, gap };
  const first = await cdx(endpoint, { url: host, output: 'json', fl: 'timestamp', filter: 'statuscode:200', limit: '1' }, o);
  if (!first) return null;
  let out;
  if (!first.rows.length) out = { first_seen: null, last_change: null, captures: 0 };
  else {
    // collapse=digest keeps one row per run of identical content; the newest row is the last change.
    const recent = await cdx(endpoint, { url: host, output: 'json', fl: 'timestamp,digest', filter: 'statuscode:200', collapse: 'digest', limit: '-50' }, o);
    if (!recent) return null;
    const last = recent.rows.at(-1)?.[0];
    out = { first_seen: ymd(first.rows[0][0]), last_change: last ? ymd(last) : null, captures: recent.rows.length };
  }
  c[host] = { ...out, checked: new Date().toISOString().slice(0, 10) };
  if (cacheFileFor(cacheDir)) writeJSON(cacheFileFor(cacheDir), c);
  return c[host];
}

// For tests: forget in-memory state (backoff, failure count, cache handle).
export function resetWayback() { Object.assign(state, { chain: Promise.resolve(), next: 0, backoff: 0, fails: 0, cache: null, cacheFile: null }); }
