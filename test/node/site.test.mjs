import test from 'node:test';
import assert from 'node:assert/strict';
import { configureHttp } from '../../lib/http.mjs';
import { siteKey, pageKind, siteState, crawlSite, auditSignals, extractPhones, extractEmails, extractSocials, extractOwner, ownerFromText, footerYear, agencyCredit, decodeCfEmail } from '../../lib/site.mjs';
import { serveSite } from '../fixtures/sites/server.mjs';

configureHttp({ cacheDir: null, gap: 0, timeout: 3000, respectRobots: true });
const crawl = async (name, opts = {}) => {
  const s = await serveSite(name, opts);
  try { return { c: await crawlSite(s.url, { gap: 0, country: 'US', ...opts }), s }; } finally { await s.close(); }
};

test('siteKey: host without www, keeps a non-default port', () => {
  assert.equal(siteKey('https://www.Northwind.example/contact?x=1'), 'northwind.example');
  assert.equal(siteKey('northwind.example'), 'northwind.example');
  assert.equal(siteKey('http://127.0.0.1:8123/'), '127.0.0.1:8123');
  assert.equal(siteKey(''), '');
});

test('pageKind: legal and privacy pages in several languages', () => {
  for (const p of ['/impressum', '/imprint/', '/mentions-legales/', '/note-legali', '/colofon', '/aviso-legal', '/legal-notice']) assert.equal(pageKind(p), 'legal', p);
  for (const p of ['/datenschutz', '/privacy-policy', '/politique-de-confidentialite', '/privacidad', '/privacybeleid']) assert.equal(pageKind(p), 'privacy', p);
  assert.equal(pageKind('/kontakt/'), 'contact');
  assert.equal(pageKind('/chi-siamo'), 'about');
  assert.equal(pageKind('/x', 'Über uns'), 'about');
  assert.equal(pageKind('/leistungen'), 'services');
  assert.equal(pageKind('/agb'), 'terms');
});

test('siteState: blocked is not broken; dns, timeout, offsite redirect', () => {
  const st = (home, extra = {}) => siteState({ url: 'https://shop.example/', final_url: 'https://shop.example/', home, ...extra });
  assert.equal(st({ status: 0, error: 'ENOTFOUND' }), 'dns');
  assert.equal(st({ status: 0, error: 'timeout' }), 'timeout');
  assert.equal(st({ status: 0, error: 'CERT_HAS_EXPIRED' }), 'broken');
  assert.equal(st({ status: 503, body: '' }), 'broken');
  assert.equal(st({ status: 403, body: '' }), 'blocked');
  assert.equal(st({ status: 429, body: '' }), 'blocked');
  assert.equal(st({ status: 0, robots: true }), 'blocked');
  assert.equal(st({ status: 200, body: '<html><title>Just a moment...</title><body>checking</body></html>' }), 'blocked');
  const page = '<html><head><title>Shop</title></head><body><h1>Welcome</h1>' + '<p>We repair bikes and sell parts. </p>'.repeat(10) + '<a href="/x">x</a></body></html>';
  assert.equal(st({ status: 200, body: page }), 'ok');
  assert.equal(st({ status: 200, body: page }, { final_url: 'https://other-brand.example/' }), 'redirect_offsite');
  assert.equal(st({ status: 200, body: page }, { final_url: 'https://www.shop.example/home' }), 'ok');
});

test('crawl: modern site - signals, contacts, owner, menu pages', async () => {
  const { c } = await crawl('modern');
  assert.equal(c.state, 'ok');
  assert.deepEqual(c.pages.map(p => p.kind), ['home', 'contact', 'about', 'privacy', 'services']);   // max 5 pages
  assert.ok(c.sitemap.ok && c.robots);
  const s = auditSignals(c);
  assert.equal(s.viewport, true); assert.equal(s.tel_link, true); assert.equal(s.form, true);
  assert.equal(s.booking_widget, 'Calendly'); assert.equal(s.gtm, true); assert.equal(s.google_ads, true); assert.equal(s.meta_pixel, true);
  assert.equal(s.ua_tag, false); assert.equal(s.footer_year, 2025); assert.equal(s.incumbent_agency, ''); assert.equal(s.parked, false);
  assert.deepEqual(extractPhones(c, 'US').map(p => p.e164), ['+15125550134']);
  assert.deepEqual(extractEmails(c).map(e => e.email), ['hello@brightpath.example']);   // jobs@ is the wrong role
  assert.ok(extractEmails(c)[0].page.endsWith('/contact/'));
  const so = extractSocials(c);
  assert.equal(so.instagram, 'https://instagram.com/brightpath.example.dental');
  assert.equal(so.facebook, '');                                                       // a share link is not a profile
  assert.deepEqual(extractOwner(c), { name: 'Dr. Maya Ellison', role: 'founder / owner (about page)', source: c.pages[2].url, confidence: 'medium' });
});

