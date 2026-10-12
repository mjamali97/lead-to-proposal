// Your own list (CSV/TSV/semicolon). `map` = { field: "Your Column" }; without it, common headers are detected.
import fs from 'node:fs';
import path from 'node:path';
import { hash, UserError } from '../lib/io.mjs';

const ALIASES = {
  name: ['name', 'business name', 'business', 'company', 'company name', 'organisation', 'organization', 'title', 'firma', 'nom', 'ragione sociale', 'bedrijfsnaam'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'telefon', 'telefono', 'téléphone', 'telefoon', 'mobile', 'cell', 'main phone'],
  website: ['website', 'web', 'url', 'site', 'homepage', 'web site', 'webseite', 'sito', 'site web'],
  email: ['email', 'e mail', 'email address', 'mail'],
  address: ['address', 'street', 'street address', 'address 1', 'address line 1', 'adresse', 'indirizzo', 'adres', 'full address'],
  city: ['city', 'town', 'locality', 'stadt', 'ort', 'citta', 'città', 'ville', 'plaats'],
  region: ['state', 'province', 'region', 'county', 'bundesland', 'provincia'],
  postcode: ['zip', 'zip code', 'postal code', 'postcode', 'post code', 'plz', 'cap', 'code postal'],
  country: ['country', 'country code', 'land', 'paese', 'pays'],
  category: ['category', 'categories', 'type', 'industry', 'niche', 'kategorie', 'categoria', 'catégorie'],
  lat: ['lat', 'latitude'], lng: ['lng', 'lon', 'long', 'longitude'],
  instagram: ['instagram'], facebook: ['facebook'], linkedin: ['linkedin'], tiktok: ['tiktok'],
  notes: ['notes', 'note', 'comments'],
  id: ['id', 'record id', 'lead id'],
};
const normHead = h => String(h).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function detectMap(headers) {
  const norm = new Map(headers.map(h => [normHead(h), h]));
  const map = {};
  for (const [field, names] of Object.entries(ALIASES)) for (const n of names) if (norm.has(normHead(n))) { map[field] = norm.get(normHead(n)); break; }
  return map;
}

// RFC 4180 with a detected delimiter (comma, semicolon or tab).
export function parseDelimited(text) {
  text = String(text).replace(/^﻿/, '');
  const head = text.split(/\r?\n/, 1)[0];
  const delim = [',', ';', '\t'].sort((a, b) => head.split(b).length - head.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const ne = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!ne.length) return { headers: [], rows: [] };
  const headers = ne[0].map(h => h.trim());
  return { headers, rows: ne.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

const SOCIALS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'whatsapp', 'telegram'];

export function mapRow(row, map, { label = 'csv', index = 0 } = {}) {
  const v = f => (map[f] ? String(row[map[f]] ?? '').trim() : '');
  const name = v('name');
  if (!name) return null;
  const socials = {};
  for (const s of SOCIALS) if (v(s)) socials[s] = v(s);
  const known = new Set(['name', 'phone', 'phones', 'email', 'emails', 'website', 'lat', 'lng', 'id', ...SOCIALS]);
  const extra = Object.fromEntries(Object.keys(map).filter(f => !known.has(f)).map(f => [f, v(f)]).filter(([, x]) => x));
  const sid = v('id') || hash(`${name}|${v('phone')}|${v('website')}|${v('address')}`, 12);
  return {
    ...extra, source: label, source_url: '', source_id: `${label}:${sid}`,
    name, phones: [v('phone') || v('phones')].filter(Boolean), emails: (v('email') || v('emails')).split(/[;,\s]+/).filter(Boolean),
    website: v('website'), socials,
    lat: v('lat') ? Number(v('lat').replace(',', '.')) : null, lng: v('lng') ? Number(v('lng').replace(',', '.')) : null,
  };
}

// collect(project, { file, map }, { limit, label })
export async function collect(project, sc, args = {}) {
  const label = args.label || sc.name || 'csv';
  if (!sc.file) throw new UserError(`csv source "${label}" needs "file"`);
  const file = path.resolve(project.dir, sc.file);
  if (!fs.existsSync(file)) throw new UserError(`csv source "${label}": ${file} not found`);
  const { headers, rows } = parseDelimited(fs.readFileSync(file, 'utf8'));
  const map = sc.map && Object.keys(sc.map).length ? sc.map : detectMap(headers);
  if (!map.name) throw new UserError(`csv source "${label}": no name column (headers: ${headers.join(', ')}). Add "map": { "name": "<your column>" }.`);
  const missing = Object.entries(map).filter(([, col]) => !headers.includes(col)).map(([f, col]) => `${f} → "${col}"`);
  const items = [];
  for (const [i, row] of rows.entries()) {
    const l = mapRow(row, map, { label, index: i });
    if (l) items.push(l);
    if (args.limit && items.length >= +args.limit) break;
  }
  return { items, cost_usd: 0, state: { file: sc.file, rows: rows.length, map, missing_columns: missing } };
}
