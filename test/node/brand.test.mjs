import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractBrand, logoCandidates, extractColors, parseColor, toHex, isNeutral, deltaE } from '../../lib/brand.mjs';
import { pickStylesheets, crawlSite } from '../../lib/site.mjs';
import { configureHttp } from '../../lib/http.mjs';
import { fixtureCrawl, serveSite, FIXTURES } from '../fixtures/sites/server.mjs';

const URL0 = 'https://cedarstone.example/';
const brandCrawl = () => {
  const c = fixtureCrawl('brand', { url: URL0, stylesheets: ['wp-content/themes/cedar/style.css'] });
  c.assets[`${URL0}wp-content/uploads/cedar-stone-logo.svg`] = fs.readFileSync(path.join(FIXTURES, 'brand/wp-content/uploads/cedar-stone-logo.svg'), 'utf8');
  return c;
};

test('logo: the header logo wins; JSON-LD next; touch icon above favicon; partner badges never', () => {
  const logos = extractBrand(brandCrawl()).logo;
  assert.deepEqual(logos.map(l => [l.source, l.url.replace(URL0, '/')]), [
    ['img[logo]', '/wp-content/uploads/cedar-stone-logo.svg'],
    ['json-ld', '/wp-content/uploads/cedar-stone-logo.png'],
    ['apple-touch-icon', '/wp-content/uploads/apple-touch-icon.png'],
    ['favicon', '/favicon.ico'],
  ]);
  assert.deepEqual([logos[0].w, logos[0].h], [220, 60]);
  assert.ok(logos.every((l, i) => i === 0 || l.score <= logos[i - 1].score));
});

