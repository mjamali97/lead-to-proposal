// l2p score: businesses.json + sites.json -> scored.json (need, interest, priority, tier).
import fs from 'node:fs';
import path from 'node:path';
import { load, writeJSON, today, log, fail } from '../lib/io.mjs';
import { scoreAll } from '../lib/score.mjs';

// sites.json is keyed by siteKey(url) from lib/site.mjs (the enrich stage). If enrich is not
// installed, scoreAll falls back to the same rule: the website's hostname without www.
async function siteKeyFn() {
  try {
    const m = await import('../lib/site.mjs');
    if (typeof m.siteKey === 'function') return b => m.siteKey(b.website);
  } catch { /* enrich not installed */ }
  return null;
}

export async function run(project, args = {}) {
  const { paths, config } = project;
  if (!fs.existsSync(paths.businesses)) fail('No data/businesses.json yet. Run `l2p merge` first.');
  const businesses = load(paths.businesses, { items: [] }).items || [];
  const sites = load(paths.sites, { items: {} }).items || {};
  if (!Object.keys(sites).length) log('note: no data/sites.json yet, so website signals are skipped (run `l2p enrich`).');
  const keyOf = await siteKeyFn();
  const rows = scoreAll(businesses, sites, config, keyOf ? { keyOf } : {});
  writeJSON(paths.scored, { updated: today(), items: rows });

  const live = rows.filter(r => !r.disqualified);
  const count = t => live.filter(r => r.tier === t).length;
  const tiers = { A: count('A'), B: count('B'), C: count('C'), D: count('D'), DQ: rows.length - live.length };
  const quiet = args.quiet === true;
  if (!quiet) {
    log(`Scored ${rows.length} businesses -> ${path.relative(project.dir, paths.scored)}`);
    log(`  A ${tiers.A}   B ${tiers.B}   C ${tiers.C}   D ${tiers.D}   disqualified ${tiers.DQ}`);
    if (live.length) log('\nTop 10:');
    for (const [i, r] of live.slice(0, 10).entries())
      log(`  ${String(i + 1).padStart(2)}. [${r.tier}] P${r.priority} (need ${r.need} / interest ${r.interest})  ${r.name}${r.city ? `, ${r.city}` : ''}\n      ${r.why_they_need_you}`);
  }
  return { log: { rows: rows.length, ...tiers } };
}
