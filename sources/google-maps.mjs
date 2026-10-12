// Google Maps discovery via Apify (compass~crawler-google-places): segments × locations, one run each.
// Paid. The collect stage shows plan() as a dry run unless --go.
import { GOOGLE_MAPS_ACTOR, ratesFor, estimate, spendGuard, runOnce } from '../lib/apify.mjs';
import { log, warn, UserError } from '../lib/io.mjs';

// Locations may name a group in sourceConfig.location_groups (e.g. "suburbs": ["Round Rock, TX", ...]).
const expand = (locs, groups = {}) => [].concat(locs || []).flatMap(l => groups[l] || [l]);

// plan(sourceConfig, { limit }) → { runs, places, cost_usd, reviews, by_segment }
export function plan(sc, { limit } = {}) {
  const reviews = +(sc.max_reviews ?? 0);
  const rates = ratesFor(sc);
  let runs = [];
  for (const seg of sc.segments || []) {
    const search = [].concat(seg.search || seg.searchStrings || []);
    for (const location of expand(seg.locations, sc.location_groups || sc.locationGroups)) {
      runs.push({ id: `${seg.key}|${location}`, segment: seg.key, tier: seg.tier || '', ticket: seg.ticket || '', location, search,
        max: +(seg.max_per_search ?? sc.max_per_search ?? 40) });
    }
  }
  if (limit) runs = runs.slice(0, 1).map(r => ({ ...r, search: r.search.slice(0, 1), max: Math.min(r.max, +limit) }));
  for (const r of runs) { r.places = r.search.length * r.max; r.cost_usd = estimate({ places: r.places, reviews, rates }); }
  const by_segment = {};
  for (const r of runs) {
    const s = (by_segment[r.segment] ||= { runs: 0, places: 0, cost_usd: 0 });
    s.runs++; s.places += r.places; s.cost_usd = estimate({ places: s.places, reviews, rates });
  }
  const places = runs.reduce((n, r) => n + r.places, 0);
  return { runs, places, reviews, cost_usd: estimate({ places, reviews, rates }), budget_usd: +(sc.budget_usd ?? 0), by_segment };
}

export function formatPlan(p, label = 'google_maps') {
  const lines = [`${label}: ${p.runs.length} Apify run(s), up to ${p.places} places, max reviews ${p.reviews}/place → at most $${p.cost_usd.toFixed(2)} (budget $${p.budget_usd.toFixed(2)})`];
  for (const [k, s] of Object.entries(p.by_segment)) lines.push(`  ${k.padEnd(18)} ${String(s.runs).padStart(3)} runs ${String(s.places).padStart(6)} places  $${s.cost_usd.toFixed(2)}`);
  lines.push('  Rates are estimates measured in Sept 2026; check the actor\'s pricing page. Maps usually returns fewer places than the max.');
  return lines.join('\n');
}

const day = s => (s ? String(s).slice(0, 10) : '');
const hoursText = oh => (Array.isArray(oh) ? oh.map(h => (h.day ? `${h.day}: ${h.hours}` : String(h))).join('; ') : String(oh || ''));

// The `google` object for a Business, from one Apify item.
export function googleFromItem(it, match = { basis: 'place_id', confidence: 'high' }) {
  return {
    place_id: it.placeId || '', name: it.title || '', rating: it.totalScore ?? null, reviews: it.reviewsCount ?? null,
    phone: it.phoneUnformatted || it.phone || '', website: it.website || '', maps_url: it.url || '',
    categories: [...new Set([it.categoryName, ...(it.categories || [])].filter(Boolean))],
    status: it.permanentlyClosed ? 'CLOSED_PERMANENTLY' : it.temporarilyClosed ? 'CLOSED_TEMPORARILY' : 'OPERATIONAL',
    // The actor reports claimThisBusiness=true when Maps shows "Own this business?" (unclaimed).
    claimed: it.claimThisBusiness === true ? false : it.claimThisBusiness === false ? true : null,
    photos_count: it.imagesCount ?? null,
    lat: it.location?.lat ?? null, lng: it.location?.lng ?? null, address: it.address || '',
    match,
    reviews_sample: (it.reviews || []).slice(0, 10).map(r => ({
      date: day(r.publishedAtDate || r.publishAt), rating: r.stars ?? r.rating ?? null, text: String(r.text || '').slice(0, 600),
      owner_reply: !!(r.responseFromOwnerText || r.responseFromOwnerDate),
    })),
  };
}

