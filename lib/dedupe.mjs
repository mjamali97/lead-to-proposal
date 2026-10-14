// Merge listings into one record per real business (union-find over shared keys, with guards).
import { hash, load, writeJSON, today } from './io.mjs';
import { parsePhone, splitPhones, fixUrl, hostname, regDomain, classifyUrl, canonSocial, SOCIAL_HOSTS,
  normName, bestNameSim, haversineKm, isTollFree, categoryGroup, ticketFor } from './normalize.mjs';

export const SOCIAL_KEYS = Object.keys(SOCIAL_HOSTS);
const blankSocials = () => Object.fromEntries(SOCIAL_KEYS.map(k => [k, '']));
const uniq = a => [...new Set(a.filter(x => x !== '' && x != null))];
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const CRAWLABLE = ['site', 'free_subdomain', 'corporate'];
const KIND_RANK = ['site', 'free_subdomain', 'corporate', 'social', 'aggregator', 'directory', 'none'];
const GENERIC_CATEGORY = /^(local ?business|organi[sz]ation|thing|place|establishment|point[ _]of[ _]interest|business|store|service|company|corporation)$/i;

// Merge settings (config.merge, all optional).
export function mergeSettings(config = {}) {
  const m = config.merge || {};
  const dirHosts = (config.sources || []).filter(s => s.type === 'directory').map(s => hostname(s.sitemap || s.base_url || '')).filter(Boolean);
  return {
    sharedHosts: m.shared_hosts || [],
    corporateHosts: m.corporate_hosts || [],
    directoryHosts: uniq([...(m.directory_hosts || []), ...dirHosts]),
    switchboardNames: m.switchboard_names ?? 4,
    nameGeoM: m.name_geo_m ?? 150,
    nameSim: m.name_sim ?? 0.9,
    tollFreeNameSim: m.toll_free_name_sim ?? 0.6,
    stop: config.area?.cities || [],
    country: config.market?.country || 'US',
  };
}

// Any raw Listing (or an already merged Business) → the shape dedupe works on.
export function normalizeListing(r, config = {}) {
  const S = mergeSettings(config);
  const country = /^[A-Za-z]{2}$/.test(r.country || '') ? r.country.toUpperCase() : S.country;
  const kindOpts = { sharedHosts: S.sharedHosts, corporateHosts: S.corporateHosts, directoryHosts: S.directoryHosts };

  const phones = [];
  const rawPhones = [...[].concat(r.phones || []), ...[].concat(r.phone || [])];
  for (const p of rawPhones) {
    if (p && typeof p === 'object' && p.key && p.valid) { if (!phones.some(x => x.key === p.key)) phones.push(p); continue; }
    const raw = typeof p === 'object' ? p?.raw || p?.e164 || '' : p;
    for (const piece of splitPhones(raw)) {
      const x = parsePhone(piece, { country });
      if (x?.valid && !phones.some(y => y.key === x.key)) phones.push({ ...x, type: (typeof p === 'object' && p.type) || x.type || 'main' });
    }
  }

  const socials = { ...blankSocials() };
  for (const [k, v] of Object.entries(r.socials || {})) if (v && SOCIAL_KEYS.includes(k)) { const c = canonSocial(v); socials[k] = c?.network === k ? c.url : v; }
  let website = '', website_kind = 'none';
  const links = [];
  const candidates = uniq([r.website, ...(r.links || []), ...Object.values(r.socials || {})].map(fixUrl));
  for (const u of candidates) {
    const s = canonSocial(u);
    if (s) { socials[s.network] ||= s.url; continue; }
    const kind = classifyUrl(u, kindOpts);
    if (kind === 'social') continue;
    if (!website && CRAWLABLE.includes(kind)) { website = u; website_kind = kind; continue; }
    if (!CRAWLABLE.includes(kind)) links.push(u);
    if (!website && KIND_RANK.indexOf(kind) < KIND_RANK.indexOf(website_kind)) website_kind = kind;
  }
  if (!website && Object.values(socials).some(Boolean) && KIND_RANK.indexOf('social') < KIND_RANK.indexOf(website_kind)) website_kind = 'social';

  const names = uniq([r.name, ...(r.names || [])].map(n => String(n ?? '').replace(/\s+/g, ' ').trim()));
  const lat = r.lat === '' || r.lat == null ? null : Number(r.lat), lng = r.lng === '' || r.lng == null ? null : Number(r.lng);
  const sources = r.sources?.length ? r.sources : [{ source: r.source || '', url: r.source_url || '', id: r.source_id || `${r.source || 'src'}:${r.source_url || hash(JSON.stringify(names) + phones.map(p => p.key))}` }];
  return {
    ...r,
    name: names[0] || '', names,
    category: r.category || '', categories: uniq([r.category, ...(r.categories || [])]),
    address: r.address || '', city: r.city || '', region: r.region || '', postcode: String(r.postcode ?? r.postal_code ?? r.zip ?? '').trim(),
    country, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
    phones, emails: uniq([...[].concat(r.emails || []), ...[].concat(r.email || [])].map(e => String(e).trim().replace(/^mailto:/i, '').toLowerCase()).filter(e => EMAIL.test(e))),
    website, website_kind, links: uniq(links), socials,
    owner: r.owner || { name: '', role: '', source: '', confidence: '' }, hours: r.hours || '',
    sources, google: r.google || null, flags: uniq(r.flags || []),
  };
}

