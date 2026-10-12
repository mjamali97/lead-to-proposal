import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { initProject, loadProject } from '../../lib/project.mjs';
import { readJSON, writeJSON } from '../../lib/io.mjs';
import { parsePhone } from '../../lib/normalize.mjs';
import * as collect from '../../stages/collect.mjs';
import * as merge from '../../stages/merge.mjs';
import * as google from '../../stages/google.mjs';
import * as status from '../../stages/status.mjs';

const FIX = path.resolve(import.meta.dirname, '../fixtures/leads');
const quiet = async fn => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };

function makeProject() {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-lead-')), 'proj');
  initProject(dir, { name: 'test' });
  fs.copyFileSync(path.join(FIX, 'leads.csv'), path.join(dir, 'my-leads.csv'));
  const pj = readJSON(path.join(dir, 'project.json'));
  pj.area = { name: 'Test area', bbox: null, center: null, radius_km: null, cities: ['austin', 'round rock'] };
  pj.sources = [
    { type: 'csv', enabled: true, file: 'my-leads.csv' },
    { type: 'google_maps', enabled: false, budget_usd: 5, segments: [{ key: 'plumbing', search: ['plumber'], locations: ['Austin, TX'], max_per_search: 20 }] },
  ];
  writeJSON(path.join(dir, 'project.json'), pj);
  return loadProject(dir);
}

test('collect(csv) → merge: normalised, area-filtered, deduplicated', async () => {
  const project = makeProject();
  const c = await quiet(() => collect.run(project, {}));
  assert.equal(c.log.items, 6); assert.equal(c.log.cost_usd, 0);
  const raw = readJSON(path.join(project.paths.raw, 'csv.json'));
  assert.equal(raw.source, 'csv'); assert.equal(raw.items.length, 6); assert.ok(raw.updated);

  const m = await quiet(() => merge.run(project, {}));
  assert.equal(m.log.listings, 6);
  const biz = readJSON(project.paths.businesses).items;
  const dropped = readJSON(project.paths.dropped).items;
  const report = readJSON(project.paths.mergeReport);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].name, 'Faraway Roofing'); assert.match(dropped[0].reason, /Dallas/);
  assert.equal(biz.length, 4);                                    // the two Northwind rows are one business
  const nw = biz.find(b => b.names.includes('Northwind Plumbing'));
  assert.deepEqual(nw.names, ['Northwind Plumbing', 'Northwind Plumbing & Drain']);
  assert.equal(nw.phones.length, 1); assert.equal(nw.phones[0].e164, '+15125550123');
  assert.equal(nw.website_kind, 'site'); assert.equal(nw.category_group, 'trades'); assert.equal(nw.ticket, 'premium');
  assert.equal(nw.sources.length, 2); assert.equal(nw.country, 'US');
  const cedar = biz.find(b => b.name === 'Cedar Hair Studio');
  assert.equal(cedar.website_kind, 'social'); assert.equal(cedar.socials.instagram, 'https://instagram.com/cedar.hair.studio');
  assert.equal(cedar.category_group, 'beauty');
  assert.equal(biz.find(b => b.name === 'Bluebird Bakery').category_group, 'food');
  assert.equal(report.listings, 6); assert.equal(report.dropped, 1); assert.equal(report.businesses, 4);
  assert.ok(report.keys_used.phone >= 1); assert.equal(report.clusters.length, 1);

  // Re-running collect (resumable) and merge gives the same ids.
  await quiet(() => collect.run(project, {}));
  await quiet(() => merge.run(project, {}));
  assert.deepEqual(readJSON(project.paths.businesses).items.map(b => b.id).sort(), biz.map(b => b.id).sort());

  const s = await quiet(() => status.run(project));
  assert.equal(s.log.businesses, 4); assert.equal(s.log.raw.csv, 6);
});

