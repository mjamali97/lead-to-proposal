import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJSON, readJSON } from '../../lib/io.mjs';
import { initProject, loadProject, PLUGIN } from '../../lib/project.mjs';
import { queue, selectRows, factsFor, workerArgs, readBrief, findPackage } from '../../stages/proposals.mjs';
import { spawnSync } from 'node:child_process';
import { renderProposal, loadStrings, esc, hasDigit, textDir, fontsFor } from '../../templates/proposal/proposal.mjs';

// Fictional businesses only: .example domains, 555 numbers.
const row = (n, tier, priority, extra = {}) => ({
  id: `b_${String(n).padStart(12, '0')}`, name: `Test Plumbing ${n}`, category: 'Plumber', category_group: 'trades',
  city: 'Springfield', country: 'US', phones: [{ e164: `+1512555010${n}`, raw: `(512) 555-010${n}` }],
  website: `https://plumbing${n}.example`, site_key: `plumbing${n}.example`, tier, priority, need: priority, interest: priority,
  disqualified: null, ...extra,
});

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-proposals-'));
  initProject(dir);
  const rows = [row(1, 'A', 80), row(2, 'B', 50), row(3, 'A', 90, { disqualified: { reason: 'chain', detail: 'franchise' } }),
    row(4, 'C', 30), row(5, 'A', 70)];
  writeJSON(path.join(dir, 'data', 'scored.json'), { updated: '2026-10-12', items: rows });
  writeJSON(path.join(dir, 'data', 'sites.json'), { updated: '2026-10-12', items: { 'plumbing1.example': { url: 'https://plumbing1.example', ok: true, brand: { colors: [] } } } });
  return loadProject(dir);
}
const quiet = fn => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };

test('queue picks tiers by priority, skips disqualified rows and writes job.json', () => {
  const p = project();
  quiet(() => queue(p, { _: ['queue'] }));
  const folders = fs.readdirSync(p.paths.proposals).filter(f => !f.startsWith('.')).sort();
  assert.deepEqual(folders, ['Test Plumbing 1', 'Test Plumbing 2', 'Test Plumbing 5']);
  const job = readJSON(path.join(p.paths.proposals, 'Test Plumbing 1', 'job.json'));
  for (const k of ['id', 'slug', 'folder', 'date', 'date_label', 'business', 'site', 'agency', 'market', 'offer', 'facts', 'paths']) assert.ok(k in job, k);
  assert.equal(job.business.name, 'Test Plumbing 1');
  assert.equal(job.site.url, 'https://plumbing1.example');
  assert.deepEqual(job.offer, p.config.offer);
  assert.equal(job.facts.ad_cost.fact_id, 'ads:home_services');
  assert.match(job.facts.ad_cost.number, /^\$\d+$/);
  assert.ok(job.facts.web_facts.length > 3 && job.facts.web_facts.every(f => f.fact_id && f.source_line));
  assert.ok(fs.existsSync(job.paths.render) && fs.existsSync(job.paths.landing_brief));
  const order = folders.map(f => readJSON(path.join(p.paths.proposals, f, 'status.json')));
  assert.ok(order.every(s => s.stage === 'queued' && s.attempts === 0));
  assert.equal(readJSON(path.join(p.paths.proposals, 'Test Plumbing 1', 'status.json')).order, 1);
});

test('queue respects --limit, --only, and never overwrites finished packages', () => {
  const p = project();
  quiet(() => queue(p, { _: ['queue'], limit: '1' }));
  assert.deepEqual(fs.readdirSync(p.paths.proposals).filter(f => !f.startsWith('.')), ['Test Plumbing 1']);
  quiet(() => queue(p, { _: ['queue'], only: 'Test Plumbing 4' }));          // any tier with --only
  assert.ok(fs.existsSync(path.join(p.paths.proposals, 'Test Plumbing 4', 'job.json')));
  quiet(() => queue(p, { _: ['queue'], only: 'b_000000000003' }));           // disqualified: never
  assert.ok(!fs.existsSync(path.join(p.paths.proposals, 'Test Plumbing 3')));
  const st = path.join(p.paths.proposals, 'Test Plumbing 1', 'status.json');
  writeJSON(st, { stage: 'done', attempts: 1 });
  quiet(() => queue(p, { _: ['queue'] }));
  assert.equal(readJSON(st).stage, 'done');
});

test('selectRows filters disqualified rows even when their tier matches', () => {
  const rows = [row(1, 'A', 10, { disqualified: { reason: 'competitor' } }), row(2, 'A', 5)];
  assert.deepEqual(selectRows(rows, { tiers: ['A'] }).map(r => r.id), ['b_000000000002']);
});

test('factsFor maps benchmark aliases and regional facts', () => {
  const cfg = { market: { country: 'CA', currency: 'CAD' }, categories: { ads_benchmark_industry: { health: 'dentists' } } };
  const f = factsFor(cfg, { category_group: 'health', country: 'CA' });
  assert.equal(f.industry_key, 'dental');
  assert.match(f.ad_cost.number, /^US\$/);
  const ids = f.web_facts.map(x => x.fact_id);
  assert.ok(ids.some(i => i.startsWith('statcan')) && !ids.some(i => i.startsWith('eurostat')));
});

const DEMO = path.join(PLUGIN, 'examples', 'demo', 'package');
const demo = () => ({ data: readJSON(path.join(DEMO, 'proposal-data.json')), job: readJSON(path.join(DEMO, 'job.json')) });

