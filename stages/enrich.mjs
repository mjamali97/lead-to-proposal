// enrich: crawl each business's own website once - audit signals, SEO, contacts, owner, brand kit.
// Free. Resumable: sites already in data/sites.json are skipped unless --refresh.
//   l2p enrich [--limit N] [--only <url>] [--refresh] [--wayback]
import fs from 'node:fs';
import { load, writeJSON, pool, num, log, warn, fail, today } from '../lib/io.mjs';
import { configureHttp } from '../lib/http.mjs';
import { classifyUrl } from '../lib/normalize.mjs';
import { siteKey, crawlSite, auditSignals, extractPhones, extractEmails, extractSocials, extractOwner, NO_OWNER, SOCIAL_KEYS } from '../lib/site.mjs';
import { seoAudit } from '../lib/seo.mjs';
import { extractBrand } from '../lib/brand.mjs';
import { waybackDates, waybackAvailable } from '../lib/wayback.mjs';

const PHONE_FIELDS = ['e164', 'key', 'cc', 'ext', 'type', 'raw', 'valid', 'page', 'how'];
const HAS_CONTENT = new Set(['ok', 'coming_soon', 'redirect_offsite']);

// The Site record saved to data/sites.json (no raw HTML).
export function buildSite(c, { businessIds = [] } = {}) {
  const content = HAS_CONTENT.has(c.state);
  const seo = c.state === 'ok' || c.state === 'redirect_offsite' ? seoAudit(c) : null;
  return {
    key: c.key, url: c.url, final_url: c.final_url, status: c.status, ok: c.state === 'ok',
    state: c.state, state_detail: c.state_detail,
    pages: c.pages.map(p => ({ url: p.url, status: p.status, kind: p.kind === 'terms' ? 'legal' : p.kind })),
    signals: auditSignals(c),
    seo,
    phones: content ? extractPhones(c, c.country).map(p => Object.fromEntries(PHONE_FIELDS.map(k => [k, p[k] ?? '']))) : [],
    emails: content ? extractEmails(c) : [],
    socials: content ? extractSocials(c) : Object.fromEntries(SOCIAL_KEYS.map(k => [k, ''])),
    owner: content ? extractOwner(c) : { ...NO_OWNER },
    brand: content ? extractBrand(c) : null,
    business_ids: businessIds,
    crawled_at: c.crawled_at || today(),
  };
}

// Which websites to crawl: each business's own site, plus the Google-listed one if it differs and is also an own site.
export function sitesToCrawl(businesses, defaultCountry) {
  const want = new Map();
  for (const b of businesses) {
    const urls = [];
    if (b.website && (b.website_kind || classifyUrl(b.website)) === 'site') urls.push(b.website);
    const g = b.google?.website;
    if (g && classifyUrl(g) === 'site' && siteKey(g) !== siteKey(b.website)) urls.push(g);
    for (const url of urls) {
      const key = siteKey(url); if (!key) continue;
      const w = want.get(key) || { key, url, country: b.country || defaultCountry, business_ids: [] };
      if (b.id && !w.business_ids.includes(b.id)) w.business_ids.push(b.id);
      want.set(key, w);
    }
  }
  return [...want.values()];
}

function summary(items) {
  const v = Object.values(items);
  const states = v.reduce((a, s) => (a[s.state] = (a[s.state] || 0) + 1, a), {});
  const seo = v.map(s => s.seo?.score).filter(x => typeof x === 'number');
  return {
    sites: v.length, states,
    avg_seo: seo.length ? Math.round(seo.reduce((a, b) => a + b, 0) / seo.length) : null,
    with_phone: v.filter(s => s.phones?.length).length, with_email: v.filter(s => s.emails?.length).length,
    with_owner: v.filter(s => s.owner?.name).length, with_logo: v.filter(s => s.brand?.logo?.length).length,
    with_photos: v.filter(s => s.brand?.photos?.length).length, dated: v.filter(s => s.signals?.wayback_last_change).length,
  };
}

