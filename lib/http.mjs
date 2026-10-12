// Polite, cached HTTP client and HTML helpers.
//  - one request in flight per host, spaced by `gap` ms (+ jitter)
//  - robots.txt respected unless respectRobots:false (only when you have permission)
//  - responses cached gzip on disk; cached answers never touch the network
//  - transport failures are never cached (a timeout cached as an answer makes a site look dead for ever)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { sleep, hash } from './io.mjs';

export const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';
export const UA_BOT = 'lead-to-proposal/1.0 (+https://github.com/mjamali97/lead-to-proposal)';

const settings = { cacheDir: null, userAgent: UA_BROWSER, robotsAgent: 'lead-to-proposal', respectRobots: true, gap: 1000, timeout: 15000 };

// Call once per process (stages do it from project.config.crawl).
export function configureHttp({ cacheDir, userAgent, respectRobots, gap, timeout } = {}) {
  if (cacheDir !== undefined) settings.cacheDir = cacheDir;
  if (userAgent) settings.userAgent = userAgent === 'bot' ? UA_BOT : userAgent === 'browser' ? UA_BROWSER : userAgent;
  if (respectRobots !== undefined) settings.respectRobots = !!respectRobots;
  if (gap !== undefined) settings.gap = gap;
  if (timeout !== undefined) settings.timeout = timeout;
  if (settings.cacheDir) fs.mkdirSync(settings.cacheDir, { recursive: true });
}
export const httpSettings = () => ({ ...settings });

const hostNext = new Map();
const hostChain = new Map();
const robotsCache = new Map();

const cacheFile = key => settings.cacheDir && path.join(settings.cacheDir, hash(key, 40) + '.json.gz');

function decode(buf, ctype) {
  let cs = (ctype.match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) cs = (buf.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder((cs || 'utf-8').toLowerCase()).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

export async function rawFetch(url, { timeout = settings.timeout, headers = {}, method = 'GET', maxBytes = 3_000_000, body, binary = false } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, {
      method, body, signal: c.signal, redirect: 'follow',
      headers: { 'user-agent': settings.userAgent, 'accept-language': 'en;q=0.9,*;q=0.5', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8', ...headers },
    });
    let buf = Buffer.alloc(0);
    if (method !== 'HEAD') {
      const ab = Buffer.from(await r.arrayBuffer());
      // Keep head and tail of huge pages: footers carry the copyright year and agency credit.
      buf = ab.length > maxBytes && !binary ? Buffer.concat([ab.subarray(0, maxBytes - 400_000), ab.subarray(-400_000)]) : ab;
    }
    const ctype = r.headers.get('content-type') || '';
    return { ok: r.ok, status: r.status, finalUrl: r.url || url, ctype, body: binary ? buf : method === 'HEAD' ? '' : decode(buf, ctype), bytes: buf.length, headers: Object.fromEntries(r.headers) };
  } catch (e) {
    const code = e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.name || String(e));
    return { ok: false, status: 0, error: String(code), body: '', bytes: 0, finalUrl: url };
  } finally { clearTimeout(t); }
}

// ---- robots.txt ----
export function parseRobots(text, agent = 'lead-to-proposal') {
  // Returns the rule list for the most specific matching group (our agent, else *).
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasAgent) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === 'allow' || k === 'disallow') cur.rules.push({ allow: k === 'allow', path: v });
  }
  const a = agent.toLowerCase();
  const g = groups.find(x => x.agents.some(n => n !== '*' && a.includes(n))) || groups.find(x => x.agents.includes('*'));
  return g ? g.rules.filter(r => r.path !== '' || !r.allow) : [];
}

