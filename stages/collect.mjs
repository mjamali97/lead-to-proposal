// l2p collect [--source <type|name>] [--go] [--limit N] [--fresh] [--reviews N --min-reviews 30 --min-rating 4]
// Runs each enabled source and writes data/raw/<name>.json. Google Maps is a dry run unless --go.
import path from 'node:path';
import { load, writeJSON, today, log, warn, num, UserError } from '../lib/io.mjs';
import { configureHttp } from '../lib/http.mjs';

const MODULES = { google_maps: 'google-maps', osm: 'osm', directory: 'directory', csv: 'csv' };

// Stable file label per source: its name, else its type (+ index when a type repeats).
export function sourceLabels(sources) {
  const count = {};
  for (const s of sources) count[s.type] = (count[s.type] || 0) + 1;
  const seen = {};
  return sources.map(s => {
    if (s.name) return String(s.name).replace(/[^\w.-]+/g, '-');
    seen[s.type] = (seen[s.type] || 0) + 1;
    return count[s.type] > 1 ? `${s.type}-${seen[s.type]}` : s.type;
  });
}

export function selectSources(config, want) {
  const all = config.sources || [];
  const labels = sourceLabels(all);
  const list = all.map((s, i) => ({ sc: s, label: labels[i] }));
  if (!want || want === true) return list.filter(x => x.sc.enabled !== false);
  const ws = String(want).split(',').map(s => s.trim());
  const hit = list.filter(x => ws.includes(x.sc.type) || ws.includes(x.label) || ws.includes(x.sc.name));
  if (!hit.length) throw new UserError(`No source matches "${want}". Sources: ${labels.join(', ') || '(none in project.json)'}`);
  return hit;
}

export async function run(project, args = {}) {
  const c = project.config;
  configureHttp({ cacheDir: project.paths.cache, respectRobots: c.crawl.respect_robots, gap: c.crawl.gap_ms, timeout: c.crawl.timeout_ms });
  const chosen = selectSources(c, args.source);
  if (!chosen.length) throw new UserError('No enabled sources in project.json (set "enabled": true on one, or pass --source <type|name>).');
  const limit = num(args.limit, 0) || undefined;
  const summary = {}; let cost = 0, dryRuns = 0;
  for (const { sc, label } of chosen) {
    const mod = await import(`../sources/${MODULES[sc.type]}.mjs`);
    const file = path.join(project.paths.raw, `${label}.json`);
    const prev = args.fresh ? { items: [], state: {} } : load(file, { items: [], state: {} });
    const write = ({ items, state }) => writeJSON(file, { source: label, type: sc.type, updated: today(), state, items });
    const opts = { ...args, limit, label, prev, checkpoint: write, go: !!args.go };
    let res;
    try {
      if (sc.type === 'google_maps' && args.reviews !== undefined) {
        res = await mod.collectReviews(project, sc, { ...opts, reviews: num(args.reviews, 0), minReviews: num(args.minReviews, 30), minRating: num(args.minRating, 4) });
        if (res.dry_run) {
          log(`${label} reviews pass: ${res.plan.places} places qualify, ${res.plan.reviews} reviews each → about $${res.plan.cost_usd.toFixed(2)}. Dry run: add --go to buy them.`);
          dryRuns++; summary[label] = { dry_run: true, places: res.plan.places, cost_usd: res.plan.cost_usd }; continue;
        }
      } else res = await mod.collect(project, sc, opts);
    } catch (e) {
      if (e instanceof UserError) throw e;
      warn(`${label}: ${e.message}`); summary[label] = { error: e.message }; continue;
    }
    if (res.dry_run) {
      log(mod.formatPlan(res.plan, label));
      log(`Dry run: nothing was bought. Add --go to run it${limit ? '' : ' (try --limit 20 --go first)'}.`);
      dryRuns++; summary[label] = { dry_run: true, runs: res.plan.runs.length, places_max: res.plan.places, cost_max_usd: res.plan.cost_usd }; continue;
    }
    write(res);
    cost += res.cost_usd || 0;
    summary[label] = { items: res.items.length, cost_usd: res.cost_usd || 0, ...(res.stopped ? { stopped: res.stopped } : {}) };
    log(`${label}: ${res.items.length} listings → data/raw/${label}.json${res.cost_usd ? ` ($${res.cost_usd.toFixed(2)})` : ''}${res.stopped ? `\n  stopped at ${res.stopped}` : ''}`);
  }
  const n = Object.values(summary).reduce((a, s) => a + (s.items || 0), 0);
  if (n) log(`Next: l2p merge`);
  return { log: { sources: summary, items: n, dry_runs: dryRuns, cost_usd: Math.round(cost * 100) / 100 } };
}