test('template escapes every text and uses the offer and agency from job.json', () => {
  const { data, job } = demo();
  data.business.name = '<script>alert(1)</script>';
  data.sales.cover_headline = 'Fine. "><img src=x onerror=alert(1)>';
  data.sales.values[0].title = '<b>bold</b>';
  const html = renderProposal({ data, job, pkgDir: DEMO });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(html.includes('$1,500') && html.includes('Fieldwork Studio') && html.includes('Alex Rivera'));
  assert.equal((html.match(/class="page /g) || []).length, 7);
  assert.equal(esc(`a&b<'"`), 'a&amp;b&lt;&#39;&quot;');
});

test('strings: English defaults, per-language files with fallback, right-to-left', () => {
  assert.equal(loadStrings('en').offer_title, 'Pick your plan.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-strings-'));
  writeJSON(path.join(dir, 'xx.json'), { _dir: 'rtl', cta_title: 'XX-CTA' });
  process.env.L2P_STRINGS_DIR = dir;
  try {
    const s = loadStrings('xx');
    assert.equal(s.cta_title, 'XX-CTA');
    assert.equal(s.offer_title, 'Pick your plan.');
    const { data, job } = demo();
    data.language = 'xx';
    data.strings = { offer_title: 'Choose.' };
    const html = renderProposal({ data, job, pkgDir: DEMO });
    assert.match(html, /<html lang="xx" dir="rtl">/);
    assert.ok(html.includes('XX-CTA') && html.includes('Choose.'));
    assert.ok(html.includes('<bdi dir="ltr" class="n">+1 512 555 0100</bdi>'), 'phones stay left-to-right inside RTL text');
  } finally { delete process.env.L2P_STRINGS_DIR; }
});

test('worker gets the brief inline, file tools, and the model', () => {
  const brief = readBrief();
  assert.ok(!brief.startsWith('---') && brief.includes('Hard rules'));
  const a = workerArgs({ brief, folder: 'Test Plumbing 1', model: 'opus' });
  assert.equal(a[0], '-p');
  assert.equal(a[a.indexOf('--append-system-prompt') + 1], brief);
  assert.ok(a.includes('Bash') && a.includes('WebFetch') && a.includes('--add-dir'));
  assert.equal(a[a.indexOf('--model') + 1], 'opus');
});

test('prices in Persian digits: on the cover, right-to-left, not mistaken for "Quote"', () => {
  const { data, job } = demo();
  job.offer.plans[0].price = '۱۸ میلیون تومان';
  job.offer.plans[1].price = '18 میلیون تومان';
  const html = renderProposal({ data, job, pkgDir: DEMO });
  const ribbon = html.split('class="ribbon"')[1].split('</b>')[0];
  assert.ok(ribbon.includes('<bdi dir="rtl" class="n">۱۸ میلیون تومان</bdi>'), 'recommended price on the cover');
  assert.ok(html.includes('<bdi dir="rtl" class="n">18 میلیون تومان</bdi>'), 'Latin digits with a Persian unit read right-to-left too');
  assert.ok(!html.split('class="plan rec"')[1].split('</div></div>')[0].includes(loadStrings('en').plan_foot_quote), 'a Persian price is a price, not "Quoted for you"');
  assert.ok(hasDigit('۱۸') && hasDigit('٣') && hasDigit('$7') && !hasDigit('Quote') && !hasDigit('توافقی'));
  assert.equal(textDir('$1,500'), 'ltr'); assert.equal(textDir('۱۸ میلیون تومان'), 'rtl'); assert.equal(textDir('۱۸'), 'ltr');
});

test('right-to-left and Persian text: no letter-spacing, Persian font declared for headings', () => {
  const { data, job } = demo();
  const en = renderProposal({ data, job, pkgDir: DEMO });
  assert.ok(!en.includes('<link rel="stylesheet"'), 'English loads no web font');
  assert.match(en, /html\[dir=rtl\] \*,:lang\(fa\)[^{]*\{letter-spacing:0!important\}/);
  assert.match(en, /classList\.add\('ar'\)/, 'Persian text inside an English proposal is tagged at render time');
  const f = fontsFor({}, 'fa');
  assert.match(f.css, /fonts\.googleapis\.com\/css2\?family=Vazirmatn/);
  assert.equal(fontsFor({ _font_stack: 'Sahel' }, 'fa').css, '', 'a declared local font is not replaced');
  data.language = 'fa';
  const fa = renderProposal({ data, job, pkgDir: DEMO });
  assert.match(fa, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Vazirmatn/);
  assert.match(fa, /--serif:"L2P Serif","Vazirmatn"/, 'big headings get the Persian font, not a system fallback');
  assert.match(fa, /--sans:"Vazirmatn"/);
});

test('render/qa take the business name, its slug or id inside a project', () => {
  const p = project();
  quiet(() => queue(p, { _: ['queue'] }));
  const dir = path.join(p.paths.proposals, 'Test Plumbing 1');
  for (const name of ['Test Plumbing 1', 'test plumbing 1', 'test-plumbing-1', 'b_000000000001', dir]) assert.equal(findPackage(p, name).toLowerCase(), dir.toLowerCase(), name);   // case: macOS folders
  assert.throws(() => findPackage(p, 'Nobody'), /No package found for "Nobody".*Packages: Test Plumbing 1/);
  assert.throws(() => findPackage(null, 'Test Plumbing 1'), /inside your project folder/);
  // The CLI finds the project from the current folder, as the redesign-proposal skill documents.
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'l2p.mjs'), 'proposals', 'qa', 'Test Plumbing 1'], { cwd: p.dir, encoding: 'utf8', timeout: 60000 });
  assert.doesNotMatch(r.stderr + r.stdout, /No package found/);
  assert.match(r.stdout, /QA FAILED/);                                       // found it: nothing is built in it yet
});