test('collect: Google Maps is a dry run without --go; unknown --source is an error', async () => {
  const project = makeProject();
  const out = [];
  const l = console.log; console.log = (...a) => out.push(a.join(' '));
  let r;
  try { r = await collect.run(project, { source: 'google_maps' }); } finally { console.log = l; }
  assert.equal(r.log.dry_runs, 1); assert.equal(r.log.cost_usd, 0);
  assert.equal(r.log.sources.google_maps.places_max, 20);
  assert.match(out.join('\n'), /1 Apify run\(s\), up to 20 places.* at most \$0\.11/);
  assert.match(out.join('\n'), /Dry run/);
  assert.ok(!fs.existsSync(path.join(project.paths.raw, 'google_maps.json')));
  await assert.rejects(collect.run(project, { source: 'nope' }), /No source matches/);
  await assert.rejects(collect.run(project, { source: 'google_maps', go: true }), /APIFY_TOKEN/);
});

test('google: match rules', () => {
  const cfg = { market: { country: 'US' } };
  const b = { name: 'Northwind Plumbing', names: ['Northwind Plumbing'], country: 'US', lat: 30.2672, lng: -97.7431, city: 'Austin', postcode: '78701',
    phones: [parsePhone('512-555-0123', { country: 'US' })], website: 'https://northwind-plumbing.example/', sources: [] };
  const it = o => ({ title: 'Northwind Plumbing', placeId: 'P1', countryCode: 'US', location: { lat: 30.2672, lng: -97.7431 }, ...o });
  assert.deepEqual(google.validate(b, it({ phoneUnformatted: '+15125550123' }), cfg).basis, 'phone');
  assert.equal(google.validate(b, it({ website: 'https://www.northwind-plumbing.example/contact' }), cfg).confidence, 'high');
  assert.equal(google.validate({ ...b, place_id: 'P1' }, it({ title: 'Totally Different' }), cfg).basis, 'place_id');
  assert.equal(google.validate(b, it({ location: { lat: 30.2690, lng: -97.7431 } }), cfg).confidence, 'medium');          // ~200 m
  assert.equal(google.validate(b, it({ title: 'Northwind Plumbing Services', location: { lat: 30.2690, lng: -97.7431 } }), cfg).confidence, 'medium');
  assert.equal(google.validate(b, it({ title: 'Northwind Plumbers', location: { lat: 30.2675, lng: -97.7431 } }), cfg).confidence, 'low');  // ~30 m
  assert.equal(google.validate(b, it({ title: 'Northwind Plumbers', location: { lat: 30.2700, lng: -97.7431 } }), cfg).status, 'rejected');
  assert.equal(google.validate(b, it({ location: { lat: 30.30, lng: -97.7431 } }), cfg).status, 'rejected');                 // 3.6 km
  assert.equal(google.validate(b, it({ title: 'Lakeside Realty', phoneUnformatted: '+15125550123' }), cfg).status, 'rejected'); // shared line
  assert.equal(google.validate(b, it({ countryCode: 'CA' }), cfg).status, 'rejected');
  assert.equal(google.validate(b, null, cfg).status, 'no_match');
  const biz = [{ ...b, flags: [], phones: [], sources: [{ id: 'csv:1' }] }];
  google.attachGoogle(biz, { results: { x: { status: 'matched', confidence: 'low', basis: 'name+geo', source_ids: ['csv:1'], google: { place_id: 'P7', phone: '+15125550109' } } } });
  assert.equal(biz[0].google.place_id, 'P7'); assert.deepEqual(biz[0].flags, ['verify-match']);
  assert.equal(biz[0].phones.length, 0);                                    // low matches never add contact data
  assert.equal(google.queryFor({ name: 'Northwind Plumbing | Best in town', address: '100 Example St', city: 'Austin', country: 'US' }), 'Northwind Plumbing, 100 Example St, Austin, United States');
  assert.equal(google.queryFor({ name: 'Bluebird Bakery', city: 'Round Rock', postcode: '78664' }, cfg), 'Bluebird Bakery, Round Rock, 78664, United States');
});

