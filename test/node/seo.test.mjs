import test from 'node:test';
import assert from 'node:assert/strict';
import { seoAudit, band, CATEGORIES } from '../../lib/seo.mjs';
import { fixtureCrawl } from '../fixtures/sites/server.mjs';

const JARGON = /\b(h1|alt text|schema|json-ld|meta|viewport|canonical|crawl|index(ation)?|render-blocking|open graph|robots\.txt|lazy-load|lang attribute)\b/i;

test('SEO: a complete modern page scores Excellent', () => {
  const c = fixtureCrawl('modern', { url: 'https://brightpath.example/', pages: { contact: 'contact.html', about: 'about.html' },
    robots: 'User-agent: *\nDisallow: /wp-admin/', sitemap: { ok: true, locs: 2 }, stylesheets: ['css/site.css'] });
  c.links_checked = [{ url: 'https://brightpath.example/team/', status: 200, ok: true }];
  const r = seoAudit(c);
  assert.ok(r.score >= 90, `scored ${r.score}: ${r.technical.join('; ')}`);
  assert.equal(r.band, 'Excellent');
  assert.equal(r.measured_pct, 100);
  assert.deepEqual(Object.keys(r.categories), CATEGORIES.map(x => x[0]));
  assert.equal(r.categories.schema, 100);
});

test('SEO: the old WordPress page is Critical, in plain English with a technical twin', () => {
  const c = fixtureCrawl('oldwp', { url: 'https://harlowplumbing.example/', pages: { about: 'about-us.html' } });
  const r = seoAudit(c);
  assert.ok(r.score < 50, `scored ${r.score}`);
  assert.equal(r.band, 'Critical');
  assert.equal(r.issues.length, r.technical.length);
  assert.equal(r.issues[0], 'The site is not built for phones: visitors have to pinch and zoom');   // most severe first
  assert.equal(r.technical[0], 'No viewport meta tag');
  assert.ok(r.issues.includes('Google sees no business details (hours, address, phone) built into the page'));
  for (const i of r.issues) assert.ok(!JARGON.test(i), `jargon in plain issue: "${i}"`);
  const vp = r.checks.find(x => x.id === 'viewport');
  assert.equal(vp.ok, false); assert.equal(vp.got, 0); assert.equal(vp.severity, 3);
});

test('SEO: unmeasurable categories lower measured_pct instead of being guessed', () => {
  const c = fixtureCrawl('german', { url: 'https://feldhaus-zahntechnik.example/' });
  const r = seoAudit(c);
  assert.equal(r.categories.images, null);    // no images on the page
  assert.equal(r.measured_pct, 90);
  const shell = fixtureCrawl('modern');
  shell.pages[0].body = shell.home.body = '<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
  const s = seoAudit(shell);
  assert.match(s.band, /partial: JavaScript-only page/);
  assert.equal(s.categories.headings, null);
});

test('SEO: no score for sites that are not ok', () => {
  const c = fixtureCrawl('parked'); c.state = 'parked';
  assert.equal(seoAudit(c), null);
  assert.equal(seoAudit({ state: 'dns', pages: [] }), null);
});

test('SEO bands', () => {
  assert.equal(band(95), 'Excellent'); assert.equal(band(70), 'Good'); assert.equal(band(69), 'Needs significant work'); assert.equal(band(49), 'Critical'); assert.equal(band(null), '');
});
