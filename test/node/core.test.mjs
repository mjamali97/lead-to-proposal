import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { parseCSV, toCSV, parseArgs, slugify, safeName, writeJSON, readJSON, pool } from '../../lib/io.mjs';
import { deepMerge, initProject, loadProject, validate, checkProject } from '../../lib/project.mjs';
import { parseRobots, robotsAllows, configureHttp, get, jsonLd, stripTags, attr, sitemapLocs } from '../../lib/http.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-core-'));
const CLI = path.resolve(import.meta.dirname, '../../bin/l2p.mjs');

test('CSV round trip keeps quotes, commas and newlines', () => {
  const rows = [{ a: 'x, y', b: 'say "hi"', c: 'line1\nline2' }, { a: '', b: 'plain', c: '' }];
  const back = parseCSV(toCSV(rows, ['a', 'b', 'c']));
  assert.deepEqual(back, rows);
});

test('parseCSV handles BOM and CRLF', () => {
  assert.deepEqual(parseCSV('﻿Name,City\r\nA,B\r\n'), [{ Name: 'A', City: 'B' }]);
});

test('parseArgs: flags, values, = form, positionals', () => {
  assert.deepEqual(parseArgs(['queue', '--go', '--limit', '20', '--source=osm', '--dry-run']),
    { _: ['queue'], go: true, limit: '20', source: 'osm', dryRun: true });
});

test('slugify and safeName', () => {
  assert.equal(slugify('Café Müller & Söhne!'), 'cafe-muller-sohne');
  assert.equal(safeName('A/B: "C"'), 'A B C');
});

test('writeJSON is atomic and readable', () => {
  const f = path.join(tmp(), 'x', 'a.json');
  writeJSON(f, { ok: 1 });
  assert.deepEqual(readJSON(f), { ok: 1 });
  assert.equal(fs.readdirSync(path.dirname(f)).length, 1);
});

test('pool limits concurrency and keeps order', async () => {
  let live = 0, peak = 0;
  const out = await pool([1, 2, 3, 4, 5, 6], 2, async n => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 5)); live--; return n * 2; });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
  assert.equal(peak, 2);
});

test('deepMerge replaces arrays and merges objects', () => {
  assert.deepEqual(deepMerge({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] } }), { a: { b: 1, c: [3] }, d: 1 });
});

test('initProject + loadProject apply defaults and strip notes', () => {
  const dir = path.join(tmp(), 'proj');
  initProject(dir);
  const p = loadProject(dir);
  assert.equal(p.config.market.country, 'US');
  assert.ok(!('_help' in p.config));
  assert.ok(p.paths.scored.endsWith(path.join('data', 'scored.json')));
  assert.ok(fs.existsSync(path.join(dir, '.env')));
  assert.throws(() => initProject(dir), /already has/);
});

test('validate rejects bad config', () => {
  assert.throws(() => validate({ market: { country: 'USA', currency: 'USD' }, sources: [] }), /2-letter/);
  assert.throws(() => validate({ market: { country: 'US', currency: 'USD' }, sources: [{ type: 'ftp' }] }), /not one of/);
  assert.throws(() => validate({ market: { country: 'US', currency: 'USD' }, sources: [], area: { bbox: [1, 2, 0, 3] } }), /bbox/);
});

test('robots.txt: specific agent group, longest match, allow ties', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$\n\nUser-agent: lead-to-proposal\nDisallow: /nope');
  assert.equal(robotsAllows(rules, '/nope'), false);
  assert.equal(robotsAllows(rules, '/private'), true);   // our own group wins over *
  const star = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$');
  assert.equal(robotsAllows(star, '/private/x'), false);
  assert.equal(robotsAllows(star, '/private/ok/1'), true);
  assert.equal(robotsAllows(star, '/file.pdf'), false);
  assert.equal(robotsAllows(star, '/file.pdf?x'), true);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:'), '/a'), true);
});

