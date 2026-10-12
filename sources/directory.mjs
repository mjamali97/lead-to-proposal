// Generic business directory: sitemap (or sitemap index) → listing URLs matching url_pattern →
// each page → JSON-LD LocalBusiness/Organization (any subtype), with microdata / tel: / mailto: fallback.
// Optional `fields` = { name: "<regex with one capture group>", phone: "...", ... } for sites without JSON-LD.
// Resumable (state.done), polite (lib/http: robots.txt, one request per host at a time, cached).
import zlib from 'node:zlib';
import { get, rawFetch, jsonLd, typeOf, clean, attr, unescape, sitemapLocs, absUrl } from '../lib/http.mjs';
import { hostname, canonSocial, fixUrl } from '../lib/normalize.mjs';
import { pool, log, UserError } from '../lib/io.mjs';

const NOT_BUSINESS = /^(WebSite|WebPage|CollectionPage|ItemPage|AboutPage|ContactPage|SearchResultsPage|BreadcrumbList|ListItem|ItemList|SearchAction|ImageObject|VideoObject|Article|NewsArticle|BlogPosting|FAQPage|Question|Answer|Offer|Product|Review|AggregateRating|Rating|PostalAddress|GeoCoordinates|OpeningHoursSpecification|Person|Event|Brand|SiteNavigationElement|WPHeader|WPFooter)$/i;

async function fetchText(url) {
  if (/\.gz($|\?)/i.test(url)) {
    const r = await rawFetch(url, { binary: true });
    if (!r.ok) return r;
    try { return { ...r, body: zlib.gunzipSync(r.body).toString('utf8') }; } catch { return { ...r, body: r.body.toString('utf8') }; }
  }
  return get(url);
}

// All listing URLs under a sitemap or sitemap index (depth ≤ 3), filtered by url_pattern.
export async function sitemapUrls(sitemap, { pattern, sitemapPattern, max = Infinity } = {}) {
  const re = pattern ? new RegExp(pattern, 'i') : null, smRe = sitemapPattern ? new RegExp(sitemapPattern, 'i') : null;
  const out = new Set(), seen = new Set(), errors = [];
  async function walk(url, depth) {
    if (seen.has(url) || depth > 3 || out.size >= max) return;
    seen.add(url);
    const r = await fetchText(url);
    if (!r.ok) { errors.push(`${url}: ${r.status || r.error}`); return; }
    const locs = sitemapLocs(r.body);
    if (/<sitemapindex/i.test(r.body)) { for (const u of locs) if (!smRe || smRe.test(u)) await walk(u, depth + 1); return; }
    for (const u of locs) { if (!re || re.test(u)) out.add(u); if (out.size >= max) break; }
  }
  for (const s of [].concat(sitemap || [])) await walk(s, 0);
  return { urls: [...out], errors };
}

