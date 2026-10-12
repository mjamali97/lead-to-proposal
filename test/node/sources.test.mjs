import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { configureHttp } from '../../lib/http.mjs';
import * as directory from '../../sources/directory.mjs';
import * as csv from '../../sources/csv.mjs';
import * as osm from '../../sources/osm.mjs';
import * as gmaps from '../../sources/google-maps.mjs';
import { estimate, runOnce } from '../../lib/apify.mjs';
import { dedupe } from '../../lib/dedupe.mjs';

const FIX = path.resolve(import.meta.dirname, '../fixtures/leads');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-src-'));
const listen = handler => new Promise(res => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
const baseOf = s => `http://127.0.0.1:${s.address().port}`;

// Fictional directory: sitemap index → listings sitemap → 3 pages (+1 blocked by robots.txt).
async function directoryServer() {
  const hits = [];
  const s = await listen((req, res) => {
    hits.push(req.url);
    const base = baseOf(s);
    const rel = req.url === '/' ? 'about.html' : req.url.replace(/^\//, '') + (/\.(xml|txt)$/.test(req.url) ? '' : '.html');
    const f = path.join(FIX, 'directory', rel);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': rel.endsWith('.xml') ? 'application/xml' : rel.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(f, 'utf8').replaceAll('{{BASE}}', base));
  });
  return { s, hits };
}

test('directory: sitemap index → listing pages → JSON-LD, microdata and regex fields; robots respected; resumable', async () => {
  const { s, hits } = await directoryServer();
  const base = baseOf(s);
  configureHttp({ cacheDir: path.join(tmp(), 'cache'), gap: 0, respectRobots: true, timeout: 5000 });
  const sc = { type: 'directory', name: 'testdir', sitemap: `${base}/sitemap.xml`, url_pattern: '/listing/', max_pages: 50,
    fields: { website: 'Website:\\s*<a href="([^"]+)"', category: '<p class="cat">([^<]+)</p>' } };
  const saved = [];
  try {
    const r = await directory.collect({ dir: tmp(), config: {}, env: {} }, sc, { label: 'testdir', checkpoint: x => saved.push(x) });
    assert.equal(r.cost_usd, 0);
    const by = n => r.items.find(i => i.name === n);
    assert.equal(r.items.length, 3);
    const nw = by('Northwind Plumbing');
    assert.equal(nw.category, 'Plumber');
    assert.deepEqual(nw.phones, ['(512) 555-0123']);                      // the footer's support number is not the business
    assert.equal(nw.website, 'https://northwind-plumbing.example/');
    assert.deepEqual(nw.links, ['https://www.instagram.com/northwind.plumbing/']);
    assert.equal(nw.city, 'Austin'); assert.equal(nw.postcode, '78701'); assert.equal(nw.lat, 30.2672);
    assert.equal(nw.hours, 'Mo-Fr 08:00-18:00');
    assert.equal(nw.source, 'testdir'); assert.equal(nw.source_url, `${base}/listing/northwind-plumbing`);
    const bb = by('Bluebird Bakery');
    assert.deepEqual(bb.phones, ['512-555-0142']); assert.equal(bb.city, 'Round Rock'); assert.equal(bb.postcode, '78664');
    assert.deepEqual(bb.emails, ['orders@bluebird-bakery.example']);
    const rd = by('Redwood Dental');
    assert.equal(rd.website, 'https://redwood-dental.example/'); assert.equal(rd.category, 'Dentist');
    assert.deepEqual(rd.phones, ['+1-512-555-0177']);
    assert.ok(!hits.includes('/listing/hidden-roofing'), 'robots.txt disallowed page was fetched');
    assert.equal(r.state.errors[`${base}/listing/hidden-roofing`], 'robots.txt');
    assert.ok(!hits.includes('/about'));                                   // not matching url_pattern
    // Resume: everything is done, nothing new is fetched.
    const before = hits.length;
    const again = await directory.collect({ dir: tmp(), config: {}, env: {} }, sc, { label: 'testdir', prev: { items: r.items, state: r.state } });
    assert.equal(again.items.length, 3);
    assert.equal(hits.filter((h, i) => i >= before && h.startsWith('/listing/')).length, 0);
    // The directory's own host is a "directory" website kind for the merge.
    const { items } = dedupe(r.items, { market: { country: 'US' }, sources: [sc] });
    assert.equal(items.length, 3);
  } finally { s.close(); }
});

test('directory: --limit fetches only N pages', async () => {
  const { s, hits } = await directoryServer();
  configureHttp({ cacheDir: path.join(tmp(), 'cache'), gap: 0, respectRobots: true });
  try {
    const r = await directory.collect({ dir: tmp() }, { name: 'd', sitemap: `${baseOf(s)}/sitemap.xml`, url_pattern: '/listing/' }, { limit: 1 });
    assert.equal(r.items.length, 1);
    assert.equal(hits.filter(h => h.startsWith('/listing/')).length, 1);
  } finally { s.close(); }
});

test('directory: parsePage picks the business node, not the directory itself', () => {
  const html = `<script type="application/ld+json">[{"@type":"Organization","name":"Some Directory","url":"https://dir.example/"},
    {"@type":"HVACBusiness","name":"Northwind Heating","telephone":["512-555-0110","512-555-0111"],"address":"1 Example St, Austin"}]</script>`;
  const l = directory.parsePage(html, 'https://dir.example/listing/1', { label: 'd' });
  assert.equal(l.name, 'Northwind Heating'); assert.equal(l.category, 'HVAC Business');
  assert.deepEqual(l.phones, ['512-555-0110', '512-555-0111']); assert.equal(l.address, '1 Example St, Austin');
  assert.equal(directory.parsePage('<html><body><p>nothing</p></body></html>', 'https://dir.example/x'), null);
});

test('csv: column map, auto-detected headers, semicolons, --limit', async () => {
  const project = { dir: FIX, config: {} };
  const r = await csv.collect(project, { name: 'mine', file: 'leads.csv', map: { name: 'Business Name', phone: 'Phone', website: 'Website', city: 'City', category: 'Category', email: 'Email', address: 'Address' } }, {});
  assert.equal(r.items.length, 6);                                          // the row without a name is skipped
  const nw = r.items[0];
  assert.equal(nw.name, 'Northwind Plumbing'); assert.deepEqual(nw.phones, ['(512) 555-0123']); assert.equal(nw.city, 'Austin');
  assert.equal(nw.category, 'Plumber'); assert.deepEqual(nw.emails, ['hello@northwind-plumbing.example']);
  assert.match(nw.source_id, /^mine:[0-9a-f]{12}$/);
  const auto = await csv.collect(project, { file: 'leads.csv' }, { limit: 2 });
  assert.equal(auto.items.length, 2);
  assert.equal(auto.items[1].name, 'Northwind Plumbing & Drain');
  assert.equal(auto.state.map.website, 'Website');
  const semi = await csv.collect(project, { file: 'leads-semicolon.csv' }, {});
  assert.equal(semi.items[0].name, 'Musterbau GmbH'); assert.deepEqual(semi.items[0].phones, ['040 5550123']);
  assert.equal(semi.items[0].city, 'Hamburg'); assert.equal(semi.items[0].website, 'musterbau.example');
  await assert.rejects(csv.collect(project, { file: 'missing.csv' }, {}), /not found/);
});

test('osm: query shape and element mapping', async () => {
  const q = osm.buildQuery([['craft', 'plumber'], 'shop=bakery', ['office', '*']], { bbox: [30, -98.1, 30.7, -97.4] });
  assert.match(q, /^\[out:json\]\[timeout:180\];/);
  assert.match(q, /nwr\["craft"="plumber"\]\(30,-98\.1,30\.7,-97\.4\);/);
  assert.match(q, /nwr\["shop"="bakery"\]/); assert.match(q, /nwr\["office"\]\(/);
  assert.match(q, /out center tags;$/);
  assert.match(osm.buildQuery([['craft', 'plumber']], { center: [30.27, -97.74], radius_km: 5 }), /\(around:5000,30\.27,-97\.74\)/);
  assert.throws(() => osm.buildQuery([['craft', 'plumber']], {}), /bbox/);

  const json = JSON.parse(fs.readFileSync(path.join(FIX, 'overpass.json'), 'utf8'));
  const items = json.elements.map(el => osm.mapElement(el, { tags: [['craft', 'plumber'], ['shop', 'bakery']] })).filter(Boolean);
  assert.equal(items.length, 2);                                            // the nameless node is skipped
  const [nw, bb] = items;
  assert.equal(nw.source_url, 'https://www.openstreetmap.org/node/1001'); assert.equal(nw.source_id, 'osm:node/1001');
  assert.equal(nw.category, 'Plumber'); assert.equal(nw.address, '100 Example St'); assert.equal(nw.city, 'Austin');
  assert.equal(nw.postcode, '78701'); assert.equal(nw.region, 'TX'); assert.deepEqual(nw.phones, ['+1 512 555 0123']);
  assert.equal(nw.website, 'https://northwind-plumbing.example'); assert.equal(nw.socials.instagram, 'https://instagram.com/northwind.plumbing');
  assert.equal(nw.hours, 'Mo-Fr 08:00-18:00');
  assert.equal(bb.lat, 30.5083); assert.equal(bb.lng, -97.6789);            // way → center
  assert.deepEqual(bb.phones, ['512-555-0142', '512-555-0143']);
  assert.equal(bb.socials.facebook, 'https://www.facebook.com/bluebirdbakery.example');
  assert.deepEqual(bb.emails, ['orders@bluebird-bakery.example']);

  // collect() against a local stand-in for the Overpass endpoint.
  let body = '';
  const s = await listen((req, res) => { req.on('data', d => { body += d; }); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); }); });
  configureHttp({ cacheDir: path.join(tmp(), 'cache'), gap: 0 });
  try {
    const r = await osm.collect({ config: { area: { bbox: [30, -98.1, 30.7, -97.4] } } }, { tags: [['craft', 'plumber']], endpoint: `${baseOf(s)}/api/interpreter` }, { label: 'osm' });
    assert.equal(r.items.length, 2); assert.equal(r.cost_usd, 0);
    assert.match(decodeURIComponent(body), /nwr\["craft"="plumber"\]/);
  } finally { s.close(); }
});