test('crawl: old WordPress site - footer 2018, no viewport, UA tag, agency credit, no tel link', async () => {
  const { c } = await crawl('oldwp');
  const s = auditSignals(c);
  assert.equal(c.state, 'ok');
  assert.equal(s.footer_year, 2018);
  assert.equal(s.viewport, false);
  assert.equal(s.ua_tag, true);
  assert.equal(s.tel_link, false);
  assert.equal(s.builder, 'WordPress');
  assert.equal(s.generator, 'WordPress 4.9.8');
  assert.equal(s.incumbent_agency, 'PixelForge Studio (pixelforge-studio.example)');
  assert.deepEqual(extractPhones(c, 'US').map(p => [p.e164, p.how]), [['+15125550142', 'text']]);
  assert.deepEqual(extractEmails(c), []);              // another domain, not declared by the site
  assert.equal(extractOwner(c).confidence, 'not published');
});

test('crawl: parked and coming-soon pages', async () => {
  const p = await crawl('parked');
  assert.equal(p.c.state, 'parked');
  assert.equal(auditSignals(p.c).parked, true);
  assert.ok(!p.s.hits.includes('/sitemap.xml'), 'a parked domain is not crawled further');
  const cs = await crawl('comingsoon');
  assert.equal(cs.c.state, 'coming_soon');
  assert.equal(auditSignals(cs.c).coming_soon, true);
  assert.deepEqual(extractPhones(cs.c, 'US').map(x => x.e164), ['+15125550151']);
});

test('crawl: German site - owner from the Impressum, fax/chamber/third-party numbers dropped, no-CEM statement', async () => {
  const { c } = await crawl('german', { country: 'DE' });
  assert.deepEqual(c.pages.map(p => p.kind), ['home', 'contact', 'legal', 'privacy', 'services'].slice(0, c.pages.length));
  const s = auditSignals(c);
  assert.equal(s.has_impressum, true);
  assert.equal(s.has_privacy, true);
  assert.equal(s.no_cem_statement, true);
  assert.equal(s.lang, 'de');
  assert.deepEqual(extractPhones(c, 'DE').map(p => p.e164), ['+49305550142']);
  assert.deepEqual(extractEmails(c).map(e => e.email), ['labor@feldhaus-zahntechnik.example']);   // "[at]" form, domain declared by canonical
  const o = extractOwner(c);
  assert.equal(o.name, 'Jonas Feldhaus');
  assert.equal(o.confidence, 'high');
  assert.ok(o.source.endsWith('/impressum/'));
});

test('crawl: Cloudflare-protected emails decoded; agency, role and placeholder addresses dropped', async () => {
  const { c } = await crawl('cloudflare');
  const got = extractEmails(c).map(e => e.email);
  assert.deepEqual(got, ['hello@quillstone.example', 'bookings@quillstone.example', 'priya@quillstone.example', 'quillstone.books@gmail.com']);
  assert.equal(decodeCfEmail('5a323f3636351a2b2f333636292e35343f743f223b372a363f'), 'hello@quillstone.example');
  assert.equal(extractOwner(c).name, 'Priya Castellane');
});

test('crawl: robots.txt is respected for menu pages; Disallow: / blocks the site', async () => {
  const { c, s } = await crawl('robots');
  assert.equal(c.state, 'ok');
  assert.ok(!s.hits.some(h => h.startsWith('/private')), `fetched a disallowed path: ${s.hits.join(' ')}`);
  assert.deepEqual(c.skipped.filter(x => x.reason === 'robots').map(x => x.kind), ['contact']);
  assert.ok(c.pages.some(p => p.kind === 'about'));
  const all = await crawl('robots', { routes: { '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /\n' } } });
  assert.equal(all.c.state, 'blocked');
  assert.deepEqual(all.s.hits, ['/robots.txt']);
});

