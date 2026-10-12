import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePhone, splitPhones, samePhone, fmtPhone, isTollFree, asciiDigits, fixUrl, hostname, regDomain, classifyUrl, canonSocial,
  normName, nameSim, bestNameSim, hasScript, haversineKm, inArea, categoryGroup, ticketFor,
} from '../../lib/normalize.mjs';

const e164 = (raw, country) => parsePhone(raw, { country })?.e164 || '';

test('phones: NANP', () => {
  assert.equal(e164('(512) 555-0123', 'US'), '+15125550123');
  assert.equal(e164('tel:5125550123', 'CA'), '+15125550123');
  assert.equal(e164('1-512-555-0123', 'US'), '+15125550123');
  assert.equal(e164('+5125550123', 'US'), '+15125550123');          // "+512..." with the 1 dropped
  assert.equal(e164('011 44 20 7555 0123', 'US'), '+442075550123');
  const p = parsePhone('+1 512-555-0123 ext. 45', { country: 'US' });
  assert.equal(p.ext, '45'); assert.equal(p.key, '1:5125550123'); assert.equal(p.cc, '1'); assert.equal(p.nsn, '5125550123');
  assert.equal(parsePhone('512-555-0123 x12', { country: 'US' }).ext, '12');
  assert.equal(parsePhone('512-555-0123 #7', { country: 'US' }).ext, '7');
  assert.equal(parsePhone('123', { country: 'US' }), null);
  assert.equal(parsePhone('', { country: 'US' }), null);
  assert.equal(parsePhone('123456', { country: 'US' }).valid, false);
});

test('phones: trunk prefixes, (0), 00 and Italy keeping its zero', () => {
  assert.equal(e164('020 7555 0123', 'GB'), '+442075550123');
  assert.equal(e164('+44 (0)20 7555 0123', 'GB'), '+442075550123');
  assert.equal(e164('040 5550123', 'DE'), '+49405550123');
  assert.equal(e164('0049 40 5550123', 'DE'), '+49405550123');
  assert.equal(e164('49405550123', 'DE'), '+49405550123');           // country code without +
  assert.equal(parsePhone('+49 (0) 40 5550123 Durchwahl 12', { country: 'DE' }).ext, '12');
  assert.equal(e164('06 5550 123', 'IT'), '+39065550123');
  assert.equal(e164('+39 06 5550 123', 'IT'), '+39065550123');
  assert.equal(parsePhone('333 555 0123', { country: 'IT' }).type, 'mobile');
  assert.equal(e164('01 25 55 01 23', 'FR'), '+33125550123');
  assert.equal(e164('020 555 0123', 'NL'), '+31205550123');
  assert.equal(e164('205550123', 'NL'), '+31205550123');              // source dropped the trunk zero
  assert.equal(e164('912 555 012', 'ES'), '+34912555012');
  assert.equal(e164('04 1555 0123', 'AU'), '+61415550123');
  assert.equal(parsePhone('04 1555 0123', { country: 'AU' }).type, 'mobile');
  assert.equal(e164('021 555 0123', 'ZA'), '+27215550123');
  assert.equal(e164('55 5550 1234', 'MX'), '+525555501234');
});

