import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scoreRow, scoreAll, tierFor, DEFAULT_SIGNALS, regimeOf } from '../../lib/score.mjs';
import { parsePhone } from '../../lib/normalize.mjs';
import { deepMerge, loadProject } from '../../lib/project.mjs';
import { readJSON } from '../../lib/io.mjs';

const FIX = path.resolve(import.meta.dirname, '../fixtures/scoring');
const DEFAULTS = readJSON(path.resolve(import.meta.dirname, '../../config/defaults.json'));
const DAY = '2026-10-12';
const cfg = (over = {}) => deepMerge(DEFAULTS, over);
const ph = raw => parsePhone(raw, { country: 'US' });

const biz = (o = {}) => ({
  id: 'b_000000000001', name: 'Fern Plumbing', names: ['Fern Plumbing'], category: 'Plumber', category_group: 'trades', ticket: 'premium',
  address: '1 Example St', city: 'Austin', country: 'US', phones: [ph('512-555-0101')], emails: [],
  website: 'https://fern.example', website_kind: 'site', socials: {}, owner: { name: '' }, sources: [{ source: 'osm', url: '', id: 'osm:1' }],
  google: null, flags: [], ...o,
});
const site = (sig = {}, o = {}) => ({
  url: 'https://fern.example', final_url: 'https://fern.example/', status: 200, ok: true, state: 'ok',
  signals: { https: true, viewport: true, tel_link: true, form: true, footer_year: 2026, ...sig },
  seo: null, phones: [{ ...ph('512-555-0101'), page: 'https://fern.example/contact' }], emails: [], socials: {}, owner: {}, ...o,
});
const google = (o = {}) => ({ place_id: 'p1', name: 'Fern Plumbing', rating: 4.5, reviews: 50, phone: '512-555-0101', status: 'OPERATIONAL',
  claimed: true, match: { basis: 'phone', confidence: 'high' }, reviews_sample: [], ...o });
const score = (b, s, c = {}, o = {}) => scoreRow(biz(b), s, cfg(c), { today: DAY, ...o });
const ids = list => list.map(r => r.id);

test('catalogue: unique ids, every signal documented', () => {
  const seen = new Set();
  for (const s of DEFAULT_SIGNALS) {
    assert.ok(!seen.has(s.id), `duplicate id ${s.id}`); seen.add(s.id);
    assert.ok(['need', 'interest', 'negative'].includes(s.kind));
    assert.ok(s.text && s.detect && typeof s.fire === 'function', s.id);
    assert.equal(s.kind === 'negative', s.weight < 0, s.id);
  }
  const doc = fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/SCORING.md'), 'utf8');
  for (const s of DEFAULT_SIGNALS) assert.match(doc, new RegExp(`\`${s.id}\``), `docs/SCORING.md lacks ${s.id}`);
});

test('need: web presence kinds', () => {
  assert.deepEqual(ids(score({ website: '', website_kind: 'none' }, null).need_reasons), ['no_website']);
  assert.ok(ids(score({ website: 'https://social.example/fern', website_kind: 'social' }, null).need_reasons).includes('aggregator_only'));
  const free = score({ website: 'https://fern.freesites.example', website_kind: 'free_subdomain' }, null);
  assert.ok(ids(free.need_reasons).includes('free_subdomain'));
  assert.ok(ids(free.interest_reasons).includes('tried_diy'));
  assert.ok(ids(score({ website_kind: 'corporate', website: 'https://bigco.example/agents/fern' }, null).need_reasons).includes('profile_page_only'));
});

test('need: broken, parked and coming soon; blocked is never broken', () => {
  assert.deepEqual(ids(score({}, site({}, { ok: false, state: 'dns' })).need_reasons), ['broken_site']);
  assert.deepEqual(ids(score({}, site({}, { ok: false, state: 'blocked' })).need_reasons), []);
  assert.ok(ids(score({}, site({}, { state: 'parked' })).need_reasons).includes('parked'));
  const cs = score({}, site({ coming_soon: true }, { state: 'coming_soon' }));
  assert.ok(ids(cs.need_reasons).includes('coming_soon'));
  assert.ok(ids(cs.interest_reasons).includes('stalled_build'));
  // A broken site's stale signals are not read as on-page defects.
  assert.ok(!ids(score({}, site({ viewport: false }, { ok: false, state: 'timeout' })).need_reasons).includes('not_responsive'));
});