// One Apify item → Listing.
export function mapItem(it, { label = 'google_maps', run = {} } = {}) {
  const socials = {};
  for (const [k, f] of [['instagram', 'instagrams'], ['facebook', 'facebooks'], ['linkedin', 'linkedIns'], ['tiktok', 'tiktoks'], ['youtube', 'youtubes'], ['x', 'twitters']])
    if (it[f]?.[0]) socials[k] = it[f][0];
  return {
    source: label, source_url: it.url || '', source_id: `gmaps:${it.placeId || it.cid || it.url}`,
    name: it.title || '', category: it.categoryName || '', categories: it.categories || [],
    address: it.address || '', city: it.city || '', region: it.state || '', postcode: it.postalCode || '', country: (it.countryCode || '').toUpperCase(),
    lat: it.location?.lat ?? null, lng: it.location?.lng ?? null,
    phones: [it.phoneUnformatted || it.phone].filter(Boolean), website: it.website || '', emails: it.emails || [], socials,
    hours: hoursText(it.openingHours),
    segment: run.segment || it._seg || '', tier: run.tier || '', ticket: run.ticket || '',
    google: googleFromItem(it),
  };
}

const actorInput = (sc, r, reviews) => ({
  searchStringsArray: r.search, locationQuery: r.location, maxCrawledPlacesPerSearch: r.max,
  language: sc.language || 'en', skipClosedPlaces: sc.skip_closed ?? true, scrapePlaceDetailPage: true,
  maxReviews: reviews, reviewsSort: 'newest', maxImages: 0, maxQuestions: 0, scrapeContacts: !!sc.scrape_contacts,
});

// collect(project, sourceConfig, { go, limit, prev: { items, state }, checkpoint, label })
export async function collect(project, sc, args = {}) {
  const label = args.label || sc.name || 'google_maps';
  const p = plan(sc, { limit: args.limit });
  const state = { runs: {}, ...(args.prev?.state || {}) };
  const items = [...(args.prev?.items || [])];
  if (!args.go) return { items, cost_usd: 0, state, plan: p, dry_run: true };
  const token = project.env?.APIFY_TOKEN;
  if (!token) throw new UserError('APIFY_TOKEN missing: put it in your project .env (https://console.apify.com/settings/integrations).');
  const budget = +(args.budget ?? sc.budget_usd ?? 0);
  const guard = await spendGuard({ token, budgetUsd: budget });
  log(`${label}: Apify usage this month $${guard.startUsage.toFixed(2)}, stage budget $${budget.toFixed(2)}`);
  const seen = new Set(items.map(i => i.source_id));
  const checkpoint = () => args.checkpoint?.({ items, state });
  let cost = 0, stopped = '';
  for (const r of p.runs) {
    const prior = state.runs[r.id];
    if (prior?.collected) continue;
    if (!prior?.runId) {
      const g = await guard.check(r.cost_usd);
      if (!g.ok) { stopped = `budget: spent $${g.spent.toFixed(2)}, $${g.left.toFixed(2)} left, next run up to $${r.cost_usd.toFixed(2)}`; break; }
    }
    log(`  run ${r.id} (${r.search.length} searches × ${r.max})`);
    const res = await runOnce({ state, key: r.id, actor: sc.actor || GOOGLE_MAPS_ACTOR, input: actorInput(sc, r, p.reviews), token,
      maxTotalChargeUsd: Math.max(0.5, +(r.cost_usd * 1.3).toFixed(2)), save: checkpoint, meta: { segment: r.segment, location: r.location },
      pollMs: args.pollMs, onTick: (run, ms) => process.stderr.write(`    ${run.status} ${Math.round(ms / 1000)}s\r`) });
    if (res.pending) { warn(`run ${r.id} still running; re-run collect to pick it up`); continue; }
    let added = 0;
    for (const it of res.items || []) {
      const l = mapItem(it, { label, run: r });
      if (seen.has(l.source_id)) continue;
      seen.add(l.source_id); items.push(l); added++;
    }
    cost += res.run.cost_usd || 0;
    log(`    +${added} places (${(res.items || []).length} returned)`);
    checkpoint();
  }
  const g = await guard.check(0);
  return { items, cost_usd: Math.round(Math.max(cost, g.spent) * 100) / 100, state, plan: p, stopped };
}

