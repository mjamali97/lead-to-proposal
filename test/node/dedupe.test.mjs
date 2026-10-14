import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, assertNoDuplicates, normalizeListing, naturalId, idsFromBusinesses, idAliases } from '../../lib/dedupe.mjs';

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

test('Iran: Persian-digit and national numbers are kept and merge with +98 listings', () => {
  const ir = { ...config, market: { country: 'IR' }, area: {} };
  const l = normalizeListing(L({ name: 'Yas Salon', phone: '۰۹۱۲۵۵۵۰۱۲۳ یا ۰۲۱-۸۵۵۵۰۱۲۳' }), ir);
  assert.deepEqual(l.phones.map(p => p.e164), ['+989125550123', '+982185550123']);
  const { items } = dedupe([L({ name: 'Yas Salon', phones: ['0912 555 0123'] }), L({ name: 'سالن یاس', phones: ['+98 912 555 0123'] })], ir);
  assert.equal(items.length, 1);
});

test('stable ids: adding a source never changes an existing business id', () => {
  const first = [{ source: 'csv', source_id: 'm:northwind', name: 'Northwind Plumbing', phones: ['512-555-0123'] }];
  const one = dedupe(first, config);
  const id = one.items[0].id;
  assert.equal(id, naturalId('m:northwind'));                      // a new business: the 1.0.0 rule
  assert.equal(one.ids.sources['m:northwind'], id);
  // A new source whose id sorts first lists the same business. 1.0.0 re-derived the id from it.
  const more = [...first, { source: 'dir', source_id: 'a:nw-1', name: 'Northwind Plumbing & Drain', phones: ['(512) 555-0123'] }];
  assert.notEqual(dedupe(more, config).items[0].id, id, 'without the registry the id would change');
  const two = dedupe(more, config, { ids: one.ids });
  assert.equal(two.items.length, 1);
  assert.equal(two.items[0].id, id);
  assert.equal(two.ids.sources['a:nw-1'], id);
  assert.deepEqual(two.report.id_changes, []);
  // Order of listings and re-running on its own output change nothing.
  assert.equal(dedupe([...more].reverse(), config, { ids: two.ids }).items[0].id, id);
  assert.equal(dedupe(two.items, config, { ids: two.ids }).items[0].id, id);
});

test('stable ids: two known businesses merge, the bigger keeps its id, the other becomes an alias', () => {
  const a = [{ source: 'csv', source_id: 'c:1', name: 'Maple Tax', phones: ['512-555-0131'] }, { source: 'dir', source_id: 'd:1', name: 'Maple Tax Co', phones: ['512-555-0131'] }];
  const b = [{ source: 'csv', source_id: 'c:0', name: 'Maple Tax Services', website: 'maple-tax.example' }];
  const before = dedupe([...a, ...b], config);
  assert.equal(before.items.length, 2);
  const idA = before.items.find(x => x.sources.length === 2).id, idB = before.items.find(x => x.sources.length === 1).id;
  // Later a listing shows they are one business (same phone and same website).
  const link = { source: 'dir', source_id: 'd:2', name: 'Maple Tax', phones: ['512-555-0131'], website: 'https://maple-tax.example/' };
  const after = dedupe([...a, ...b, link], config, { ids: before.ids });
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].id, idA);
  assert.deepEqual(after.items[0].former_ids, [idB]);
  assert.equal(after.ids.aliases[idB], idA);
  assert.deepEqual(after.report.id_changes, [{ id: idA, name: after.items[0].name, from: [idB] }]);
  assert.ok(idAliases(after.items[0]).includes(idB));
  // The same thing when the input is already-merged businesses (the Google pass) with no registry at all.
  const again = dedupe([...before.items, link], config);
  assert.equal(again.items[0].id, idA);
});

test('stable ids: a split keeps the id on one side and mints a fresh one for the other', () => {
  const ls = [{ source: 'csv', source_id: 'c:1', name: 'Cedar Hair Studio', phones: ['512-555-0141'] }, { source: 'csv', source_id: 'c:2', name: 'Cedar Hair Studio', phones: ['512-555-0141'] }];
  const before = dedupe(ls, config);
  assert.equal(before.items.length, 1);
  const id = before.items[0].id;
  const split = dedupe([ls[0], { ...ls[1], name: 'Cedar Hair Studio North', phones: ['512-555-0142'] }], config, { ids: before.ids });
  assert.equal(split.items.length, 2);
  assert.equal(split.items.find(x => x.sources[0].id === 'c:1').id, id, 'the listing the id came from keeps it');
  assert.notEqual(split.items[0].id, split.items[1].id);
});

test('stable ids: data from 1.0.0 (no registry) keeps its ids', () => {
  const old = dedupe([{ source: 'csv', source_id: 'm:1', name: 'Redwood Dental', phones: ['512-555-0151'] }], config).items;
  const reg = idsFromBusinesses(old);
  assert.equal(reg.sources['m:1'], old[0].id);
  const now = dedupe([{ source: 'csv', source_id: 'm:1', name: 'Redwood Dental', phones: ['512-555-0151'] },
    { source: 'osm', source_id: 'a:9', name: 'Redwood Dental Clinic', phones: ['+1 512 555 0151'] }], config, { ids: reg });
  assert.equal(now.items[0].id, old[0].id);
});