test('need: on-page defects only when the site was reached', () => {
  const s = site({ https: false, viewport: false, tel_link: false, form: false, ua_tag: true, footer_year: 2022, psi_mobile: 31, page_kb: 5200 });
  const r = score({}, s);
  for (const id of ['no_https', 'not_responsive', 'no_tel_link', 'no_booking', 'dead_ua_tag', 'old_footer', 'slow_page', 'heavy_page'])
    assert.ok(ids(r.need_reasons).includes(id), id);
  assert.equal(r.need_reasons.find(x => x.id === 'slow_page').points, 14);
  assert.ok(ids(score({}, site({ page_bytes: 5e6 })).need_reasons).includes('heavy_page'));
  const https = sig => score({}, site(sig)).need_reasons.find(x => x.id === 'no_https')?.points;
  assert.deepEqual([https({ https: false }), https({ https: false, https_redirect: false }), https({ mixed_content: true }), https({})], [8, 4, 5, undefined]);
  assert.equal(score({}, site({ psi_mobile: 70 }, { seo: { score: 80, categories: { perf: 20 } } })).need_reasons.length, 0, 'measured PSI wins over inferred perf');
  assert.equal(score({}, site({}, { seo: { score: 80, categories: { perf: 20 } } })).need_reasons.find(x => x.id === 'slow_page').points, 7);
  assert.deepEqual(ids(score({}, null).need_reasons), [], 'site not crawled: no site signals');
  assert.ok(ids(score({}, site({}, { phones: [] })).need_reasons).includes('no_phone_on_site'));
  assert.ok(!ids(score({}, site({ form: false, booking_widget: 'Booker' })).need_reasons).includes('no_booking'));
});

test('need: stale site prefers the archive date and never double counts the footer', () => {
  const wb = score({}, site({ wayback_last_change: '2019-04-02', footer_year: 2020 })).need_reasons;
  assert.match(wb.find(x => x.id === 'stale_site').text, /2019 \(Internet Archive\)/);
  assert.ok(ids(wb).includes('old_footer'), 'archive date used, so the old footer still counts');
  const ft = score({}, site({ footer_year: 2019 })).need_reasons;
  assert.match(ft.find(x => x.id === 'stale_site').text, /Footer still says 2019/);
  assert.ok(!ids(ft).includes('old_footer'));
});

test('need: SEO bands, legal page, phone mismatch, unclaimed, loved but weak', () => {
  const seo = sc => score({}, site({}, { seo: { score: sc, band: 'x' } })).need_reasons.find(x => x.id === 'low_seo')?.points;
  assert.deepEqual([seo(30), seo(50), seo(65), seo(80)], [16, 11, 6, undefined]);
  assert.ok(ids(score({ country: 'DE' }, site({ has_impressum: false })).need_reasons).includes('missing_legal_page'));
  assert.ok(!ids(score({ country: 'US' }, site({ has_impressum: false })).need_reasons).includes('missing_legal_page'));
  const mm = score({ google: google({ phone: '512-555-0199' }) }, site());
  assert.ok(ids(mm.need_reasons).includes('phone_mismatch'));
  assert.ok(ids(score({ google: google({ claimed: false }) }, site()).need_reasons).includes('unclaimed_google'));
  const loved = score({ google: google({ rating: 4.8, reviews: 90 }) }, site({ viewport: false })).need_reasons.find(x => x.id === 'loved_but_weak_site');
  assert.equal(loved.points, 22);
  assert.equal(score({ google: google({ rating: 4.1, reviews: 20 }) }, site({ viewport: false })).need_reasons.find(x => x.id === 'loved_but_weak_site').points, 9);
  assert.ok(!ids(score({ google: google({ rating: 4.8, reviews: 90 }) }, site()).need_reasons).includes('loved_but_weak_site'), 'site is fine');
});

test('Google rules only fire on matched rows', () => {
  const r = score({ google: null }, site({ viewport: false }));
  for (const id of ['loved_but_weak_site', 'phone_mismatch', 'unclaimed_google']) assert.ok(!ids(r.need_reasons).includes(id));
  assert.ok(!ids(r.interest_reasons).some(i => ['replies_reviews', 'review_velocity', 'well_reviewed'].includes(i)));
  const none = score({ google: google({ match: { confidence: 'none' }, claimed: false }) }, site());
  assert.ok(!ids(none.need_reasons).includes('unclaimed_google'));
});

