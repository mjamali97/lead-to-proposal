// l2p google [--go] [--budget USD] [--limit N] [--batch N]
// Looks up each business that has no Google data, one search per business, and accepts the result
// only when it provably is that business. Paid (Apify); dry run unless --go. Never looks anything up twice.
import { load, writeJSON, today, log, warn, num, UserError } from '../lib/io.mjs';
import { parsePhone, hostname, regDomain, classifyUrl, bestNameSim, normName, haversineKm } from '../lib/normalize.mjs';
import { dedupe } from '../lib/dedupe.mjs';
import { GOOGLE_MAPS_ACTOR, spendGuard, runOnce, ratesFor } from '../lib/apify.mjs';
import { googleFromItem } from '../sources/google-maps.mjs';

const countryName = cc => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc); } catch { return cc; } };
const cleanName = n => String(n || '').split(/\s[|–—]\s/)[0].replace(/\s{2,}/g, ' ').trim().slice(0, 80);

// "Name, street + city (or city + postcode), Country"
export function queryFor(b, config = {}) {
  const cc = b.country || config.market?.country || '';
  const country = cc ? countryName(cc) : '';
  const addr = b.address && b.address.length > 5 ? [b.address, b.city].filter(Boolean) : [b.city, b.postcode].filter(Boolean);
  let where = [...new Set(addr)].join(', ');
  if (country && !new RegExp(`\\b${country}\\b`, 'i').test(where)) where = where ? `${where}, ${country}` : country;
  return `${cleanName(b.name)}, ${where}`.replace(/,\s*$/, '').slice(0, 200);
}

// Is this Google result really this business? → { status: matched|rejected|no_match, confidence, basis, reason, sim, d_m }
export function validate(b, it, config = {}) {
  if (!it) return { status: 'no_match', reason: 'no result' };
  const country = b.country || config.market?.country;
  const gPhone = parsePhone(it.phoneUnformatted || it.phone || '', { country });
  const gHost = it.website ? regDomain(hostname(it.website)) : '';
  const gcc = String(it.countryCode || '').toUpperCase();
  if (gcc && country && gcc !== country) return { status: 'rejected', reason: `different country (${gcc})` };
  if (it.isAdvertisement) return { status: 'rejected', reason: 'ad result' };
  const sim = Math.round(bestNameSim(b.names?.length ? b.names : [b.name], [it.title], { stop: config.area?.cities }) * 100) / 100;
  const glat = it.location?.lat, glng = it.location?.lng;
  const d_m = b.lat != null && glat != null ? Math.round(haversineKm([b.lat, b.lng], [glat, glng]) * 1000) : null;
  const samePost = b.postcode && it.postalCode && b.postcode.replace(/\s/g, '').toUpperCase() === String(it.postalCode).replace(/\s/g, '').toUpperCase();
  const sameCity = b.city && it.city && normName(b.city) === normName(it.city);
  const myHosts = [b.website, ...(b.links || [])].filter(u => u && classifyUrl(u) === 'site').map(u => regDomain(hostname(u)));
  // A shared line (brokerage, group practice) shows a clearly different name for the same phone.
  const differentName = sim < 0.25;
  if (gPhone?.key && (b.phones || []).some(p => p.key === gPhone.key))
    return differentName ? { status: 'rejected', reason: `same phone, different business on Google ("${it.title}"): shared line?`, sim, d_m } : { status: 'matched', confidence: 'high', basis: 'phone', sim, d_m };
  if (gHost && myHosts.includes(gHost) && !differentName) return { status: 'matched', confidence: 'high', basis: 'website', sim, d_m };
  if (it.placeId && (b.place_id || b.google_place_hint) === it.placeId) return { status: 'matched', confidence: 'high', basis: 'place_id', sim, d_m };
  if (sim >= 0.8 && ((d_m != null && d_m <= 300) || (d_m == null && (samePost || sameCity))))
    return { status: 'matched', confidence: 'medium', basis: 'name+geo', sim, d_m };
  if (sim >= 0.6 && d_m != null && d_m <= 100) return { status: 'matched', confidence: 'low', basis: 'name+geo', sim, d_m };
  return { status: 'rejected', reason: `not the same business (name ${Math.round(sim * 100)}%${d_m != null ? `, ${d_m} m away` : ''})`, sim, d_m };
}

