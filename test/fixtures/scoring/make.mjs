// Writes the fictional scoring fixtures (businesses.json, sites.json, project.json, scored.json).
//   node test/fixtures/scoring/make.mjs
// All names, domains (.example / .test) and numbers (555-01xx) are made up.
import { writeJSON, readJSON } from '../../../lib/io.mjs';
import { parsePhone } from '../../../lib/normalize.mjs';
import path from 'node:path';
import { scoreAll } from '../../../lib/score.mjs';
import { deepMerge, DEFAULTS } from '../../../lib/project.mjs';

const dir = import.meta.dirname;
const ph = (raw, country = 'US') => parsePhone(raw, { country });
const soc = (o = {}) => ({ instagram: '', facebook: '', linkedin: '', tiktok: '', youtube: '', x: '', whatsapp: '', telegram: '', ...o });
const src = (...names) => names.map((s, i) => ({ source: s, url: `https://${s}.example/listing/${i + 1}`, id: `${s}:${i + 1}` }));
let n = 0;
const biz = o => ({
  id: `b_${String(++n).padStart(12, '0')}`, names: [o.name], category: 'Plumber', category_group: 'trades', ticket: 'premium',
  address: `${n}0 Example St`, city: 'Austin', region: 'TX', postcode: '78701', country: 'US', lat: 30.27, lng: -97.74,
  phones: [], emails: [], website: '', website_kind: 'none', socials: soc(), owner: { name: '', role: '', source: '', confidence: '' },
  hours: '', sources: src('osm'), google: null, flags: [], ...o,
});
const g = o => ({ place_id: `place-${n}`, name: '', rating: null, reviews: null, phone: '', website: '', maps_url: `https://maps.example/place/${n}`,
  categories: [], status: 'OPERATIONAL', claimed: true, photos_count: null, match: { basis: 'phone', confidence: 'high' }, reviews_sample: [], ...o });

const businesses = [
  biz({ name: 'Northwind Plumbing', phones: [ph('(512) 555-0123')], website: 'https://www.northwind.example', website_kind: 'site',
    socials: soc({ instagram: 'https://instagram.com/northwind.example' }), sources: src('osm', 'google_maps', 'csv'),
    owner: { name: 'Dana Fields', role: 'Owner', source: 'about page', confidence: 'high' },
    google: g({ name: 'Northwind Plumbing', rating: 4.7, reviews: 85, phone: '(512) 555-0199',
      reviews_sample: [{ date: '2026-10-01', rating: 5, text: 'Great', owner_reply: true }, { date: '2026-09-20', rating: 5, text: 'Fast', owner_reply: true },
        { date: '2026-09-05', rating: 4, text: 'Good', owner_reply: false }, { date: '2026-08-28', rating: 5, text: 'Nice', owner_reply: true },
        { date: '2026-08-15', rating: 5, text: 'Top', owner_reply: false }] }) }),
  biz({ name: 'Bluebell Bakery', category: 'Bakery', category_group: 'food', ticket: 'low', phones: [ph('512-555-0124')],
    socials: soc({ instagram: 'https://instagram.com/bluebell.test' }), sources: src('osm', 'google_maps'),
    google: g({ name: 'Bluebell Bakery', rating: 4.6, reviews: 120, phone: '512-555-0124', claimed: false }) }),
  biz({ name: 'Cedar Dental', category: 'Dentist', category_group: 'health', phones: [ph('512-555-0125')],
    website: 'https://cedardental.example', website_kind: 'site', emails: ['hello@cedardental.example'],
    google: g({ name: 'Cedar Dental', rating: 4.9, reviews: 300, phone: '512-555-0125' }) }),
  biz({ name: 'RooterCo Austin', phones: [ph('512-555-0126')], website: 'https://rooterco.example', website_kind: 'site' }),
  biz({ name: 'Pixel Web Design Studio', category: 'Web design', category_group: 'professional', ticket: 'mid', phones: [ph('512-555-0127')],
    website: 'https://pixelweb.example', website_kind: 'site' }),
  biz({ name: 'Lark Salon', category: 'Hair salon', category_group: 'beauty', ticket: 'mid', phones: [ph('512-555-0128')],
    website: 'https://larksalon.freesites.example', website_kind: 'free_subdomain', sources: src('osm', 'csv') }),
  biz({ name: 'Maple Auto Repair', category: 'Auto repair', category_group: 'auto', ticket: 'mid', phones: [ph('512-555-0129')],
    website: 'https://maple-auto.example', website_kind: 'site', socials: soc({ instagram: 'https://instagram.com/mapleauto.test' }) }),
  biz({ name: 'Orchid Law', category: 'Lawyer', category_group: 'legal', phones: [ph('512-555-0130')],
    google: g({ name: 'Orchid Law', rating: 4.1, reviews: 12, phone: '512-555-0130', status: 'CLOSED_PERMANENTLY' }) }),
  biz({ name: 'Quiet Holdings', category: 'Consultant', category_group: 'professional', ticket: 'mid', address: '', sources: src('csv') }),
  biz({ name: 'مخبز الياسمين', names: ['مخبز الياسمين', 'Jasmine Bakery'], category: 'Bakery', category_group: 'food', ticket: 'low',
    phones: [ph('512-555-0131')], website: 'https://facebook.example/jasmine', website_kind: 'social' }),
];

