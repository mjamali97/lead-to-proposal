// OpenStreetMap via the Overpass API. Free; please keep queries small (one per tag list, cached).
import { get, UA_BOT } from '../lib/http.mjs';
import { UserError } from '../lib/io.mjs';

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

const tagList = tags => [].concat(tags || []).map(t => (Array.isArray(t) ? t : String(t).split('='))).map(([k, v]) => [String(k).trim(), v == null || v === '*' ? '' : String(v).trim()]);
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Overpass QL for every [key, value] inside area.bbox, or around area.center (radius_km).
export function buildQuery(tags, area = {}, { timeout = 180 } = {}) {
  let scope;
  if (Array.isArray(area.bbox) && area.bbox.length === 4) scope = `(${area.bbox.join(',')})`;
  else if (area.center && area.radius_km) {
    const [lat, lng] = Array.isArray(area.center) ? area.center : [area.center.lat, area.center.lng ?? area.center.lon];
    scope = `(around:${Math.round(area.radius_km * 1000)},${lat},${lng})`;
  } else throw new UserError('OSM source needs area.bbox [south, west, north, east] or area.center + area.radius_km in project.json.');
  const parts = tagList(tags).map(([k, v]) => `  nwr["${esc(k)}"${v ? `="${esc(v)}"` : ''}]${scope};`);
  if (!parts.length) throw new UserError('OSM source needs "tags", e.g. [["craft", "plumber"]].');
  return `[out:json][timeout:${timeout}];\n(\n${parts.join('\n')}\n);\nout center tags;`;
}

const pick = (t, ...keys) => { for (const k of keys) if (t[k]) return String(t[k]).trim(); return ''; };
const human = v => String(v || '').replace(/[_;]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
const SOCIAL_TAGS = {
  instagram: ['contact:instagram', 'instagram'], facebook: ['contact:facebook', 'facebook'], linkedin: ['contact:linkedin', 'linkedin'],
  tiktok: ['contact:tiktok', 'tiktok'], youtube: ['contact:youtube', 'youtube'], x: ['contact:twitter', 'twitter', 'contact:x'],
  whatsapp: ['contact:whatsapp', 'whatsapp'], telegram: ['contact:telegram', 'telegram'],
};
const SOCIAL_BASE = { instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', linkedin: 'https://linkedin.com/company/',
  tiktok: 'https://tiktok.com/@', youtube: 'https://youtube.com/@', x: 'https://x.com/', whatsapp: 'https://wa.me/', telegram: 'https://t.me/' };
const socialUrl = (k, v) => (/^https?:\/\/|\.[a-z]{2,}\//i.test(v) ? v : SOCIAL_BASE[k] + (k === 'whatsapp' ? v.replace(/\D/g, '') : v.replace(/^@/, '')));
const CATEGORY_KEYS = ['craft', 'shop', 'amenity', 'office', 'healthcare', 'leisure', 'tourism', 'club'];

// One Overpass element → Listing (null when it has no name).
export function mapElement(el, { label = 'osm', tags = [] } = {}) {
  const t = el.tags || {};
  const name = pick(t, 'name', 'name:en', 'brand', 'operator');
  if (!name) return null;
  const want = tagList(tags).find(([k, v]) => t[k] && (!v || t[k] === v));
  const catKey = want?.[0] || CATEGORY_KEYS.find(k => t[k]);
  const street = [pick(t, 'addr:housenumber'), pick(t, 'addr:street', 'addr:place')].filter(Boolean).join(' ');
  const socials = {};
  for (const [k, keys] of Object.entries(SOCIAL_TAGS)) { const v = pick(t, ...keys); if (v) socials[k] = socialUrl(k, v); }
  const lat = el.lat ?? el.center?.lat ?? null, lng = el.lon ?? el.center?.lon ?? null;
  return {
    source: label, source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`, source_id: `osm:${el.type}/${el.id}`,
    name, category: human(catKey ? t[catKey] : ''), categories: CATEGORY_KEYS.filter(k => t[k]).map(k => human(t[k])),
    address: [street, pick(t, 'addr:unit') && `Unit ${t['addr:unit']}`].filter(Boolean).join(', '),
    city: pick(t, 'addr:city', 'addr:town', 'addr:village', 'addr:suburb'), region: pick(t, 'addr:state', 'addr:province', 'addr:county'),
    postcode: pick(t, 'addr:postcode'), country: pick(t, 'addr:country').toUpperCase(),
    lat, lng,
    phones: [t.phone, t['contact:phone'], t.mobile, t['contact:mobile']].filter(Boolean).flatMap(p => String(p).split(';')).map(s => s.trim()).filter(Boolean),
    website: pick(t, 'website', 'contact:website', 'url', 'brand:website'),
    emails: [t.email, t['contact:email']].filter(Boolean).flatMap(e => String(e).split(';')).map(s => s.trim()),
    socials, hours: pick(t, 'opening_hours'),
    osm_tags: Object.fromEntries(Object.entries(t).filter(([k]) => CATEGORY_KEYS.includes(k) || /^(brand|operator)/.test(k))),
  };
}

// collect(project, sourceConfig, { limit, label }) → { items, cost_usd: 0, state }
export async function collect(project, sc, args = {}) {
  const label = args.label || sc.name || 'osm';
  const query = buildQuery(sc.tags, sc.area || project.config.area, { timeout: sc.timeout_s || 180 });
  const endpoint = sc.endpoint || OVERPASS;
  const res = await get(endpoint, {
    method: 'POST', body: `data=${encodeURIComponent(query)}`, skipRobots: true, gap: 2000, timeout: Math.max(60_000, (sc.timeout_s || 180) * 1000),
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA_BOT },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status || res.error}: ${String(res.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`
    + ([429, 504].includes(res.status) ? ' (the public server is busy: try again later, or set "endpoint" to another Overpass instance)' : ''));
  let json; try { json = JSON.parse(res.body); } catch { throw new Error('Overpass returned something that is not JSON (overloaded? try again later)'); }
  const seen = new Set(), items = [];
  for (const el of json.elements || []) {
    const l = mapElement(el, { label, tags: sc.tags });
    if (!l || seen.has(l.source_id)) continue;
    seen.add(l.source_id); items.push(l);
    if (args.limit && items.length >= +args.limit) break;
  }
  return { items, cost_usd: 0, state: { query, elements: (json.elements || []).length, cached: !!res.cached, osm_base: json.osm3s?.timestamp_osm_base || '' } };
}