// Put stored matches back on businesses (merge re-runs call this too, so Google data survives a re-merge).
export function attachGoogle(businesses, gstate = {}) {
  const bySource = new Map();
  for (const r of Object.values(gstate.results || {})) if (r.status === 'matched' && r.google) for (const id of r.source_ids || []) bySource.set(id, r);
  let n = 0;
  for (const b of businesses) {
    if (b.google) continue;
    const r = b.sources.map(s => bySource.get(s.id)).find(Boolean);
    if (!r) continue;
    b.google = { ...r.google, match: { basis: r.basis, confidence: r.confidence } };
    if (r.confidence === 'low' && !b.flags.includes('verify-match')) b.flags.push('verify-match');
    if (r.confidence !== 'low') {
      const ph = parsePhone(r.google.phone, { country: b.country });
      if (ph?.valid && !b.phones.some(p => p.key === ph.key)) b.phones.push({ ...ph, type: ph.type || 'main', from: 'google' });
      if (r.google.website && !b.website && classifyUrl(r.google.website) === 'site') { b.website = r.google.website; b.website_kind = 'site'; }
      if (b.lat == null && r.google.lat != null) { b.lat = r.google.lat; b.lng = r.google.lng; }
    }
    n++;
  }
  return n;
}

const TICKET_ORDER = { premium: 0, mid: 1, low: 2 };
const lookedUp = gstate => new Set(Object.values(gstate.results || {}).flatMap(r => r.source_ids || []));
export const todoList = (businesses, gstate) => {
  const done = lookedUp(gstate);
  return businesses.filter(b => !b.google && !b.sources.some(s => done.has(s.id)) && b.name)
    .sort((a, c) => (TICKET_ORDER[a.ticket] ?? 3) - (TICKET_ORDER[c.ticket] ?? 3) || (!!c.website - !!a.website) || c.sources.length - a.sources.length);
};