const ITEMS = JSON.parse(fs.readFileSync(path.join(FIX, 'apify-items.json'), 'utf8'));

test('google maps: Apify item → Listing with the google object', () => {
  const l = gmaps.mapItem(ITEMS[0], { label: 'google_maps', run: { segment: 'plumbing', tier: 'A', ticket: 'premium' } });
  assert.equal(l.source_id, 'gmaps:ChIJfictional0001'); assert.equal(l.name, 'Northwind Plumbing');
  assert.equal(l.country, 'US'); assert.equal(l.city, 'Austin'); assert.equal(l.postcode, '78701');
  assert.deepEqual(l.phones, ['+15125550123']); assert.equal(l.website, 'https://northwind-plumbing.example/');
  assert.equal(l.hours, 'Monday: 8 AM to 6 PM; Sunday: Closed'); assert.equal(l.segment, 'plumbing'); assert.equal(l.ticket, 'premium');
  const g = l.google;
  assert.equal(g.place_id, 'ChIJfictional0001'); assert.equal(g.rating, 4.7); assert.equal(g.reviews, 132);
  assert.equal(g.status, 'OPERATIONAL'); assert.equal(g.claimed, false); assert.equal(g.photos_count, 41);
  assert.deepEqual(g.categories, ['Plumber', 'Drainage service']);
  assert.deepEqual(g.match, { basis: 'place_id', confidence: 'high' });
  assert.deepEqual(g.reviews_sample.map(r => [r.date, r.rating, r.owner_reply]), [['2026-08-01', 5, true], ['2026-07-12', 3, false]]);
  const closed = gmaps.mapItem(ITEMS[1]).google;
  assert.equal(closed.status, 'CLOSED_PERMANENTLY'); assert.equal(closed.claimed, true); assert.deepEqual(closed.reviews_sample, []);
});