test('phones: other countries, unknown countries, non-Latin digits', () => {
  for (const [raw, cc, want] of [['01 555 0123', 'IE', '+35315550123'], ['01 555 01 23', 'AT', '+4315550123'], ['044 555 01 23', 'CH', '+41445550123'],
    ['02 555 01 23', 'BE', '+3225550123'], ['08 555 012 3', 'SE', '+4685550123'], ['22 55 50 12', 'NO', '+4722555012'], ['33 55 50 12', 'DK', '+4533555012'],
    ['09 555 0123', 'FI', '+35895550123'], ['22 555 01 23', 'PL', '+48225550123'], ['221 555 012', 'CZ', '+420221555012'], ['09 555 0123', 'NZ', '+6495550123'],
    ['04 555 0123', 'AE', '+97145550123'], ['0212 555 01 23', 'TR', '+902125550123'], ['011 2555 0123', 'IN', '+911125550123'], ['(11) 5555-0123', 'BR', '+551155550123'],
    ['22 555 0123', 'PT', '+351225550123'], ['352 555 0123', 'LU', '+3523525550123']])
    assert.equal(e164(raw, cc), want, `${cc} ${raw}`);
  assert.equal(e164('+81 3 5555 0123', 'US'), '+81355550123');       // not in the table: E.164 kept
  assert.equal(parsePhone('+81 3 5555 0123', { country: 'US' }).key, '81:355550123');
  assert.equal(asciiDigits('۰۱۲٣٤५६'), '0123456');
  assert.equal(e164('۰۲۰ ۷۵۵۵ ۰۱۲۳', 'GB'), '+442075550123');       // Persian digits
  assert.equal(e164('٠٢٠ ٧٥٥٥ ٠١٢٣', 'GB'), '+442075550123');       // Arabic-Indic digits
  assert.equal(e164('०२० ७५५५ ०१२३', 'GB'), '+442075550123');       // Devanagari digits
  assert.equal(e164('5125550123', 'XX'), '');                         // unknown home country, no +
});

test('phones: split, compare, format, toll-free', () => {
  assert.deepEqual(splitPhones('040/5550123 oder 0176 5550123; +49 30 5550123'), ['040/5550123', '0176 5550123', '+49 30 5550123']);
  assert.deepEqual(splitPhones('512-555-0123 / 512-555-0124'), ['512-555-0123', '512-555-0124']);
  assert.deepEqual(splitPhones('(512) 555-0123 or (512) 555-0124'), ['(512) 555-0123', '(512) 555-0124']);
  const a = parsePhone('+49 40 5550123', { country: 'DE' });
  assert.equal(samePhone(a, parsePhone('040 5550123', { country: 'DE' })), 'same');
  assert.equal(samePhone(a, parsePhone('040 5550123-45', { country: 'DE' })), 'same_block');
  assert.equal(samePhone(parsePhone('512-555-0123 x1', { country: 'US' }), parsePhone('512-555-0123 x2', { country: 'US' })), 'same_block');
  assert.equal(samePhone(parsePhone('512-555-0123', { country: 'US' }), parsePhone('512-555-0124', { country: 'US' })), 'different');
  assert.equal(samePhone('+1 512 555 0123', '(512) 555-0123', { country: 'US' }), 'same');
  assert.equal(samePhone(null, a), 'different');
  assert.equal(fmtPhone(parsePhone('5125550123', { country: 'US' })), '(512) 555-0123');
  assert.equal(fmtPhone(parsePhone('+15125550123 ext 9')), '(512) 555-0123 ext. 9');
  assert.equal(fmtPhone(parsePhone('+442075550123')), '020 7555 0123');
  assert.equal(fmtPhone(parsePhone('+33125550123')), '01 25 55 01 23');
  assert.equal(fmtPhone(parsePhone('+393335550123')), '333 555 0123');
  assert.equal(fmtPhone(parsePhone('+441615550123')), '0161 555 0123');
  assert.equal(fmtPhone(parsePhone('+61415550123')), '0415 550 123');
  assert.equal(fmtPhone(parsePhone('+49405550123')), '040 555 0123');
  assert.equal(fmtPhone({ valid: false, raw: 'call us' }), 'call us');
  assert.equal(isTollFree(parsePhone('1-800-555-0199', { country: 'US' })), true);
  assert.equal(isTollFree(parsePhone('512-555-0123', { country: 'US' })), false);
  assert.equal(isTollFree(parsePhone('0800 555 0123', { country: 'GB' })), true);
  assert.equal(parsePhone('1-800-555-0199', { country: 'US' }).type, 'toll_free');
});