const ruleRegex = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
export function robotsAllows(rules, pathname) {
  // Longest matching rule wins; Allow wins ties. Empty Disallow allows everything.
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (ruleRegex(r.path).test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

export async function allowedByRobots(url) {
  if (!settings.respectRobots) return true;
  let u; try { u = new URL(url); } catch { return false; }
  if (/\/robots\.txt$/.test(u.pathname)) return true;
  const origin = u.origin;
  if (!robotsCache.has(origin)) robotsCache.set(origin, (async () => {
    const r = await get(`${origin}/robots.txt`, { skipRobots: true, retries: 1 });
    // 4xx = no robots file = everything allowed. 5xx/unreachable = be careful: allow only the home page.
    if (r.status >= 400 && r.status < 500) return [];
    if (!r.ok) return r.status === 0 ? [{ allow: false, path: '/?*' }] : [];
    return /text\/html/i.test(r.ctype || '') && /<html/i.test(r.body) ? [] : parseRobots(r.body, settings.robotsAgent);
  })());
  return robotsAllows(await robotsCache.get(origin), u.pathname + u.search);
}

// get(url, {gap, cache, refresh, retries, skipRobots, ...fetchOpts})
// cache:false = neither read nor write the cache; refresh:true = re-fetch but still write it.
export async function get(url, o = {}) {
  const { gap = settings.gap, cache = true, refresh = false, retries = 2, skipRobots = false } = o;
  const key = url + (o.method && o.method !== 'GET' ? ` ${o.method}` : '') + (o.body ? ` ${hash(o.body)}` : '');
  const cf = cache && !o.binary ? cacheFile(key) : null;
  if (cf && !refresh && fs.existsSync(cf)) {
    try { return { ...JSON.parse(zlib.gunzipSync(fs.readFileSync(cf))), cached: true }; } catch { /* re-fetch */ }
  }
  let host;
  try { host = new URL(url).host; } catch { return { ok: false, status: 0, error: 'bad url', body: '', finalUrl: url }; }
  if (!skipRobots && !(await allowedByRobots(url))) return { ok: false, status: 0, error: 'robots', body: '', finalUrl: url, robots: true };
  const prev = hostChain.get(host) || Promise.resolve();
  const run = prev.then(async () => {
    let res;
    for (let a = 0; a <= retries; a++) {
      const wait = (hostNext.get(host) || 0) - Date.now();
      if (wait > 0) await sleep(wait);
      hostNext.set(host, Date.now() + gap + Math.random() * gap * 0.3);
      res = await rawFetch(url, o);
      const retryable = [429, 502, 503, 504].includes(res.status) || (res.status === 0 && !['timeout', 'ENOTFOUND', 'robots'].includes(res.error) && a === 0);
      if (!retryable) break;
      const ra = Number(res.headers?.['retry-after']);
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : gap * (a + 2) * 2);
    }
    if (cf && res.status) {
      const keep = { ok: res.ok, status: res.status, finalUrl: res.finalUrl, ctype: res.ctype, body: res.body, bytes: res.bytes };
      fs.writeFileSync(cf, zlib.gzipSync(JSON.stringify(keep)));
    }
    return res;
  });
  hostChain.set(host, run.catch(() => {}));
  return run;
}

export async function getJSON(url, o = {}) {
  const r = await get(url, { headers: { accept: 'application/json', ...(o.headers || {}) }, ...o });
  if (!r.ok) return { ...r, json: null };
  try { return { ...r, json: JSON.parse(r.body) }; } catch { return { ...r, ok: false, json: null, error: 'bad json' }; }
}

// ---- HTML helpers ----
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '‌', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
export const unescape = s => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
export const stripTags = s => unescape(String(s ?? '').replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d|section|footer|header)>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
export const clean = s => unescape(String(s ?? '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const attr = (tag, name) => { const m = String(tag).match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? unescape(m[1] ?? m[2] ?? m[3]) : ''; };
export const absUrl = (href, base) => { try { return new URL(href, base).href; } catch { return ''; } };

// Every JSON-LD node on a page, @graph flattened.
export function jsonLd(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; const txt = m[1].trim().replace(/^<!--|-->$/g, '');
    try { j = JSON.parse(txt); } catch { try { j = JSON.parse(txt.replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x['@graph']) walk(x['@graph']); else out.push(x); } };
    walk(j);
  }
  return out;
}
export const typeOf = n => [].concat(n?.['@type'] || []).join(',');

// <loc> entries of a sitemap or sitemap index (recursion is the caller's job).
export const sitemapLocs = xml => [...String(xml).matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)].map(m => unescape(m[1].trim()));