// ---------- keys ----------
const pathKey = u => { try { const x = new URL(u); const p = x.pathname.replace(/\/+$/, '').toLowerCase(); return p ? hostname(u) + p : ''; } catch { return ''; } };
const postKey = p => String(p || '').replace(/\s+/g, '').toUpperCase();
const hasGeo = r => r.lat != null && r.lng != null;
function keysOf(r, S) {
  const out = [];
  for (const ph of r.phones) if (ph.key) out.push(`${isTollFree(ph) ? 'tf' : 'ph'}:${ph.key}`);
  if (r.website && r.website_kind === 'site') {
    const d = regDomain(hostname(r.website));
    if (d && !S.sharedHosts.some(h => regDomain(h) === d)) out.push(`web:${d}`);
  }
  if (r.website && r.website_kind === 'corporate' && !S.sharedHosts.some(h => regDomain(h) === regDomain(hostname(r.website)))) {
    const k = pathKey(r.website); if (k) out.push(`corp:${k}`);
  }
  const ig = r.socials?.instagram && canonSocial(r.socials.instagram);
  if (ig) out.push(`ig:${ig.handle.toLowerCase()}`);
  const pid = r.google?.place_id || r.place_id;
  if (pid) out.push(`gp:${pid}`);
  return out;
}
const KEY_NAMES = { ph: 'phone', tf: 'toll_free', web: 'domain', corp: 'corporate_page', ig: 'instagram', gp: 'place_id' };

// Greedy clusters of clearly different names (sim < 0.5 to every member of other clusters).
function nameClusters(recs) {
  const clusters = [];
  for (const r of recs) {
    if (!r.names.length) continue;
    const c = clusters.find(cl => cl.some(o => bestNameSim(o.names, r.names) >= 0.5));
    if (c) c.push(r); else clusters.push([r]);
  }
  return clusters;
}

