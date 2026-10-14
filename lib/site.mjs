// One crawl per website: home + robots.txt + sitemap + a few menu pages (contact, legal, about,
// privacy, services). Feeds the audit signals, contacts (phones with the page they were on, emails,
// socials), the owner named on the site, the SEO audit and the brand kit. Pure functions below take
// the crawl record, so they can be tested on fixture HTML without a network.
import { get, jsonLd, typeOf, stripTags, clean, attr, absUrl, unescape } from './http.mjs';
import { parsePhone, splitPhones, canonSocial, hostname, regDomain, fixUrl, COUNTRIES, normDigits } from './normalize.mjs';
import { logoCandidates } from './brand.mjs';

const NOW_Y = () => new Date().getFullYear();
const host = u => hostname(u);
const rootDomain = u => { try { return regDomain(u) || host(u); } catch { return host(u); } };

// One site = one key: the hostname without www.
export function siteKey(url) {
  const u = fixUrl(url); if (!u) return '';
  return hostname(u);   // hostname() keeps a non-default port: a different port is a different site
}

// ---------- detection tables ----------
const BUILDERS = [
  [/static\.wixstatic\.com|wix\.com\/|_wixCIDX|wix-warmup-data/i, 'Wix'], [/squarespace(-cdn)?\.com|static1\.squarespace/i, 'Squarespace'],
  [/cdn\.shopify\.com|Shopify\.theme/i, 'Shopify'], [/webflow\.(com|io)|data-wf-page/i, 'Webflow'],
  [/img1\.wsimg\.com|websitebuilder\.godaddy|godaddysites/i, 'GoDaddy'], [/dudaone|_dm_static|multiscreensite|irp\.cdn-website\.com/i, 'Duda'],
  [/weebly\.com|editmysite\.com/i, 'Weebly'], [/jimdo(cdn|free|site)?\.com|jimdo/i, 'Jimdo'], [/webnode\./i, 'Webnode'],
  [/zyrosite|hostinger website builder/i, 'Hostinger'], [/strikingly/i, 'Strikingly'], [/site123/i, 'SITE123'], [/framerusercontent|framer\.com\//i, 'Framer'],
  [/wp-content|wp-includes|wp-json/i, 'WordPress'], [/\/media\/jui\/|joomla/i, 'Joomla'], [/drupal-settings-json|\/sites\/default\/files/i, 'Drupal'],
  [/ghost\.(io|org)|content="Ghost/i, 'Ghost'], [/__NEXT_DATA__|\/_next\/static/, 'Next.js'], [/___gatsby/, 'Gatsby'],
];
const BOOKING = [
  [/calendly\.com/i, 'Calendly'], [/acuityscheduling\.com|as\.me\//i, 'Acuity'], [/janeapp\.com/i, 'Jane'], [/setmore\.com/i, 'Setmore'],
  [/squareup\.com\/appointments|square\.site\/book/i, 'Square Appointments'], [/mindbodyonline|mindbody\.io/i, 'Mindbody'], [/simplybook\./i, 'SimplyBook'],
  [/vagaro\.com/i, 'Vagaro'], [/opentable\.(com|ca|co\.uk|de)/i, 'OpenTable'], [/resy\.com/i, 'Resy'], [/booksy\.com/i, 'Booksy'], [/zocdoc\.com/i, 'Zocdoc'],
  [/nexhealth\.com/i, 'NexHealth'], [/housecallpro\.com/i, 'Housecall Pro'], [/getjobber\.com|jobber\.com/i, 'Jobber'], [/servicetitan\.com|scheduleengine/i, 'ServiceTitan'],
  [/workiz\.com/i, 'Workiz'], [/servicem8\.com/i, 'ServiceM8'], [/doctolib\./i, 'Doctolib'], [/treatwell\./i, 'Treatwell'], [/fresha\.com/i, 'Fresha'],
  [/shore\.com\/|connect\.shore/i, 'Shore'], [/terminland\.de|termin\.io|etermin\.net/i, 'Online appointments'], [/planity\.com/i, 'Planity'],
  [/salonized\.com/i, 'Salonized'], [/timify\.com/i, 'Timify'], [/thefork\.|quandoo\./i, 'Restaurant booking'], [/sevenrooms\.com/i, 'SevenRooms'],
  [/youcanbook\.me/i, 'YouCanBookMe'], [/outlook\.office365\.com\/owa\/calendar|bookings\.microsoft/i, 'Microsoft Bookings'],
];
const CHAT = [
  [/tawk\.to/i, 'Tawk.to'], [/widget\.intercom\.io|intercomcdn/i, 'Intercom'], [/js\.driftt\.com|drift\.com/i, 'Drift'], [/client\.crisp\.chat/i, 'Crisp'],
  [/code\.tidio\.co|tidio/i, 'Tidio'], [/livechatinc\.com|cdn\.livechat/i, 'LiveChat'], [/jivosite|code\.jivo/i, 'JivoChat'], [/freshchat|wchat\.freshchat/i, 'Freshchat'],
  [/gorgias/i, 'Gorgias'], [/zopim|static\.zdassets\.com\/ekr/i, 'Zendesk Chat'], [/podium\.com/i, 'Podium'], [/birdeye\.com/i, 'Birdeye'],
  [/js\.hs-scripts\.com|js\.usemessages\.com/i, 'HubSpot chat'], [/joinchat|wa__btn|whatsapp-(?:button|widget|chat)|wa-chat-box|ht-ctc|qlwapp/i, 'WhatsApp button'],
  [/smartsupp/i, 'Smartsupp'], [/olark/i, 'Olark'], [/chatra\.io/i, 'Chatra'], [/manychat/i, 'ManyChat'],
];
const CALL_TRACKING = /callrail|calltrackingmetrics|invoca|marchex|whatconverts|avanser|mediahawk|ruler analytics/i;
const ADS_GOOGLE = /AW-\d{6,}|googleadservices\.com|gtag\/js\?id=AW-/i;
const ADS_META = /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/i;
const ADS_TIKTOK = /analytics\.tiktok\.com|ttq\.load/i;
// Must be THEM refusing to receive, not boilerplate warning the visitor they might get spam.
const NO_CEM = new RegExp([
  'no unsolicited (commercial )?(e-?mails?|messages?) (are |will be )?(accepted|welcome)',
  '(we|us|this (site|company|firm|business))\\b[^.]{0,60}(do not (accept|wish to receive)|will not accept|refuse to accept)[^.]{0,40}unsolicited',
  'do not (send|contact)[^.]{0,30}unsolicited (commercial )?(e-?mail|messages)', 'no soliciting',
  'widersprechen? (hiermit )?(der|jeder) (nutzung|verwendung)[^.]{0,80}(werbung|werbe)',
  "nous nous opposons [^.]{0,60}(prospection|publicit)", "ci opponiamo [^.]{0,60}(pubblicit|commercial)",
].join('|'), 'i');
// An agency credit is an outbound link in the footer ("Website by <a href=…>Acme</a>"), not bare text.
const AGENCY_LINK = /(?:web\s?site|site|web ?design|designed|developed|built|created|powered|maintained|realisiert|erstellt|gestaltet|umsetzung|réalisé|réalisation|conçu|realizzato|sviluppato|ontwikkeld|ontworpen|diseñado|desarrollado)\s*(?:and\s+\w+\s*)?(?:by|von|durch|par|da|door|por)\s*[:\-]?\s*(?:<[^a][^>]*>\s*)*<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,40})/i;
const AGENCY_INLINE = /<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>[^<]{0,40}?(?:designed|developed|built|created|powered|maintained|web ?design|website|webdesign)\s+(?:by|von|par|da|door|por)\s+([^<]{2,40})<\/a>/i;
const NOT_AGENCY = /wordpress|wpbakery|elementor|shopify|wix|squarespace|webflow|weebly|woocommerce|divi|themeforest|envato|judge\.?me|yoast|jetpack|smartcrawl|google|cookie|stream|godaddy|duda|joomla|drupal|bootstrap|font ?awesome|cloudflare|template|theme|slider ?revolution|layerslider|revslider|webador|bentobox|jimdo|ionos|strato|hostinger|nbsp|&amp|^na$|people who|^link$/i;
const COMING_SOON = /coming soon|under construction|site is being (built|updated)|launching soon|website is on its way|in kürze|demnächst online|im aufbau|bientôt disponible|en construction|in costruzione|prossimamente|binnenkort|en construcción|próximamente/i;
const MAINTENANCE_PLUGIN = /seed_csp|seedprod|coming-soon-page|under-construction-page|wp-maintenance-mode|cmp-coming-soon/i;
const PARKED = /(sedoparking|sedo\.com|dan\.com|afternic|hugedomains|parkingcrew|bodis\.com|above\.com\/|domain (name )?(is|may be) for sale|this domain (is|has been) (registered|parked)|buy this domain|domain zu verkaufen|domain parked|parkingpage|this page is parked|parked free|webhosting-default|plesk default page|apache2? (ubuntu |debian )?default page|<title>\s*it works!|welcome to nginx|default web site page|hosted by agentlocator|future home of something quite cool)/i;
const BOT_WALL = /just a moment\.\.\.|cf-chl-|cf_chl_|attention required! \| cloudflare|sgcaptcha|imunify360|captcha-delivery|please enable cookies|ddos-guard|checking your browser/i;

// ---------- page kinds (multilingual) ----------
const LEGAL_NOTICE = /impressum|imprint|legal[-_ ]?notice|mentions[-_ ]?l[ée]gales|note[-_ ]?legali|colofon|aviso[-_ ]?legal|nota[-_ ]?legal|informa[cç](?:õ|o)es[-_ ]legais|anbieterkennzeichnung|wettelijke[-_ ]informatie|juridische[-_ ]informatie|^legal$/i;
const PRIVACY = /privacy|datenschutz|dsgvo|confidentialit|privacidad|privacit[àa]|informativa|privacybeleid|privacyverklaring|rgpd|gdpr|protecci[oó]n[-_ ]de[-_ ]datos/i;
const TERMS = /terms|agb|cgv|cgu|conditions[-_ ]g[ée]n[ée]rales|condizioni|voorwaarden|t[ée]rminos|nutzungsbedingungen/i;
const CONTACT = /contact|kontakt|contatt|contacto|contato|nous[-_ ]joindre|get[-_ ]in[-_ ]touch|reach[-_ ]us|find[-_ ]us|anfahrt|standort|dove[-_ ]siamo|come[-_ ]raggiungerci|bereikbaarheid/i;
const ABOUT = /about|ueber[-_ ]uns|uber[-_ ]uns|über[-_ ]uns|wir[-_ ]über[-_ ]uns|chi[-_ ]siamo|over[-_ ]ons|qui[-_ ]sommes|a[-_ ]propos|à[-_ ]propos|nosotros|qui[eé]nes[-_ ]somos|sobre[-_ ]n[oó]s|our[-_ ]story|team|staff|equipe|équipe|meet[-_ ]|founder|geschichte|storia|historia|praxis/i;
const SERVICES = /services|leistungen|servizi|diensten|prestations|servicios|what[-_ ]we[-_ ]do|treatments|behandlungen|speisekarte|menu|carte|products|portfolio|gallery|galerie|galleria|projects|projekte|referenzen|our[-_ ]work/i;

// Which kind a link is, from its path or anchor text. Order = priority.
export function pageKind(path, text = '') {
  const p = decodeURIComponent(String(path || '')).toLowerCase(), t = String(text || '').toLowerCase().trim();
  const test = re => re.test(p) || re.test(t);
  if (p === '/' || p === '') return 'home';
  if (test(LEGAL_NOTICE)) return 'legal';
  if (test(PRIVACY)) return 'privacy';
  if (test(CONTACT)) return 'contact';
  if (test(ABOUT)) return 'about';
  if (test(TERMS)) return 'terms';
  if (test(SERVICES)) return 'services';
  return 'other';
}
const PAGE_PRIORITY = ['contact', 'legal', 'about', 'privacy', 'services', 'terms'];

// ---------- state ----------
const DNS_ERR = /ENOTFOUND|EAI_AGAIN|EAI_NONAME|ENODATA/;
const TLS_ERR = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|HOSTNAME_MISMATCH|EPROTO|HANDSHAKE/i;

function classify(c) {
  const h = c.home;
  if (!h) return { state: 'broken', detail: 'not fetched' };
  if (h.robots) return { state: 'blocked', detail: 'robots.txt asks crawlers not to read this site' };
  if (!h.status) {
    const e = h.error || '';
    if (DNS_ERR.test(e)) return { state: 'dns', detail: 'domain does not resolve (expired or deleted)' };
    if (/timeout/i.test(e)) return { state: 'timeout', detail: 'site did not answer in time' };
    if (TLS_ERR.test(e)) return { state: 'broken', detail: /EXPIRED/i.test(e) ? 'SSL certificate expired (browsers show a security warning)' : 'secure connection fails (browsers show a security warning)' };
    return { state: 'broken', detail: `could not load (${e || 'connection failed'})` };
  }
  if ([401, 403, 429].includes(h.status)) return { state: 'blocked', detail: `site refused our check (HTTP ${h.status}); not a defect` };
  if (h.status >= 400) return { state: 'broken', detail: `site returns HTTP ${h.status}` };
  const body = h.body || '', head = body.slice(0, 20000), low = head.toLowerCase(), text = clean(body.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' '));
  if (BOT_WALL.test(head) && text.length < 2500) return { state: 'blocked', detail: 'bot protection page; not a defect' };
  if (/^\s*(<br\s*\/?>\s*)?<b>(Fatal error|Parse error|Warning)<\/b>|^\s*(Fatal error|Parse error): /i.test(body) && !/<html/i.test(head.slice(0, 6000)))
    return { state: 'broken', detail: 'site shows a PHP error instead of the page' };
  if (/<title>\s*Index of \//i.test(head)) return { state: 'parked', detail: 'empty server directory ("Index of /"), no website' };
  const appShell = /<script\b[^>]*\bsrc=|<div[^>]+id=["'](root|app|__next|__nuxt|main)["']|<app-root|<frameset/i.test(body);
  const tiny = /window\.location(?:\.href)?\s*=\s*["']\/lander/i.test(body)
    || ((h.bytes || body.length) < 1500 && /http-equiv=["']?refresh/i.test(body))
    || (text.length < 120 && !/<a\b/i.test(body) && !appShell);
  if (PARKED.test(head) || PARKED.test(host(c.final_url || c.url))) return { state: 'parked', detail: 'parked, for-sale or empty domain' };
  // A short "coming soon" page is a stalled build, not an empty domain: check it before the tiny-page rule.
  const titleH1 = (low.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/) || ['', ''])[1] + ' ' + (low.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/) || ['', ''])[1];
  if (COMING_SOON.test(titleH1) || MAINTENANCE_PLUGIN.test(head) || (COMING_SOON.test(low.slice(0, 4000)) && (h.bytes || body.length) < 20000))
    return { state: 'coming_soon', detail: 'placeholder "coming soon" page' };
  if (tiny) return { state: 'parked', detail: 'parked, for-sale or empty domain' };
  const a = rootDomain(c.url), b = rootDomain(c.final_url || c.url);
  if (a && b && a !== b) return { state: 'redirect_offsite', detail: `redirects to ${host(c.final_url)}` };
  return { state: 'ok', detail: '' };
}
export const siteState = c => classify(c).state;
export const describeState = c => classify(c).detail;

// ---------- crawl ----------
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|docx?|xlsx?|pptx?|mp4|mov|mp3|wav|css|js|xml|txt)$/i;

export function internalLinks(html, base) {
  const out = [], seen = new Set(), baseHost = host(base);
  for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi)) {
    const href = attr(`<a ${m[1]}>`, 'href'); if (!href || /^(#|mailto:|tel:|javascript:|data:|sms:|whatsapp:)/i.test(href)) continue;
    let u; try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || host(u.href) !== baseHost || SKIP_EXT.test(u.pathname) || /^\/(cdn-cgi|wp-admin|wp-login)/.test(u.pathname)) continue;
    u.hash = '';
    const text = clean(m[2]) || attr(`<a ${m[1]}>`, 'title') || attr(`<a ${m[1]}>`, 'aria-label');
    out.push({ href: u.href, text: text.slice(0, 80), path: u.pathname });
    seen.add(u.href);
  }
  return out;
}

// Same-host stylesheets worth reading for brand colours (theme CSS, not plugins or frameworks).
const CSS_SKIP = /\/wp-includes\/|\/wp-content\/plugins\/|bootstrap|font-?awesome|fontawesome|animate(\.min)?\.css|jquery|swiper|slick|owl\.carousel|fancybox|lightbox|magnific|aos\.css|normalize|reset\.css|dashicons|icons?\.css|elementor\/assets|woocommerce|gutenberg|block-library/i;
export function pickStylesheets(html, base, n = 2) {
  const links = [...String(html).matchAll(/<link\b[^>]*>/gi)].map(m => m[0])
    .filter(t => /rel=["']?stylesheet/i.test(t)).map(t => absUrl(attr(t, 'href'), base)).filter(Boolean)
    .filter(u => host(u) === host(base) && !CSS_SKIP.test(u));
  const rank = u => (/\/themes\/|style|main|custom|site|theme|app|global|brand/i.test(u) ? 0 : 1);
  return [...new Set(links)].sort((a, b) => rank(a) - rank(b)).slice(0, n);
}

// fresh: skip the HTTP cache (re-fetch everything).
export async function crawlSite(url, { maxPages = 5, country = 'US', gap, timeout, checkLinks = 2, fresh = false } = {}) {
  const o = { ...(gap !== undefined && { gap }), ...(timeout !== undefined && { timeout }), ...(fresh && { refresh: true }) };
  const start = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
  const c = { url: start, key: siteKey(start), country, final_url: start, status: 0, ok: false, error: '', state: '', state_detail: '',
    https_available: null, https_error: '', home: null, pages: [], skipped: [], robots: null, sitemap: null,
    internal_links: [], links_checked: [], stylesheets: [], assets: {}, crawled_at: new Date().toISOString().slice(0, 10) };

  let home = await get(start, o);
  // https broken but the server answers on http (common on old hosting): audit what visitors get.
  if (!home.ok && home.status === 0 && !home.robots && !DNS_ERR.test(home.error || '') && !/timeout/.test(home.error || '') && /^https:/i.test(start)) {
    const h2 = await get(start.replace(/^https:/i, 'http:'), o);
    if (h2.status) { c.https_error = home.error; home = h2; }
  }
  // Old framed sites: the visible page is the frame's src.
  if (home.ok && /<frameset\b/i.test(home.body) && (home.body.match(/<frame\b/gi) || []).length <= 3) {
    const src = [...home.body.matchAll(/<frame\b[^>]*\bsrc=["']?([^"' >]+)/gi)].map(m => m[1]).find(x => !/(menu|nav|top|header|footer|left)\./i.test(x));
    const fu = src && absUrl(src, home.finalUrl || start);
    if (fu && host(fu) === host(home.finalUrl || start)) { const fr = await get(fu, o); if (fr.ok) home = { ...fr, framedFrom: home.finalUrl }; }
  }
  // A tiny page that only forwards with <meta http-equiv="refresh">: follow it once.
  const refresh = home.ok && (home.bytes || home.body.length) < 4000 && (home.body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d+\s*;\s*url=['"]?([^"'>\s]+)/i) || [])[1];
  if (refresh) { const ru = absUrl(unescape(refresh), home.finalUrl || start); if (ru && ru !== (home.finalUrl || start)) { const r2 = await get(ru, o); if (r2.status) home = r2; } }
  c.home = { url: home.finalUrl || start, status: home.status, body: home.body || '', bytes: home.bytes || (home.body || '').length,
    headers: home.headers || null, ctype: home.ctype || '', error: home.error || '', robots: !!home.robots };
  c.final_url = home.finalUrl || start; c.status = home.status; c.error = home.error || '';
  ({ state: c.state, detail: c.state_detail } = classify(c));
  c.ok = c.state === 'ok';
  if (home.status >= 200 && home.status < 400) c.pages.push({ url: c.final_url, status: home.status, kind: 'home', body: c.home.body, bytes: c.home.bytes });
  if (!['ok', 'coming_soon', 'redirect_offsite'].includes(c.state)) return c;

  const final = c.final_url, origin = new URL(final).origin;
  if (/^http:/i.test(final)) c.https_available = !!(await get(final.replace(/^http:/i, 'https:'), { ...o, retries: 0 })).ok;
  else c.https_available = true;

  const rob = await get(origin + '/robots.txt', { ...o, skipRobots: true, retries: 1 });
  c.robots_status = rob.status;
  c.robots = rob.ok && !/<html/i.test(rob.body.slice(0, 500)) && (/text\/plain/i.test(rob.ctype || '') || /user-agent|disallow|sitemap/i.test(rob.body.slice(0, 2000))) ? rob.body : null;
  const smList = [...new Set([...(c.robots || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => absUrl(m[1], origin)).filter(Boolean).concat([origin + '/sitemap.xml', origin + '/sitemap_index.xml', origin + '/wp-sitemap.xml']))].slice(0, 3);
  c.sitemap = { url: '', ok: false, locs: 0 };
  for (const sm of smList) {
    const r = await get(sm, { ...o, retries: 0 });
    if (r.ok && /<(urlset|sitemapindex)\b/i.test(r.body.slice(0, 5000))) { c.sitemap = { url: sm, ok: true, locs: (r.body.match(/<loc>/gi) || []).length }; break; }
    if (r.robots) break;
  }

  // Menu pages: contact, legal notice, about, privacy, services, terms - one of each, in that order.
  c.internal_links = internalLinks(c.home.body, final);
  const byKind = new Map();
  for (const l of c.internal_links) {
    const k = pageKind(l.path, l.text);
    if (k === 'home' || k === 'other' || l.href === final) continue;
    if (!byKind.has(k)) byKind.set(k, l.href);
  }
  const fallbacks = { contact: ['/contact', '/contact-us'], legal: /^(DE|AT|CH|LI)$/.test(country) ? ['/impressum'] : [] };
  if (/^(DE|AT|CH)$/.test(country)) fallbacks.contact.unshift('/kontakt');
  const fetched = new Set([final]);
  const budget = Math.max(0, maxPages - 1);
  for (const kind of PAGE_PRIORITY) {
    if (c.pages.length - 1 >= budget) break;
    const cands = byKind.has(kind) ? [byKind.get(kind)] : (fallbacks[kind] || []).slice(0, 1).map(p => origin + p);
    for (const href of cands) {
      if (fetched.has(href)) continue;
      fetched.add(href);
      const r = await get(href, o);
      if (r.robots) { c.skipped.push({ url: href, kind, reason: 'robots' }); continue; }
      const fu = r.finalUrl || href;
      if (!r.ok || !/html/i.test(r.ctype || 'text/html')) { if (byKind.has(kind)) c.skipped.push({ url: href, kind, reason: `HTTP ${r.status || r.error}` }); continue; }
      if (host(fu) !== host(final) || fu === final || c.pages.some(p => p.url === fu)) continue;
      c.pages.push({ url: fu, status: r.status, kind, body: r.body, bytes: r.bytes || r.body.length });
      break;
    }
  }

  // Broken-link sample: a few other internal links, HEAD (405/403 count as fine).
  const used = new Set([...c.pages.map(p => p.url), ...c.skipped.map(s => s.url)]);
  const sample = [...new Set(c.internal_links.map(l => l.href))].filter(h => !used.has(h) && h !== final).slice(0, checkLinks);
  for (const h of sample) {
    const r = await get(h, { ...o, method: 'HEAD', retries: 0 });
    if (r.robots) continue;
    c.links_checked.push({ url: h, status: r.status, ok: r.ok || [403, 405].includes(r.status) });
  }

  // Brand inputs: up to 2 theme stylesheets and a same-host SVG logo (its colours are the brand's).
  for (const css of pickStylesheets(c.home.body, final)) {
    const r = await get(css, o);
    if (r.ok) c.stylesheets.push({ url: css, body: r.body.slice(0, 400_000) });
  }
  const svg = logoCandidates(c).find(l => l.url && /\.svg(\?|$)/i.test(l.url) && host(l.url) === host(final));
  if (svg) { const r = await get(svg.url, o); if (r.ok && /<svg\b/i.test(r.body) && r.body.length < 200_000) c.assets[svg.url] = r.body; }
  return c;
}

// The pages of a crawl that have HTML, home first.
const htmlPages = c => c.pages.length ? c.pages : (c.home?.body ? [{ url: c.final_url || c.url, kind: 'home', body: c.home.body }] : []);
const homeBody = c => c.home?.body || '';

// ---------- audit signals ----------
const FORM = /<input\b[^>]*\stype=["']?(email|tel)\b|<form\b[\s\S]{0,8000}?<textarea\b|data-aid=["']CONTACT_FORM|wpcf7|gform_wrapper|wpforms|ninja-forms|elementor-form|formidable|hs-form|typeform\.com|jotform|wufoo|formspree|netlify-form|data-netlify|fluentform|forminator|caldera-form|cognitoforms|paperform|tally\.so|wixui-form|form-block|sqs-block-form/i;
const LEGAL_LINK = /href=["'][^"']*(impressum|imprint|legal-notice|mentions-legales|note-legali|colofon|aviso-legal)/i;

export function footerYear(html) {
  const tail = String(html).slice(-80000);
  const years = [];
  for (const m of tail.matchAll(/(?:©|&copy;|&#169;|\(c\)|copyright)([^<\n]{0,80})/gi))
    for (const y of m[1].matchAll(/(?<!\d)(19[89]\d|20\d\d)(?!\d)/g)) years.push(+y[1]);
  const ok = years.filter(y => y <= NOW_Y());
  return ok.length ? Math.max(...ok) : null;
}

export function agencyCredit(html, final) {
  const foot = String(html).slice(-60000);
  const ag = foot.match(AGENCY_LINK) || foot.match(AGENCY_INLINE);
  if (!ag) return { name: '', host: '' };
  const name = clean(ag[2]).replace(/\s+/g, ' ').trim(), h = host(ag[1]);
  // An agency links OUT to itself. A self-link, a platform or a versioned plugin banner is not an incumbent.
  if (!h || rootDomain(ag[1]) === rootDomain(final) || NOT_AGENCY.test(name) || NOT_AGENCY.test(h) || /\d+\.\d+/.test(name) || name.length < 3) return { name: '', host: '' };
  return { name: name.slice(0, 40), host: h };
}

const firstMatch = (table, s) => (table.find(([re]) => re.test(s)) || [, ''])[1];

export function auditSignals(c) {
  const s = {
    https: null, https_redirect: null, https_error: c.https_error || '', viewport: null, tel_link: null, whatsapp_link: null, form: null,
    booking_widget: '', chat_widget: '', call_tracking: '', builder: '', generator: '', footer_year: null, ua_tag: false, gtm: false, gtag: false,
    google_ads: false, meta_pixel: false, tiktok_pixel: false, incumbent_agency: '', incumbent_agency_host: '', no_cem_statement: false,
    coming_soon: c.state === 'coming_soon', parked: c.state === 'parked', has_impressum: false, has_privacy: false, mixed_content: false,
    js_shell: false, lang: '', hreflang: false, page_kb: null, title: '', wayback_first: null, wayback_last_change: null,
  };
  if (!['ok', 'coming_soon', 'redirect_offsite'].includes(c.state) || !homeBody(c)) return s;
  const h = homeBody(c), final = c.final_url || c.url, pages = htmlPages(c), all = pages.map(p => p.body).join('\n');
  s.https = /^https:/i.test(final);
  s.https_redirect = s.https ? true : (c.https_available ? false : null);   // false = https works but visitors are not sent there
  s.viewport = /<meta[^>]+name=["']?viewport/i.test(h);
  s.tel_link = /href=["']?tel:/i.test(h);
  s.whatsapp_link = /href=["'][^"']*(wa\.me\/|api\.whatsapp\.com\/send|whatsapp:\/\/send)/i.test(all);
  s.form = FORM.test(all);
  s.booking_widget = firstMatch(BOOKING, all);
  s.chat_widget = firstMatch(CHAT, h);
  s.call_tracking = (h.match(CALL_TRACKING) || [''])[0].toLowerCase();
  s.generator = attr((h.match(/<meta[^>]+name=["']generator["'][^>]*>/i) || [''])[0], 'content').slice(0, 60);
  s.builder = firstMatch(BUILDERS, s.generator) || firstMatch(BUILDERS, h);
  s.footer_year = footerYear(h);
  s.ua_tag = /['"]UA-\d{4,10}-\d{1,4}['"]/.test(h);
  s.gtm = /GTM-[A-Z0-9]{4,}/.test(h);
  s.gtag = /googletagmanager\.com\/gtag\/js/i.test(h);
  s.google_ads = ADS_GOOGLE.test(h);
  s.meta_pixel = ADS_META.test(h);
  s.tiktok_pixel = ADS_TIKTOK.test(h);
  const ag = agencyCredit(h, final);
  s.incumbent_agency = ag.name ? `${ag.name} (${ag.host})` : '';
  s.incumbent_agency_host = ag.host;
  s.no_cem_statement = NO_CEM.test(stripTags(all));
  s.has_impressum = pages.some(p => p.kind === 'legal') || LEGAL_LINK.test(h) || c.internal_links.some(l => LEGAL_NOTICE.test(l.path) || LEGAL_NOTICE.test(l.text));
  s.has_privacy = pages.some(p => p.kind === 'privacy') || c.internal_links.some(l => PRIVACY.test(l.path) || PRIVACY.test(l.text));
  s.mixed_content = s.https && (/<(?:script|img|iframe|source|video|audio|embed)\b[^>]+src=["']http:\/\/(?!localhost|127\.)/i.test(h)
    || /<link\b[^>]*rel=["']?(?:stylesheet|preload)["']?[^>]*href=["']http:\/\/(?!localhost|127\.)/i.test(h));
  const text = clean(h.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' '));
  s.js_shell = text.length < 300 && /id=["'](root|app|__next|__nuxt)["']|<app-root/i.test(h);
  s.lang = ((h.match(/<html\b[^>]*\blang=["']?([a-zA-Z-]{2,10})/i) || [])[1] || '').toLowerCase();
  s.hreflang = /hreflang=["']?[a-z]{2}/i.test(h);
  s.page_kb = Math.round((c.home.bytes || h.length) / 1024);
  s.title = clean((h.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i) || [])[1] || '').slice(0, 160);
  return s;
}

// ---------- phones ----------
const PHONE_LABEL = /(?<![\p{L}])(?:tel(?:efon|ephone|éfono|efono|efoon|\.)?|t\.|fon|phone|call(?: us)?|mob(?:il|ile)?|handy|cell|portable|téléphone|cellulare|bel ons|contact|kontakt|contatto|whatsapp|تلفن(?:\s*همراه)?|تلفن‌همراه|موبایل|همراه|شماره(?:\s*(?:تماس|تلفن))?|تماس|واتس‌?اپ|هاتف|جوال|الهاتف)(?![\p{L}])(?:\s*(?:number|nummer|no\.?|nr\.?|#|numero|numéro|número))?\s*[:.]?\s*/iu;
const PHONE_TEXT = /(?:\+|00)?\(?\d[\d\s().\/–-]{6,20}\d/g;
// Third parties named in cookie banners / privacy text are not the business.
const THIRD_PARTY = /google ireland|google llc|meta platforms|facebook ireland|anbieter:|provider:|cookie|consent|amazon web services|microsoft ireland|cloudflare/i;
const REGULATOR = /kammer|chamber|aufsicht|behörde|registergericht|regulator|ordine|camera di commercio|versicherung|insurer|college of|stichting|tuchtraad|ombudsman|cnil|garante/i;
const ICON_LABEL = /<(?:i|span|svg|img|em)\b[^>]*(?:class|alt|aria-label)=["'][^"']*(?:fa-phone|icon-phone|phone-icon|bi-telephone|la-phone|icon-call|eicon-phone|fa-mobile|telephone)[^"']*["'][^>]*>/gi;

export function extractPhones(c, country = c.country || 'US') {
  const out = [], seen = new Set();
  const add = (raw, page, how) => {
    for (const piece of splitPhones(String(raw))) {
      const ph = parsePhone(piece, { country });
      if (!ph?.valid || seen.has(ph.key)) continue;
      seen.add(ph.key); out.push({ ...ph, page, how });
    }
  };
  const dec = s => { try { return unescape(decodeURIComponent(s.replace(/%(?![0-9a-f]{2})/gi, ''))); } catch { return unescape(s); } };
  for (const pg of htmlPages(c)) {
    const b = pg.body;
    const walk = x => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); if (x.telephone) [].concat(x.telephone).forEach(t => add(t, pg.url, 'schema')); for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v); };
    jsonLd(b).forEach(walk);
    // tel: links: the number shown first (typos in the href are common), then the href.
    for (const m of b.matchAll(/<a\b[^>]*href=["']?tel:([^"' >]+)["']?[^>]*>([\s\S]{0,2000}?)<\/a>/gi)) {
      if (THIRD_PARTY.test(b.slice(Math.max(0, m.index - 300), m.index))) continue;
      const shown = normDigits(clean(m[2]));
      if (/\d{3}/.test(shown) && shown.replace(/\D/g, '').length >= 7) add(shown, pg.url, 'tel link');
      add(dec(m[1]), pg.url, 'tel link');
    }
    for (const m of b.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=)(\+?\d{7,15})/gi)) add('+' + m[1].replace(/^\+/, ''), pg.url, 'whatsapp');
    // Text numbers only after a phone label, never fax, never on privacy pages, never in a regulator's block.
    if (pg.kind === 'privacy' || pg.kind === 'terms') continue;
    const txt = normDigits(stripTags(b.replace(ICON_LABEL, ' Tel: ')));   // Persian/Arabic digits → ASCII
    let hits = 0, skip = 0, pending = false;
    for (const line of txt.split('\n')) {
      if (pending && /^\s*(?:\+|00|\(?0|\(?[1-9]\d)/.test(line) && line.length < 60 && !/fax|فکس|نمابر/i.test(line)) { const nm = line.match(PHONE_TEXT); if (nm) { add(nm[0], pg.url, 'text'); hits++; } pending = false; continue; }
      if (REGULATOR.test(line)) { skip = 5; continue; }
      if (skip > 0) { skip--; continue; }
      if (line.length > 220 || /[{}\\"]/.test(line) || THIRD_PARTY.test(line) || hits >= 3) continue;
      if (/fax|telefax|فکس|نمابر/i.test(line) && !PHONE_LABEL.test(line.replace(/(?:(?:tele)?fax|فکس|نمابر)[^:]*:[^A-Za-z\u0600-\u06FF]*/i, ''))) continue;
      const lm = line.match(PHONE_LABEL); if (!lm) { pending = false; continue; }
      const after = line.slice(lm.index + lm[0].length);
      if (!/\d{3}/.test(after)) { pending = true; continue; }
      const nm = after.split(/(?:tele)?fax|فکس|نمابر/i)[0].match(PHONE_TEXT);
      if (nm) { add(nm[0], pg.url, 'text'); hits++; }
    }
  }
  // A number in another country (cookie-banner HQs, call centres) is dropped when local ones exist.
  const cc = COUNTRIES[country]?.cc;
  const local = cc ? out.filter(p => p.cc === cc) : out;
  return local.length ? local : out;
}

// ---------- emails ----------
export function decodeCfEmail(hex) {
  const k = parseInt(hex.slice(0, 2), 16); let s = '';
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return s;
}
const WRONG_ROLE = /^(hr|careers?|jobs|vacatures|recruiting|bewerbung|karriere|lavoro|emploi|accounts?|accounting|billing|invoices?|rechnung|fattur\w*|factur\w*|webmaster|hostmaster|media|press|presse|stampa|privacy(officer)?|datenschutz|dsb|dpo|gdpr|rgpd|legal|abuse|postmaster|noreply|no-?reply|donotreply|ne-pas-repondre|unsubscribe|opt-?out|claims|complaints|mailer-daemon)([._-][a-z]+)?@/i;
const CONSUMER = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|gmx|web|t-online|freenet|arcor|posteo|mail|libero|virgilio|tiscali|alice|tin|ziggo|kpnmail|planet|hetnet|xs4all|orange|wanadoo|free|laposte|sfr|bluewin|rogers|bell|sympatico|shaw|telus|comcast|verizon|att|sbcglobal|bellsouth|cox|charter|protonmail|proton|zoho|yandex)\.[a-z.]+$/i;
const PLACEHOLDER_EMAIL = /@(example\.(com|org|net)|domain\.(com|tld)|yourdomain|yoursite|yourcompany|company\.com|email\.com|mysite\.com|website\.com|sentry\.io|[a-z0-9.-]*wixpress\.com|sentry-next\.wixpress)|^(name|your|you|user|email|info)@(email|domain|example)\./i;
const okEmail = e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e) && !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e) && e.length <= 80 && !PLACEHOLDER_EMAIL.test(e);

// Domains the site declares as its own (canonical, og:url, JSON-LD url): a site served from an alias still owns them.
function ownDomains(c) {
  const out = new Set([rootDomain(c.final_url || c.url), rootDomain(c.url)]);
  for (const pg of htmlPages(c)) {
    const b = pg.body;
    for (const re of [/<link[^>]+rel=["']canonical["'][^>]*>/i, /<meta[^>]+property=["']og:url["'][^>]*>/i]) {
      const t = (b.match(re) || [''])[0]; const u = attr(t, 'href') || attr(t, 'content'); if (u) out.add(rootDomain(absUrl(u, c.final_url)));
    }
    for (const n of jsonLd(b)) if (typeof n.url === 'string' && !/WebPage/.test(typeOf(n))) out.add(rootDomain(absUrl(n.url, c.final_url)));
  }
  out.delete('');
  return out;
}

export function extractEmails(c) {
  const found = [], own = ownDomains(c);
  for (const pg of htmlPages(c)) {
    const b = pg.body;
    const add = raw => {
      let e = String(raw).trim().toLowerCase().replace(/^mailto:/, '').split('?')[0];
      try { e = decodeURIComponent(e); } catch { /* keep */ }
      e = e.trim();
      if (!okEmail(e) || WRONG_ROLE.test(e) || found.some(f => f.email === e)) return;
      // Only the business's own domain or a personal mailbox; an agency's or a chamber's address is not theirs.
      if (own.has(rootDomain('https://' + e.split('@')[1])) || CONSUMER.test(e)) found.push({ email: e, page: pg.url });
    };
    const visible = stripTags(b).toLowerCase();
    for (const m of b.matchAll(/<a\b[^>]*href=["']mailto:(?:\s|%20|%09|\+)*([^"'?\s]+@[^"'?\s]+)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/a>/gi))
      if (clean(m[2]) || visible.includes(m[1].toLowerCase())) add(m[1]);   // an invisible mailto is usually a designer's leftover
    for (const m of b.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) add(decodeCfEmail(m[1]));
    for (const m of b.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) add(decodeCfEmail(m[1]));
    for (const n of jsonLd(b)) for (const e of [].concat(n.email || [])) if (typeof e === 'string') add(e);
    const txt = stripTags(b).replace(/\s*[\[({]\s*(?:at|ät|@|arroba|chiocciola)\s*[\])}]\s*/gi, '@').replace(/\s+(?:at)\s+(?=[a-z0-9-]+\s*[\[({]?\s*(?:dot|punkt|punto|point)\b)/gi, '@')
      .replace(/\s*[\[({]\s*(?:dot|punkt|punto|point)\s*[\])}]\s*/gi, '.').replace(/(@[a-z0-9-]+)\s+(?:dot|punkt|punto)\s+/gi, '$1.');
    for (const m of txt.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) add(m[0]);
  }
  const ownFirst = e => own.has(rootDomain('https://' + e.email.split('@')[1])) ? 0 : 1;
  return found.sort((a, b) => ownFirst(a) - ownFirst(b));
}

// ---------- socials ----------
export const SOCIAL_KEYS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'whatsapp', 'telegram'];
const NET_ALIAS = { twitter: 'x', fb: 'facebook', ig: 'instagram', wa: 'whatsapp' };

export function extractSocials(c) {
  const counts = new Map();
  const bump = (u, w) => {
    let s; try { s = canonSocial(unescape(u)); } catch { s = null; }
    if (!s?.url) return;
    const net = NET_ALIAS[s.network || s.platform] || s.network || s.platform;
    if (!SOCIAL_KEYS.includes(net)) return;
    const k = `${net}\t${s.url}`; counts.set(k, (counts.get(k) || 0) + w);
  };
  for (const pg of htmlPages(c)) {
    for (const m of pg.body.matchAll(/href=["']((?:https?:)?\/\/[^"']+|https?:[^"']+)["']/gi)) bump(m[1].startsWith('//') ? 'https:' + m[1] : m[1], 1);
    for (const n of jsonLd(pg.body)) for (const u of [].concat(n.sameAs || [])) if (typeof u === 'string') bump(u, 2);
  }
  const best = Object.fromEntries(SOCIAL_KEYS.map(k => [k, '']));
  for (const [k] of [...counts.entries()].sort((a, b) => b[1] - a[1])) { const [net, url] = k.split('\t'); if (!best[net]) best[net] = url; }
  return best;
}

// ---------- owner ----------
const TITLE = String.raw`(?:(?:Dr|Prof|Dipl|Mag|Ing|Avv|Dott|Dott\.ssa|Arch|Rechtsanwalt|Rechtsanwältin|RA|Mr|Mrs|Ms|Mme|M|Herr|Frau|Sig|Sig\.ra|Sr|Sra|Me|drs|ir)\.?(?:[-‐][\p{L}]+\.?)?\s+){0,3}`;
const NAME = String.raw`(${TITLE}\p{Lu}[\p{L}'’]+(?:-\p{Lu}[\p{L}'’]+)?(?:[ \t]+(?:(?:von|van|de|der|den|di|da|del|della|du|le|la|dos|al|el|bin|zu|ter|ten)[ \t]+)?\p{Lu}[\p{L}'’]+(?:-\p{Lu}[\p{L}'’]+)?){1,3})`;
const BAD_TOKEN = /^(gmbh|ug|kg|ohg|ag|gbr|mbh|e\.?k|e\.?v|srl|s\.r\.l|sas|sarl|eurl|sasu|sa|sl|spa|snc|bv|b\.v|vof|inc|ltd|llc|llp|corp|co|plc|str|straße|strasse|street|st|road|rd|avenue|ave|rue|via|calle|telefon|tel|fax|e-?mail|email|mail|registergericht|amtsgericht|handelsregister|hrb|hra|ust|umsatzsteuer|steuernummer|siret|siren|rcs|tva|inhalt|haftung|datenschutz|kontakt|impressum|team|praxis|kanzlei|firma|unternehmen|company|services?|website|webseite|office|owner|founder|president|director|manager|germany|deutschland|österreich|schweiz|france|italia|italy|españa|spain|nederland|netherlands|belgique|canada|usa|home|about|contact|menu|cookies?|privacy|policy|copyright|alle|rechte|all|rights|reserved|seite|page|verantwortlich|inhaber|inhaberin|geschäftsführer|geschäftsführerin|vertreten|durch|the|und|and|et|our|unser|unsere|mit|für|for|per|via|tutti|diritti|riservati|partita|iva|sede|legale|kvk|btw|google|maps|online|digital|media|marketing|design|studio|group|gruppe|holding|clinic|klinik|restaurant|salon|inh|gf|hrsg|anschrift|adresse|address|ust-id|ust-idnr|immigration|consulting|consultants?|law|legal|lawyers?|dental|dentistry|realty|real|estate|homes|mortgages?|insurance|financial|finance|accounting|tax|solutions|systems|agency|academy|institute|center|centre|clinics?|beauty|spa|laser|medical|health|care|plumbing|plumbers?|heating|cooling|roofing|electric|electrical|construction|contracting|contractors?|renovations?|landscaping|cleaning|auto|motors|repair|best|top|free|book|call|now|today|here|more|welcome|hello|have|need|want|looking|years|experience|quality|professional|family|friendly|trusted|expert|experts|staff|official|corporation|associates|partners|inhaltlich|verantwortlicher|verantwortliche|angaben|gemäß|gemaess|tmg|ddg|vertretungsberechtigt|vertretungsberechtigter|kontaktdaten|postanschrift|hair|lab|nails|barber|kitchen|grill|cafe|bar|express|art|gallery|garden|glass|print|photo|photography|video|events|wedding|school|music|dance|yoga|fitness|store|shop|market|bakery|publication|directeur|directrice|responsable|gérant|gérante|hébergeur|hébergement|hosting|host|server|titolare|eigenaar|propietario|titular)$/i;
const PLACEHOLDER_NAME = /mustermann|musterfrau|max muster|erika muster|john doe|jane doe|john smith|mario rossi|jean dupont|jan jansen|juan pérez|lorem|ipsum|your name|first last/i;

function trimName(n) {
  const toks = n.trim().split(/[ \t]+/);
  while (toks.length && BAD_TOKEN.test(toks.at(-1).replace(/[.,:;]$/, ''))) toks.pop();
  return toks.join(' ');
}
function validName(n) {
  if (!n || /\d|@/.test(n) || PLACEHOLDER_NAME.test(n) || n.length > 60) return false;
  const toks = n.replace(new RegExp('^' + TITLE, 'u'), '').split(/[ \t]+/).filter(Boolean);
  if (toks.length < 2 || toks.length > 4) return false;
  return !toks.some(t => BAD_TOKEN.test(t.replace(/[.,]$/, '')) || t.length < 2 || t === t.toUpperCase() && t.length > 3);
}
const SEP = String.raw`\s*(?:\([^)]{0,40}\))?\s*[:\-–]?\s*\n?\s*`;
// [regex over page text, role, confidence, only on this page kind]
const OWNER_PATTERNS = [
  [String.raw`(?:Inhaber(?:in)?|Geschäftsführer(?:in)?|Geschäftsführung|Vertreten durch|Vertretungsberechtigte[rn]?(?: Geschäftsführer(?:in)?)?|Praxisinhaber(?:in)?|Kanzleiinhaber(?:in)?)${SEP}${NAME}`, 'Inhaber / Geschäftsführer', 'high'],
  [String.raw`(?:Gérant(?:e)?|Propriétaire|Fondat(?:eur|rice)|Exploitant(?:e)?|Directeur de (?:la )?publication|Directrice de (?:la )?publication|Responsable de (?:la )?publication)${SEP}${NAME}`, 'gérant / directeur de la publication', 'high'],
  [String.raw`(?:Legale rappresentante|Rappresentante legale|Amministratore (?:unico|delegato)|Titolare|Fondat(?:ore|rice))${SEP}${NAME}`, 'titolare / legale rappresentante', 'high'],
  [String.raw`(?:Eigena(?:ar|resse)|Oprichter|Directeur(?:-eigenaar)?|Bestuurder|Praktijkhouder|Vennoot)${SEP}${NAME}`, 'eigenaar / directeur', 'high'],
  [String.raw`(?:Titular|Propietari[oa]|Administrador(?:a)?(?: único)?|Gerente|Fundador(?:a)?)${SEP}${NAME}`, 'titular / administrador', 'high'],
  [String.raw`(?:Owner|Proprietor|Principal|Managing Director|Founder)\s*:\s*\n?\s*${NAME}`, 'owner (named on the site)', 'high'],
  [String.raw`(?:Verantwortlich(?:e[r]?)?(?: für den Inhalt| i\.?\s?S\.?\s?d\.?[^:\n]{0,40})?)${SEP}${NAME}`, 'responsible for content (Impressum)', 'medium'],
  [String.raw`${NAME}\s+(?:trägt die Berufsbezeichnung|ist als (?:Rechtsanwalt|Rechtsanwältin|Zahnarzt|Zahnärztin|Arzt|Ärztin|Steuerberater(?:in)?))`, 'practitioner named in the legal notice', 'high', 'legal'],
  [String.raw`Angaben gem(?:ä|ae)(?:ß|ss)\s*§\s*5\s*(?:TMG|DDG)\s*:?\s*\n\s*${NAME}\s*\n`, 'named in the legal notice (Impressum)', 'medium', 'legal'],
  [String.raw`(?:founded|owned|established|run|led|operated|started)\s+(?:in\s+\d{4}\s+)?by\s+${NAME}`, 'founder / owner (about page)', 'medium'],
  [String.raw`${NAME}\s*[,–-]\s*(?:the\s+|our\s+)?(?:Owner|Founder|Co-Founder|Proprietor|Inhaber(?:in)?|Gründer(?:in)?|Titolare|Fondat(?:ore|rice|eur)|Eigenaar|Oprichter|Propriétaire|Gérant(?:e)?)\b`, 'owner / founder (about page)', 'medium'],
  [String.raw`${NAME}\s*[,–-]\s*(?:the\s+|our\s+)?(?:President|Principal|CEO|Managing (?:Partner|Director)|Geschäftsführer(?:in)?|Broker of Record)\b`, 'principal (about page)', 'medium', 'about'],
  [String.raw`(?:My name is|I am|I'm|Ich bin|Je m'appelle|Mi chiamo|Mijn naam is|Me llamo)\s+${NAME}`, 'self-introduction (about page)', 'low', 'about'],
].map(([re, role, conf, kind]) => [new RegExp(re, 'u'), role, conf, kind]);

// Owner named in a block of page text, or null. Never guessed from an email address.
export function ownerFromText(text, source = '', kind = '') {
  for (const [re, role, confidence, onlyKind] of OWNER_PATTERNS) {
    if (onlyKind && onlyKind !== kind) continue;
    const m = String(text).match(re); if (!m) continue;
    const name = trimName(m[1]).replace(/[ \t]+/g, ' ');
    if (validName(name)) return { name, role, source, confidence };
  }
  return null;
}

export const NO_OWNER = Object.freeze({ name: '', role: '', source: '', confidence: 'not published' });

export function extractOwner(c) {
  const pages = htmlPages(c);
  const order = [...pages.filter(p => p.kind === 'legal'), ...pages.filter(p => p.kind === 'about'), ...pages.filter(p => p.kind === 'home'),
    ...pages.filter(p => !['legal', 'about', 'home'].includes(p.kind))];
  for (const pg of order) {
    // JSON-LD first: founder, or a Person with an owner-like job title.
    for (const n of jsonLd(pg.body)) {
      const f = [].concat(n.founder || [])[0];
      const fn = typeof f === 'string' ? f : f?.name;
      if (fn && validName(fn)) return { name: fn, role: 'founder (schema.org)', source: pg.url, confidence: 'high' };
      if (/Person/.test(typeOf(n)) && n.name && /owner|founder|president|principal|ceo|inhaber|director|geschäftsführer|gérant|titolare|eigenaar/i.test(n.jobTitle || '') && validName(n.name))
        return { name: n.name, role: clean(n.jobTitle), source: pg.url, confidence: 'high' };
    }
    const txt = stripTags(pg.body.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ').replace(/<(nav|header)\b[\s\S]*?<\/\1>/gi, ' '));
    const o = ownerFromText(txt, pg.url, pg.kind);
    if (o) return o;
  }
  return { ...NO_OWNER };
}