test('interest: ads, software, reviews, ticket, sources, owner, email', () => {
  const sample = ['2026-10-05', '2026-09-28', '2026-09-20', '2026-09-12', '2026-09-01'].map((d, i) => ({ date: d, rating: 5, text: 't', owner_reply: i < 3 }));
  const r = score({
    google: google({ reviews: 240, reviews_sample: sample }), owner: { name: 'Robin Example' },
    socials: { instagram: 'https://instagram.example/fern' }, sources: [{ source: 'osm' }, { source: 'csv' }, { source: 'google_maps' }],
  }, site({ google_ads: true, meta_pixel: true, tiktok_pixel: true, gtm: true, chat_widget: 'ChatBox', booking_widget: 'Booker' },
    { emails: [{ email: 'hi@fern.example', page: 'https://fern.example/contact' }] }));
  const got = Object.fromEntries(r.interest_reasons.map(x => [x.id, x.points]));
  assert.deepEqual(got, { google_ads: 18, meta_pixel: 14, tiktok_pixel: 6, chat_widget: 6, booking_widget: 6, replies_reviews: 15,
    review_velocity: 13, fresh_review: 5, well_reviewed: 6, instagram: 7, owner_named: 7, email_own_domain: 5, ticket: 12, multi_source: 10 });
  assert.match(r.interest_reasons.find(x => x.id === 'replies_reviews').text, /3 of the last 5/);
  assert.equal(r.interest, 100, 'capped');
  assert.ok(ids(score({}, site({ gtm: true })).interest_reasons).includes('gtm_only'));
  assert.equal(score({ ticket: 'mid' }, null).interest_reasons.find(x => x.id === 'ticket').points, 6);
  assert.equal(score({ ticket: 'low' }, null).interest_reasons.find(x => x.id === 'ticket').points, 1);
  assert.ok(ids(score({}, site({ wayback_first: '2025-01-01' })).interest_reasons).includes('new_business'));
  assert.ok(ids(score({ socials: { instagram: 'x' } }, site({}, { ok: false, state: 'broken' })).interest_reasons).includes('instagram_dead_site'));
});

test('negatives subtract from interest', () => {
  const base = score({}, site()).interest;
  const r = score({}, site({ incumbent_agency: 'Some Agency', no_cem_statement: true }));
  assert.deepEqual(ids(r.negatives), ['incumbent_agency', 'no_cem_statement']);
  assert.equal(r.interest, Math.max(0, base - 28));
  const old = [{ date: '2025-01-10', owner_reply: false }, { date: '2024-12-01', owner_reply: false }];
  assert.ok(ids(score({ google: google({ reviews_sample: old }) }, site()).negatives).includes('dormant'));
  const many = ['a', 'b', 'c'].map((x, i) => biz({ id: `b_${i}`, name: `Fern ${x}`, website: 'https://fern.example' }));
  const rows = scoreAll(many, { 'fern.example': site() }, cfg(), { today: DAY });
  assert.ok(rows.every(r => ids(r.negatives).includes('multi_location')));
  assert.ok(rows.every(r => !r.disqualified), '3 locations: negative, not yet a chain');
});

test('weights: override, disable with 0, negatives stay negative, community bonus', () => {
  const s = site({ viewport: false, google_ads: true, incumbent_agency: 'X' });
  const r = score({}, s, { scoring: { weights: { not_responsive: 30, google_ads: 0, incumbent_agency: 5 } } });
  assert.equal(r.need_reasons.find(x => x.id === 'not_responsive').points, 30);
  assert.ok(!ids(r.interest_reasons).includes('google_ads'));
  assert.equal(r.negatives.find(x => x.id === 'incumbent_agency').points, -5);
  const com = { community: { enabled: true, mode: 'boost', script_regex: '[\\u0600-\\u06FF]', name_tokens: ['jasmine'], bonus: 9 } };
  assert.equal(score({ name: 'Jasmine Cafe', names: [] }, null, com).interest_reasons.find(x => x.id === 'community').points, 9);
  assert.ok(ids(score({ name: 'مخبز', names: [] }, null, com).interest_reasons).includes('community'));
  assert.ok(!ids(score({ name: 'Fern Plumbing' }, null, com).interest_reasons).includes('community'));
  assert.ok(!ids(score({ name: 'Jasmine Cafe' }, null).interest_reasons).includes('community'), 'lens off by default');
});