// dedupe(listings, config, { ids }) → { items: [Business], report: { keys_used, disabled_keys, kept_apart, clusters, id_changes }, ids }
// `ids` is the id registry (data/ids.json, see assignIds); the updated registry is returned.
export function dedupe(listings, config = {}, { ids: registry = null } = {}) {
  const S = mergeSettings(config);
  const recs = listings.map(l => normalizeListing(l, config));
  const parent = recs.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const why = new Map();      // root pair reasons for the report
  const keysUsed = {};
  const union = (a, b, reason) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    parent[rb] = ra;
    keysUsed[reason] = (keysUsed[reason] || 0) + 1;
    why.set(`${a}|${b}`, reason);
  };

  const groups = new Map();
  recs.forEach((r, i) => { for (const k of uniq(keysOf(r, S))) (groups.get(k) || groups.set(k, []).get(k)).push(i); });

  const disabled = [], keptApart = [];
  const flagged = new Map();     // index → Set(flags)
  const flag = (i, f) => (flagged.get(i) || flagged.set(i, new Set()).get(i)).add(f);
  const label = i => `${recs[i].name || '(no name)'} [${recs[i].sources.map(s => s.source).join(',')}]`;

  for (const [k, idx] of groups) {
    if (idx.length < 2) continue;
    const type = k.slice(0, k.indexOf(':'));
    if (type !== 'gp') {
      const clusters = nameClusters(idx.map(i => recs[i]));
      if (clusters.length >= S.switchboardNames) {
        disabled.push({ key: k, reason: 'switchboard', names: clusters.map(c => c[0].name), listings: idx.length });
        idx.forEach(i => flag(i, 'switchboard'));
        continue;
      }
    }
    if (type === 'tf') {
      let apart = false;
      for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
        if (bestNameSim(recs[idx[x]].names, recs[idx[y]].names, { stop: S.stop }) >= S.tollFreeNameSim) union(idx[x], idx[y], 'toll_free');
        else apart = true;
      }
      if (apart) { keptApart.push({ key: k, reason: 'toll-free number, different names', listings: idx.map(label) }); idx.forEach(i => flag(i, 'shared-toll-free')); }
      continue;
    }
    for (const j of idx.slice(1)) union(idx[0], j, KEY_NAMES[type]);
  }

  // Same name in the same place (≤ name_geo_m metres or same postcode), when nothing contradicts it.
  const byTok = new Map();
  recs.forEach((r, i) => {
    for (const n of r.names) for (const t of normName(n).split(' ').filter(w => w.length > 2).slice(0, 2)) (byTok.get(t) || byTok.set(t, new Set()).get(t)).add(i);
  });
  const domainOf = r => (r.website_kind === 'site' ? regDomain(hostname(r.website)) : '');
  const seenPair = new Set();
  for (const set of byTok.values()) {
    const idx = [...set];
    if (idx.length > 500) continue;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const i = idx[x], j = idx[y], pk = `${i}|${j}`;
      if (seenPair.has(pk) || find(i) === find(j)) continue;
      seenPair.add(pk);
      const a = recs[i], b = recs[j];
      const samePost = a.postcode && b.postcode && postKey(a.postcode) === postKey(b.postcode);
      const near = hasGeo(a) && hasGeo(b) ? haversineKm([a.lat, a.lng], [b.lat, b.lng]) * 1000 <= S.nameGeoM : samePost;
      if (!near) continue;
      if (bestNameSim(a.names, b.names, { stop: S.stop }) < S.nameSim) continue;
      const phoneConflict = a.phones.length && b.phones.length && !a.phones.some(p => b.phones.some(q => q.key === p.key));
      const da = domainOf(a), db = domainOf(b);
      if (phoneConflict || (da && db && da !== db)) { keptApart.push({ key: `name:${normName(a.name)}`, reason: phoneConflict ? 'same name nearby, different phones' : 'same name nearby, different websites', listings: [label(i), label(j)] }); continue; }
      union(i, j, 'name_geo');
    }
  }

  // ---------- build merged businesses ----------
  const members = new Map();
  recs.forEach((r, i) => { const root = find(i); (members.get(root) || members.set(root, []).get(root)).push(i); });
  const rankOf = sourceRanker(config);
  const groupsOf = [...members.values()].map(idx => ({ idx, ms: idx.map(i => recs[i]).sort((a, b) => rankOf(a) - rankOf(b)) }));
  const { ids, formerIds, registry: reg, changes } = assignIds(groupsOf.map(g => g.ms), registry);
  const items = [], clusters = [];
  for (const [k, { idx, ms }] of groupsOf.entries()) {
    const b = buildBusiness(ms, config, S, ids[k], formerIds[k]);
    for (const i of idx) for (const f of flagged.get(i) || []) if (!b.flags.includes(f)) b.flags.push(f);
    items.push(b);
    if (idx.length > 1) {
      const reasons = uniq([...why].filter(([pk]) => { const [x, y] = pk.split('|').map(Number); return idx.includes(x) && idx.includes(y); }).map(([, r]) => r));
      clusters.push({ id: b.id, name: b.name, size: idx.length, keys: reasons, members: ms.map(m => ({ name: m.name, sources: m.sources.map(s => s.id) })) });
    }
  }
  clusters.sort((a, b) => b.size - a.size);
  const nameOf = new Map(items.map(b => [b.id, b.name]));
  for (const ch of changes) ch.name = nameOf.get(ch.id) || ch.name;
  return { items, report: { listings: recs.length, businesses: items.length, keys_used: keysUsed, disabled_keys: disabled, kept_apart: keptApart, clusters, id_changes: changes }, ids: reg };
}

