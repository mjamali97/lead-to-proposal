// Proposal packages: queue the best leads, build each package with a headless Claude Code worker,
// render, QA, and report status. State lives in proposals/<folder>/status.json, so every step resumes.
//   l2p proposals queue [--tiers A,B] [--limit N] [--only <id|name>] [--force] [--retry-failed]
//   l2p proposals run [--concurrency N] [--model <m>] [--limit N] [--only <id|name>]
//   l2p proposals render <package-dir>      screenshots + PDFs for one package
//   l2p proposals qa <package-dir>          check one package
//   l2p proposals status
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { writeJSON, load, safeName, slugify, today, num, log, fail, sleep } from '../lib/io.mjs';
import { PLUGIN } from '../lib/project.mjs';
import { python, runPython } from '../lib/python.mjs';
import { idAliases } from '../lib/dedupe.mjs';

const MAX_ATTEMPTS = 2;   // one retry
const STAGES = ['queued', 'working', 'done', 'failed', 'skipped'];
const USAGE_LIMIT = /usage limit|rate limit|limit reached|hit your limit|too many requests|overloaded|quota/i;
// config.categories.ads_benchmark_industry values that are spelled differently in facts/ads-benchmarks.json
const ADS_ALIAS = { dentists: 'dental', dentist: 'dental', automotive_repair: 'auto', automotive: 'auto', business_services: 'all',
  professional: 'all', medical_clinics: 'medical', restaurants: 'food', home: 'home_services', trades: 'home_services', insurance: 'finance_insurance' };
// which web facts fit which category group (facts list industries in plain words)
const GROUP_WORDS = { trades: ['trades', 'home services'], food: ['restaurants'], beauty: ['salons'], health: ['clinics', 'dentists'],
  legal: ['lawyers'], real_estate: ['real estate'], auto: [], professional: [] };
const EU = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));

export async function run(project, args) {
  const sub = args._[0] || 'status';
  if (sub === 'queue') return queue(project, args);
  if (sub === 'run') return runAll(project, args);
  if (sub === 'render') return renderOne(project, args);
  if (sub === 'qa') return qaOne(project, args);
  if (sub === 'status') return status(project);
  fail(`Unknown: l2p proposals ${sub}. Use queue, run, render, qa or status.`);
}

// ---------- queue ----------
export function factsFor(config, row, root = PLUGIN) {
  const ads = load(path.join(root, 'facts', 'ads-benchmarks.json'), { industries: {} });
  const web = load(path.join(root, 'facts', 'web-facts.json'), { facts: [] });
  const group = row.category_group || '';
  const mapped = config.categories?.ads_benchmark_industry?.[group] || '';
  const key = ads.industries[mapped] ? mapped : ads.industries[ADS_ALIAS[mapped]] ? ADS_ALIAS[mapped] : 'all';
  const ind = ads.industries[key] || {};
  const m = config.market || {};
  const usd = m.currency === 'USD' && (m.country || 'US') === 'US';
  const src = (ads.sources || []).find(s => s.id === ind.source) || {};
  const country = String(row.country || m.country || '').toUpperCase();
  const words = GROUP_WORDS[group] || [];
  const fits = f => (f.industries || []).some(i => /^all\b/i.test(i) || words.some(w => i.toLowerCase().includes(w)));
  const regional = f => (/^statcan/.test(f.id) ? country === 'CA' : /^eurostat/.test(f.id) ? EU.has(country) : f.id === 'mobile-share-canada-europe' ? country === 'CA' || EU.has(country) : true);
  return {
    industry_group: group,
    industry_key: key,
    ad_cost: ind.cpl_usd ? {
      fact_id: `ads:${key}`, industry: key, label: ind.report_category,
      cpl_usd: ind.cpl_usd, cpc_usd: ind.cpc_usd, conversion_rate_pct: ind.conversion_rate_pct,
      number: `${usd ? '$' : 'US$'}${Math.round(ind.cpl_usd)}`,
      source_line: `WordStream by LocaliQ, Google Ads Benchmarks ${src.year || 2026} (median of US campaigns, USD)`,
      note: `US medians in USD${usd ? '' : ': say "US data" and print US$'}. CPL = cost per lead (a call, form or chat), not per signed customer. Check the category is right before using it; other industries: facts/ads-benchmarks.json.`,
    } : null,
    ads_industries: Object.fromEntries(Object.entries(ads.industries).map(([k, v]) => [k, { label: v.report_category, cpl_usd: v.cpl_usd }])),
    web_facts: (web.facts || []).filter(f => f.verified !== false && fits(f) && regional(f)).map(f => ({
      fact_id: f.id, claim: f.claim, number: f.number,
      source_line: `${f.source?.publisher || ''}, ${f.source?.title || ''}${f.source?.year ? `, ${f.source.year}` : ''}`.replace(/\s+/g, ' ').trim(),
      url: f.source?.url || '', industries: f.industries || [], caution: f.caution || '',
    })),
  };
}