const first = v => (Array.isArray(v) ? v[0] : v);
const txt = v => clean(typeof v === 'object' && v ? v.name ?? v['@value'] ?? '' : v ?? '');
const humanType = t => String(t || '').split(',').map(x => x.replace(/^https?:\/\/schema\.org\//, '')).find(x => !/^(LocalBusiness|Organization|Corporation|Place)$/.test(x))
  ?.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') || '';

// Pick the node that describes the listed business, not the directory itself.
export function businessNode(nodes, pageUrl) {
  const pageHost = hostname(pageUrl);
  const cands = nodes.filter(n => n && typeof n === 'object' && txt(n.name) && !typeOf(n).split(',').every(t => NOT_BUSINESS.test(t)));
  const score = n => (n.address ? 2 : 0) + (n.telephone ? 2 : 0) + (n.geo ? 1 : 0)
    - (/Organization/.test(typeOf(n)) && !n.address && hostname(txt(n.url) || n['@id'] || '') === pageHost ? 5 : 0);
  const best = cands.map(n => [n, score(n)]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > -1 ? best[0] : null;
}

function hoursOf(n) {
  if (n.openingHours) return [].concat(n.openingHours).join('; ');
  const spec = [].concat(n.openingHoursSpecification || []);
  return spec.map(s => `${[].concat(s.dayOfWeek || []).map(d => String(d).replace(/^https?:\/\/schema\.org\//, '')).join(',')}: ${s.opens || ''}–${s.closes || ''}`).join('; ');
}

function fromNode(n, page) {
  const a = first(n.address) || {};
  const ad = typeof a === 'string' ? { streetAddress: a } : a;
  const geo = first(n.geo) || {};
  const urls = [].concat(n.url || [], n.sameAs || []).map(u => txt(u) || u).filter(u => typeof u === 'string');
  const pageHost = hostname(page);
  return {
    name: txt(n.name), names: [].concat(n.alternateName || []).map(txt).filter(Boolean),
    category: humanType(typeOf(n)) || '',
    phones: [].concat(n.telephone || []).map(txt).filter(Boolean),
    emails: [].concat(n.email || []).map(e => txt(e).replace(/^mailto:/i, '')).filter(Boolean),
    website: urls.find(u => hostname(u) && hostname(u) !== pageHost && !canonSocial(u)) || '',
    links: urls.filter(u => canonSocial(u)),
    address: txt(ad.streetAddress), city: txt(ad.addressLocality), region: txt(ad.addressRegion), postcode: txt(ad.postalCode),
    country: txt(ad.addressCountry),
    lat: geo.latitude != null ? +geo.latitude : null, lng: geo.longitude != null ? +geo.longitude : null,
    hours: hoursOf(n), description: txt(n.description).slice(0, 1000),
  };
}

// Microdata itemprop values, tel: and mailto: links, og:title / h1 for the name.
function fromHtml(html, page) {
  const prop = name => {
    const m = html.match(new RegExp(`<[^>]+itemprop=["']${name}["'][^>]*>`, 'i'));
    if (!m) return '';
    const c = attr(m[0], 'content') || attr(m[0], 'href');
    if (c) return clean(c.replace(/^(tel|mailto):/i, ''));
    const rest = html.slice(m.index + m[0].length, m.index + m[0].length + 400);
    return clean(rest.split(/<\/(?:span|div|p|a|h\d|td|li|strong|b)>/i)[0]);
  };
  const tels = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map(m => unescape(decodeURIComponent(m[1])).trim());
  const mails = [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map(m => unescape(decodeURIComponent(m[1])).trim().toLowerCase());
  const og = (html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i) || [])[0];
  const h1 = clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  return {
    name: prop('name') || h1 || clean(og ? attr(og, 'content') : '').split(/\s[|–—-]\s/)[0],
    phones: [prop('telephone'), ...tels].filter(Boolean), emails: [prop('email'), ...mails].filter(Boolean),
    address: prop('streetAddress'), city: prop('addressLocality'), region: prop('addressRegion'), postcode: prop('postalCode'),
    website: (() => { const u = prop('url'); return u && hostname(absUrl(u, page)) !== hostname(page) ? absUrl(u, page) : ''; })(),
  };
}

function fromFields(html, fields = {}) {
  const out = {};
  for (const [k, src] of Object.entries(fields)) {
    const vals = [...html.matchAll(new RegExp(src, 'gi'))].map(m => clean(m[1] ?? m[0])).filter(Boolean);
    if (!vals.length) continue;
    out[k] = ['phones', 'phone', 'emails', 'email', 'links', 'categories'].includes(k) ? vals : vals[0];
  }
  if (out.phone) { out.phones = out.phone; delete out.phone; }
  if (out.email) { out.emails = out.email; delete out.email; }
  return out;
}

// One listing page → Listing (null when no business name could be found).
export function parsePage(html, url, { label = 'directory', fields } = {}) {
  const node = businessNode(jsonLd(html), url);
  const base = node ? fromNode(node, url) : {};
  const micro = fromHtml(html, url);
  const custom = fields ? fromFields(html, fields) : {};
  const l = { ...micro, ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))), ...custom };
  if (!node) l.phones = micro.phones; else if (!base.phones?.length) l.phones = micro.phones.slice(0, 2);
  if (!l.emails?.length) l.emails = micro.emails;
  if (l.website) l.website = fixUrl(l.website);
  if (!l.name) return null;
  return { source: label, source_url: url, source_id: `${label}:${url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '')}`, ...l };
}

// collect(project, sourceConfig, { limit, prev: { items, state }, checkpoint, label })
export async function collect(project, sc, args = {}) {
  const label = args.label || sc.name || hostname(sc.sitemap) || 'directory';
  if (!sc.sitemap && !sc.urls) throw new UserError(`directory source "${label}" needs "sitemap" (or a "urls" list)`);
  const state = { done: {}, errors: {}, ...(args.prev?.state || {}) };
  const byUrl = new Map((args.prev?.items || []).map(i => [i.source_url, i]));
  const max = +(sc.max_pages ?? 2000);
  const listed = sc.urls ? { urls: sc.urls, errors: [] } : await sitemapUrls(sc.sitemap, { pattern: sc.url_pattern, sitemapPattern: sc.sitemap_pattern, max: max * 2 });
  const urls = listed.urls.slice(0, max);
  const todo = urls.filter(u => !state.done[u]).slice(0, args.limit ? +args.limit : Infinity);
  log(`${label}: ${listed.urls.length} listing URLs in sitemap, ${urls.length - todo.length} done before, ${todo.length} to fetch${listed.errors.length ? ` (${listed.errors.length} sitemap errors)` : ''}`);
  const save = () => args.checkpoint?.({ items: [...byUrl.values()], state });
  await pool(todo, sc.concurrency || 2, async url => {
    const r = await get(url, { gap: sc.gap_ms });
    if (!r.ok) { state.errors[url] = r.robots ? 'robots.txt' : String(r.status || r.error); if (r.status === 404 || r.status === 410 || r.robots) state.done[url] = 0; return; }
    const l = parsePage(r.body, r.finalUrl || url, { label, fields: sc.fields });
    if (l) { l.source_url = url; byUrl.set(url, l); }
    delete state.errors[url];
    state.done[url] = l ? 1 : 0;
  }, { every: 25, save, label });
  state.sitemap_urls = listed.urls.length;
  return { items: [...byUrl.values()], cost_usd: 0, state };
}
