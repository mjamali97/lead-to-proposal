// Outreach queue: this week's call list, the follow-up clock, and a one-way suppression list.
// Nothing here sends anything. A person writes every message and presses send.
//
//   l2p queue [--n 20] [--tier A] [--group trades]   build this week's list from scored.json
//   l2p queue --due                                   follow-ups (and demos) due today
//   l2p queue --sent <id> --channel phone [--note ..] log a touch
//   l2p queue --replied <id>                          a reply ends the sequence
//   l2p queue --booked <id> --at 2026-10-14T19:30     demo booked
//   l2p queue --won <id> | --lost <id> --reason ".."  outcome
//   l2p queue --stop <email|phone|id>                 never contact again (cannot be undone here)
//
// Extra: --on YYYY-MM-DD backdates a logged event; --today YYYY-MM-DD fixes "today" (tests, planning).
import fs from 'node:fs';
import path from 'node:path';
import { load, writeJSON, toCSV, num, log, fail, slugify } from '../lib/io.mjs';

export const CHANNELS = ['phone', 'whatsapp', 'email', 'sms', 'walk-in', 'dm', 'telegram'];
const ENDED = ['replied', 'booked', 'won', 'lost', 'stopped'];
const DAY = 864e5;

// ---- dates (plain YYYY-MM-DD strings, compared as UTC days) ----
export function todayIn(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s));
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

// ---- contact keys ----
const digits = s => String(s ?? '').replace(/\D+/g, '');
const lc = s => String(s ?? '').toLowerCase().trim();
// Scored rows carry a flattened `phone` / `email` plus the full `phones` / `emails` lists.
const rowEmails = r => [...new Set([r.email, ...(r.emails || [])].map(e => lc(typeof e === 'string' ? e : e?.email)).filter(Boolean))];
const rowPhones = r => [r.phone, ...(r.phones || [])].flatMap(p => (typeof p === 'string' ? [p] : [p?.e164, p?.raw, p?.key?.split(':').join('')]))
  .map(digits).filter(d => d.length >= 7);
const firstPhone = r => { if (r.phone) return r.phone; const p = (r.phones || [])[0]; return typeof p === 'string' ? p : (p?.e164 || p?.raw || ''); };
const phoneMatch = (a, b) => a === b || (a.length >= 9 && b.length >= 9 && (a.endsWith(b) || b.endsWith(a)));

// ---- state files ----
export function loadState(project) {
  const touches = load(project.paths.touches, { updated: null, leads: {} });
  touches.leads ??= {};
  const suppression = load(project.paths.suppression, { updated: null, entries: [] });
  suppression.entries ??= [];
  return { touches, suppression };
}
const saveTouches = (project, t, day) => writeJSON(project.paths.touches, { ...t, updated: day });

export function isSuppressed(row, suppression) {
  const emails = rowEmails(row), phones = rowPhones(row);
  return suppression.entries.some(e =>
    (e.kind === 'id' && e.value === row.id) ||
    (e.kind === 'email' && emails.includes(e.value)) ||
    (e.kind === 'phone' && phones.some(p => phoneMatch(p, e.value))));
}

function settings(project) {
  const o = project.config.outreach || {};
  const touchDays = Array.isArray(o.touch_days) && o.touch_days.length ? o.touch_days.map(Number) : [0, 1, 3, 6, 9, 14];
  const maxTouches = Math.min(num(o.max_touches, touchDays.length), touchDays.length);
  return { touchDays, maxTouches, perWeek: num(o.new_per_week, 20), tz: project.config.market?.timezone };
}

// When is touch number (k+1) due? Relative to the first touch, but never closer to the
// previous touch than the cadence intends (so being late once does not stack touches).
export function nextDue(rec, touchDays, maxTouches) {
  const t = rec.touches || [];
  if (!t.length || t.length >= maxTouches || ENDED.includes(rec.status)) return null;
  const k = t.length, first = t[0].date, last = t[k - 1].date;
  const byPlan = addDays(first, touchDays[k]);
  const bySpacing = addDays(last, Math.max(1, touchDays[k] - touchDays[k - 1]));
  return { step: k + 1, date: byPlan > bySpacing ? byPlan : bySpacing, day: touchDays[k] };
}

