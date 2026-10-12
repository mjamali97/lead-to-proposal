// Resolve the user's project workspace and its config.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON, fail, today } from './io.mjs';

export const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULTS = path.join(PLUGIN, 'config', 'defaults.json');

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}
const stripNotes = v => Array.isArray(v) ? v.map(stripNotes)
  : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, stripNotes(x)])) : v;

export function findProjectDir(start = process.cwd()) {
  let d = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(d, 'project.json'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

export function readEnv(dir) {
  const env = { ...process.env };
  const f = path.join(dir, '.env');
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#') && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

export function paths(dir) {
  const data = path.join(dir, 'data'), out = path.join(dir, 'out');
  return {
    data, out, raw: path.join(data, 'raw'), cache: path.join(data, 'http-cache'), proposals: path.join(dir, 'proposals'),
    businesses: path.join(data, 'businesses.json'), mergeReport: path.join(data, 'merge-report.json'),
    dropped: path.join(data, 'dropped.json'), google: path.join(data, 'google.json'),
    sites: path.join(data, 'sites.json'), scored: path.join(data, 'scored.json'),
    touches: path.join(data, 'touches.json'), suppression: path.join(data, 'suppression.json'),
    workbook: path.join(out, 'leads.xlsx'), runLog: path.join(out, 'run-log.jsonl'),
  };
}

export function loadProject(dirArg) {
  const dir = dirArg ? path.resolve(dirArg) : (process.env.L2P_PROJECT ? path.resolve(process.env.L2P_PROJECT) : findProjectDir());
  if (!dir || !fs.existsSync(path.join(dir, 'project.json')))
    fail('No project found. Run `l2p init <folder>` first, or pass --project <folder>.');
  const config = stripNotes(deepMerge(readJSON(DEFAULTS), readJSON(path.join(dir, 'project.json'))));
  validate(config);
  return { dir, config, paths: paths(dir), env: readEnv(dir), plugin: PLUGIN };
}

export function validate(c) {
  const errs = [];
  if (!c.market?.country || !/^[A-Z]{2}$/.test(c.market.country)) errs.push('market.country must be a 2-letter country code, e.g. "US"');
  if (!c.market?.currency) errs.push('market.currency is required, e.g. "USD"');
  if (!Array.isArray(c.sources)) errs.push('sources must be a list');
  for (const [i, s] of (c.sources || []).entries())
    if (!['google_maps', 'osm', 'directory', 'csv'].includes(s.type)) errs.push(`sources[${i}].type "${s.type}" is not one of google_maps, osm, directory, csv`);
  const b = c.area?.bbox;
  if (b && !(Array.isArray(b) && b.length === 4 && b[0] < b[2] && b[1] < b[3])) errs.push('area.bbox must be [south, west, north, east]');
  if (errs.length) fail('project.json has problems:\n  - ' + errs.join('\n  - '));
}

// One line per stage run: what ran, when, how much it cost.
export function logRun(project, entry) {
  fs.mkdirSync(project.paths.out, { recursive: true });
  fs.appendFileSync(project.paths.runLog, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

export function initProject(dir, { name } = {}) {
  dir = path.resolve(dir);
  if (fs.existsSync(path.join(dir, 'project.json'))) fail(`${dir} already has a project.json`);
  fs.mkdirSync(dir, { recursive: true });
  const example = readJSON(path.join(PLUGIN, 'config', 'project.example.json'));
  example.name = name || path.basename(dir);
  writeJSON(path.join(dir, 'project.json'), example);
  fs.writeFileSync(path.join(dir, '.env'), '# Apify token, only needed for Google Maps (paid). https://console.apify.com/settings/integrations\nAPIFY_TOKEN=\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\ndata/http-cache/\n');
  for (const p of ['data/raw', 'out', 'proposals']) fs.mkdirSync(path.join(dir, p), { recursive: true });
  return { dir, created: today() };
}
