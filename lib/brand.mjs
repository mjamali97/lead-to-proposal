// The business's own identity, collected from its site so a redesign keeps it: logo candidates,
// brand colours, fonts, real photos (team, work, premises, products), tagline and description.
// Pure functions over a crawl record (see lib/site.mjs); nothing here touches the network.
import { jsonLd, typeOf, clean, attr, absUrl } from './http.mjs';
import { canonSocial } from './normalize.mjs';

const pagesOf = c => c.pages?.length ? c.pages : (c.home?.body ? [{ url: c.final_url || c.url, kind: 'home', body: c.home.body }] : []);
const homeOf = c => pagesOf(c).find(p => p.kind === 'home') || pagesOf(c)[0] || { url: c.final_url || c.url, body: '' };
const num = v => { const n = parseInt(String(v ?? '').trim(), 10); return /^\d+(px)?$/.test(String(v ?? '').trim()) && n > 0 ? n : null; };

// ---------- logo ----------
const LOGO_WORD = /logo|brand|site-title|custom-logo|navbar-brand|site-branding|wordmark/i;
const THIRD_PARTY_LOGO = /google|yelp|bbb|better-business|trustpilot|houzz|homestars|angi\.com|angies|homeadvisor|thumbtack|visa|mastercard|amex|paypal|stripe|apple-pay|partner|award|badge|certif|member|accredit|association|seal|facebook|instagram|twitter|linkedin|youtube|tiktok|whatsapp|tripadvisor|opentable|ubereats|doordash|skip|grubhub|flag|payment|app-?store|play-?store/i;
const NOT_LOGO = /icon|arrow|loader|spinner|cart|search|menu|hamburger|close|phone|mail|map|pin|marker|star|rating|avatar|placeholder|spacer|pixel|blank/i;