test('disqualify rules', () => {
  const dq = (b, s, c) => score(b, s, c).disqualified?.reason ?? null;
  assert.equal(dq({ google: google({ status: 'CLOSED_PERMANENTLY' }) }, null), 'closed');
  assert.equal(dq({ name: 'Megachain Plumbing #12' }, null, { scoring: { disqualify: { chain_patterns: ['megachain'] } } }), 'chain');
  assert.equal(dq({ name: 'Bright Digital Marketing' }, null), 'competitor');
  assert.equal(dq({ name: 'Plain Name', category: 'SEO agency' }, null), 'competitor');
  assert.equal(dq({ phones: [], emails: [], address: '', website: '', website_kind: 'none', socials: {} }, null), 'unreachable');
  assert.equal(dq({ phones: [], address: '', website: '', website_kind: 'none', socials: { instagram: 'x' } }, null), null);
  const modern = site({ footer_year: 2025, form: true }, { seo: { score: 82 } });
  assert.equal(dq({}, modern), 'well_served');
  assert.equal(dq({}, site({ footer_year: 2025, form: false }, { seo: { score: 82 } })), null, 'no form: not converting');
  assert.equal(dq({}, site({ footer_year: 2025 }, { seo: { score: 60 } })), null, 'SEO below min');
  assert.equal(dq({ name: 'Fern' }, null, { community: { enabled: true, mode: 'filter', name_tokens: ['jasmine'] } }), 'outside_community');
  const four = [1, 2, 3, 4].map(i => biz({ id: `b_${i}`, name: `Fern ${i}` }));
  assert.ok(scoreAll(four, {}, cfg(), { today: DAY }).every(r => r.disqualified?.reason === 'chain'));
});

