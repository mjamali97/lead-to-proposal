// l2p status: what each stage has produced so far, and the money spent.
import fs from 'node:fs';
import path from 'node:path';
import { load, log } from '../lib/io.mjs';

const count = f => { const j = load(f, null); if (!j) return null; const it = j.items ?? j; return Array.isArray(it) ? it.length : it && typeof it === 'object' ? Object.keys(it).length : 0; };
const tally = (arr, f) => arr.reduce((a, x) => { const k = f(x) ?? '-'; a[k] = (a[k] || 0) + 1; return a; }, {});
const fmt = o => Object.entries(o).sort().map(([k, v]) => `${k} ${v}`).join(', ');

export async function run(project) {
  const P = project.paths, out = {};
  const lines = [`Project ${project.config.name} (${project.dir})`];

  const raw = fs.existsSync(P.raw) ? fs.readdirSync(P.raw).filter(f => f.endsWith('.json')) : [];
  out.raw = Object.fromEntries(raw.map(f => [f.replace(/\.json$/, ''), count(path.join(P.raw, f))]));
  lines.push(`collect    ${raw.length ? fmt(out.raw) : 'nothing yet → l2p collect'}`);

  const biz = load(P.businesses, null)?.items;
  out.businesses = biz?.length ?? 0;
  out.dropped = count(P.dropped) ?? 0;
  lines.push(`merge      ${biz ? `${biz.length} businesses (${out.dropped} dropped), ${biz.filter(b => b.website_kind === 'site').length} with own website, ${biz.filter(b => b.flags?.length).length} flagged` : 'not run → l2p merge'}`);

  const g = load(P.google, null);
  if (g || biz) {
    const R = Object.values(g?.results || {});
    out.google = { with_google: biz?.filter(b => b.google).length ?? 0, looked_up: R.length, matched: R.filter(r => r.status === 'matched').length };
    lines.push(`google     ${out.google.with_google} businesses with Google data; ${R.length} lookups (${out.google.matched} matched)`);
  }

  const sites = count(P.sites);
  if (sites != null) { out.sites = sites; lines.push(`enrich     ${sites} websites crawled`); }

  const scored = load(P.scored, null)?.items;
  if (scored) {
    out.tiers = tally(scored, r => (r.disqualified ? 'disqualified' : r.tier || '-'));
    lines.push(`score      ${scored.length} rows: ${fmt(out.tiers)}`);
  }
  if (fs.existsSync(P.workbook)) lines.push(`export     ${path.relative(project.dir, P.workbook)} (${fs.statSync(P.workbook).mtime.toISOString().slice(0, 10)})`);

  if (fs.existsSync(P.proposals)) {
    const dirs = fs.readdirSync(P.proposals, { withFileTypes: true }).filter(d => d.isDirectory());
    if (dirs.length) {
      out.proposals = tally(dirs, d => load(path.join(P.proposals, d.name, 'status.json'), {}).stage || (fs.existsSync(path.join(P.proposals, d.name, 'job.json')) ? 'queued' : '-'));
      lines.push(`proposals  ${dirs.length}: ${fmt(out.proposals)}`);
    }
  }

  // Money: every stage run logs cost_usd; Google lookup runs also keep their own charge.
  let spent = 0; const byStage = {};
  if (fs.existsSync(P.runLog)) for (const line of fs.readFileSync(P.runLog, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e.cost_usd) { spent += e.cost_usd; byStage[e.stage] = (byStage[e.stage] || 0) + e.cost_usd; } } catch { /* skip */ }
  }
  const gRuns = Object.values(g?.runs || {}).reduce((a, r) => a + (r.cost_usd || 0), 0);
  out.spent_usd = Math.round(spent * 100) / 100;
  lines.push(`money      $${out.spent_usd.toFixed(2)} logged${Object.keys(byStage).length ? ` (${Object.entries(byStage).map(([k, v]) => `${k} $${v.toFixed(2)}`).join(', ')})` : ''}${gRuns ? `; Google lookup runs report $${gRuns.toFixed(2)}` : ''}`);
  log(lines.join('\n'));
  return { log: { ...out, cost_usd: 0 } };
}