test('crawl: server errors, refusals and timeouts', async () => {
  const err = await crawl('modern', { routes: { '/': { status: 503, body: 'down' } } });
  assert.equal(err.c.state, 'broken');
  const forbidden = await crawl('modern', { routes: { '/': { status: 403, body: 'no' } } });
  assert.equal(forbidden.c.state, 'blocked');
  const s = await serveSite('modern', { routes: { '/': { delay: 2000 } } });
  try { assert.equal((await crawlSite(s.url, { gap: 0, timeout: 300 })).state, 'timeout'); } finally { await s.close(); }
});

test('owner: legal-notice patterns in several languages; junk and placeholders rejected', () => {
  assert.equal(ownerFromText('Impressum\nInhaber: Dr. Lena Brandt\nMusterweg 1', 'x', 'legal').name, 'Dr. Lena Brandt');
  assert.equal(ownerFromText('Gérant : Julien Marchetti\nSIRET 000', 'x', 'legal').name, 'Julien Marchetti');
  assert.equal(ownerFromText('Titolare: Giulia Ferraresi - P.IVA 000', 'x', 'legal').name, 'Giulia Ferraresi');
  assert.equal(ownerFromText('Eigenaar: Daan Verhoeven', 'x', 'legal').name, 'Daan Verhoeven');
  assert.equal(ownerFromText('Directeur de la publication : Camille Rousseau', 'x', 'legal').name, 'Camille Rousseau');
  assert.equal(ownerFromText('The bakery was founded by Nora Whitfield in 2009.', 'x').name, 'Nora Whitfield');
  assert.equal(ownerFromText('Geschäftsführer: Max Mustermann', 'x', 'legal'), null);
  assert.equal(ownerFromText('Inhaber: Musterfirma GmbH', 'x', 'legal'), null);
  assert.equal(ownerFromText('Owner: Northwind Plumbing Services', 'x'), null);
  assert.equal(ownerFromText('Write to sarah.jones@shop.example for bookings', 'x'), null);   // never from an email address
});

test('footer year and agency credit edge cases', () => {
  assert.equal(footerYear('<footer>© 2015–2019 Shop</footer>'), 2019);
  assert.equal(footerYear('<footer>&copy; 2099 Template</footer>'), null);   // a year in the future is a template, not a date
  assert.equal(footerYear('<p>Founded 2012</p>'), null);
  assert.equal(agencyCredit('<footer>Powered by <a href="https://wordpress.org/">WordPress</a></footer>', 'https://shop.example/').name, '');
  assert.equal(agencyCredit('<footer>Website by <a href="https://shop.example/about">Shop</a></footer>', 'https://shop.example/').name, '');
  assert.equal(agencyCredit('<footer><a href="https://webcraft.example/">Website by Webcraft Co</a></footer>', 'https://shop.example/').host, 'webcraft.example');
});

test('phones on a Persian page: Persian digits, Persian labels, fax dropped', () => {
  const body = `<html lang="fa" dir="rtl"><body><footer>
    <p>تلفن: ۰۲۱-۸۵۵۵۰۱۲۳</p>
    <p>موبایل: ۰۹۱۲ ۵۵۵ ۰۱۲۴</p>
    <p>فکس: ۰۲۱-۸۵۵۵۰۱۹۹</p>
    <a href="tel:+989125550125">۰۹۱۲ ۵۵۵ ۰۱۲۵</a>
  </footer></body></html>`;
  const c = { country: 'IR', pages: [{ url: 'https://salon-yas.example/', kind: 'home', body }] };
  const got = extractPhones(c, 'IR').map(p => [p.e164, p.how]);
  assert.deepEqual(got.map(x => x[0]).sort(), ['+982185550123', '+989125550124', '+989125550125']);
  assert.ok(!got.some(x => x[0] === '+982185550199'), 'fax is not a phone');
});
