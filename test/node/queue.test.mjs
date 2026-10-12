import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJSON, readJSON, parseCSV } from '../../lib/io.mjs';
import { initProject, loadProject } from '../../lib/project.mjs';
import { run, nextDue, balance } from '../../stages/queue.mjs';

// Fictional businesses only. `.example` domains, 555 numbers.
const lead = (n, group, tier, priority, extra = {}) => ({
  id: `b_${String(n).padStart(12, '0')}`,
  name: `${group} business ${n}`,
  category: group, category_group: group, city: 'Springfield',
  phones: [{ e164: `+151255501${String(n).padStart(2, '0')}`, raw: `(512) 555-01${String(n).padStart(2, '0')}`, key: `1:51255501${String(n).padStart(2, '0')}` }],
  phone: `(512) 555-01${String(n).padStart(2, '0')}`, email: `hello${n}@biz${n}.example`, email_ok: true,
  emails: [`hello${n}@biz${n}.example`],
  website: `https://biz${n}.example`, site_state: 'ok', seo_score: 40,
  google: { rating: 4.6, reviews: 50 + n },
  need: priority, interest: priority, priority, tier,
  need_reasons: [{ id: 'no_booking', points: 11, text: 'No way to book or request a quote online' }, { id: 'no_https', points: 8, text: 'Site is not on HTTPS' }],
  interest_reasons: [{ id: 'google_ads', points: 18, text: 'Running Google Ads' }],
  negatives: [], risk: '', disqualified: null, channel: 'phone', outreach_rule: 'Phone first.',
  why_they_need_you: 'No online booking; no HTTPS.', why_they_care: 'Runs Google Ads.',
  ...extra,
});

const ROWS = [
  lead(1, 'trades', 'A', 80), lead(2, 'trades', 'A', 75), lead(3, 'trades', 'A', 70), lead(4, 'trades', 'B', 50),
  lead(5, 'beauty', 'B', 45), lead(6, 'beauty', 'B', 40),
  lead(7, 'food', 'C', 30),
  lead(8, 'trades', 'D', 10),
  lead(9, 'trades', 'A', 90, { disqualified: { reason: 'chain', detail: 'fictional chain' } }),
];

const quiet = async fn => {
  const orig = console.log; console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
};

function setup(rows = ROWS) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-queue-')), 'proj');
  initProject(dir);
  const p = loadProject(dir);
  writeJSON(p.paths.scored, { updated: '2026-10-01', items: rows });
  return loadProject(dir);
}
const q = (p, args) => quiet(() => run(p, { _: [], ...args }));
const touches = p => readJSON(p.paths.touches).leads;

test('queue skips disqualified and tier D, writes csv + md', async () => {
  const p = setup();
  const r = await q(p, { n: 20, today: '2026-10-12' });
  const ids = r.items.map(i => i.id);
  assert.equal(ids.length, 7);
  assert.ok(!ids.includes(ROWS[7].id), 'tier D excluded');
  assert.ok(!ids.includes(ROWS[8].id), 'disqualified excluded');
  const csv = parseCSV(fs.readFileSync(path.join(p.paths.out, 'queue-2026-10-12.csv'), 'utf8'));
  assert.equal(csv.length, 7);
  const md = fs.readFileSync(path.join(p.paths.out, 'queue-2026-10-12.md'), 'utf8');
  assert.match(md, /Why they need you: No online booking/);
  assert.match(md, /You write the words/);
});

test('queue is balanced across groups, best first within each', async () => {
  const p = setup();
  const r = await q(p, { n: 4, today: '2026-10-12' });
  assert.deepEqual(r.items.map(i => i.group), ['trades', 'beauty', 'food', 'trades']);
  assert.deepEqual(r.items.map(i => i.priority), [80, 45, 30, 75]);
  assert.deepEqual(balance([{ category_group: 'x', priority: 1 }], 3).length, 1);
});

test('--tier and --group filter, and the file name says so', async () => {
  const p = setup();
  const r = await q(p, { tier: 'A', group: 'trades', today: '2026-10-12' });
  assert.deepEqual(r.items.map(i => i.priority), [80, 75, 70]);
  assert.ok(fs.existsSync(path.join(p.paths.out, 'queue-2026-10-12-trades-a.csv')));
});

test('proposal PDF path is attached when a package exists', async () => {
  const p = setup();
  const dir = path.join(p.paths.proposals, 'trades-business-1');
  fs.mkdirSync(dir, { recursive: true });
  writeJSON(path.join(dir, 'job.json'), { business: { id: ROWS[0].id } });
  fs.writeFileSync(path.join(dir, 'trades business 1 - Proposal.pdf'), '%PDF');
  fs.writeFileSync(path.join(dir, 'trades business 1 - Landing Page.pdf'), '%PDF');
  const r = await q(p, { n: 1, today: '2026-10-12' });
  assert.equal(r.items[0].proposal_pdf, path.join('proposals', 'trades-business-1', 'trades business 1 - Proposal.pdf'));
  assert.match(r.items[0].landing_pdf, /Landing Page\.pdf$/);
});