export function scriptPaths(project, pkg) {
  const P = s => path.join(PLUGIN, s);
  return {
    package: pkg, project: project.dir, plugin: PLUGIN, python: python() || 'python3',
    capture: P('python/capture.py'), render: P('python/render.py'), qa: P('python/qa.py'), markers: P('python/markers.py'),
    brand_palette: P('python/brand_palette.py'), proposal_template: P('templates/proposal/proposal.mjs'),
    schema: P('templates/proposal/schema.json'), limits: P('templates/proposal/limits.json'), strings: P('templates/proposal/strings'),
    landing_brief: P('templates/landing/brief.md'), readme_template: P('templates/landing/README.template.md'),
    agent_brief: P('agents/proposal-builder.md'), demo_package: P('examples/demo/package'), facts: P('facts'),
  };
}

const matchOnly = (row, only) => !only || [row.id, row.name, slugify(row.name)].some(v => String(v || '').toLowerCase() === String(only).toLowerCase());

export function selectRows(rows, { tiers = ['A', 'B'], limit = 25, only } = {}) {
  return rows
    .filter(r => !r.disqualified && (only ? true : tiers.includes(r.tier)) && matchOnly(r, only))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}

function absLogo(logo, dir) {
  if (!logo || /^(https?:|data:)/.test(logo) || path.isAbsolute(logo)) return logo || '';
  return path.resolve(dir, logo);
}