test('google maps: dry-run plan and cost maths', () => {
  const sc = { type: 'google_maps', budget_usd: 10, max_reviews: 0, location_groups: { north: ['Round Rock, TX', 'Georgetown, TX'] },
    segments: [
      { key: 'plumbing', search: ['plumber', 'drain cleaning'], locations: ['Austin, TX', 'north'], max_per_search: 40 },
      { key: 'hvac', search: ['hvac contractor'], locations: ['Austin, TX'], max_per_search: 50 },
    ] };
  const p = gmaps.plan(sc);
  assert.equal(p.runs.length, 4);                                          // 3 plumbing locations + 1 hvac
  assert.equal(p.places, 3 * 2 * 40 + 50);                                  // 290
  assert.equal(p.cost_usd, estimate({ places: 290 }));
  assert.equal(p.cost_usd, 1.65);                                           // 290 × $5.7/1k
  assert.deepEqual(p.by_segment.plumbing, { runs: 3, places: 240, cost_usd: 1.37 });
  assert.equal(gmaps.plan({ ...sc, max_reviews: 5 }).cost_usd, 2.47);       // 290 × $8.5/1k
  assert.equal(gmaps.plan({ ...sc, rates: { place_per_1k: 10 } }).cost_usd, 2.9);
  const small = gmaps.plan(sc, { limit: 10 });
  assert.equal(small.runs.length, 1); assert.equal(small.places, 10); assert.equal(small.cost_usd, 0.06);
  assert.match(gmaps.formatPlan(p), /4 Apify run\(s\), up to 290 places/);
});