export async function run(project, args = {}) {
  const cfg = project.config.crawl || {};
  configureHttp({ cacheDir: project.paths.cache, respectRobots: cfg.respect_robots ?? true, gap: cfg.gap_ms ?? 1000, timeout: cfg.timeout_ms ?? 15000 });
  const country = project.config.market?.country || 'US';
  const store = load(project.paths.sites, { updated: '', items: {} });
  const items = store.items || {};
  const save = () => writeJSON(project.paths.sites, { updated: today(), items });
  const opts = { maxPages: cfg.max_pages ?? 5, country };
  const wantWayback = !!(args.wayback || cfg.wayback);

  let todo;
  if (!(args.only && args.only !== true) && !fs.existsSync(project.paths.businesses)) fail('No data/businesses.json yet. Run `l2p collect` and `l2p merge` first (or use --only <url>).');
  if (args.only && args.only !== true) {
    const key = siteKey(args.only);
    const known = sitesToCrawl(load(project.paths.businesses, { items: [] }).items || [], country).find(w => w.key === key);
    todo = [known || { key, url: args.only, country, business_ids: [] }];
  } else {
    const all = sitesToCrawl(load(project.paths.businesses, { items: [] }).items || [], country);
    for (const w of all) if (items[w.key]) items[w.key].business_ids = w.business_ids;   // links refresh even when not re-crawled
    todo = args.refresh ? all : all.filter(w => !items[w.key]);
    const limit = num(args.limit, Infinity);
    if (Number.isFinite(limit)) todo = todo.slice(0, limit);
    log(`${all.length} websites, ${all.length - all.filter(w => !items[w.key]).length} already crawled, ${todo.length} to crawl`);
  }

  await pool(todo, cfg.concurrency ?? 6, async w => {
    try { await enrichOne(w); } catch (e) { warn(`${w.url}: ${e.message}`); }
  }, { every: 25, save, label: 'sites' });
  async function enrichOne(w) {
    const c = await crawlSite(w.url, { ...opts, country: w.country || country, fresh: !!args.refresh });
    const prev = items[w.key]?.signals;
    items[w.key] = buildSite(c, { businessIds: w.business_ids });
    if (prev?.wayback_checked) Object.assign(items[w.key].signals, { wayback_first: prev.wayback_first, wayback_last_change: prev.wayback_last_change, wayback_checked: true });
  }

  if (wantWayback) {
    const keys = (args.only && args.only !== true ? [siteKey(args.only)] : Object.keys(items))
      .filter(k => items[k] && items[k].state === 'ok' && (args.refresh || items[k].signals.wayback_last_change == null && !items[k].signals.wayback_checked));
    log(`dating ${keys.length} sites on archive.org (slow, polite)`);
    let n = 0;
    for (const k of keys) {
      if (!waybackAvailable()) { log('archive.org is not answering; stopping. Dates found so far are kept; run again later.'); break; }
      const d = await waybackDates(items[k].final_url || items[k].url, { refresh: !!args.refresh, ...(cfg.wayback_endpoint && { endpoint: cfg.wayback_endpoint }) });
      if (d) Object.assign(items[k].signals, { wayback_first: d.first_seen, wayback_last_change: d.last_change, wayback_checked: true });
      if (++n % 25 === 0) { save(); log(`wayback: ${n}/${keys.length}`); }
    }
  }
  save();

  const s = summary(items);
  log(`sites.json: ${s.sites} sites | ${Object.entries(s.states).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
  log(`avg SEO ${s.avg_seo ?? '-'} | phone ${s.with_phone} | email ${s.with_email} | owner ${s.with_owner} | logo ${s.with_logo} | photos ${s.with_photos}${wantWayback ? ` | dated ${s.dated}` : ''}`);
  if (args.only && args.only !== true) {
    const x = items[siteKey(args.only)];
    if (x) log(JSON.stringify({ state: x.state, detail: x.state_detail, seo: x.seo?.score, issues: x.seo?.issues?.slice(0, 5), signals: x.signals, owner: x.owner,
      phones: x.phones.map(p => p.e164), emails: x.emails.map(e => e.email), logo: x.brand?.logo?.[0]?.url, colors: x.brand?.colors?.map(c => c.hex) }, null, 1));
  }
  return { log: { crawled: todo.length, ...s } };
}
