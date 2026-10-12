import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, assertNoDuplicates, normalizeListing } from '../../lib/dedupe.mjs';

const config = {
  market: { country: 'US' },
  area: { cities: ['austin'] },
  sources: [{ type: 'google_maps' }, { type: 'directory', name: 'dir', sitemap: 'https://directory.example/sitemap.xml' }, { type: 'csv' }],
  categories: { groups: { trades: ['plumb'], food: ['bakery'], health: ['dent'] }, ticket: { trades: 'premium', food: 'low', health: 'premium' } },
};
let n = 0;
const L = (o) => ({ source: o.source || 'csv', source_id: `t:${++n}`, source_url: '', ...o });

test('normalizeListing: phones, website kinds, socials', () => {
  const l = normalizeListing(L({ name: ' Northwind  Plumbing ', phone: '(512) 555-0123 / (512) 555-0124', website: 'https://www.instagram.com/northwind.plumbing/',
    links: ['https://directory.example/listing/1', 'https://www.yelp.com/biz/northwind'], email: 'Hello@northwind.example' }), config);
  assert.equal(l.name, 'Northwind Plumbing');
  assert.deepEqual(l.phones.map(p => p.e164), ['+15125550123', '+15125550124']);
  assert.equal(l.website, ''); assert.equal(l.website_kind, 'social');
  assert.equal(l.socials.instagram, 'https://instagram.com/northwind.plumbing');
  assert.deepEqual(l.emails, ['hello@northwind.example']);
  assert.equal(normalizeListing(L({ name: 'X', website: 'https://directory.example/listing/9' }), config).website_kind, 'directory');
  assert.equal(normalizeListing(L({ name: 'X', website: 'northwind.example' }), config).website, 'https://northwind.example/');
});

test('merges on phone, own domain, Instagram, place id, and same name nearby', () => {
  const listings = [
    L({ name: 'Northwind Plumbing', phones: ['512-555-0123'], website: 'northwind-plumbing.example', source: 'google_maps',
      google: { place_id: 'P1', categories: ['Plumber'], rating: 4.7, reviews: 100 }, lat: 30.2672, lng: -97.7431 }),
    L({ name: 'Northwind Plumbing & Drain', phones: ['+1 512 555 0123 ext 2'], source: 'dir' }),               // phone
    L({ name: 'Northwind Plumbing Co', website: 'https://shop.northwind-plumbing.example/contact', source: 'csv' }), // domain
    L({ name: 'Bluebird Bakery', socials: { instagram: 'https://instagram.com/bluebird.bakery' }, source: 'dir' }),
    L({ name: 'Bluebird Bakery Ltd', links: ['https://www.instagram.com/Bluebird.Bakery/'], phones: ['512-555-0142'], source: 'csv' }),   // instagram
    L({ name: 'Redwood Dental', google: { place_id: 'P9' }, source: 'google_maps' }),
    L({ name: 'Redwood Dental Clinic', place_id: 'P9', source: 'dir' }),                                             // place id
    L({ name: 'Cedar Hair Studio', lat: 30.2700, lng: -97.7400, source: 'dir' }),
    L({ name: 'Cedar Hair Studio LLC', lat: 30.2705, lng: -97.7402, source: 'csv' }),                                // name ≤ 150 m
    L({ name: 'Cedar Hair Studio', lat: 30.3500, lng: -97.7000, source: 'csv' }),                                    // same name, far away
    L({ name: 'Maple Tax', postcode: '78701', source: 'dir' }), L({ name: 'Maple Tax', postcode: '78 701', source: 'csv' }),  // same postcode
  ];
  const { items, report } = dedupe(listings, config);
  const by = name => items.find(b => b.names.includes(name));
  assert.equal(items.length, 6);
  const nw = by('Northwind Plumbing');
  assert.equal(nw.sources.length, 3);
  assert.equal(nw.name, 'Northwind Plumbing');                       // Google name wins
  assert.equal(nw.category, 'Plumber');
  assert.equal(nw.category_group, 'trades'); assert.equal(nw.ticket, 'premium');
  assert.equal(nw.website, 'https://northwind-plumbing.example/'); assert.equal(nw.website_kind, 'site');
  assert.equal(nw.google.place_id, 'P1');
  assert.ok(nw.id.startsWith('b_') && nw.id.length === 14);
  assert.equal(by('Bluebird Bakery').sources.length, 2);
  assert.equal(by('Bluebird Bakery').category_group, 'food');
  assert.equal(by('Redwood Dental').sources.length, 2);
  assert.equal(items.filter(b => b.names.includes('Cedar Hair Studio')).length, 2);
  assert.equal(by('Maple Tax').sources.length, 2);
  assert.ok(report.keys_used.phone >= 1 && report.keys_used.domain >= 1 && report.keys_used.instagram >= 1 && report.keys_used.place_id >= 1 && report.keys_used.name_geo >= 2);
  assert.ok(report.clusters.length >= 5);
  assert.ok(report.clusters[0].members.length >= 2);
  assertNoDuplicates(items, config);
});