test('suppression is one-way: by email, phone or id, and blocks queue + touches', async () => {
  const p = setup();
  await q(p, { stop: 'HELLO1@biz1.example', today: '2026-10-12' });
  await q(p, { stop: '+1 512 555 0102', today: '2026-10-12' });
  await q(p, { stop: ROWS[2].id, today: '2026-10-12' });
  const s = readJSON(p.paths.suppression).entries;
  assert.deepEqual(s.map(e => e.kind), ['email', 'phone', 'id']);
  assert.equal(s[0].value, 'hello1@biz1.example');
  const r = await q(p, { n: 20, today: '2026-10-12' });
  const ids = r.items.map(i => i.id);
  for (const k of [0, 1, 2]) assert.ok(!ids.includes(ROWS[k].id), `lead ${k + 1} suppressed`);
  await assert.rejects(q(p, { sent: ROWS[0].id, channel: 'phone', today: '2026-10-12' }), /suppression list/);
  // Stopping again does not duplicate, and nothing in the CLI can remove an entry.
  await q(p, { stop: 'hello1@biz1.example', today: '2026-10-13' });
  assert.equal(readJSON(p.paths.suppression).entries.length, 3);
  assert.equal(touches(p)[ROWS[0].id].status, 'stopped');
  await assert.rejects(q(p, { stop: 'not a contact', today: '2026-10-13' }), /not an email/);
});

test('touch sequence follows touch_days and --due lists what is due', async () => {
  const p = setup();
  const id = ROWS[0].id;
  await q(p, { sent: id, channel: 'whatsapp', on: '2026-10-12' });
  let rec = touches(p)[id];
  assert.equal(rec.touches.length, 1);
  assert.deepEqual(nextDue(rec, [0, 1, 3, 6, 9, 14], 6), { step: 2, date: '2026-10-13', day: 1 });
  assert.equal((await q(p, { due: true, today: '2026-10-12' })).items.length, 0);
  const d = await q(p, { due: true, today: '2026-10-13' });
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].step, 2);
  // Late second touch (day 5): the third keeps its 2-day spacing instead of stacking.
  await q(p, { sent: id, channel: 'phone', on: '2026-10-17' });
  rec = touches(p)[id];
  assert.equal(nextDue(rec, [0, 1, 3, 6, 9, 14], 6).date, '2026-10-19');
  // Already in a sequence: not queued again.
  const r = await q(p, { n: 20, today: '2026-10-17' });
  assert.ok(!r.items.some(i => i.id === id));
  await assert.rejects(q(p, { sent: id, channel: 'pigeon' }), /--channel must be/);
});

test('max touches is a hard ceiling', async () => {
  const p = setup();
  const proj = { ...p, config: { ...p.config, outreach: { ...p.config.outreach, touch_days: [0, 3, 8], max_touches: 3 } } };
  const id = ROWS[1].id;
  for (const day of ['2026-10-01', '2026-10-04', '2026-10-09']) await q(proj, { sent: id, channel: 'email', on: day });
  await assert.rejects(q(proj, { sent: id, channel: 'email', on: '2026-10-20' }), /maximum/);
  assert.equal((await q(proj, { due: true, today: '2026-10-30' })).items.length, 0);
});

test('a reply stops the sequence; booked demos show up on their day; lost needs a reason', async () => {
  const p = setup();
  const id = ROWS[0].id;
  await q(p, { sent: id, channel: 'phone', on: '2026-10-12' });
  await q(p, { replied: id, on: '2026-10-12' });
  assert.equal(touches(p)[id].status, 'replied');
  assert.equal((await q(p, { due: true, today: '2026-10-20' })).items.length, 0);
  await assert.rejects(q(p, { sent: id, channel: 'phone', on: '2026-10-13' }), /already ended/);

  await q(p, { booked: id, at: '2026-10-15T19:30', on: '2026-10-13' });
  const d = await q(p, { due: true, today: '2026-10-15' });
  assert.equal(d.items[0].kind, 'demo');
  await assert.rejects(q(p, { booked: id, at: 'someday' }), /Usage/);

  await assert.rejects(q(p, { lost: ROWS[1].id }), /reason/);
  await q(p, { lost: ROWS[1].id, reason: 'has an agency', on: '2026-10-13' });
  assert.equal(touches(p)[ROWS[1].id].lost_reason, 'has an agency');
  await q(p, { won: id, on: '2026-10-16' });
  assert.equal(touches(p)[id].status, 'won');
  await assert.rejects(q(p, { won: 'b_nope' }), /No lead with id/);
});