// ---------- stable ids ----------
// A business keeps the id it was first given, so touches, the stop list, proposal packages and the
// workbook's own columns stay attached when a new source adds a listing to it. The registry
// (data/ids.json) remembers which business id every source listing belongs to:
//   { version: 1, sources: { "<source id>": "b_…" }, ids: { "b_…": <order assigned> }, aliases: { "<old id>": "<id it merged into>" } }
// A merged group keeps the id most of its listings (or the already-merged business with most listings)
// carried; on a tie the id assigned first. Only a group none of whose listings was seen before gets a
// new id: the hash of its alphabetically first source id (the 1.0.0 rule, so ids made by 1.0.0 match).
// When two known businesses become one, the id that disappears is kept as an alias of the survivor.
export const naturalId = sourceId => 'b_' + hash(sourceId, 12);
const BID = /^b_[0-9a-f]{12}$/;
export const emptyIds = () => ({ version: 1, sources: {}, ids: {}, aliases: {} });

export function assignIds(groups, registry) {
  const R = { ...emptyIds(), ...(registry || {}) };
  R.sources = { ...R.sources }; R.ids = { ...R.ids }; R.aliases = { ...R.aliases };
  const resolve = id => { let x = id; for (let n = 0; R.aliases[x] && n < 50; n++) x = R.aliases[x]; return x; };
  const order = id => R.ids[id] ?? Infinity;
  const claims = groups.map(ms => {
    const c = new Map(), add = (id, w) => { if (id) { id = resolve(id); c.set(id, (c.get(id) || 0) + w); } };
    for (const m of ms) {
      if (BID.test(m.id || '')) add(m.id, Math.max(1, (m.sources || []).length));     // an already merged business
      for (const s of m.sources || []) add(R.sources[s.id], 1);
    }
    return c;
  });
  const anchors = groups.map(ms => new Set(ms.flatMap(m => (m.sources || []).map(s => naturalId(s.id)))));
  const pairs = [];
  claims.forEach((c, g) => { for (const [id, w] of c) pairs.push({ g, id, w }); });
  pairs.sort((a, b) => b.w - a.w || order(a.id) - order(b.id) || anchors[b.g].has(b.id) - anchors[a.g].has(a.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.g - b.g));
  const ids = new Array(groups.length).fill(null), taken = new Set();
  for (const { g, id } of pairs) if (!ids[g] && !taken.has(id)) { ids[g] = id; taken.add(id); }
  const known = new Set([...Object.keys(R.ids), ...Object.keys(R.aliases)]);
  groups.forEach((ms, g) => {
    if (ids[g]) return;
    const sids = [...new Set(ms.flatMap(m => (m.sources || []).map(s => s.id)))].sort();
    const free = x => !taken.has(x) && !known.has(x);
    let id = sids.map(naturalId).find(free);
    for (let k = 1; !id; k++) { const x = naturalId(`${sids[0] || 'business'}#${k}`); if (free(x)) id = x; }
    ids[g] = id; taken.add(id);
  });
  let next = Math.max(0, ...Object.values(R.ids).map(Number).filter(Number.isFinite)) + 1;
  const changes = [], formerIds = [];
  groups.forEach((ms, g) => {
    const id = ids[g];
    for (const m of ms) for (const s of m.sources || []) R.sources[s.id] = id;
    if (R.ids[id] == null) R.ids[id] = next++;
    delete R.aliases[id];
    // Ids this group carried that no group kept: merged away. Earlier aliases travel with the business.
    const gone = [...claims[g].keys()].filter(x => x !== id && !taken.has(x));
    const former = [...new Set([...ms.flatMap(m => m.former_ids || []), ...gone])].filter(x => x !== id && !taken.has(x));
    for (const x of former) R.aliases[x] = id;
    formerIds[g] = former;
    const had = ms.map(m => m.id).filter(x => BID.test(x || ''));
    if (gone.length || had.some(x => x !== id)) changes.push({ id, name: ms[0]?.name || '', from: [...new Set([...had, ...gone])].filter(x => x !== id) });
  });
  return { ids, registry: R, changes, formerIds };
}