export function queue(project, args = {}) {
  const c = project.config, P = project.paths;
  if (!fs.existsSync(P.scored)) fail('No data/scored.json yet. Run `l2p score` first.');
  const rows = load(P.scored, { items: [] }).items || [];
  const sites = load(P.sites, { items: {} }).items || {};
  const tiers = String(args.tiers || (c.proposals?.tiers || ['A', 'B']).join(',')).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const picked = selectRows(rows, { tiers, limit: num(args.limit, c.proposals?.limit ?? 25), only: args.only });
  fs.mkdirSync(P.proposals, { recursive: true });
  const now = new Date();
  const lang = c.proposals?.language || c.market?.language || 'en';
  let dateLabel;
  try { dateLabel = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(now); } catch { dateLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(now); }
  const counts = { new: 0, refreshed: 0, kept: 0 };
  // folders already taken by other businesses
  const owner = new Map();
  for (const d of fs.existsSync(P.proposals) ? fs.readdirSync(P.proposals) : []) {
    const j = load(path.join(P.proposals, d, 'job.json'), null);
    if (j?.id) owner.set(d, j.id);
  }
  let order = 0;
  for (const row of picked) {
    order++;
    // A package made under an id the business had before a merge is still its package.
    const mine = f => !owner.has(f) || owner.get(f) === row.id || idAliases(row).includes(owner.get(f));
    let folder = safeName(row.name);
    if (!mine(folder)) folder = safeName(`${row.name} (${row.city || row.id.slice(-4)})`);
    if (!mine(folder)) folder = safeName(`${row.name} (${row.id})`);
    owner.set(folder, row.id);
    const dir = path.join(P.proposals, folder);
    const st = load(path.join(dir, 'status.json'), null);
    const keep = st && ['done', 'skipped', 'working'].includes(st.stage) || (st?.stage === 'failed' && !args.retryFailed);
    if (keep && !args.force) { counts.kept++; continue; }
    const job = {
      id: row.id, slug: slugify(row.name), folder, created: st?.created || today(), date: today(), date_label: dateLabel,
      language: lang, secondary_language: c.proposals?.secondary_language || '',
      business: row, site: (row.site_key && sites[row.site_key]) || null,
      agency: { ...c.agency, logo: absLogo(c.agency?.logo, project.dir) }, market: c.market, offer: c.offer,
      strings: c.proposals?.strings || {},
      facts: factsFor(c, row),
      paths: scriptPaths(project, dir),
    };
    writeJSON(path.join(dir, 'job.json'), job);
    writeJSON(path.join(dir, 'status.json'), { stage: 'queued', attempts: 0, order, updated: new Date().toISOString(), created: job.created });
    counts[st ? 'refreshed' : 'new']++;
  }
  log(`proposals queue: ${picked.length} selected (tiers ${tiers.join(',')}${args.only ? `, only ${args.only}` : ''}): ${counts.new} new, ${counts.refreshed} refreshed, ${counts.kept} kept (already done, skipped, working or failed)`);
  if (!picked.length) log('Nothing matched. Check `l2p score` output, --tiers, or --only.');
  else log(`Next: \`l2p proposals run\` (headless Claude builds each package), or open one folder in Claude Code and ask it to build the package.`);
  return { log: { selected: picked.length, ...counts } };
}

// ---------- run ----------
function packages(project) {
  const P = project.paths.proposals;
  if (!fs.existsSync(P)) return [];
  return fs.readdirSync(P, { withFileTypes: true }).filter(d => d.isDirectory())
    .map(d => ({ folder: d.name, dir: path.join(P, d.name), st: path.join(P, d.name, 'status.json') }))
    .filter(p => fs.existsSync(p.st) && fs.existsSync(path.join(p.dir, 'job.json')))
    .map(p => ({ ...p, status: load(p.st, {}) }));
}
const setStatus = (p, patch) => { p.status = { ...p.status, ...patch, updated: new Date().toISOString() }; writeJSON(p.st, p.status); };

export function claudeBin() { return process.env.L2P_CLAUDE || 'claude'; }

export function workerArgs({ brief, folder, model, plugin = PLUGIN }) {
  const a = ['-p', `Build the proposal package for "${folder}" in the current folder. job.json has everything you need. Follow your brief exactly, make qa.py print QA PASSED, then reply DONE.`,
    '--append-system-prompt', brief,
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
    '--add-dir', plugin];
  if (model) a.push('--model', model);
  return a;
}

export function readBrief(file = path.join(PLUGIN, 'agents', 'proposal-builder.md')) {
  return fs.readFileSync(file, 'utf8').replace(/^---[\s\S]*?\n---\n/, '').trim();
}

function runWorker(p, { brief, model, minutes }) {
  return new Promise(resolve => {
    const logs = path.join(p.dir, 'logs');
    fs.mkdirSync(logs, { recursive: true });
    const out = fs.createWriteStream(path.join(logs, `agent-${p.status.attempts}.log`));
    let text = '';
    const child = spawn(claudeBin(), workerArgs({ brief, folder: p.folder, model }), { cwd: p.dir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { text += b; out.write(b); });
    child.stderr.on('data', b => { text += b; out.write(b); });
    const timer = setTimeout(() => { out.write(`\n[l2p] ${minutes} minutes passed, stopping the worker\n`); child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 10000); }, minutes * 60000);
    child.on('error', e => { clearTimeout(timer); out.end(); resolve({ code: -1, text: String(e.message) }); });
    child.on('close', code => { clearTimeout(timer); out.end(); resolve({ code, text }); });
  });
}