// Optional reviews pass for a shortlist (cheaper than buying reviews during discovery).
// shortlist(items, { min_reviews, min_rating }) → places worth paying for.
export const shortlist = (items, { min_reviews = 30, min_rating = 4.0 } = {}) =>
  items.filter(l => l.google?.place_id && l.google.status === 'OPERATIONAL' && !(l.google.reviews_sample || []).length
    && (l.google.reviews ?? 0) >= min_reviews && (l.google.rating ?? 0) >= min_rating);

export async function collectReviews(project, sc, args = {}) {
  const label = args.label || sc.name || 'google_maps';
  const state = { runs: {}, ...(args.prev?.state || {}) };
  const items = [...(args.prev?.items || [])];
  const list = shortlist(items, { min_reviews: args.minReviews ?? 30, min_rating: args.minRating ?? 4.0 }).slice(0, args.limit || Infinity);
  const n = +(args.reviews > 0 ? args.reviews : sc.max_reviews || 5);
  const rates = ratesFor(sc);
  const perPlace = n * rates.review_per_1k / 1000 + rates.place_per_1k / 1000;
  const cost_est = Math.round(list.length * perPlace * 100) / 100;
  if (!args.go) return { items, cost_usd: 0, state, dry_run: true, plan: { places: list.length, reviews: n, cost_usd: cost_est } };
  const token = project.env?.APIFY_TOKEN;
  if (!token) throw new UserError('APIFY_TOKEN missing in .env');
  const guard = await spendGuard({ token, budgetUsd: +(args.budget ?? sc.budget_usd ?? 0) });
  const byId = new Map(items.map(l => [l.google?.place_id, l]));
  const CHUNK = 150;
  for (let i = 0; i < list.length; i += CHUNK) {
    const batch = list.slice(i, i + CHUNK);
    const key = `reviews:${batch[0].google.place_id}:${batch.length}`;
    if (!state.runs[key]?.runId && !(await guard.check(batch.length * perPlace)).ok) break;
    const res = await runOnce({ state, key, actor: sc.actor || GOOGLE_MAPS_ACTOR, token, save: () => args.checkpoint?.({ items, state }),
      maxTotalChargeUsd: Math.max(0.5, +(batch.length * perPlace * 1.3).toFixed(2)), pollMs: args.pollMs,
      input: { startUrls: batch.map(l => ({ url: l.google.maps_url || l.source_url })), maxReviews: n, reviewsSort: 'newest', language: sc.language || 'en', scrapePlaceDetailPage: true, maxImages: 0, maxQuestions: 0 } });
    for (const it of res.items || []) {
      const l = byId.get(it.placeId);
      if (l) l.google = { ...l.google, ...googleFromItem(it, l.google.match), reviews_sample: googleFromItem(it).reviews_sample };
    }
    args.checkpoint?.({ items, state });
  }
  return { items, cost_usd: Math.round((await guard.check(0)).spent * 100) / 100, state, label };
}