// Registry for data made before ids.json existed: every business keeps the id it has now.
export function idsFromBusinesses(items = []) {
  const R = emptyIds();
  items.forEach((b, i) => {
    if (!b?.id) return;
    R.ids[b.id] ??= i + 1;
    for (const s of b.sources || []) if (s?.id) R.sources[s.id] ??= b.id;
    for (const f of b.former_ids || []) R.aliases[f] = b.id;
  });
  return R;
}

// The project's registry (data/ids.json). Projects made before it existed get one from
// data/businesses.json, so every business keeps the id its touches, stop-list entries, packages and
// workbook rows already use.
export function loadIds(project) {
  const reg = load(project.paths.ids, null);
  if (reg?.sources) return { reg, migrated: 0 };
  const prev = load(project.paths.businesses, null)?.items || [];
  return { reg: idsFromBusinesses(prev), migrated: prev.length };
}
export const saveIds = (project, reg) => writeJSON(project.paths.ids, { ...reg, updated: today() });

// Every id this business may have been known by: ids merged into it, and (for data made by 1.0.0,
// which re-derived ids from the first source) the id each of its listings would have had alone.
export const idAliases = b => [...new Set([...(b?.former_ids || []), ...(b?.sources || []).map(s => naturalId(s.id))])].filter(x => x && x !== b?.id);

// Google first (owners set those names), then config.sources order.
function sourceRanker(config) {
  const order = (config.sources || []).map((s, i) => [s.name || s.type, i]);
  const pos = new Map(order);
  return r => (r.google?.place_id ? -1 : Math.min(99, ...r.sources.map(s => pos.get(s.source) ?? 50)));
}

