// Shared helpers: files, CSV, CLI flags, small utilities. Standard library only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
export const load = (p, d) => (fs.existsSync(p) ? readJSON(p) : d);

// Atomic write: a crash mid-write never leaves a half file behind.
export function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const today = () => new Date().toISOString().slice(0, 10);
export const hash = (s, n = 12) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, n);

export function slugify(s, max = 60) {
  const out = String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, max).replace(/-+$/, '');
  return out || 'item';
}

// File-system-safe folder/file name that keeps the business's real spelling.
export const safeName = s => String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Business';

// ---- CSV (RFC 4180) ----
const csvCell = v => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = (rows, cols) =>
  [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const head = nonEmpty[0].map(h => h.trim());
  return nonEmpty.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ---- CLI flags: --go, --limit 20, --source=osm, positional args in _ ----
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s);
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (v !== undefined) out[key] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}
export const num = (v, d) => (v === undefined || v === true || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

// Concurrency-limited map that saves progress every `every` items.
export async function pool(items, limit, fn, { every = 25, save = () => {}, label = '' } = {}) {
  let i = 0, done = 0;
  const out = new Array(items.length);
  async function worker() {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); }
      catch (e) { out[k] = { error: String(e?.message || e) }; }
      if (++done % every === 0) { save(); if (label) log(`${label}: ${done}/${items.length}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  save();
  return out;
}

export const log = (...a) => console.log(...a);
export const warn = (...a) => console.error('warning:', ...a);

export class UserError extends Error {}   // printed without a stack trace
export const fail = msg => { throw new UserError(msg); };