test('ids are stable and dedupe is idempotent on its own output', () => {
  const listings = [L({ name: 'Northwind Plumbing', phones: ['512-555-0123'] }), L({ name: 'Northwind Plumbing', phones: ['5125550123'] })];
  const a = dedupe(listings, config).items;
  const b = dedupe([...listings].reverse(), config).items;
  assert.equal(a[0].id, b[0].id);
  const again = dedupe(a, config).items;
  assert.equal(again.length, 1); assert.equal(again[0].id, a[0].id); assert.equal(again[0].sources.length, 2);
});

test('switchboard: a key joining 4+ different names is disabled, flagged and reported', () => {
  const names = ['Alpha Realty Team', 'Jordan Smith Homes', 'Casey Lee Mortgage', 'Riverbend Property Group'];
  const { items, report } = dedupe(names.map(name => L({ name, phones: ['512-555-0150'] })), config);
  assert.equal(items.length, 4);
  assert.equal(report.disabled_keys.length, 1);
  assert.equal(report.disabled_keys[0].reason, 'switchboard');
  assert.ok(items.every(b => b.flags.includes('switchboard')));
  assertNoDuplicates(items, config);                                  // exempt: flagged switchboard
  const three = dedupe(names.slice(0, 3).map(name => L({ name, phones: ['512-555-0151'] })), config);
  assert.equal(three.items.length, 1);                               // 3 names still merge
});

test('toll-free numbers merge only with similar names', () => {
  const { items, report } = dedupe([
    L({ name: 'Northwind Plumbing', phones: ['1-800-555-0199'] }), L({ name: 'Northwind Plumbing Inc', phones: ['800 555 0199'] }),
    L({ name: 'Bluebird Bakery', phones: ['1 (800) 555-0199'] }),
  ], config);
  assert.equal(items.length, 2);
  assert.equal(report.kept_apart.length, 1);
  assert.ok(items.every(b => b.flags.includes('shared-toll-free')));
  assertNoDuplicates(items, config);
});

test('guards: shared hosts are never keys, corporate pages key on host + path, name merge needs no conflict', () => {
  const cfg = { ...config, merge: { shared_hosts: ['mall.example'], corporate_hosts: ['bigbrokerage.example'] } };
  const shared = dedupe([L({ name: 'Shop One', website: 'https://mall.example/one' }), L({ name: 'Shop Two', website: 'https://mall.example/two' })], cfg);
  assert.equal(shared.items.length, 2);
  const corp = dedupe([
    L({ name: 'Jane Roe', website: 'https://bigbrokerage.example/agents/jane-roe' }), L({ name: 'J. Roe Realty', website: 'https://bigbrokerage.example/agents/jane-roe/' }),
    L({ name: 'Sam Poe', website: 'https://bigbrokerage.example/agents/sam-poe' }),
  ], cfg);
  assert.equal(corp.items.length, 2);
  assert.equal(corp.items.find(b => b.names.includes('Jane Roe')).website_kind, 'corporate');
  const conflict = dedupe([
    L({ name: 'Cedar Hair Studio', lat: 30.27, lng: -97.74, phones: ['512-555-0155'] }),
    L({ name: 'Cedar Hair Studio', lat: 30.2701, lng: -97.7401, phones: ['512-555-0156'] }),
  ], config);
  assert.equal(conflict.items.length, 2);
  assert.equal(conflict.report.kept_apart[0].reason, 'same name nearby, different phones');
});

test('merged record keeps every name, phone, email and source; picks best values', () => {
  const { items } = dedupe([
    L({ name: 'Bluebird Bakery', phones: ['512-555-0142'], emails: ['orders@bluebird.example'], address: '200 Sample Ave', city: 'Austin', source: 'dir' }),
    L({ name: 'Bluebird Bakery & Cafe', phones: ['512-555-0142', '512-555-0143'], emails: ['hello@bluebird.example'], address: '200 Sample Ave, Suite 4', postcode: '78701', city: 'Austin', hours: 'Mo-Sa 07:00-15:00', source: 'csv', ticket: 'mid' }),
  ], config);
  assert.equal(items.length, 1);
  const b = items[0];
  assert.deepEqual(b.names, ['Bluebird Bakery', 'Bluebird Bakery & Cafe']);
  assert.deepEqual(b.phones.map(p => p.e164), ['+15125550142', '+15125550143']);
  assert.deepEqual(b.emails.sort(), ['hello@bluebird.example', 'orders@bluebird.example']);
  assert.equal(b.address, '200 Sample Ave, Suite 4'); assert.equal(b.postcode, '78701');
  assert.equal(b.hours, 'Mo-Sa 07:00-15:00');
  assert.equal(b.ticket, 'mid');                                       // a segment/listing ticket beats the group default
  assert.deepEqual(Object.keys(b.socials).sort(), ['facebook', 'instagram', 'linkedin', 'telegram', 'tiktok', 'whatsapp', 'x', 'youtube']);
});

test('assertNoDuplicates lists what is still duplicated', () => {
  const a = { id: 'b_1', name: 'One', phones: ['512-555-0123'], sources: [{ id: 'x:1' }] };
  const b = { id: 'b_2', name: 'Two', phones: ['(512) 555-0123'], sources: [{ id: 'x:2' }] };
  assert.throws(() => assertNoDuplicates([a, b], config), /ph:1:5125550123: One \(b_1\) \| Two \(b_2\)/);
});