function regionIndex(h) {
  const m = h.match(/<header\b|<(?:div|nav|section)\b[^>]*(?:class|id)=["'][^"']*(?:header|masthead|navbar|site-branding|top-bar|topbar|nav-bar)[^"']*["']/i);
  const start = m ? m.index : Math.max(0, h.search(/<body\b/i));
  // The header ends at </header>, the first main headline, or a few KB later - whichever comes first.
  const ends = [start + 6000];
  const close = h.indexOf('</header>', start); if (m && /^<header/i.test(m[0]) && close > 0) ends.push(close);
  const h1 = h.slice(start).search(/<h1\b/i); if (h1 > 0) ends.push(start + h1);
  const f = h.search(/<footer\b|<(?:div|section)\b[^>]*(?:class|id)=["'][^"']*\bfooter\b/i);
  return { hStart: start, hEnd: Math.min(...ends), footer: f >= 0 ? f : Infinity };
}
const imgSrc = t => {
  const ss = attr(t, 'srcset') || attr(t, 'data-srcset');
  const best = ss ? ss.split(/,\s+(?=\S)/).map(s => s.trim().split(/\s+/)).map(([u, d]) => ({ u, w: parseFloat(d) || 1 })).sort((a, b) => b.w - a.w)[0] : null;
  return { src: attr(t, 'data-src') || attr(t, 'data-lazy-src') || attr(t, 'data-original') || attr(t, 'src') || best?.u || '', srcsetBest: best };
};

// Ranked logo candidates. Each: { url, source, w, h, score, svg? } (svg = inline markup, url '').
export function logoCandidates(c) {
  const home = homeOf(c), h = home.body || '', base = c.final_url || home.url || c.url;
  if (!h) return [];
  const origin = (() => { try { return new URL(base).origin; } catch { return ''; } })();
  const { hStart, hEnd, footer } = regionIndex(h);
  const out = new Map();
  const add = (url, source, score, w = null, h2 = null, extra = {}) => {
    const key = url || extra.svg?.slice(0, 200);
    if (!key || (url && /^data:(?!image\/svg)/i.test(url))) return;
    const prev = out.get(key);
    if (!prev || prev.score < score) out.set(key, { url, source, w, h: h2, score, ...extra });
  };
  const opener = i => {   // the <a ...> this position sits inside, if any (looks back a little)
    const back = h.slice(Math.max(0, i - 600), i), a = back.lastIndexOf('<a '), close = back.lastIndexOf('</a>');
    return a > close ? back.slice(a, back.indexOf('>', a) + 1) : '';
  };
  const homeLink = a => { const href = attr(a, 'href'); return href === '/' || href === './' || (href && absUrl(href, base).replace(/\/(index\.\w+)?$/, '') === origin); };

  for (const m of h.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0], { src } = imgSrc(t), url = absUrl(src, base);
    if (!url) continue;
    const a = opener(m.index), hints = `${attr(t, 'class')} ${attr(t, 'id')} ${attr(t, 'alt')} ${src} ${attr(a, 'class')} ${attr(a, 'id')}`;
    const inHeader = m.index >= hStart && m.index < hEnd, inFooter = m.index >= footer;
    const logoWord = LOGO_WORD.test(hints), w = num(attr(t, 'width')), ht = num(attr(t, 'height'));
    if (THIRD_PARTY_LOGO.test(`${src} ${attr(t, 'alt')}`) && !(logoWord && inHeader && homeLink(a))) continue;
    if (!logoWord && NOT_LOGO.test(src.split('/').pop() || '')) continue;
    let score, source;
    if (logoWord) { score = inFooter ? 55 : inHeader ? 95 : 85; source = inFooter ? 'footer-img' : 'img[logo]'; }
    else if (inHeader && homeLink(a)) { score = 80; source = 'header-img'; }
    else if (inHeader && ![...out.values()].some(x => x.source === 'header-img')) { score = 55; source = 'header-img'; }
    else continue;
    if (/\.svg(\?|$)/i.test(url)) score += 4;
    if ((w && w < 24) || (ht && ht < 16)) score -= 40;
    add(url, source, score, w, ht);
  }
  // Inline SVG logo in the header (or with logo in its class/id or its link): keep the markup.
  for (const m of h.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) {
    if (m.index >= hEnd && m.index < footer) continue;
    const tag = m[0].slice(0, m[0].indexOf('>') + 1), a = opener(m.index);
    const hints = `${attr(tag, 'class')} ${attr(tag, 'id')} ${attr(tag, 'aria-label')} ${attr(a, 'class')} ${attr(a, 'id')} ${attr(a, 'aria-label')}`;
    const vb = (attr(tag, 'viewBox') || '').split(/[\s,]+/).map(Number), vw = num(attr(tag, 'width')) || vb[2] || 0;
    if (/icon|arrow|chevron|close|menu|search|cart|social|facebook|instagram/i.test(hints) && !LOGO_WORD.test(hints)) continue;
    const logo = LOGO_WORD.test(hints), inHeader = m.index >= hStart && m.index < hEnd;
    if (!(logo || (inHeader && homeLink(a) && vw >= 60))) continue;
    if (m[0].length > 60000) continue;
    add('', 'inline-svg', logo ? (m.index >= footer ? 50 : 88) : 75, num(attr(tag, 'width')), num(attr(tag, 'height')), { svg: m[0] });
  }
  for (const n of jsonLd(h)) {
    const l = [].concat(n.logo || [])[0];
    const u = typeof l === 'string' ? l : l?.url || l?.contentUrl;
    if (u) add(absUrl(u, base), 'json-ld', 85, num(l?.width), num(l?.height));
  }
  const metaContent = re => attr((h.match(re) || [''])[0], 'content');
  const og = metaContent(/<meta[^>]+property=["']og:image["'][^>]*>/i);
  if (og && /logo/i.test(og)) add(absUrl(og, base), 'og:image', 70);
  for (const t of (h.match(/<link\b[^>]*>/gi) || [])) {
    const rel = attr(t, 'rel').toLowerCase(), href = absUrl(attr(t, 'href'), base);
    if (!href) continue;
    const [sw, sh] = (attr(t, 'sizes').match(/(\d+)x(\d+)/) || []).slice(1).map(Number);
    if (/apple-touch-icon/.test(rel)) add(href, 'apple-touch-icon', 40, sw || null, sh || null);
    else if (/mask-icon/.test(rel)) add(href, 'mask-icon', 15);
    else if (/\bicon\b/.test(rel)) add(href, 'favicon', (sw || 0) >= 192 ? 30 : 10, sw || null, sh || null);
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

// ---------- colours ----------
const clamp = (x, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, x));
export function parseColor(v) {
  v = String(v).trim().toLowerCase();
  let m;
  if ((m = v.match(/^#([0-9a-f]{3,8})$/))) {
    let s = m[1];
    if (s.length === 3 || s.length === 4) s = [...s].map(ch => ch + ch).join('');
    if (s.length !== 6 && s.length !== 8) return null;
    const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1;
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a };
  }
  if ((m = v.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/))) {
    const ch = x => clamp(x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x));
    return { r: Math.round(ch(m[1])), g: Math.round(ch(m[2])), b: Math.round(ch(m[3])), a: m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1 };
  }
  if ((m = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/))) {
    const hh = (+m[1] % 360) / 360, s = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return { r: Math.round(f(hh + 1 / 3) * 255), g: Math.round(f(hh) * 255), b: Math.round(f(hh - 1 / 3) * 255), a: m[4] ? parseFloat(m[4]) / (m[4].endsWith('%') ? 100 : 1) : 1 };
  }
  return null;
}
export const toHex = ({ r, g, b }) => '#' + [r, g, b].map(x => clamp(Math.round(x)).toString(16).padStart(2, '0')).join('').toUpperCase();

function hsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l, chroma: d * 255 };
}
// Near-white, near-black and greys are not a brand.
export function isNeutral(rgb) {
  const { s, l, chroma } = hsl(rgb);
  return l > 0.93 || l < 0.08 || s < 0.15 || chroma < 22;
}
function lab({ r, g, b }) {
  const lin = x => { x /= 255; return x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), y = f(R * 0.2126 + G * 0.7152 + B * 0.0722), z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

// Defaults shipped by WordPress, Elementor, Bootstrap, browsers and social icon sets: not the business's choice.
const FOREIGN = new Set(['#000000', '#FFFFFF', '#ABB8C3', '#F78DA7', '#CF2E2E', '#FF6900', '#FCB900', '#7BDCB5', '#00D084', '#8ED1FC', '#0693E3', '#9B51E0',
  '#6EC1E4', '#54595F', '#7A7A7A', '#61CE70', '#007BFF', '#0D6EFD', '#28A745', '#198754', '#DC3545', '#FFC107', '#17A2B8', '#0DCAF0', '#6C757D', '#6610F2',
  '#6F42C1', '#E83E8C', '#D63384', '#FD7E14', '#20C997', '#0000EE', '#551A8B', '#3B5998', '#1877F2', '#E4405F', '#C13584', '#1DA1F2', '#25D366', '#FF0000',
  '#0077B5', '#0A66C2', '#BD081C', '#2271B1', '#72AEE6', '#135E96', '#00B9EB', '#4285F4', '#34A853', '#FBBC05', '#EA4335', '#32373C']);
const WP_PRESET = /--wp--preset--(?:color|gradient)--|--wp-admin|--wp--style--color|--e-global-color-(?:primary|secondary|text|accent)\b|--bs-|--swiper|--fa-|--toastify|--plyr/i;
const SOURCE_RANK = ['logo', 'theme-color', 'css-var', 'button', 'inline', 'stylesheet'];
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{5,40}\)|hsla?\([^)]{5,40}\)/g;
const BUTTONISH = /button|\bbtn|\.cta|call-to-action|a:hover|(^|[\s,>])a(\b|:)|\.nav|menu|header|primary|accent|highlight|brand|link/i;

function cssRules(css) {
  const out = [];
  css = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]{1,600})\{([^{}]*)\}/g)) out.push({ sel: m[1].trim().replace(/^@media[^{]*$/, ''), decls: m[2] });
  return out;
}