export async function run(project, args = {}) {
  const c = project.config, gl = c.google_lookup || {};
  const biz = load(project.paths.businesses, null);
  if (!biz?.items) throw new UserError('No data/businesses.json yet. Run `l2p merge` first.');
  const gstate = load(project.paths.google, { runs: {}, results: {} });
  gstate.runs ||= {}; gstate.results ||= {};
  const save = () => writeJSON(project.paths.google, gstate);
  const price = +(gl.price_per_lookup_usd ?? ratesFor(gl).lookup_per_place);
  const budget = num(args.budget, +(gl.budget_usd ?? 5));
  let todo = todoList(biz.items, gstate);
  if (args.limit) todo = todo.slice(0, num(args.limit, todo.length));
  const pendingRuns = Object.values(gstate.runs).filter(r => r.runId && !r.collected);

  log(`${biz.items.length} businesses, ${biz.items.filter(b => b.google).length} already have Google data, ${Object.keys(gstate.results).length} looked up before, ${todo.length} to look up.`);
  log(`About $${(todo.length * price).toFixed(2)} at $${price}/lookup (check the actor's pricing page). Budget $${budget.toFixed(2)}.`);
  if (!args.go) {
    if (todo.length) log('Example searches:\n  ' + todo.slice(0, 5).map(b => queryFor(b, c)).join('\n  '));
    log('Dry run: nothing was bought. Add --go to look them up (try --limit 20 --go first).');
    return { log: { dry_run: true, todo: todo.length, est_usd: Math.round(todo.length * price * 100) / 100, cost_usd: 0 } };
  }
  const token = project.env?.APIFY_TOKEN;
  if (!token) throw new UserError('APIFY_TOKEN missing: put it in your project .env (https://console.apify.com/settings/integrations).');
  const byId = new Map(biz.items.map(b => [b.id, b]));
  const guard = await spendGuard({ token, budgetUsd: budget });
  const BATCH = num(args.batch, gl.batch || 100);
  let matched = 0, looked = 0;

  async function runBatch(key, queries, input, snap) {
    const res = await runOnce({ state: gstate, key, actor: gl.actor || GOOGLE_MAPS_ACTOR, input, token, save, meta: { queries, snap },
      maxTotalChargeUsd: Math.max(0.5, +(Object.keys(queries).length * price * 1.3).toFixed(2)), pollMs: args.pollMs,
      onTick: (r, ms) => process.stderr.write(`  ${r.status} ${Math.round(ms / 1000)}s\r`) });
    if (res.pending) { warn(`run ${key} still running; re-run \`l2p google --go\` later to collect it`); return; }
    const items = res.items || [];
    const byQuery = new Map(); for (const it of items) if (!byQuery.has(it.searchString)) byQuery.set(it.searchString, it);
    for (const [q, id] of Object.entries(queries)) {
      const b = byId.get(id) || res.run.snap?.[id];
      if (!b) continue;
      let it = byQuery.get(q) || byQuery.get(q.trim());
      let v = validate(b, it, c);
      // The actor de-duplicates places within a run, so a result can sit under another query.
      if (v.status !== 'matched') for (const other of items) {
        if (other === it) continue;
        const v2 = validate(b, other, c);
        if (v2.status === 'matched' && v2.confidence === 'high') { it = other; v = v2; break; }
      }
      looked++; if (v.status === 'matched') matched++;
      gstate.results[id] = { query: q.trim(), ...v, source_ids: b.sources.map(s => s.id), looked_up: today(),
        google: it ? googleFromItem(it, v.status === 'matched' ? { basis: v.basis, confidence: v.confidence } : null) : null };
    }
    save();
  }

  // Finish runs a crash left behind first (no new spend).
  for (const r of pendingRuns) { log(`collecting unfinished run ${r.key}`); await runBatch(r.key, r.queries, null); }

  let stopped = '';
  for (let i = 0; i < todo.length; i += BATCH) {
    const left = todoList(todo, gstate);
    if (!left.length) break;
    const g = await guard.check(0);
    const n = Math.min(BATCH, left.length, Math.floor(g.left / (price * 1.1)));
    if (n < Math.min(10, left.length)) { stopped = `budget ($${g.spent.toFixed(2)} spent, $${g.left.toFixed(2)} left)`; break; }
    const batch = left.slice(0, n);
    const queries = {};
    for (const b of batch) { let q = queryFor(b, c); while (queries[q]) q += ' '; queries[q] = b.id; }
    const key = `lookup-${Object.keys(gstate.runs).length + 1}-${batch[0].id}`;
    log(`batch ${key}: ${n} lookups`);
    await runBatch(key, queries, {
      searchStringsArray: Object.keys(queries), maxCrawledPlacesPerSearch: 1, language: c.market?.language || 'en',
      scrapePlaceDetailPage: false, skipClosedPlaces: false, maxReviews: 0, maxImages: 0, maxQuestions: 0, scrapeContacts: false,
    }, Object.fromEntries(batch.map(b => [b.id, b])));
  }
  const spent = (await guard.check(0)).spent;

  // Attach matches and merge pass 2: businesses that turned out to be the same Google place become one.
  const attached = attachGoogle(biz.items, gstate);
  const { items, report } = dedupe(biz.items, c);
  writeJSON(project.paths.businesses, { updated: today(), items });
  const mr = load(project.paths.mergeReport, {});
  mr.google_pass = { at: today(), attached, merged: biz.items.length - items.length, keys_used: report.keys_used, clusters: report.clusters.filter(x => x.keys.includes('place_id')) };
  writeJSON(project.paths.mergeReport, mr);
  const R = Object.values(gstate.results);
  const by = k => R.filter(r => r.confidence === k).length;
  log(`${looked} looked up now, ${matched} matched. All time: ${R.filter(r => r.status === 'matched').length} matched (high ${by('high')}, medium ${by('medium')}, low ${by('low')} → flagged verify-match), ${R.filter(r => r.status === 'rejected').length} rejected, ${R.filter(r => r.status === 'no_match').length} no result.`);
  log(`Spent $${spent.toFixed(2)}${stopped ? `; stopped at ${stopped}` : ''}. ${biz.items.length - items.length} businesses merged by Google place → ${items.length} businesses.`);
  return { log: { looked_up: looked, matched, merged: biz.items.length - items.length, businesses: items.length, stopped, cost_usd: Math.round(spent * 100) / 100 } };
}