// ---- proposal packages: id -> { dir, landing, proposal, stage } ----
function packages(project) {
  const out = new Map();
  const root = project.paths.proposals;
  if (!fs.existsSync(root)) return out;
  for (const slug of fs.readdirSync(root)) {
    const dir = path.join(root, slug);
    let job;
    try { job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8')); } catch { continue; }
    const id = job?.business?.id;
    if (!id) continue;
    const files = fs.readdirSync(dir);
    const rel = f => (f ? path.relative(project.dir, path.join(dir, f)) : '');
    const status = load(path.join(dir, 'status.json'), {});
    out.set(id, {
      dir: path.relative(project.dir, dir),
      landing: rel(files.find(f => / - Landing Page\.pdf$/i.test(f))),
      proposal: rel(files.find(f => / - Proposal\.pdf$/i.test(f))),
      stage: status.stage || '',
    });
  }
  return out;
}

// ---- evidence for one lead: facts only, the sentence is yours ----
export function evidence(r) {
  const need = (r.need_reasons || []).slice().sort((a, b) => (b.points || 0) - (a.points || 0)).map(x => x.text).filter(Boolean);
  const care = (r.interest_reasons || []).slice().sort((a, b) => (b.points || 0) - (a.points || 0)).map(x => x.text).filter(Boolean);
  // `risk` (written by l2p score) already includes negatives, blocked sites and phone mismatches.
  const warn = r.risk ? [r.risk] : (r.negatives || []).map(x => x.text || x).filter(Boolean);
  if (!r.risk && r.site_state === 'blocked') warn.push('Site blocked our check: problems unverified, look before you call');
  if (r.phone_check?.verdict === 'MISMATCH' && !/phone/i.test(r.risk || '')) warn.push('Phone on the website differs from Google: confirm the number');
  return { need: need.slice(0, 3), care: care.slice(0, 2), warn };
}

// Round-robin across category groups (each group best-first), so one niche never fills the week.
export function balance(rows, n) {
  const groups = new Map();
  for (const r of rows) {
    const g = r.category_group || 'other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const lists = [...groups.values()].map(l => l.sort((a, b) => (b.priority || 0) - (a.priority || 0)))
    .sort((a, b) => (b[0].priority || 0) - (a[0].priority || 0));
  const out = [];
  for (let i = 0; out.length < n && lists.some(l => i < l.length); i++)
    for (const l of lists) if (i < l.length && out.length < n) out.push(l[i]);
  return out;
}

export function select(rows, { n, tiers, group, touches, suppression }) {
  const pool = rows.filter(r => r.id && !r.disqualified)
    .filter(r => (tiers ? tiers.includes(r.tier) : ['A', 'B', 'C'].includes(r.tier)))
    .filter(r => !group || r.category_group === group)
    .filter(r => !touches.leads[r.id])                        // never queued twice once a sequence exists
    .filter(r => !isSuppressed(r, suppression))
    .filter(r => rowPhones(r).length || rowEmails(r).length || r.socials?.whatsapp || r.socials?.instagram || r.socials?.facebook || r.address);
  return balance(pool, n);
}

// ---- the commands ----
function findRow(rows, id) {
  const r = rows.find(x => x.id === id);
  if (!r) fail(`No lead with id "${id}" in data/scored.json. Ids look like b_1a2b3c4d5e6f (see the queue file or the workbook).`);
  return r;
}
function record(touches, row) {
  touches.leads[row.id] ??= { id: row.id, name: row.name, status: 'active', touches: [], events: [] };
  const rec = touches.leads[row.id];
  rec.touches ??= []; rec.events ??= [];
  return rec;
}

function stop(project, value, rows, state, day) {
  const v = String(value ?? '').trim();
  if (!v || v === 'true') fail('Usage: l2p queue --stop <email|phone|id>');
  let kind, key;
  if (v.includes('@')) { kind = 'email'; key = lc(v); }
  else if (rows.some(r => r.id === v) || /^b_[0-9a-f]+$/i.test(v)) { kind = 'id'; key = v; }
  else if (digits(v).length >= 7) { kind = 'phone'; key = digits(v); }
  else fail(`"${v}" is not an email, a phone number, or a lead id.`);
  const s = state.suppression;
  if (!s.entries.some(e => e.kind === kind && e.value === key)) s.entries.push({ kind, value: key, added: day });
  writeJSON(project.paths.suppression, { ...s, updated: day });
  // Close any sequence this touches. Suppression is checked again before every queue and touch.
  let closed = 0;
  for (const r of rows) if (isSuppressed(r, { entries: [{ kind, value: key }] })) {
    const rec = record(state.touches, r);
    if (rec.status !== 'stopped') { rec.status = 'stopped'; rec.events.push({ type: 'stopped', date: day, by: kind }); closed++; }
  }
  if (closed) saveTouches(project, state.touches, day);
  log(`Suppressed ${kind}: ${key}  (${s.entries.length} on the list${closed ? `, ${closed} lead(s) closed` : ''}).`);
  log('No l2p command removes an entry. If it was a mistake, edit data/suppression.json by hand, deliberately.');
  return { log: { action: 'stop', kind } };
}

function sent(project, id, args, rows, state, cfg, day) {
  const row = findRow(rows, id);
  const channel = lc(args.channel);
  if (!CHANNELS.includes(channel)) fail(`--channel must be one of: ${CHANNELS.join(', ')}`);
  if (isSuppressed(row, state.suppression)) fail(`${row.name} is on the suppression list. Do not contact them.`);
  const rec = record(state.touches, row);
  if (ENDED.includes(rec.status)) fail(`${row.name}: sequence already ended (${rec.status}). Track the conversation in your CRM sheet, or use --booked / --won / --lost.`);
  if (rec.touches.length >= cfg.maxTouches) fail(`${row.name} has had ${rec.touches.length} touches, the maximum. Stop here; a polite "closing your file" was the last one.`);
  const step = rec.touches.length + 1;
  rec.touches.push({ step, date: day, channel, ...(args.note && args.note !== true ? { note: String(args.note) } : {}) });
  saveTouches(project, state.touches, day);
  const nd = nextDue(rec, cfg.touchDays, cfg.maxTouches);
  log(`Logged touch ${step}/${cfg.maxTouches} to ${row.name} by ${channel} on ${day}.`);
  log(nd ? `Next touch (${nd.step}/${cfg.maxTouches}) due ${nd.date}.` : 'Sequence complete. Do not send another; move them to monthly nurture or Lost.');
  return { log: { action: 'sent', step, channel } };
}

function outcome(project, type, id, args, rows, state, day) {
  const row = findRow(rows, id);
  const rec = record(state.touches, row);
  const ev = { type, date: day };
  if (type === 'booked') {
    const at = args.at;
    if (!at || at === true || Number.isNaN(Date.parse(at))) fail('Usage: l2p queue --booked <id> --at 2026-10-14T19:30 (the demo time you both agreed)');
    ev.at = String(at); rec.booked_at = String(at);
  }
  if (type === 'lost') {
    if (!args.reason || args.reason === true) fail('Usage: l2p queue --lost <id> --reason "built it themselves" (the reason is how you learn)');
    ev.reason = String(args.reason); rec.lost_reason = ev.reason;
  }
  rec.status = type;
  rec.events.push(ev);
  saveTouches(project, state.touches, day);
  const msg = {
    replied: 'Sequence stopped. Answer within the hour if you can, and aim for a booked time.',
    booked: `Demo booked for ${ev.at}. Send a calendar invite and a one-line confirmation now.`,
    won: 'Won. Ask for a review and two referrals at handover.',
    lost: `Marked lost: ${ev.reason}. Add the reason to your weekly review.`,
  }[type];
  log(`${row.name}: ${msg}`);
  return { log: { action: type } };
}

function due(project, rows, state, cfg, day) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const items = [];
  for (const rec of Object.values(state.touches.leads)) {
    const row = byId.get(rec.id);
    if (row && isSuppressed(row, state.suppression)) continue;
    if (rec.status === 'booked' && rec.booked_at && String(rec.booked_at).slice(0, 10) === day) {
      items.push({ kind: 'demo', id: rec.id, name: rec.name, when: rec.booked_at, overdue: 0 });
      continue;
    }
    const nd = nextDue(rec, cfg.touchDays, cfg.maxTouches);
    if (nd && nd.date <= day) {
      const last = rec.touches[rec.touches.length - 1];
      items.push({ kind: 'touch', id: rec.id, name: rec.name, step: nd.step, day: nd.day, due: nd.date, overdue: daysBetween(nd.date, day), last_channel: last.channel, last_date: last.date, final: nd.step === cfg.maxTouches });
    }
  }
  items.sort((a, b) => (a.kind === 'demo' ? -1 : b.kind === 'demo' ? 1 : b.overdue - a.overdue));
  log(`\nDue on ${day}: ${items.length}  (cadence: day ${cfg.touchDays.slice(0, cfg.maxTouches).join(', ')}; max ${cfg.maxTouches} touches)\n`);
  for (const d of items) {
    if (d.kind === 'demo') log(`  DEMO   ${d.when}  ${d.name}  [${d.id}]`);
    else log(`  touch ${d.step}/${cfg.maxTouches} (day ${d.day})${d.overdue ? `  ${d.overdue}d late` : ''}  ${d.name}  [${d.id}]  last: ${d.last_channel} ${d.last_date}${d.final ? '  <- last touch: the "closing your file" message' : ''}`);
  }
  if (!items.length) log('  Nothing due. Start new conversations from this week\'s queue.');
  log(`\nAfter each one: l2p queue --sent <id> --channel <${CHANNELS.join('|')}>`);
  return { log: { action: 'due', due: items.length }, items };
}

function build(project, args, rows, state, cfg, day) {
  const n = num(args.n, cfg.perWeek);
  const tiers = args.tier && args.tier !== true ? String(args.tier).toUpperCase().split(',').map(s => s.trim()).filter(Boolean) : null;
  const group = args.group && args.group !== true ? String(args.group) : null;
  const picked = select(rows, { n, tiers, group, touches: state.touches, suppression: state.suppression });
  const pk = packages(project);
  const compliance = project.config.compliance || {};

  const items = picked.map((r, i) => {
    const ev = evidence(r), p = pk.get(r.id) || {};
    return {
      rank: i + 1, id: r.id, name: r.name, tier: r.tier, priority: r.priority, need: r.need, interest: r.interest,
      group: r.category_group || '', category: r.category || '', city: r.city || '',
      phone: firstPhone(r), email: rowEmails(r)[0] || '', email_ok: r.email_ok ?? '', website: r.website || '', owner: r.owner?.name || '',
      rating: r.google?.rating ?? '', reviews: r.google?.reviews ?? '', seo_score: r.seo_score ?? '',
      channel: r.channel || (rowPhones(r).length ? 'phone' : rowEmails(r).length ? 'email' : 'walk-in'),
      outreach_rule: r.outreach_rule || '',
      why_they_need_you: r.why_they_need_you || ev.need.join('; '), why_they_care: r.why_they_care || ev.care.join('; '),
      evidence: ev.need.join('; '), cautions: ev.warn.join(' '),
      landing_pdf: p.landing || '', proposal_pdf: p.proposal || '', package_dir: p.dir || '',
      _ev: ev, _r: r,
    };
  });

  const suffix = [group, tiers?.join('')].filter(Boolean).map(s => slugify(s)).join('-');
  const base = path.join(project.paths.out, `queue-${day}${suffix ? `-${suffix}` : ''}`);
  const cols = ['rank', 'id', 'name', 'tier', 'priority', 'need', 'interest', 'group', 'category', 'city', 'phone', 'email', 'email_ok', 'website', 'owner',
    'rating', 'reviews', 'seo_score', 'channel', 'outreach_rule', 'why_they_need_you', 'why_they_care', 'evidence', 'cautions', 'landing_pdf', 'proposal_pdf'];
  fs.mkdirSync(project.paths.out, { recursive: true });
  fs.writeFileSync(`${base}.csv`, toCSV(items, cols));

  const groups = {};
  for (const it of items) groups[it.group || 'other'] = (groups[it.group || 'other'] || 0) + 1;
  const md = [
    `# Outreach queue, ${day}`,
    '',
    `${items.length} lead${items.length === 1 ? '' : 's'}${tiers ? `, tier ${tiers.join('/')}` : ''}${group ? `, group ${group}` : ''}. By group: ${Object.entries(groups).map(([g, c]) => `${g} ${c}`).join(', ') || 'none'}.`,
    `Suppression list: ${state.suppression.entries.length}. Compliance regime: ${compliance.regime || 'not set'} (see docs/COMPLIANCE.md).`,
    '',
    '**This file gives you facts. You write the words and you press send.** Goal of every call: a booked 15-minute screen share at a fixed time, a clear no, or a callback time the owner chose.',
    '',
    'Log each touch: `l2p queue --sent <id> --channel phone`. Follow-ups: `l2p queue --due`.',
    '',
    '---',
    '',
    ...items.flatMap(it => {
      const r = it._r, ev = it._ev;
      const reviews = it.reviews !== '' ? ` · ${it.reviews} reviews at ${it.rating}` : '';
      return [
        `## ${it.rank}. ${it.name}  (tier ${it.tier}, priority ${it.priority}: need ${it.need} / interest ${it.interest})`,
        '',
        `${[it.category, it.city].filter(Boolean).join(' · ')}${reviews}`,
        `- Reach: ${it.channel}${it.phone ? ` · ${it.phone}` : ''}${it.email ? ` · ${it.email}${it.email_ok === false ? ' (do not email, see rule)' : ''}` : ''}${it.owner ? ` · owner: ${it.owner}` : ''}`,
        it.outreach_rule ? `- Rule: ${it.outreach_rule}` : null,
        `- Site: ${it.website || 'none'}${r.site_state ? ` (${r.site_state})` : ''}${it.seo_score !== '' ? ` · SEO ${it.seo_score}/100` : ''}`,
        ev.need.length
          ? `- Why they need you: ${it.why_they_need_you || ev.need.join('; ')}`
          : '- Why they need you: no defect observed. Look at the site yourself before calling, or skip.',
        it.why_they_care ? `- Why they will care: ${it.why_they_care}` : null,
        it.cautions ? `- Check first: ${it.cautions}` : null,
        it.landing_pdf || it.proposal_pdf
          ? `- Package: ${[it.landing_pdf && `landing page PDF \`${it.landing_pdf}\``, it.proposal_pdf && `proposal PDF \`${it.proposal_pdf}\``].filter(Boolean).join(' · ')}`
          : '- Package: none yet (`l2p proposals queue --only ' + it.id + '`)',
        `- Id: \`${it.id}\``,
        '',
      ].filter(l => l !== null);
    }),
  ].join('\n');
  fs.writeFileSync(`${base}.md`, md + '\n');

  const active = Object.values(state.touches.leads).filter(x => !ENDED.includes(x.status) && (x.touches || []).length && x.touches.length < cfg.maxTouches).length;
  log(`${items.length} lead${items.length === 1 ? '' : 's'} -> ${path.relative(project.dir, base)}.csv and .md`);
  log(`  by group: ${Object.entries(groups).map(([g, c]) => `${g} ${c}`).join(', ') || 'none'}`);
  log(`  with a proposal PDF: ${items.filter(x => x.proposal_pdf).length} · in a sequence already: ${active} · suppressed: ${state.suppression.entries.length}`);
  if (items.length < n) log(`  Only ${items.length} of ${n} available. Loosen --tier/--group, or collect more leads.`);
  return { log: { action: 'build', queued: items.length }, items: items.map(({ _ev, _r, ...x }) => x), file: `${base}.csv` };
}

export async function run(project, args = {}) {
  if (!project) fail('No project. Run inside a project folder or pass --project <folder>.');
  const cfg = settings(project);
  const day = isDate(args.on) ? args.on : isDate(args.today) ? args.today : todayIn(cfg.tz);
  const rows = load(project.paths.scored, { items: [] }).items || [];
  const state = loadState(project);

  if (args.stop !== undefined) return stop(project, args.stop, rows, state, day);
  if (!rows.length) fail('No scored leads yet. Run `l2p score` first.');
  if (args.sent !== undefined) return sent(project, String(args.sent), args, rows, state, cfg, day);
  for (const type of ['replied', 'booked', 'won', 'lost'])
    if (args[type] !== undefined) {
      if (args[type] === true) fail(`Usage: l2p queue --${type} <id>`);
      return outcome(project, type, String(args[type]), args, rows, state, day);
    }
  if (args.due) return due(project, rows, state, cfg, day);
  return build(project, args, rows, state, cfg, day);
}