test('HTML helpers', () => {
  assert.equal(stripTags('<p>A&amp;B</p><script>x()</script><div>C</div>'), 'A&B\nC');
  assert.equal(attr('<a href="/x" class=y>', 'class'), 'y');
  assert.deepEqual(jsonLd('<script type="application/ld+json">[{"@type":"Plumber"},{"@graph":[{"@type":"Person"}]}]</script>').map(n => n['@type']), ['Plumber', 'Person']);
  assert.deepEqual(sitemapLocs('<urlset><url><loc>https://a.example/1</loc></url><url><loc><![CDATA[https://a.example/2]]></loc></url></urlset>'), ['https://a.example/1', 'https://a.example/2']);
});

test('get(): caches answers, respects robots, never caches transport failures', async () => {
  let hits = 0;
  const srv = http.createServer((req, res) => {
    hits++;
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /secret'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h1>ok</h1>');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  configureHttp({ cacheDir: path.join(tmp(), 'cache'), gap: 5, respectRobots: true });
  try {
    const a = await get(`${base}/page`);
    assert.equal(a.status, 200);
    const before = hits;
    const b = await get(`${base}/page`);
    assert.equal(b.cached, true);
    assert.equal(hits, before);
    const s = await get(`${base}/secret`);
    assert.equal(s.robots, true);
    const dead = await get('http://127.0.0.1:1/nothing', { retries: 0, skipRobots: true, timeout: 500 });
    assert.equal(dead.status, 0);
    const again = await get('http://127.0.0.1:1/nothing', { retries: 0, skipRobots: true, timeout: 500 });
    assert.ok(!again.cached);
  } finally { srv.close(); }
});

test('CLI: help, init, unknown command', () => {
  const h = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /l2p collect/);
  const dir = path.join(tmp(), 'cli-proj');
  const i = spawnSync(process.execPath, [CLI, 'init', dir], { encoding: 'utf8' });
  assert.equal(i.status, 0, i.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'project.json')));
  const u = spawnSync(process.execPath, [CLI, 'nope', '--project', dir], { encoding: 'utf8' });
  assert.equal(u.status, 2);
  assert.match(u.stderr, /Unknown command/);
});

test('doctor: a broken project.json is reported, not "none here yet"', () => {
  const dir = path.join(tmp(), 'broken');
  initProject(dir);
  assert.ok(checkProject(dir).project, 'a fresh project is valid');
  assert.equal(checkProject(path.join(tmp(), 'empty')).found, false);
  fs.writeFileSync(path.join(dir, 'project.json'), '{ "market": { "country": "US", ');
  const bad = checkProject(dir);
  assert.ok(bad.found && !bad.project);
  assert.match(bad.error, /not valid JSON/);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ market: { country: 'USA' } }));
  assert.match(checkProject(dir).error, /2-letter country code/);
  const d = spawnSync(process.execPath, [CLI, 'doctor'], { cwd: dir, encoding: 'utf8' });
  assert.equal(d.status, 1);
  assert.match(d.stdout, /FIX +project\.json/);
  assert.match(d.stdout, /2-letter country code/);
  assert.doesNotMatch(d.stdout, /none here yet/);
});

test('init: the paid source is off, so a fresh project needs no Apify token', () => {
  const dir = path.join(tmp(), 'fresh');
  initProject(dir);
  const p = loadProject(dir);
  const gm = p.config.sources.find(s => s.type === 'google_maps');
  assert.equal(gm.enabled, false);
  assert.match(readJSON(path.join(dir, 'project.json')).sources.find(s => s.type === 'google_maps')._help, /enabled to true.*APIFY_TOKEN/);
  assert.ok(p.config.sources.some(s => s.enabled !== false), 'a free source is on, so `l2p collect` has something to run');
  assert.ok(!p.config.google_lookup.enabled);
  const d = spawnSync(process.execPath, [CLI, 'doctor', '--project', dir], { encoding: 'utf8' });
  assert.match(d.stdout, /ok +APIFY_TOKEN +not needed/);
  assert.doesNotMatch(d.stdout, /FIX +(APIFY_TOKEN|project\.json)/);
});