const mostCommon = arr => {
  const c = new Map();
  for (const v of arr.filter(Boolean)) c.set(v, (c.get(v) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

function buildBusiness(ms, config, S, id, former = []) {
  const sources = [];
  for (const m of ms) for (const s of m.sources) if (!sources.some(x => x.id === s.id)) sources.push(s);
  id ||= naturalId(sources.map(s => s.id).sort()[0]);

  const phoneCount = new Map();
  for (const m of ms) for (const ph of m.phones) { const e = phoneCount.get(ph.key) || { ph, n: 0 }; e.n++; phoneCount.set(ph.key, e); }
  const phones = [...phoneCount.values()].sort((a, b) => b.n - a.n || (a.ph.type === 'main' ? -1 : b.ph.type === 'main' ? 1 : 0)).map(e => e.ph);

  const sites = ms.filter(m => m.website).map(m => ({ u: m.website, k: m.website_kind }));
  const siteCount = new Map(); for (const s of sites) siteCount.set(s.u, (siteCount.get(s.u) || 0) + 1);
  const site = sites.sort((a, b) => KIND_RANK.indexOf(a.k) - KIND_RANK.indexOf(b.k) || siteCount.get(b.u) - siteCount.get(a.u))[0];
  const socials = blankSocials();
  for (const k of SOCIAL_KEYS) socials[k] = mostCommon(ms.map(m => m.socials?.[k]));
  const website_kind = site?.k || ms.map(m => m.website_kind).sort((a, b) => KIND_RANK.indexOf(a) - KIND_RANK.indexOf(b))[0] || 'none';

  const addr = [...ms].sort((a, b) => (!!b.postcode - !!a.postcode) || ((b.address || '').length - (a.address || '').length))[0];
  const geo = ms.find(m => m.google?.place_id && hasGeo(m)) || ms.find(hasGeo) || {};
  const names = uniq(ms.flatMap(m => m.names));
  const categories = uniq(ms.flatMap(m => m.categories || []));
  const category = ms.map(m => m.google?.categories?.[0]).find(Boolean) || ms.map(m => m.category).find(c => c && !GENERIC_CATEGORY.test(c)) || categories[0] || '';
  const google = ms.map(m => m.google).filter(Boolean).sort((a, b) => (b.match?.confidence === 'high') - (a.match?.confidence === 'high') || (b.reviews || 0) - (a.reviews || 0))[0] || null;
  const groups = config.categories?.groups;
  let category_group = groups ? categoryGroup([category, ...categories, ...(google?.categories || [])], groups) : '';
  if (groups && category_group === 'other') category_group = categoryGroup(names, groups);
  if (!groups) category_group = ms.map(m => m.category_group).find(Boolean) || 'other';
  const pick = f => ms.map(m => m[f]).find(v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length));

  const out = {};
  for (const m of [...ms].reverse()) Object.assign(out, m);     // keep extra fields, best-ranked member wins
  delete out.source; delete out.source_url; delete out.source_id; delete out.phone; delete out.email; delete out.postal_code;
  return Object.assign(out, {
    id, name: ms[0].name || names[0] || '', names, category, categories, category_group,
    ticket: pick('ticket') || ticketFor(category_group, config),
    address: addr.address || '', city: addr.city || pick('city') || '', region: addr.region || pick('region') || '', postcode: addr.postcode || pick('postcode') || '',
    country: addr.country || S.country, lat: geo.lat ?? null, lng: geo.lng ?? null,
    phones, emails: uniq(ms.flatMap(m => m.emails)), website: site?.u || '', website_kind,
    links: uniq(ms.flatMap(m => m.links || [])), socials,
    owner: ms.map(m => m.owner).find(o => o?.name) || { name: '', role: '', source: '', confidence: '' },
    hours: (ms.find(m => m.google && m.hours) || {}).hours || pick('hours') || '',
    description: ms.map(m => m.description).filter(Boolean).sort((a, b) => b.length - a.length)[0] || undefined,
    sources, google, flags: uniq(ms.flatMap(m => m.flags || [])),
    former_ids: former.length ? former : undefined,
  });
}

// Throws when two items still share a phone, own-site domain, Instagram handle or Google place
// (keys disabled as switchboards / kept-apart toll-free numbers are exempt).
export function assertNoDuplicates(items, config = {}) {
  const S = mergeSettings(config);
  const seen = new Map();
  items.forEach((b, i) => {
    const r = normalizeListing(b, config);
    for (const k of uniq(keysOf(r, S))) {
      if (k.startsWith('corp:')) continue;
      if ((k.startsWith('ph:') || k.startsWith('web:') || k.startsWith('ig:')) && r.flags?.includes('switchboard')) continue;
      if (k.startsWith('tf:') && (r.flags?.includes('shared-toll-free') || r.flags?.includes('switchboard'))) continue;
      (seen.get(k) || seen.set(k, []).get(k)).push(i);
    }
  });
  const dups = [...seen].filter(([, idx]) => idx.length > 1);
  if (dups.length) {
    const lines = dups.slice(0, 50).map(([k, idx]) => `  ${k}: ${idx.map(i => `${items[i].name || items[i].id} (${items[i].id})`).join(' | ')}`);
    throw new Error(`${dups.length} duplicate key(s) left after merging:\n${lines.join('\n')}`);
  }
  return true;
}
