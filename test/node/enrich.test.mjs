import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { writeJSON, readJSON } from '../../lib/io.mjs';
import { loadProject } from '../../lib/project.mjs';
import { run, sitesToCrawl } from '../../stages/enrich.mjs';
import { waybackDates, resetWayback } from '../../lib/wayback.mjs';
import { serveSite } from '../fixtures/sites/server.mjs';

const quiet = async fn => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

// Fake archive.org CDX endpoint: answers by the `limit` parameter; `mode` switches failure behaviour.
async function fakeCdx() {
  const hits = []; let mode = 'ok';
  const server = http.createServer((req, res) => {
    const q = new URL(req.url, 'http://x').searchParams; hits.push(Object.fromEntries(q));
    if (mode === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>Service Unavailable</html>'); }
    if (mode === 'empty') return res.end('');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (q.get('limit') === '1') return res.end(JSON.stringify([['timestamp'], ['20110305120000']]));
    res.end(JSON.stringify([['timestamp', 'digest'], ['20190101000000', 'AAA'], ['20220615000000', 'BBB'], ['20240210000000', 'CCC']]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { endpoint: `http://127.0.0.1:${server.address().port}/cdx`, hits, setMode: m => { mode = m; }, close: () => new Promise(r => server.close(r)) };
}

function makeProject(businesses, crawl = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-enrich-'));
  writeJSON(path.join(dir, 'project.json'), { name: 't', market: { country: 'US', currency: 'USD' }, sources: [],
    crawl: { gap_ms: 0, timeout_ms: 3000, concurrency: 3, max_pages: 3, respect_robots: true, ...crawl } });
  writeJSON(path.join(dir, 'data', 'businesses.json'), { updated: '2026-10-12', items: businesses });
  return loadProject(dir);
}

test('sitesToCrawl: own sites only, one crawl per site, Google website added when different', () => {
  const w = sitesToCrawl([
    { id: 'b1', website: 'https://www.alpha.example/', website_kind: 'site', country: 'US' },
    { id: 'b2', website: 'https://alpha.example/contact', website_kind: 'site' },
    { id: 'b3', website: 'https://instagram.com/beta.example', website_kind: 'social', google: { website: 'https://beta.example/' } },
    { id: 'b4', website: 'https://gamma.wixsite.com/x', website_kind: 'free_subdomain' },
    { id: 'b5', website: '', website_kind: 'none', google: { website: 'https://www.facebook.com/delta' } },
  ], 'US');
  assert.deepEqual(w.map(x => [x.key, x.business_ids]), [['alpha.example', ['b1', 'b2']], ['beta.example', ['b3']]]);
});

test('enrich stage: crawls each site once, writes the Site shape without HTML, resumes, --limit/--only/--refresh', async () => {
  const modern = await serveSite('modern'), parked = await serveSite('parked'), german = await serveSite('german');
  try {
    const project = makeProject([
      { id: 'b_modern', name: 'Brightpath', website: modern.url, website_kind: 'site', country: 'US' },
      { id: 'b_modern2', name: 'Brightpath Kids', website: modern.url + 'kids/', website_kind: 'site', country: 'US' },
      { id: 'b_parked', name: 'Quiet Creek', website: parked.url, website_kind: 'site' },
      { id: 'b_social', name: 'Insta only', website: 'https://instagram.com/someone.example', website_kind: 'social' },
    ]);
    const r1 = await quiet(() => run(project, { limit: 1 }));
    assert.equal(r1.log.crawled, 1);
    const r2 = await quiet(() => run(project, {}));
    assert.equal(r2.log.crawled, 1, 'only the remaining site is crawled');
    assert.deepEqual(r2.log.states, { ok: 1, parked: 1 });
    assert.equal(typeof r2.log.avg_seo, 'number');

    const raw = fs.readFileSync(project.paths.sites, 'utf8');
    assert.ok(!/<html|<body|<script/i.test(raw), 'no raw HTML in sites.json');
    const { items } = readJSON(project.paths.sites);
    const key = new URL(modern.url).host;
    const s = items[key];
    for (const k of ['url', 'final_url', 'status', 'ok', 'state', 'pages', 'signals', 'seo', 'phones', 'emails', 'socials', 'owner', 'brand', 'crawled_at']) assert.ok(k in s, `missing ${k}`);
    for (const k of ['https', 'viewport', 'tel_link', 'form', 'booking_widget', 'chat_widget', 'builder', 'footer_year', 'ua_tag', 'gtm', 'google_ads', 'meta_pixel',
      'tiktok_pixel', 'incumbent_agency', 'no_cem_statement', 'coming_soon', 'parked', 'has_impressum', 'wayback_first', 'wayback_last_change']) assert.ok(k in s.signals, `missing signals.${k}`);
    assert.deepEqual(Object.keys(s.seo.categories), ['crawl', 'meta', 'headings', 'images', 'perf', 'schema', 'links', 'mobile']);
    assert.deepEqual(s.business_ids, ['b_modern', 'b_modern2']);
    assert.deepEqual(s.pages.map(p => p.kind), ['home', 'contact', 'about']);       // max_pages: 3
    assert.ok(s.pages.every(p => !('body' in p)));
    assert.deepEqual(Object.keys(s.phones[0]).sort(), ['cc', 'e164', 'ext', 'how', 'key', 'page', 'raw', 'type', 'valid']);
    assert.equal(s.owner.name, 'Dr. Maya Ellison');
    assert.ok(s.brand.logo[0].url.endsWith('/img/brightpath-logo.svg'));
    const p = items[new URL(parked.url).host];
    assert.equal(p.state, 'parked'); assert.equal(p.seo, null); assert.equal(p.brand, null); assert.equal(p.owner.confidence, 'not published');

    const before = modern.hits.length;
    const r3 = await quiet(() => run(project, {}));
    assert.equal(r3.log.crawled, 0);
    assert.equal(modern.hits.length, before, 'a finished site is not fetched again');

    const r4 = await quiet(() => run(project, { only: german.url }));
    assert.equal(r4.log.crawled, 1);
    assert.equal(readJSON(project.paths.sites).items[new URL(german.url).host].owner.name, 'Jonas Feldhaus');

    await quiet(() => run(project, { refresh: true }));
    assert.ok(modern.hits.length > before, '--refresh crawls again');
  } finally { await Promise.all([modern.close(), parked.close(), german.close()]); }
});

test('wayback: first capture and last content change, cached; failures are never cached', async () => {
  const cdx = await fakeCdx();
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-wb-'));
  const o = { endpoint: cdx.endpoint, cacheDir, gap: 0, timeout: 2000 };
  try {
    resetWayback();
    assert.deepEqual(await waybackDates('https://www.oakline.example/', o), { first_seen: '2011-03-05', last_change: '2024-02-10', captures: 3, checked: new Date().toISOString().slice(0, 10) });
    assert.equal(cdx.hits[1].collapse, 'digest');
    const n = cdx.hits.length;
    assert.equal((await waybackDates('oakline.example', o)).last_change, '2024-02-10');
    assert.equal(cdx.hits.length, n, 'second call served from cache');
    assert.ok(readJSON(path.join(cacheDir, 'wayback.json'))['oakline.example']);

    cdx.setMode('html');                                          // an error page is not an answer
    assert.equal(await waybackDates('https://mapleworks.example/', o), null);
    cdx.setMode('ok');
    resetWayback();
    assert.equal((await waybackDates('https://mapleworks.example/', o)).first_seen, '2011-03-05', 'retried later, not stuck as "no archive"');

    cdx.setMode('empty');                                         // a real "no captures" answer is remembered
    const none = await waybackDates('https://brandnew.example/', o);
    assert.deepEqual([none.first_seen, none.last_change, none.captures], [null, null, 0]);

    resetWayback();
    assert.equal(await waybackDates('https://unreachable.example/', { ...o, endpoint: 'http://127.0.0.1:9/cdx' }), null);
    assert.ok(!readJSON(path.join(cacheDir, 'wayback.json'))['unreachable.example']);

    assert.equal((await waybackDates('https://www.facebook.com/somebiz', o)).skipped, 'not an own website');
  } finally { await cdx.close(); resetWayback(); }
});

test('enrich --wayback dates ok sites through the configured endpoint', async () => {
  const cdx = await fakeCdx(); const site = await serveSite('modern');
  try {
    resetWayback();
    const project = makeProject([{ id: 'b1', website: site.url, website_kind: 'site' }], { wayback_endpoint: cdx.endpoint });
    const r = await quiet(() => run(project, { wayback: true }));
    assert.equal(r.log.dated, 1);
    const s = Object.values(readJSON(project.paths.sites).items)[0];
    assert.equal(s.signals.wayback_first, '2011-03-05');
    assert.equal(s.signals.wayback_last_change, '2024-02-10');
  } finally { await cdx.close(); await site.close(); resetWayback(); }
});