function pyRun(script, argv) {
  const py = python();
  const r = spawnSync(py, [path.join(PLUGIN, 'python', script), ...argv], { encoding: 'utf8', timeout: 15 * 60000 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

export async function runAll(project, args = {}) {
  const v = spawnSync(claudeBin(), ['--version'], { encoding: 'utf8' });
  if (v.error || v.status !== 0) fail('Claude Code CLI not found (`claude`). Install it (https://docs.claude.com/en/docs/claude-code), sign in, and run again. Or set L2P_CLAUDE to its path.');
  if (!python()) fail('Python 3.10+ not found. Install it, or set L2P_PYTHON to its path (see `l2p doctor`).');
  const lock = path.join(project.paths.proposals, '.runner.lock');
  const other = load(lock, null);
  if (other?.pid && other.pid !== process.pid) {
    let alive = true;
    try { process.kill(other.pid, 0); } catch (e) { alive = e.code === 'EPERM'; }
    if (alive) fail(`Another \`l2p proposals run\` is working (pid ${other.pid}). Stop it first or wait.`);
  }
  fs.mkdirSync(project.paths.proposals, { recursive: true });
  writeJSON(lock, { pid: process.pid, started: new Date().toISOString() });
  const cleanup = () => { try { if (load(lock, {}).pid === process.pid) fs.unlinkSync(lock); } catch { /* gone */ } };
  process.once('exit', cleanup);
  try {
    let all = packages(project);
    for (const p of all) if (p.status.stage === 'working') setStatus(p, { stage: 'queued' });   // left over from a crash
    let todo = all.filter(p => p.status.stage === 'queued' && matchOnly({ name: load(path.join(p.dir, 'job.json'), {}).business?.name, id: load(path.join(p.dir, 'job.json'), {}).id }, args.only))
      .sort((a, b) => (a.status.order ?? 1e9) - (b.status.order ?? 1e9));
    todo = todo.slice(0, num(args.limit, todo.length));
    if (!todo.length) { log('Nothing queued. Run `l2p proposals queue` first (or `l2p proposals status`).'); return { log: { built: 0 } }; }
    const conc = Math.max(1, num(args.concurrency, project.config.proposals?.concurrency ?? 2));
    const minutes = num(args.minutes, project.config.proposals?.minutes_per_package ?? 40);
    const brief = readBrief();
    log(`proposals run: ${todo.length} package(s), ${conc} at a time, up to ${minutes} min each${args.model ? `, model ${args.model}` : ''}. Logs: proposals/<business>/logs/`);
    const tally = { done: 0, failed: 0, skipped: 0, retry: 0 };
    let stop = false, n = 0;
    const work = async p => {
      const t0 = Date.now();
      setStatus(p, { stage: 'working', attempts: (p.status.attempts || 0) + 1, started: new Date().toISOString() });
      const r = await runWorker(p, { brief, model: args.model, minutes });
      try {
        const j = JSON.parse(r.text.trim().split('\n').filter(l => l.startsWith('{')).pop() || '{}');
        if (j.num_turns != null) setStatus(p, { usage: { cost_usd: j.total_cost_usd, turns: j.num_turns, minutes: Math.round((j.duration_ms || 0) / 6000) / 10, is_error: j.is_error } });
      } catch { /* not JSON */ }
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      const tag = `[${++n}/${todo.length}]`;
      if (r.code !== 0 && USAGE_LIMIT.test(r.text)) {
        setStatus(p, { stage: 'queued', attempts: p.status.attempts - 1, error: 'usage limit reached' });
        stop = true; log(`${tag} paused  ${p.folder}: Claude usage limit reached. Run \`l2p proposals run\` again later; finished work is kept.`);
        return;
      }
      if (fs.existsSync(path.join(p.dir, 'skip.json'))) {
        const s = load(path.join(p.dir, 'skip.json'), {});
        setStatus(p, { stage: 'skipped', error: `skipped: ${s.reason || ''}`, finished: new Date().toISOString() });
        tally.skipped++; log(`${tag} skipped ${p.folder}: ${s.reason || ''}`); return;
      }
      const rr = pyRun('render.py', [p.dir, '--project', project.dir]);
      const q = rr.code === 0 ? pyRun('qa.py', [p.dir]) : rr;
      if (q.code === 0) {
        setStatus(p, { stage: 'done', error: null, finished: new Date().toISOString() });
        tally.done++; log(`${tag} done    ${p.folder} (${mins} min)`); return;
      }
      const err = q.out.split('\n').filter(Boolean).slice(-12).join('\n').slice(-1500);
      const again = p.status.attempts < MAX_ATTEMPTS;
      setStatus(p, { stage: again ? 'queued' : 'failed', error: err || `worker exited with ${r.code}` });
      if (again) { tally.retry++; log(`${tag} retry   ${p.folder}: ${err.split('\n').slice(-2).join(' | ').slice(0, 200)}`); todo.push(p); }
      else { tally.failed++; log(`${tag} FAILED  ${p.folder}: ${err.split('\n').slice(-2).join(' | ').slice(0, 200)}`); }
    };
    let i = 0;
    const lane = async () => { while (!stop && i < todo.length) { const p = todo[i++]; await work(p); await sleep(500); } };
    await Promise.all(Array.from({ length: Math.min(conc, todo.length) }, (_, k) => sleep(k * 3000).then(lane)));
    log(`proposals run: ${tally.done} done, ${tally.skipped} skipped, ${tally.failed} failed${stop ? ', paused (usage limit)' : ''}. \`l2p proposals status\` for details.`);
    return { log: tally };
  } finally { cleanup(); }
}

// ---------- render / qa / status ----------
function pkgDir(project, args) {
  const a = args._[1];
  if (!a) fail(`Usage: l2p proposals ${args._[0]} <package-dir or business folder name>`);
  for (const d of [path.resolve(a), project && path.join(project.paths.proposals, a)].filter(Boolean)) if (fs.existsSync(path.join(d, 'proposal-data.json')) || fs.existsSync(path.join(d, 'job.json'))) return d;
  fail(`No package found at ${a}`);
}

function renderOne(project, args) {
  const d = pkgDir(project, args);
  runPython('render.py', project ? [d, '--project', project.dir] : [d]);
  return { log: { package: path.basename(d) } };
}

function qaOne(project, args) {
  const d = pkgDir(project, args);
  const r = pyRun('qa.py', [d]);
  process.stdout.write(r.out);
  if (r.code === 1) process.exitCode = 1;
  return { log: { package: path.basename(d), passed: r.code === 0 } };
}

export function status(project) {
  const all = packages(project);
  if (!all.length) { log('No proposal packages yet. Run `l2p proposals queue`.'); return { log: {} }; }
  const by = Object.fromEntries(STAGES.map(s => [s, all.filter(p => p.status.stage === s)]));
  log(`proposals: ${all.length} packages · ` + STAGES.map(s => `${s} ${by[s].length}`).join(' · '));
  const cost = all.reduce((s, p) => s + (p.status.usage?.cost_usd || 0), 0);
  if (cost) log(`Claude usage so far: about $${cost.toFixed(2)} (API-equivalent)`);
  for (const p of by.working) log(`  working  ${p.folder} (attempt ${p.status.attempts}, since ${p.status.started || '?'})`);
  for (const p of by.failed) log(`  FAILED   ${p.folder}: ${String(p.status.error || '').split('\n').filter(Boolean).slice(-1)[0] || '?'}`);
  for (const p of by.skipped) log(`  skipped  ${p.folder}: ${String(p.status.error || '').replace(/^skipped: /, '')}`);
  for (const p of by.queued.filter(p => p.status.error)) log(`  retry    ${p.folder}: ${String(p.status.error).split('\n').filter(Boolean).slice(-1)[0]}`);
  return { log: Object.fromEntries(STAGES.map(s => [s, by[s].length])) };
}