const site = o => ({
  url: '', final_url: '', status: 200, ok: true, state: 'ok', pages: [],
  signals: { https: true, viewport: true, tel_link: true, form: true, booking_widget: '', chat_widget: '', builder: '', footer_year: 2026,
    ua_tag: false, gtm: false, google_ads: false, meta_pixel: false, tiktok_pixel: false, incumbent_agency: '', no_cem_statement: false,
    coming_soon: false, parked: false, has_impressum: false, wayback_first: null, wayback_last_change: null },
  seo: null, phones: [], emails: [], socials: soc(), owner: { name: '', role: '', source: '', confidence: '' }, brand: {}, crawled_at: '2026-10-12', ...o,
});
const sig = o => ({ ...site().signals, ...o });
const sites = {
  'northwind.example': site({ url: 'https://www.northwind.example', final_url: 'http://northwind.example/',
    signals: sig({ https: false, viewport: false, tel_link: false, form: false, builder: 'WordPress', footer_year: 2019, ua_tag: true, google_ads: true, gtm: true }),
    seo: { score: 38, band: 'Critical', measured_pct: 85, categories: { perf: 35 }, issues: ['No page title', 'No business details for Google (structured data)'] },
    phones: [{ ...ph('(512) 555-0123'), page: 'http://northwind.example/contact' }],
    emails: [{ email: 'office@northwind.example', page: 'http://northwind.example/contact' }] }),
  'cedardental.example': site({ url: 'https://cedardental.example', final_url: 'https://cedardental.example/',
    signals: sig({ builder: 'Webflow', footer_year: 2026, booking_widget: 'BookingTool', meta_pixel: true }),
    seo: { score: 88, band: 'Good', measured_pct: 90, categories: {}, issues: [] },
    phones: [{ ...ph('512-555-0125'), page: 'https://cedardental.example/' }],
    emails: [{ email: 'hello@cedardental.example', page: 'https://cedardental.example/contact' }] }),
  'rooterco.example': site({ url: 'https://rooterco.example', final_url: 'https://rooterco.example/', seo: { score: 60, band: 'Needs significant work', categories: {}, issues: [] } }),
  'pixelweb.example': site({ url: 'https://pixelweb.example', final_url: 'https://pixelweb.example/', seo: { score: 95, band: 'Excellent', categories: {}, issues: [] } }),
  'larksalon.freesites.example': site({ url: 'https://larksalon.freesites.example', final_url: 'https://larksalon.freesites.example/',
    signals: sig({ form: false, footer_year: 2021 }), phones: [{ ...ph('512-555-0128'), page: 'https://larksalon.freesites.example/' }] }),
  'maple-auto.example': site({ url: 'https://maple-auto.example', final_url: '', status: 0, ok: false, state: 'dns', signals: {} }),
};

const project = {
  name: 'scoring-fixture',
  agency: { name: 'Example Studio', color: '#2E5E4E' },
  market: { country: 'US', currency: 'USD' },
  sources: [],
  scoring: { disqualify: { chain_patterns: ['rooterco'] } },
  compliance: { regime: 'CAN-SPAM', sender_identity: 'Pat Example, Example Studio, 1 Example Way' },
};

writeJSON(path.join(dir, 'businesses.json'), { updated: '2026-10-12', items: businesses });
writeJSON(path.join(dir, 'sites.json'), { updated: '2026-10-12', items: sites });
writeJSON(path.join(dir, 'project.json'), project);
const scored = scoreAll(businesses, sites, deepMerge(readJSON(DEFAULTS), project), { today: '2026-10-12' });
writeJSON(path.join(dir, 'scored.json'), { updated: '2026-10-12', items: scored });
console.log(`wrote ${businesses.length} businesses, ${Object.keys(sites).length} sites`);