test('urls: fix, host, registrable domain', () => {
  assert.equal(fixUrl('northwind.example'), 'https://northwind.example/');
  assert.equal(fixUrl('//cdn.example/x'), 'https://cdn.example/x');
  assert.equal(fixUrl('mailto:a@b.example'), '');
  assert.equal(fixUrl('not a url'), '');
  assert.equal(hostname('https://WWW.Northwind.example/path'), 'northwind.example');
  assert.equal(regDomain('shop.northwind.co.uk'), 'northwind.co.uk');
  assert.equal(regDomain('a.b.northwind.example'), 'northwind.example');
  assert.equal(regDomain('www.northwind.com.au'), 'northwind.com.au');
  assert.equal(regDomain('northwind.co.nz'), 'northwind.co.nz');
  assert.equal(regDomain('loja.northwind.com.br'), 'northwind.com.br');
  assert.equal(regDomain('northwind.github.io'), 'northwind.github.io');
});

test('urls: what kind of website', () => {
  assert.equal(classifyUrl(''), 'none');
  assert.equal(classifyUrl('northwind.example'), 'site');
  assert.equal(classifyUrl('https://northwind.wixsite.com/home'), 'free_subdomain');
  assert.equal(classifyUrl('https://sites.google.com/view/northwind'), 'free_subdomain');
  assert.equal(classifyUrl('https://linktr.ee/northwind'), 'free_subdomain');
  assert.equal(classifyUrl('https://northwind.business.site'), 'free_subdomain');
  assert.equal(classifyUrl('https://www.instagram.com/northwind'), 'social');
  assert.equal(classifyUrl('https://www.yelp.com/biz/northwind'), 'aggregator');
  assert.equal(classifyUrl('https://www.yelp.co.uk/biz/northwind'), 'aggregator');
  assert.equal(classifyUrl('https://booksy.com/en-us/1_northwind'), 'aggregator');
  assert.equal(classifyUrl('https://www.google.com/maps/place/x'), 'aggregator');
  assert.equal(classifyUrl('https://www.remax.com/agent/x'), 'corporate');
  assert.equal(classifyUrl('https://agents.bigbrokerage.example/jane', { corporateHosts: ['bigbrokerage.example'] }), 'corporate');
  assert.equal(classifyUrl('https://mall.example/shops/12', { sharedHosts: ['mall.example'] }), 'corporate');
  assert.equal(classifyUrl('https://directory.example/listing/1', { directoryHosts: ['directory.example'] }), 'directory');
});

test('socials: canonical profile, no share/post links or placeholders', () => {
  assert.deepEqual(canonSocial('https://www.instagram.com/Northwind.Plumbing/?hl=en'), { network: 'instagram', handle: 'northwind.plumbing', url: 'https://instagram.com/northwind.plumbing' });
  assert.equal(canonSocial('https://instagram.com/p/abc123'), null);
  assert.equal(canonSocial('https://www.instagram.com/reel/abc123'), null);
  assert.equal(canonSocial('https://www.facebook.com/'), null);
  assert.equal(canonSocial('https://www.facebook.com/sharer/sharer.php?u=x'), null);
  assert.equal(canonSocial('https://www.facebook.com/plugins/page.php?href=x'), null);
  assert.equal(canonSocial('https://twitter.com/intent/tweet?text=x'), null);
  assert.equal(canonSocial('https://instagram.com/yourusername'), null);
  assert.equal(canonSocial('https://www.facebook.com/profile.php?id=1000123').url, 'https://facebook.com/profile.php?id=1000123');
  assert.equal(canonSocial('https://www.linkedin.com/company/northwind-co/about').url, 'https://linkedin.com/company/northwind-co');
  assert.equal(canonSocial('https://youtube.com/@northwind').handle, '@northwind');
  assert.equal(canonSocial('https://www.tiktok.com/@northwind?lang=en').url, 'https://tiktok.com/@northwind');
  assert.equal(canonSocial('https://x.com/NorthwindCo').url, 'https://x.com/northwindco');
  assert.deepEqual(canonSocial('https://wa.me/15125550123'), { network: 'whatsapp', handle: '15125550123', url: 'https://wa.me/15125550123' });
  assert.equal(canonSocial('https://api.whatsapp.com/send?phone=15125550123').url, 'https://wa.me/15125550123');
  assert.equal(canonSocial('https://t.me/northwind').network, 'telegram');
  assert.equal(canonSocial('https://northwind.example'), null);
});