export function extractColors(c, logos = logoCandidates(c)) {
  const tally = new Map();   // hex -> { rgb, weight, sources:Set }
  const add = (val, weight, source) => {
    const rgb = parseColor(val);
    if (!rgb || rgb.a < 0.5 || isNeutral(rgb)) return;
    const hex = toHex(rgb);
    const t = tally.get(hex) || { rgb, weight: 0, sources: new Set() };
    t.weight += FOREIGN.has(hex) && !['logo', 'theme-color'].includes(source) ? weight * 0.15 : weight;
    t.sources.add(source); tally.set(hex, t);
  };
  const home = homeOf(c), h = home.body || '';
  for (const re of [/<meta[^>]+name=["']theme-color["'][^>]*>/gi, /<meta[^>]+name=["']msapplication-TileColor["'][^>]*>/gi])
    for (const t of h.match(re) || []) add(attr(t, 'content'), /theme-color/i.test(t) ? 14 : 8, 'theme-color');
  // Colours drawn in the logo itself (inline SVG or a fetched SVG file).
  const svgs = [...logos.filter(l => l.svg).map(l => l.svg), ...logos.filter(l => l.url && c.assets?.[l.url]).map(l => c.assets[l.url])].slice(0, 2);
  for (const svg of svgs) {
    const seen = new Set();
    for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g)) {
      const hex = parseColor(m[1]) && toHex(parseColor(m[1])); if (!hex || seen.has(hex)) continue;
      seen.add(hex); add(m[1], 12, 'logo');
    }
  }
  const sheets = [
    ...pagesOf(c).slice(0, 1).flatMap(p => [...p.body.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => ({ css: m[1], src: 'inline' }))),
    ...(c.stylesheets || []).map(s => ({ css: s.body, src: 'stylesheet' })),
  ];
  for (const { css, src } of sheets) {
    const varColor = new Map();
    for (const { sel, decls } of cssRules(css)) {
      for (const d of decls.split(';')) {
        const i = d.indexOf(':'); if (i < 0) continue;
        const prop = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim();
        if (prop.startsWith('--')) {
          if (WP_PRESET.test(prop)) continue;
          const col = (val.match(COLOR_RE) || [])[0]; if (!col) continue;
          varColor.set(prop, col);
          add(col, /primary|brand|accent|main|theme|secondary|highlight/.test(prop) ? 8 : 3, 'css-var');
          continue;
        }
        if (!/color|background|border|fill|stroke|outline|shadow/.test(prop)) continue;
        const btn = BUTTONISH.test(sel) && /^(background(-color)?|color|border(-color)?)$/.test(prop);
        for (const col of val.match(COLOR_RE) || []) add(col, btn ? 3 : 1, btn ? 'button' : src);
        if (/var\(/.test(val)) for (const v of val.matchAll(/var\(\s*(--[\w-]+)/g)) if (varColor.has(v[1])) add(varColor.get(v[1]), 0.5, 'css-var');
      }
    }
  }
  for (const m of h.matchAll(/\sstyle=["']([^"']{0,400})["']/gi)) for (const col of m[1].match(COLOR_RE) || []) add(col, 1, 'inline');

  // Merge near-duplicates into the heavier colour.
  const list = [...tally.entries()].map(([hex, t]) => ({ hex, ...t })).sort((a, b) => b.weight - a.weight);
  const merged = [];
  for (const x of list) {
    const into = merged.find(m => deltaE(m.rgb, x.rgb) < 10);
    if (into) { into.weight += x.weight; x.sources.forEach(s => into.sources.add(s)); } else merged.push({ ...x, sources: new Set(x.sources) });
  }
  return merged.filter(m => m.weight >= 1).sort((a, b) => b.weight - a.weight).slice(0, 8)
    .map(m => ({ hex: m.hex, weight: Math.round(m.weight * 10) / 10, source: SOURCE_RANK.find(s => m.sources.has(s)) || 'stylesheet' }));
}

// ---------- fonts ----------
const GENERIC_FONT = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|inherit|initial|unset|revert|-apple-system|blinkmacsystemfont|segoe ui|roboto fallback|arial|helvetica( neue)?|verdana|tahoma|times( new roman)?|georgia|courier( new)?|trebuchet ms|lucida grande|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|emoji|var\(.*|.*awesome.*|dashicons|eicons|icomoon|glyphicons.*|slick|revicons|etmodules|fontello|themify|ionicons|material icons.*|simple-line-icons|elegantIcons|linearicons|feather|bootstrap-icons|swiper-icons|wpforms|star|woocommerce)$/i;
export function extractFonts(c) {
  const google = new Map(), other = new Map();
  const bump = (m, k, n = 1) => { k = k.replace(/["'+]/g, ' ').replace(/\s+/g, ' ').trim(); if (k && !GENERIC_FONT.test(k) && k.length < 40) m.set(k, (m.get(k) || 0) + n); };
  const texts = [...pagesOf(c).map(p => p.body), ...(c.stylesheets || []).map(s => s.body)];
  for (const t of texts) {
    for (const m of t.matchAll(/(?:fonts\.googleapis\.com|fonts\.bunny\.net)\/css2?\?([^"')\s>]+)/gi)) {
      const q = m[1].replace(/&amp;/g, '&');
      for (const fam of q.split('&').filter(p => p.startsWith('family=')))
        for (const f of decodeURIComponent(fam.slice(7)).split('|')) bump(google, f.split(':')[0], 5);
    }
    if (/use\.typekit\.net|p\.typekit\.net/i.test(t)) bump(other, 'Adobe Fonts (kit)', 3);
    for (const m of t.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*([^;}]+)/gi)) bump(other, m[1], 2);
    for (const m of t.matchAll(/font-family\s*:\s*([^;}"]+|"[^"]+"[^;}]*)/gi)) bump(other, m[1].split(',')[0], 1);
  }
  const names = [...google.entries(), ...[...other.entries()].filter(([k]) => !google.has(k))].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return [...new Set(names)].slice(0, 6);
}

// ---------- photos ----------
const PHOTO_SKIP_FILE = /icon|sprite|pixel|spacer|blank|placeholder|loader|loading|spinner|arrow|badge|seal|flag|emoji|logo|favicon|button|btn|payment|visa|mastercard|paypal|stars?[-_.]|rating|social|facebook|instagram|twitter|whatsapp|youtube|linkedin|tiktok|yelp|bbb|trustpilot|google|map[-_.]|captcha|gravatar|avatar-default|mystery-man|wpcf7|ajax-loader|transparent|1x1|dummy|no-image|noimage|default-image/i;
const TRACKER_HOST = /facebook\.com\/tr|google-analytics|googletagmanager|doubleclick|googleadservices|bat\.bing|analytics\.|pixel\.|px\.ads|t\.co\/|linkedin\.com\/px|scorecardresearch|quantserve|hotjar|clarity\.ms|gravatar\.com|maps\.googleapis|maps\.gstatic|ytimg\.com|vimeocdn|trustpilot|yelp|googleusercontent\.com\/proxy/i;
const STOCK_HOST = /images\.unsplash\.com|source\.unsplash|images\.pexels\.com|cdn\.pixabay\.com|pixabay\.com\/get|shutterstock|istockphoto|gettyimages|depositphotos|dreamstime|123rf|stock\.adobe|ftcdn\.net|freepik|placehold|placeholder\.com|picsum\.photos|dummyimage|placekitten|lorempixel|loremflickr|fakeimg/i;
const KINDS = [
  ['team', /team|staff|owner|founder|our[-_ ]doctor|doctor|dr[-_.]|dentist|lawyer|attorney|portrait|headshot|chef|barber|stylist|technician|crew|employee|mitarbeiter|inhaber|équipe|squadra|personeel|about[-_ ]?(us|me)|ueber-uns|chi-siamo|over-ons/i],
  ['work', /gallery|galerie|galleria|portfolio|project|projekt|before|after|vorher|nachher|our[-_ ]work|job|install|renovat|remodel|kitchen-reno|bathroom|roof|repair|result|case[-_ ]stud|referenz|realisation|lavori|werk/i],
  ['place', /storefront|store-?front|exterior|interior|office|shop|store|building|location|clinic|salon|showroom|reception|lobby|waiting|dining|restaurant|premises|praxis|laden|negozio|winkel|façade|facade|outside|inside/i],
  ['product', /menu|dish|food|pizza|cake|bread|pastry|coffee|plate|meal|burger|sushi|product|produkt|prodotto|item|collection|wine|cocktail|dessert/i],
  ['hero', /hero|banner|slider|slide|carousel|cover|masthead|jumbotron|header-bg|bg-image|background/i],
];
const urlBase = u => { try { const x = new URL(u); return (x.pathname.replace(/\/v1\/(fill|fit|crop)\/.*$/, '').replace(/-\d{2,5}x\d{2,5}(?=\.\w+$)/, '').replace(/(@2x|-scaled|-e\d{10,})(?=\.\w+$)/, '')).toLowerCase(); } catch { return u; } };
const sizeFromUrl = u => {
  const wp = u.match(/-(\d{2,5})x(\d{2,5})\.\w+(\?|$)/); if (wp) return [+wp[1], +wp[2]];
  const wix = u.match(/\/w_(\d+),h_(\d+)/); if (wix) return [+wix[1], +wix[2]];
  const q = u.match(/[?&](?:w|width)=(\d{2,5})/); if (q) return [+q[1], null];
  return [null, null];
};

export function extractPhotos(c, logos = logoCandidates(c)) {
  const logoBases = new Set(logos.filter(l => l.url).map(l => urlBase(l.url)));
  const found = new Map();
  let stock = 0;
  const consider = ({ url, alt = '', w = null, h = null, page, pageKind, ctx = '', from = 'img', inFooter = false }) => {
    if (!url || /^data:/i.test(url) || !/^https?:/i.test(url)) return;
    let pathname = ''; try { pathname = new URL(url).pathname; } catch { return; }
    if (/\.(svg|gif|ico|bmp)(\?|$)/i.test(pathname) || TRACKER_HOST.test(url)) return;
    if (STOCK_HOST.test(url)) { stock++; return; }
    const file = pathname.split('/').pop() || '';
    if (PHOTO_SKIP_FILE.test(file) || /logo/i.test(alt)) return;
    const base = urlBase(url);
    if (logoBases.has(base)) return;
    const [uw, uh] = sizeFromUrl(url); w ||= uw; h ||= uh;
    if ((w && w < 200) || (h && h < 150) || (w && h && Math.max(w, h) < 300)) return;
    if (/avatar|testimonial|review|author/i.test(ctx) && (!w || w < 400)) return;   // reviewer thumbnails are not their photos
    // What the photo says about itself (alt, file name) beats where it sits on the page.
    let kind = (KINDS.find(([, re]) => re.test(`${alt} ${file.replace(/\.\w+$/, '')}`)) || KINDS.find(([, re]) => re.test(ctx)) || ['other'])[0];
    if (kind === 'other' && pageKind === 'about' && /\b(me|us|our|team|owner|founder)\b/i.test(alt)) kind = 'team';
    if (kind === 'other' && pageKind === 'services' && /gallery|portfolio|projects|work/i.test(page)) kind = 'work';
    if (kind === 'other' && from === 'og') kind = 'hero';
    const score = (w && h ? Math.log10(w * h) * 10 : 45) + ({ team: 20, work: 18, place: 16, product: 14, hero: 12, other: 0 }[kind]) +
      (pageKind === 'home' ? 6 : 0) + (alt ? 5 : 0) - (inFooter ? 25 : 0) - (from === 'bg' ? 4 : 0);
    const prev = found.get(base);
    if (prev) {
      if ((w || 0) * (h || 0) > (prev.w || 0) * (prev.h || 0)) Object.assign(prev, { url, w, h });
      prev.alt ||= clean(alt); prev.score = Math.max(prev.score, score);
      if (prev.kind === 'other') prev.kind = kind;
      return;
    }
    found.set(base, { url, alt: clean(alt).slice(0, 160), w, h, page, kind, score });
  };
  for (const pg of pagesOf(c)) {
    const b = pg.body, f = b.search(/<footer\b/i);
    for (const m of b.matchAll(/<img\b[^>]*>/gi)) {
      const t = m[0], { src, srcsetBest } = imgSrc(t);
      const url = absUrl(srcsetBest && srcsetBest.w > 1 ? srcsetBest.u : src, pg.url);
      const ctx = (b.slice(Math.max(0, m.index - 700), m.index).match(/(?:class|id)=["'][^"']*["']/gi) || []).slice(-4).join(' ') + ' ' + attr(t, 'class');
      consider({ url, alt: attr(t, 'alt') || attr(t, 'title'), w: num(attr(t, 'width')) || (srcsetBest?.w > 1 ? Math.round(srcsetBest.w) : null), h: num(attr(t, 'height')),
        page: pg.url, pageKind: pg.kind, ctx, inFooter: f >= 0 && m.index > f });
    }
    // Hero/section background images set inline.
    for (const m of b.matchAll(/<(\w+)\b[^>]*style=["'][^"']*background(?:-image)?\s*:[^"']*url\(\s*(?:&quot;|['"])?([^'")&]+)/gi)) {
      const tag = b.slice(m.index, b.indexOf('>', m.index) + 1);
      consider({ url: absUrl(m[2], pg.url), page: pg.url, pageKind: pg.kind, ctx: `${attr(tag, 'class')} ${attr(tag, 'id')} hero`, from: 'bg' });
    }
    if (pg.kind === 'home') {
      const og = attr((b.match(/<meta[^>]+property=["']og:image["'][^>]*>/i) || [''])[0], 'content');
      if (og && !/logo/i.test(og)) consider({ url: absUrl(og, pg.url), page: pg.url, pageKind: 'home', from: 'og',
        w: num(attr((b.match(/<meta[^>]+property=["']og:image:width["'][^>]*>/i) || [''])[0], 'content')),
        h: num(attr((b.match(/<meta[^>]+property=["']og:image:height["'][^>]*>/i) || [''])[0], 'content')) });
    }
  }
  const photos = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 24).map(({ score, ...p }) => p);
  return { photos, stock };
}

// ---------- words ----------
export function extractWords(c) {
  const h = homeOf(c).body || '';
  const meta = re => clean(attr((h.match(re) || [''])[0], 'content'));
  const ld = jsonLd(h).find(n => /Organization|LocalBusiness|Store|Restaurant|Service|Business|Dentist|Attorney|Physician|Contractor|Salon/.test(typeOf(n)) && (n.slogan || n.description));
  const description = (meta(/<meta[^>]+name=["']description["'][^>]*>/i) || meta(/<meta[^>]+property=["']og:description["'][^>]*>/i) || clean(ld?.description || '')).slice(0, 300);
  let tagline = clean(ld?.slogan || '');
  if (!tagline) {
    const m = h.match(/<(p|span|div|h2|h3)\b[^>]*class=["'][^"']*(?:tagline|slogan|site-description|subtitle|sub-title|subheading|hero[-_]?(?:sub|text|lead)|lead)[^"']*["'][^>]*>([\s\S]{0,400}?)<\/\1>/i);
    if (m) tagline = clean(m[2]);
  }
  if (!tagline) {
    const h1 = clean((h.match(/<h1\b[^>]*>([\s\S]{0,400}?)<\/h1>/i) || [])[1] || '');
    if (h1.length >= 12 && h1.length <= 90) tagline = h1;
  }
  if (!tagline) {
    const title = clean((h.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i) || [])[1] || ''), site = meta(/<meta[^>]+property=["']og:site_name["'][^>]*>/i);
    const parts = title.split(/\s+[|–—·-]\s+/).filter(p => p && p.toLowerCase() !== site.toLowerCase());
    if (parts.length > 1) tagline = parts.sort((a, b) => b.length - a.length)[0];
  }
  return { tagline: tagline.slice(0, 140), description };
}

// Instagram / Facebook profiles linked from the site: where the redesign can find more real photos.
function photoProfiles(c) {
  const out = { instagram: '', facebook: '' };
  for (const pg of pagesOf(c)) for (const m of pg.body.matchAll(/href=["'](https?:\/\/[^"']*(?:instagram\.com|facebook\.com|fb\.com)[^"']*)["']/gi)) {
    let s; try { s = canonSocial(m[1]); } catch { s = null; }
    const net = s && (s.network || s.platform);
    if (net && net in out && !out[net]) out[net] = s.url;
  }
  return out;
}

export function extractBrand(c) {
  const empty = { logo: [], colors: [], fonts: [], photos: [], stock_photos: 0, tagline: '', description: '', profiles: { instagram: '', facebook: '' } };
  if (!homeOf(c).body) return empty;
  const logos = logoCandidates(c);
  const { photos, stock } = extractPhotos(c, logos);
  return {
    logo: logos.map(l => ({ url: l.url, source: l.source, w: l.w ?? null, h: l.h ?? null, score: l.score, ...(l.svg && { svg: l.svg.slice(0, 30000) }) })),
    colors: extractColors(c, logos),
    fonts: extractFonts(c),
    photos, stock_photos: stock,
    ...extractWords(c),
    profiles: photoProfiles(c),
  };
}
