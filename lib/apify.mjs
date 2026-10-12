// Minimal Apify REST client with a spend guard. Every paid call goes through runOnce(), which saves
// state BEFORE the POST, so a crash or a re-run never starts (and pays for) the same run twice.
import { sleep, UserError } from './io.mjs';

export const API = 'https://api.apify.com/v2';
export const GOOGLE_MAPS_ACTOR = 'compass~crawler-google-places';

// Measured on a real account in Sept 2026 with compass~crawler-google-places, not vendor-advertised:
// discovery without reviews ≈ $5.7 per 1,000 places; with 5 reviews per place ≈ $8.5 per 1,000.
// Prices change: check the actor's pricing page and override with `rates` in the source config.
export const DEFAULT_RATES = { place_per_1k: 5.7, review_per_1k: 0.56, lookup_per_place: 0.004 };
export const ratesFor = (sourceConfig = {}) => ({ ...DEFAULT_RATES, ...(sourceConfig.rates || {}) });

// estimate({ places, reviews, rates }) → USD (upper bound: Maps often returns fewer than the max)
export function estimate({ places = 0, reviews = 0, lookups = 0, rates = DEFAULT_RATES } = {}) {
  const r = { ...DEFAULT_RATES, ...rates };
  const perPlace = (r.place_per_1k + Math.max(0, reviews) * r.review_per_1k) / 1000;
  return Math.round((places * perPlace + lookups * r.lookup_per_place) * 100) / 100;
}

const base = o => (o.baseUrl || process.env.APIFY_BASE_URL || API).replace(/\/$/, '');
async function call(path, { token, method = 'GET', body, baseUrl, fetchImpl = fetch } = {}) {
  if (!token) throw new UserError('APIFY_TOKEN missing: put it in your project .env (https://console.apify.com/settings/integrations).');
  const r = await fetchImpl(`${base({ baseUrl })}${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) {
    const msg = json?.error?.message || text.slice(0, 300);
    const e = new Error(`Apify ${method} ${path.split('?')[0]} → ${r.status}: ${msg}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

export async function startRun(actor, input, { token, maxTotalChargeUsd, baseUrl, fetchImpl } = {}) {
  const q = maxTotalChargeUsd ? `?maxTotalChargeUsd=${(+maxTotalChargeUsd).toFixed(2)}` : '';
  const j = await call(`/acts/${actor}/runs${q}`, { token, method: 'POST', body: input, baseUrl, fetchImpl });
  return j.data;            // { id, defaultDatasetId, status, ... }
}

export const getRun = async (runId, o = {}) => (await call(`/actor-runs/${runId}`, o)).data;

export async function waitRun(runId, { token, baseUrl, fetchImpl, pollMs = 10_000, maxWaitMs = 45 * 60_000, onTick } = {}) {
  const t0 = Date.now();
  for (;;) {
    const run = await getRun(runId, { token, baseUrl, fetchImpl });
    if (!['READY', 'RUNNING'].includes(run.status)) return run;
    onTick?.(run, Date.now() - t0);
    if (Date.now() - t0 > maxWaitMs) return run;       // still running: caller keeps it pending, collects next time
    await sleep(pollMs);
  }
}

export async function datasetItems(datasetId, { token, baseUrl, fetchImpl, limit = 0 } = {}) {
  const out = []; const page = 1000;
  for (let offset = 0; ; offset += page) {
    const j = await call(`/datasets/${datasetId}/items?clean=true&format=json&offset=${offset}&limit=${page}`, { token, baseUrl, fetchImpl });
    const items = Array.isArray(j) ? j : j?.data?.items || [];
    out.push(...items);
    if (items.length < page || (limit && out.length >= limit)) return limit ? out.slice(0, limit) : out;
  }
}

// { usage, limit } in USD for the current billing month.
export async function accountLimits(token, o = {}) {
  const d = (await call('/users/me/limits', { token, ...o })).data || {};
  return { usage: +(d.current?.monthlyUsageUsd ?? 0), limit: +(d.limits?.maxMonthlyUsageUsd ?? Infinity) };
}
export const accountUsageUsd = async (token, o = {}) => (await accountLimits(token, o)).usage;

// Spend guard: budget is relative to usage when the stage started; the account limit is absolute.
export async function spendGuard({ token, budgetUsd, margin = 0.5, baseUrl, fetchImpl } = {}) {
  const first = await accountLimits(token, { baseUrl, fetchImpl });
  const g = {
    startUsage: first.usage, limit: first.limit, budgetUsd: +budgetUsd || 0,
    // Re-reads usage. ok=false when `nextCostUsd` would cross the budget or the account limit.
    async check(nextCostUsd = 0) {
      const now = await accountLimits(token, { baseUrl, fetchImpl });
      const spent = Math.max(0, now.usage - g.startUsage);
      const left = Math.min(g.budgetUsd - spent, now.limit - margin - now.usage);
      return { ok: nextCostUsd <= left && left > 0, spent, left: Math.max(0, left), usage: now.usage, limit: now.limit };
    },
  };
  return g;
}

// Run an actor once per `key`, resumably. state.runs[key] is written before the POST.
//  - collected → { skipped: true }
//  - started earlier (runId known) → wait + collect, no new spend
//  - POST may have happened but the id was lost (crash) → look for a run started after it; else refuse
export async function runOnce({ state, key, actor, input, token, maxTotalChargeUsd, save = () => {}, meta = {}, baseUrl, fetchImpl, pollMs, maxWaitMs, onTick }) {
  state.runs ||= {};
  let r = state.runs[key];
  const o = { token, baseUrl, fetchImpl };
  if (r?.collected) return { skipped: true, run: r };
  if (r && !r.runId && r.posting) {
    const list = await call(`/acts/${actor}/runs?desc=1&limit=25`, o).catch(() => null);
    const found = list?.data?.items?.find(x => Date.parse(x.startedAt) >= Date.parse(r.created) - 5000);
    if (found) { r.runId = found.id; r.datasetId = found.defaultDatasetId; save(); }
    else if (list) { delete state.runs[key]; r = null; }   // the POST never reached Apify: safe to start
    else throw new UserError(`Cannot tell whether Apify run "${key}" was started (crash during start). Check https://console.apify.com/actors/runs, then delete state.runs["${key}"] to retry.`);
  }
  if (!r) {
    r = state.runs[key] = { key, actor, created: new Date().toISOString(), posting: true, maxTotalChargeUsd: maxTotalChargeUsd ?? null, ...meta };
    save();
    const run = await startRun(actor, input, { ...o, maxTotalChargeUsd });
    Object.assign(r, { runId: run.id, datasetId: run.defaultDatasetId, posting: false });
    save();
  }
  const run = await waitRun(r.runId, { ...o, pollMs, maxWaitMs, onTick });
  r.status = run.status;
  r.datasetId ||= run.defaultDatasetId;
  if (['READY', 'RUNNING'].includes(run.status)) { save(); return { pending: true, run: r }; }
  const items = await datasetItems(r.datasetId, o);
  Object.assign(r, { collected: true, items: items.length, cost_usd: +(run.usageTotalUsd ?? 0) || null, finished: new Date().toISOString() });
  save();
  return { items, run: r };
}