test('priority and tiers', () => {
  assert.deepEqual([60, 55, 54, 38, 37, 24, 23, 0].map(p => tierFor(p)), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
  assert.equal(tierFor(50, { A: 50 }), 'A');
  const r = score({}, site({ viewport: false, google_ads: true }));
  assert.equal(r.priority, Math.round(Math.sqrt(r.need * r.interest)));
  assert.equal(r.tier, tierFor(r.priority));
  assert.equal(score({}, site({ viewport: false }), { scoring: { tiers: { A: 1, B: 1, C: 1 } } }).tier, 'A');
});

test('phone check verdicts', () => {
  const v = (b, s) => score(b, s).phone_check;
  assert.equal(v({ website: '', website_kind: 'none' }, null).verdict, 'NO WEBSITE');
  assert.equal(v({}, null).verdict, 'NOT CHECKED');
  assert.equal(v({}, site({}, { ok: false, state: 'broken' })).verdict, 'SITE UNREACHABLE');
  assert.equal(v({ google: google() }, site({}, { phones: [] })).verdict, 'NO PHONE ON WEBSITE');
  assert.equal(v({ google: null }, site()).verdict, 'NOT CHECKED');
  assert.equal(v({ google: google({ phone: '' }) }, site()).verdict, 'SITE ONLY');
  const m = v({ google: google() }, site());
  assert.equal(m.verdict, 'MATCH');
  assert.ok(m.site && m.google);
  assert.equal(v({ google: google({ phone: '512-555-0101 ext. 4' }) }, site({}, { phones: [{ ...ph('512-555-0101 ext. 2'), page: '' }] })).verdict, 'MATCH (different extension)');
  const mm = v({ google: google({ phone: '512-555-0199' }) }, site({ call_tracking: 'CallTrack' }));
  assert.equal(mm.verdict, 'MISMATCH');
  assert.match(mm.note, /call tracking/);
});

test('outreach rule and channel follow the compliance regime', () => {
  const own = site({}, { emails: [{ email: 'office@fern.example', page: 'https://fern.example/contact' }] });
  const reg = regime => ({ compliance: { regime, honor_no_cem_statement: true, sender_identity: 'Pat, Studio, 1 Example Way' } });

  let r = score({}, own, reg('CASL'));
  assert.equal(r.channel, 'email'); assert.equal(r.email_ok, true); assert.match(r.outreach_rule, /^CASL: email allowed to office@fern\.example/);
  r = score({ emails: ['fern@directory.example'] }, site(), reg('CASL'));
  assert.equal(r.channel, 'phone'); assert.equal(r.email_ok, false); assert.match(r.outreach_rule, /not published on their own site/);
  r = score({}, site({ no_cem_statement: true }, { emails: own.emails }), reg('CASL'));
  assert.equal(r.email_ok, false); assert.match(r.outreach_rule, /refuses unsolicited email/);

  r = score({ country: 'DE' }, own, reg('GDPR + national law'));
  assert.equal(r.channel, 'phone'); assert.equal(r.email_ok, false);
  assert.match(r.outreach_rule, /^GDPR: phone or letter first/); assert.match(r.outreach_rule, /legitimate-interest/); assert.match(r.outreach_rule, /Germany/);

  r = score({}, own, reg('CAN-SPAM'));
  assert.equal(r.channel, 'email'); assert.match(r.outreach_rule, /opt-out/); assert.match(r.outreach_rule, /Pat, Studio/);
  r = score({ emails: [] }, site(), reg('CAN-SPAM'));
  assert.equal(r.channel, 'phone');

  assert.equal(score({ name: 'Fern Plumbing Ltd' }, own, reg('PECR + UK-GDPR')).email_ok, true);
  assert.equal(score({ name: 'Fern Plumbing' }, own, reg('PECR + UK-GDPR')).email_ok, false);
  assert.equal(score({}, own, reg('Spam Act')).email_ok, true);
  r = score({}, own, reg('Moon law'));
  assert.equal(r.email_ok, false); assert.match(r.outreach_rule, /not recognised/);
  assert.equal(score({ phones: [], socials: { instagram: 'x' }, website: '', website_kind: 'none' }, null, reg('GDPR')).channel, 'dm');
  assert.deepEqual(['CASL', 'GDPR', 'CAN-SPAM', 'PECR', 'SPAM_ACT'].map(x => regimeOf(x === 'SPAM_ACT' ? 'Spam Act (AU)' : x)), ['CASL', 'GDPR', 'CAN-SPAM', 'PECR', 'SPAM_ACT']);
});

test('plain sentences', () => {
  const r = score({}, site({ viewport: false, google_ads: true, incumbent_agency: 'Old Agency' }));
  assert.match(r.why_they_need_you, /^Not built for phones.*\.$/);
  assert.match(r.why_they_care, /Google Ads/);
  assert.match(r.risk, /Old Agency/);
  assert.match(score({}, site()).why_they_need_you, /research before calling/);
});

test('stage: fixtures -> scored.json sorted, disqualified last', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-score-'));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.copyFileSync(path.join(FIX, 'project.json'), path.join(dir, 'project.json'));
  for (const f of ['businesses.json', 'sites.json']) fs.copyFileSync(path.join(FIX, f), path.join(dir, 'data', f));
  const { run } = await import('../../stages/score.mjs');
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  let res;
  try { res = await run(loadProject(dir), {}); } finally { console.log = orig; }
  const rows = readJSON(path.join(dir, 'data', 'scored.json')).items;
  assert.equal(rows.length, 10);
  assert.equal(res.log.rows, 10);
  assert.equal(res.log.DQ, rows.filter(r => r.disqualified).length);
  const live = rows.filter(r => !r.disqualified);
  assert.deepEqual(rows.slice(0, live.length), live, 'live rows first');
  for (let i = 1; i < live.length; i++) assert.ok(live[i - 1].priority >= live[i].priority);
  assert.equal(rows[0].name, 'Northwind Plumbing');
  assert.equal(rows[0].site_key, 'northwind.example');
  assert.ok(logs.some(l => /Top 10/.test(l)));
  const reasons = Object.fromEntries(rows.filter(r => r.disqualified).map(r => [r.name, r.disqualified.reason]));
  assert.deepEqual(reasons, { 'Cedar Dental': 'well_served', 'RooterCo Austin': 'chain', 'Pixel Web Design Studio': 'competitor', 'Orchid Law': 'closed', 'Quiet Holdings': 'unreachable' });
});