// A stand-in for the Apify API: usage grows by $0.25 per finished run.
async function apifyMock() {
  const m = { usage: 10, limit: 100, posts: [], stateAtPost: [] };
  const s = await listen((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const send = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      assert.equal(req.headers.authorization, 'Bearer test-token');
      if (req.url.startsWith('/users/me/limits')) return send({ data: { current: { monthlyUsageUsd: m.usage }, limits: { maxMonthlyUsageUsd: m.limit } } });
      if (req.method === 'POST' && /^\/acts\/[^/]+\/runs/.test(req.url)) {
        m.posts.push({ url: req.url, input: JSON.parse(body) }); m.stateAtPost.push(m.lastSaved);
        const id = `run${m.posts.length}`;
        return send({ data: { id, defaultDatasetId: `ds${m.posts.length}`, status: 'RUNNING' } });
      }
      if (req.url.startsWith('/actor-runs/')) { m.usage += 0.25; return send({ data: { id: req.url.split('/')[2], status: 'SUCCEEDED', defaultDatasetId: 'ds', usageTotalUsd: 0.25 } }); }
      if (req.url.startsWith('/datasets/')) return send(new URL(req.url, 'http://x').searchParams.get('offset') === '0' ? ITEMS : []);
      res.writeHead(404); res.end('{}');
    });
  });
  return { s, m };
}

test('google maps --go: state saved before each POST, stops at the budget, never re-runs a collected run', async () => {
  const { s, m } = await apifyMock();
  process.env.APIFY_BASE_URL = baseOf(s);
  try {
    const sc = { type: 'google_maps', budget_usd: 0.3, segments: [{ key: 'plumbing', search: ['plumber'], locations: ['Austin, TX', 'Round Rock, TX'], max_per_search: 40 }] };
    const project = { env: { APIFY_TOKEN: 'test-token' }, config: {} };
    const checkpoint = x => { m.lastSaved = JSON.parse(JSON.stringify(x.state)); };
    const r = await gmaps.collect(project, sc, { go: true, pollMs: 1, checkpoint });
    assert.equal(m.posts.length, 1);                                       // run 2 ($0.23) would cross the $0.30 budget
    assert.match(r.stopped, /budget/);
    assert.ok(m.stateAtPost[0].runs['plumbing|Austin, TX'].posting, 'state was not saved before the POST');
    assert.match(m.posts[0].url, /maxTotalChargeUsd=0\.50/);
    assert.equal(m.posts[0].input.locationQuery, 'Austin, TX'); assert.equal(m.posts[0].input.maxReviews, 0);
    assert.equal(r.items.length, 2); assert.equal(r.state.runs['plumbing|Austin, TX'].collected, true);
    assert.equal(r.cost_usd, 0.25);
    // Re-run with the saved state and a bigger budget: only the missing run is started.
    const r2 = await gmaps.collect(project, { ...sc, budget_usd: 5 }, { go: true, pollMs: 1, prev: { items: r.items, state: r.state }, checkpoint });
    assert.equal(m.posts.length, 2);
    assert.equal(m.posts[1].input.locationQuery, 'Round Rock, TX');
    assert.equal(r2.items.length, 2);                                     // same places again: deduped by place id
    // Dry run never calls the API.
    const dry = await gmaps.collect({ env: {} }, sc, {});
    assert.equal(dry.dry_run, true); assert.equal(m.posts.length, 2);
  } finally { s.close(); delete process.env.APIFY_BASE_URL; }
});

test('apify runOnce: a run whose id was lost is found again instead of paid twice', async () => {
  const started = new Date(Date.now() - 1000).toISOString();
  let posts = 0;
  const s = await listen((req, res) => {
    const send = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST') { posts++; return send({ data: { id: 'new', defaultDatasetId: 'dsn' } }); }
    if (req.url.startsWith('/acts/')) return send({ data: { items: [{ id: 'lost', defaultDatasetId: 'dsl', startedAt: new Date().toISOString() }] } });
    if (req.url.startsWith('/actor-runs/')) return send({ data: { status: 'SUCCEEDED', defaultDatasetId: 'dsl' } });
    if (req.url.startsWith('/datasets/')) return send([{ placeId: 'x' }]);
    res.writeHead(404); res.end('{}');
  });
  try {
    const state = { runs: { k: { key: 'k', created: started, posting: true } } };
    const r = await runOnce({ state, key: 'k', actor: 'a~b', input: {}, token: 't', baseUrl: baseOf(s), pollMs: 1 });
    assert.equal(posts, 0); assert.equal(state.runs.k.runId, 'lost'); assert.equal(r.items.length, 1);
    const again = await runOnce({ state, key: 'k', actor: 'a~b', input: {}, token: 't', baseUrl: baseOf(s), pollMs: 1 });
    assert.equal(again.skipped, true); assert.equal(posts, 0);
  } finally { s.close(); }
});
