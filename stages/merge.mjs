// l2p merge: every data/raw/*.json → normalise, keep the area, merge duplicates.
// Writes data/businesses.json, data/merge-report.json, data/dropped.json.
import fs from 'node:fs';
import path from 'node:path';
import { load, readJSON, writeJSON, today, log, UserError } from '../lib/io.mjs';
import { inArea } from '../lib/normalize.mjs';
import { dedupe, normalizeListing, assertNoDuplicates } from '../lib/dedupe.mjs';
import { attachGoogle } from './google.mjs';

export function readRaw(rawDir) {
  if (!fs.existsSync(rawDir)) return [];
  return fs.readdirSync(rawDir).filter(f => f.endsWith('.json')).sort().map(f => {
    const j = readJSON(path.join(rawDir, f));
    const label = j.source || f.replace(/\.json$/, '');
    return { label, items: (j.items || []).map(it => ({ ...it, source: it.source || label })) };
  });
}

export async function run(project, args = {}) {
  const c = project.config;
  const raw = readRaw(project.paths.raw);
  const listings = raw.flatMap(r => r.items);
  if (!listings.length) throw new UserError('No listings in data/raw/ yet. Run `l2p collect` first.');

  const kept = [], dropped = [];
  for (const r of listings) {
    const l = normalizeListing(r, c);
    if (!l.name) { dropped.push({ source: r.source, name: '', url: r.source_url || '', reason: 'no name' }); continue; }
    const a = inArea(l, c.area);
    if (!a.ok) { dropped.push({ source: r.source, name: l.name, city: l.city, address: l.address, url: r.source_url || '', reason: a.reason }); continue; }
    if (l.google?.status === 'CLOSED_PERMANENTLY') { dropped.push({ source: r.source, name: l.name, city: l.city, url: r.source_url || '', reason: 'permanently closed (Google)' }); continue; }
    kept.push(l);
  }

  let { items, report } = dedupe(kept, c);
  // Google matches found by `l2p google` survive a re-merge; a second pass merges businesses that share a place.
  const gstate = load(project.paths.google, null);
  let googlePass = null;
  if (gstate?.results) {
    const attached = attachGoogle(items, gstate);
    if (attached) {
      const before = items.length;
      ({ items } = dedupe(items, c));
      googlePass = { attached, merged: before - items.length };
    }
  }
  assertNoDuplicates(items, c);

  const reasons = {};
  for (const d of dropped) { const k = d.reason.replace(/"[^"]*"/g, '…').replace(/[\d.]+ km/, 'N km'); reasons[k] = (reasons[k] || 0) + 1; }
  const bySource = Object.fromEntries(raw.map(r => [r.label, r.items.length]));
  writeJSON(project.paths.businesses, { updated: today(), items });
  writeJSON(project.paths.dropped, { updated: today(), items: dropped });
  writeJSON(project.paths.mergeReport, {
    ...report, updated: today(), listings: listings.length, by_source: bySource, in_area: kept.length, dropped: dropped.length, dropped_reasons: reasons,
    businesses: items.length, merged_clusters: report.clusters.length, google_pass: googlePass,
  });
  log(`${listings.length} listings from ${raw.length} source(s) → ${items.length} businesses (${dropped.length} dropped)`);
  if (report.disabled_keys.length) log(`  ${report.disabled_keys.length} shared phone/site key(s) treated as switchboards (kept apart, flagged): see data/merge-report.json`);
  if (dropped.length) log(`  dropped: ${Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  return { log: { listings: listings.length, sources: raw.length, businesses: items.length, dropped: dropped.length, clusters: report.clusters.length, cost_usd: 0 } };
}