test('logo: an inline SVG logo keeps its markup and gives its colours', () => {
  const html = `<html><head><title>Juniper Yoga</title></head><body><header><a href="/" class="site-logo" aria-label="Juniper Yoga home"><svg viewBox="0 0 120 40" width="120"><circle cx="20" cy="20" r="18" fill="#8A2BE2"/><text fill="#333333">Juniper</text></svg></a>
    <a href="/classes"><svg class="icon icon-menu" viewBox="0 0 24 24"><path d="M0 0h24"/></svg></a></header><h1>Yoga</h1>
    <meta property="og:image" content="/media/juniper-logo-card.png"></body></html>`;
  const c = { url: 'https://juniper.example/', final_url: 'https://juniper.example/', pages: [{ url: 'https://juniper.example/', kind: 'home', body: html }], stylesheets: [], assets: {} };
  const logos = logoCandidates(c);
  assert.equal(logos[0].source, 'inline-svg');
  assert.match(logos[0].svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(logos.some(l => l.source === 'og:image' && l.url.endsWith('juniper-logo-card.png')));
  assert.equal(logos.filter(l => l.source === 'inline-svg').length, 1);      // the menu icon is not a logo
  assert.deepEqual(extractColors(c, logos).map(x => [x.hex, x.source]), [['#8A2BE2', 'logo']]);
});

test('colours: brand colours first, greys and platform defaults ignored, near-duplicates merged', () => {
  const colors = extractBrand(brandCrawl()).colors;
  assert.deepEqual(colors.slice(0, 2).map(x => x.hex), ['#1F6F5C', '#E07A2F']);
  for (const x of colors) assert.ok(!isNeutral(parseColor(x.hex)), `${x.hex} is a grey`);
  const hexes = colors.map(x => x.hex);
  for (const h of ['#333333', '#F5F5F5', '#DDDDDD', '#999999', '#CF2E2E', '#FF6900', '#0693E3', '#9B51E0', '#6EC1E4', '#61CE70', '#3B5998', '#1E6E5B'])
    assert.ok(!hexes.includes(h), `${h} should not be a brand colour`);
  assert.ok(colors[0].weight > colors[1].weight);
  assert.ok(colors.every(x => ['logo', 'theme-color', 'css-var', 'button', 'inline', 'stylesheet'].includes(x.source)));
});

test('colour helpers', () => {
  assert.equal(toHex(parseColor('#abc')), '#AABBCC');
  assert.equal(toHex(parseColor('rgb(31, 111, 92)')), '#1F6F5C');
  assert.equal(toHex(parseColor('hsl(0, 100%, 50%)')), '#FF0000');
  assert.equal(parseColor('rgba(0,0,0,.1)').a, 0.1);
  assert.equal(isNeutral(parseColor('#777777')), true);
  assert.equal(isNeutral(parseColor('#FAFAF7')), true);
  assert.equal(isNeutral(parseColor('#0B1F3A')), false);   // dark navy is a colour, not black
  assert.ok(deltaE(parseColor('#1F6F5C'), parseColor('#1E6E5B')) < 2);
  assert.ok(deltaE(parseColor('#1F6F5C'), parseColor('#E07A2F')) > 50);
});

test('fonts, tagline, description, photo profiles', () => {
  const b = extractBrand(brandCrawl());
  assert.deepEqual(b.fonts.slice(0, 2), ['Montserrat', 'Lora']);
  assert.ok(!b.fonts.some(f => /georgia|serif|sans-serif/i.test(f)));
  assert.equal(b.tagline, 'Kitchens, baths and decks built to last');
  assert.match(b.description, /^Cedar & Stone Renovations builds kitchens/);
  assert.deepEqual(b.profiles, { instagram: 'https://instagram.com/cedarstone.example.reno', facebook: 'https://facebook.com/cedarstoneexamplereno' });
});

test('photos: real large photos kept and classified; icons, pixels, stock, avatars, badges and logos dropped', () => {
  const b = extractBrand(brandCrawl());
  const byFile = Object.fromEntries(b.photos.map(p => [p.url.split('/').pop(), p]));
  assert.equal(byFile['sam-carter-owner.jpg'].kind, 'team');
  assert.equal(byFile['showroom-exterior.jpg'].kind, 'place');
  assert.equal(byFile['project-bathroom-1024x768.jpg'].kind, 'work');
  assert.equal(byFile['hero-deck.jpg'].kind, 'hero');
  assert.deepEqual([byFile['project-kitchen-1024x683.jpg'].w, byFile['project-kitchen-1024x683.jpg'].h], [1024, 683]);
  assert.ok(!byFile['project-kitchen-300x200.jpg'], 'a smaller copy of the same photo is merged');
  for (const bad of ['icon-phone.png', 'spinner.gif', 'reviewer-jane-96x96.jpg', 'bbb-accredited-logo.png', 'cedar-stone-logo.svg', 'cedar-stone-logo.png'])
    assert.ok(!byFile[bad], `${bad} should not be a photo`);
  assert.ok(!b.photos.some(p => /facebook\.com\/tr|unsplash/.test(p.url)));
  assert.equal(b.stock_photos, 1);
  assert.equal(b.photos[0].kind, 'team');           // ranking favours the people and the work
  assert.ok(b.photos.every(p => p.page === URL0));
});

test('crawl fetches the theme stylesheet and SVG logo, not plugin CSS', async () => {
  const html = fs.readFileSync(path.join(FIXTURES, 'brand/index.html'), 'utf8');
  assert.deepEqual(pickStylesheets(html, URL0), [`${URL0}wp-content/themes/cedar/style.css`]);
  configureHttp({ cacheDir: null, gap: 0, timeout: 3000 });
  const s = await serveSite('brand');
  try {
    const c = await crawlSite(s.url, { gap: 0 });
    assert.ok(s.hits.includes('/wp-content/themes/cedar/style.css') && s.hits.includes('/wp-content/uploads/cedar-stone-logo.svg'));
    assert.ok(!s.hits.includes('/wp-content/plugins/gallery/gallery.css'));
    const b = extractBrand(c);
    assert.equal(b.colors[0].source, 'logo');
    assert.ok(!b.colors.some(x => x.hex === '#FF00AA'));
  } finally { await s.close(); }
});

test('no HTML, no brand', () => {
  assert.deepEqual(extractBrand({ pages: [], home: null }).logo, []);
});