test('names: legal suffixes, tokens and trigrams', () => {
  assert.equal(normName('Café Müller GmbH'), 'cafe muller gmbh');
  assert.equal(nameSim('Northwind Plumbing Inc.', 'Northwind Plumbing'), 1);
  assert.ok(nameSim('Northwind Plumbing', 'Northwind Plumbing & Drain') >= 0.9);
  assert.equal(nameSim("Joe's Pizza", 'Joes Pizza LLC'), 1);
  assert.equal(nameSim('Bäckerei Sonne GmbH', 'Backerei Sonne'), 1);
  assert.ok(nameSim('Northwind Salon', 'Northwind Plumbing') < 0.6);
  assert.ok(nameSim('Bluebird Bakery', 'Redwood Dental') < 0.2);
  assert.ok(nameSim('Austin Northwind Plumbing', 'Northwind Plumbing', { stop: ['Austin'] }) === 1);
  assert.equal(bestNameSim(['Bluebird', 'Bluebird Bakery Ltd'], ['Redwood', 'Bluebird Bakery']), 1);
  assert.equal(nameSim('', 'x'), 0);
  assert.equal(hasScript('Bäckerei Δelta', /\p{Script=Greek}/u), true);
  assert.equal(hasScript('Northwind', '\\p{Script=Arabic}'), false);
});

test('area: bbox, radius, cities, with reasons', () => {
  const area = { bbox: [30.0, -98.1, 30.7, -97.4], cities: ['austin', 'round rock'] };
  assert.deepEqual(inArea({ lat: 30.27, lng: -97.74 }, area), { ok: true, reason: 'bbox' });
  assert.equal(inArea({ city: 'Round Rock' }, area).ok, true);
  assert.equal(inArea({ address: '1 Example St, Round Rock, TX' }, { cities: ['round rock'] }).ok, true);
  const out = inArea({ lat: 32.78, lng: -96.8, city: 'Dallas' }, area);
  assert.equal(out.ok, false); assert.match(out.reason, /outside bbox/); assert.match(out.reason, /Dallas/);
  assert.equal(inArea({}, area).ok, false);
  assert.equal(inArea({ lat: 30.3, lng: -97.7 }, { center: [30.27, -97.74], radius_km: 10 }).ok, true);
  assert.match(inArea({ lat: 31.3, lng: -97.7 }, { center: { lat: 30.27, lng: -97.74 }, radius_km: 10 }).reason, /km from center/);
  assert.equal(inArea({ city: 'Anywhere' }, {}).ok, true);
  assert.ok(Math.abs(haversineKm([30.2672, -97.7431], [30.5083, -97.6789]) - 27.5) < 1);
});

test('categories: config groups, word starts, tickets', () => {
  const config = { categories: { groups: { trades: ['plumb', 'roof'], food: ['bakery', 'cafe'], legal: ['law', 'attorney'] }, ticket: { trades: 'premium', food: 'low' } } };
  const g = config.categories.groups;
  assert.equal(categoryGroup(['Plumber'], g), 'trades');
  assert.equal(categoryGroup(['', 'Bluebird Bakery'], g), 'food');
  assert.equal(categoryGroup(['Café Sol'], g), 'food');
  assert.equal(categoryGroup(['Hairdresser'], g), 'other');
  assert.equal(categoryGroup(['Outlaw Coffee'], g), 'other');        // "law" only at a word start
  assert.equal(categoryGroup([], g), 'other');
  assert.equal(ticketFor('trades', config), 'premium');
  assert.equal(ticketFor('other', config), 'low');
});