test('google: dry run by default; --go matches, attaches and merges pass 2 by place id', async () => {
  const project = makeProject();
  await quiet(() => collect.run(project, {}));
  await quiet(() => merge.run(project, {}));
  const dry = await quiet(() => google.run(project, {}));
  assert.equal(dry.log.dry_run, true); assert.equal(dry.log.todo, 4); assert.equal(dry.log.cost_usd, 0);
  assert.ok(!fs.existsSync(project.paths.google));

  // Stand-in Apify: Northwind found by phone; Bluebird and Redwood both map to the same Google place.
  const usage = { v: 1 };
  const posts = [];
  const answers = q => q.startsWith('Northwind') ? { title: 'Northwind Plumbing', placeId: 'PN', phoneUnformatted: '+15125550123', countryCode: 'US', totalScore: 4.8, reviewsCount: 50, location: { lat: 30.27, lng: -97.74 } }
    : q.startsWith('Bluebird') ? { title: 'Bluebird Bakery', placeId: 'PB', phoneUnformatted: '+15125550142', countryCode: 'US' }
    : q.startsWith('Redwood') ? { title: 'Redwood Dental', placeId: 'PB', phoneUnformatted: '+15125550177', countryCode: 'US' } : null;
  let dataset = [];
  const s = await new Promise(res => { const srv = http.createServer((req, rq) => {
    let body = ''; req.on('data', d => { body += d; });
    req.on('end', () => {
      const send = o => { rq.writeHead(200, { 'content-type': 'application/json' }); rq.end(JSON.stringify(o)); };
      if (req.url.startsWith('/users/me/limits')) return send({ data: { current: { monthlyUsageUsd: usage.v }, limits: { maxMonthlyUsageUsd: 50 } } });
      if (req.method === 'POST') {
        const input = JSON.parse(body); posts.push(input);
        dataset = input.searchStringsArray.map(q => answers(q) && { searchString: q, ...answers(q) }).filter(Boolean);
        return send({ data: { id: 'r1', defaultDatasetId: 'd1' } });
      }
      if (req.url.startsWith('/actor-runs/')) { usage.v += 0.02; return send({ data: { status: 'SUCCEEDED', defaultDatasetId: 'd1', usageTotalUsd: 0.02 } }); }
      if (req.url.startsWith('/datasets/')) return send(new URL(req.url, 'http://x').searchParams.get('offset') === '0' ? dataset : []);
      rq.writeHead(404); rq.end('{}');
    });
  }); srv.listen(0, '127.0.0.1', () => res(srv)); });
  process.env.APIFY_BASE_URL = `http://127.0.0.1:${s.address().port}`;
  project.env.APIFY_TOKEN = 'test-token';
  try {
    const r = await quiet(() => google.run(project, { go: true, budget: 1, pollMs: 1 }));
    assert.equal(posts.length, 1); assert.equal(posts[0].maxCrawledPlacesPerSearch, 1); assert.equal(posts[0].searchStringsArray.length, 4);
    assert.equal(r.log.looked_up, 4); assert.equal(r.log.matched, 3);
    assert.equal(r.log.cost_usd, 0.02);
    const g = readJSON(project.paths.google);
    assert.equal(Object.values(g.results).filter(x => x.status === 'matched').length, 3);
    assert.ok(Object.values(g.runs)[0].collected);
    const biz = readJSON(project.paths.businesses).items;
    assert.equal(biz.length, 3);                                   // Bluebird + Redwood share Google place PB → merged in pass 2
    const nw = biz.find(b => b.names.includes('Northwind Plumbing'));
    assert.equal(nw.google.place_id, 'PN'); assert.deepEqual(nw.google.match, { basis: 'phone', confidence: 'high' });
    assert.equal(readJSON(project.paths.mergeReport).google_pass.merged, 1);
    // Nothing is looked up twice; a re-merge keeps the Google data.
    const again = await quiet(() => google.run(project, { go: true, budget: 1, pollMs: 1 }));
    assert.equal(posts.length, 1); assert.equal(again.log.looked_up, 0);
    await quiet(() => merge.run(project, {}));
    const re = readJSON(project.paths.businesses).items;
    assert.equal(re.length, 3); assert.equal(re.find(b => b.names.includes('Northwind Plumbing')).google.place_id, 'PN');
  } finally { s.close(); delete process.env.APIFY_BASE_URL; }
});
