// Normalisation: phones, URLs, social profiles, names, area, categories. Standard library only.

// ---------------- digits ----------------
// Any Unicode decimal digit (Arabic-Indic, Persian, Devanagari, full-width, ...) → ASCII.
const DIGIT_ZEROS = [0x0660, 0x06F0, 0x07C0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66, 0x0E50, 0x0ED0, 0x0F20, 0x1040, 0x17E0, 0x1810, 0xFF10];
export const asciiDigits = s => String(s ?? '').replace(/\p{Nd}/gu, ch => {
  const c = ch.codePointAt(0);
  if (c <= 0x39) return ch;
  for (const z of DIGIT_ZEROS) if (c >= z && c <= z + 9) return String(c - z);
  return ch;
});

// ---------------- phones ----------------
// len = valid national significant number length (after the trunk prefix is removed).
// trunk = domestic prefix dropped in international format; keepTrunk = it stays (Italy).
// fmt: nanp | pairs | 333 | default (head + groups of 3/4).
export const COUNTRIES = {
  US: { cc: '1', nanp: true, toll: /^8(00|33|44|55|66|77|88)/ },
  CA: { cc: '1', nanp: true, toll: /^8(00|33|44|55|66|77|88)/ },
  GB: { cc: '44', trunk: '0', len: [9, 10], mobile: /^7[1-9]/, toll: /^80[08]/ },
  IE: { cc: '353', trunk: '0', len: [7, 10], mobile: /^8[3-9]/, toll: /^1800/ },
  DE: { cc: '49', trunk: '0', len: [5, 13], mobile: /^1[5-7]/, toll: /^800/, ddi: true },
  AT: { cc: '43', trunk: '0', len: [4, 13], mobile: /^6[5-9]/, toll: /^800/, ddi: true },
  CH: { cc: '41', trunk: '0', len: [9, 9], mobile: /^7[5-9]/, toll: /^800/ },
  FR: { cc: '33', trunk: '0', len: [9, 9], mobile: /^[67]/, toll: /^80[0-5]/, fmt: 'pairs' },
  BE: { cc: '32', trunk: '0', len: [8, 9], mobile: /^4[5-9]/, toll: /^800/ },
  NL: { cc: '31', trunk: '0', len: [9, 9], mobile: /^6/, toll: /^800/ },
  LU: { cc: '352', len: [4, 11], mobile: /^6[2-9]1/, toll: /^800/, ddi: true },
  IT: { cc: '39', keepTrunk: true, len: [6, 11], re: /^(0\d{5,10}|3\d{8,9}|80[0-3]\d{3,7}|1\d{4,8})$/, mobile: /^3/, toll: /^80[03]/, ddi: true },
  ES: { cc: '34', len: [9, 9], re: /^[5-9]/, mobile: /^[67]/, toll: /^[89]00/, fmt: '333' },
  PT: { cc: '351', len: [9, 9], re: /^[2389]/, mobile: /^9/, toll: /^800/, fmt: '333' },
  SE: { cc: '46', trunk: '0', len: [7, 10], mobile: /^7[02369]/, toll: /^20/ },
  NO: { cc: '47', len: [8, 8], re: /^[2-9]/, mobile: /^[49]/, toll: /^80[01]/, fmt: 'pairs' },
  DK: { cc: '45', len: [8, 8], re: /^[2-9]/, toll: /^80/, fmt: 'pairs' },
  FI: { cc: '358', trunk: '0', len: [5, 12], mobile: /^(4|50)/, toll: /^800/ },
  PL: { cc: '48', len: [9, 9], mobile: /^(5[0137]|6[069]|7[2389]|88)/, toll: /^800/, fmt: '333' },
  CZ: { cc: '420', len: [9, 9], mobile: /^(60[1-8]|7[2-9])/, toll: /^800/, fmt: '333' },
  AU: { cc: '61', trunk: '0', len: [6, 10], mobile: /^4/, toll: /^1800/ },
  NZ: { cc: '64', trunk: '0', len: [8, 10], mobile: /^2/, toll: /^(800|508)/ },
  AE: { cc: '971', trunk: '0', len: [8, 9], mobile: /^5/, toll: /^800/ },
  TR: { cc: '90', trunk: '0', len: [10, 10], mobile: /^5/, toll: /^800/, fmt: '333' },
  IN: { cc: '91', trunk: '0', len: [10, 11], mobile: /^[6-9]/, toll: /^1800/ },
  BR: { cc: '55', trunk: '0', len: [10, 11], mobile: /^\d\d9/, toll: /^800/ },
  MX: { cc: '52', len: [10, 10], toll: /^800/ },
  ZA: { cc: '27', trunk: '0', len: [9, 9], mobile: /^[6-8]/, toll: /^80[06]/ },
};
const BY_CC = {};
for (const [iso, c] of Object.entries(COUNTRIES)) BY_CC[c.cc] ||= { iso, ...c };

// ITU calling codes: 1 and 7 are one digit, this list is two digits, everything else is three.
const CC2 = new Set('20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98'.split(' '));
const splitCC = d => (d[0] === '1' || d[0] === '7') ? [d[0], d.slice(1)] : CC2.has(d.slice(0, 2)) ? [d.slice(0, 2), d.slice(2)] : [d.slice(0, 3), d.slice(3)];

const NANP = /^[2-9]\d\d[2-9]\d{6}$/;
function validFor(c, nsn) {
  if (!c) return nsn.length >= 4 && nsn.length <= 14;
  if (c.nanp) return NANP.test(nsn);
  if (nsn.length < c.len[0] || nsn.length > c.len[1]) return false;
  if (c.re) return c.re.test(nsn);
  return c.keepTrunk ? true : /^[1-9]/.test(nsn);
}

const EXT = /(?:;ext=|\s*(?:ext\.?|extension|x|#|durchwahl|dw\.?|nebenstelle|poste|interno|int\.?|toestel|anknytning|lokal)\s*[:.]?\s*)(\d{1,6})\s*$/i;

// National significant number for an international number (digits after the calling code).
function intlNsn(cc, rest) {
  const c = BY_CC[cc];
  if (c?.trunk && !c.keepTrunk) rest = rest.replace(/^0/, '');
  if (cc === '52' && rest.length === 11 && rest[0] === '1') rest = rest.slice(1);   // old "+52 1" mobile prefix
  return rest;
}

// Domestic digits (no international prefix) for home country c → nsn or ''.
function domesticNsn(c, d) {
  if (c.nanp) {
    if (d.length === 10 && NANP.test(d)) return d;
    if (d.length === 11 && d[0] === '1' && NANP.test(d.slice(1))) return d.slice(1);
    return '';
  }
  const tryCC = () => { if (!d.startsWith(c.cc)) return ''; const n = intlNsn(c.cc, d.slice(c.cc.length)); return validFor(c, n) ? n : ''; };
  if (c.trunk) {
    if (d.startsWith(c.trunk) && !d.startsWith('00')) { const n = d.slice(c.trunk.length); return validFor(c, n) ? n : ''; }
    return tryCC() || (validFor(c, d) ? d : '');   // second case: source dropped the trunk zero
  }
  if (c.cc === '52' && /^0[14][45]?/.test(d) && d.length > 10) d = d.replace(/^0(1|44|45)/, '');
  return validFor(c, d) ? d : tryCC();
}

function lineType(c, nsn) {
  if (!c) return '';
  if (c.toll?.test(nsn)) return 'toll_free';
  if (c.mobile?.test(nsn)) return 'mobile';
  return c.nanp ? '' : 'fixed';
}

// parsePhone('(512) 555-0123', { country: 'US' }) → { e164: '+15125550123', key: '1:5125550123', cc: '1', nsn: '5125550123', ext: '', valid: true, raw, type }
// null for empty/too short input; { valid: false, e164: '', key: '' } for digits that are not a number we can trust.
export function parsePhone(raw, { country = 'US' } = {}) {
  const rawStr = String(raw ?? '').trim();
  let s = asciiDigits(rawStr).replace(/^tel:/i, '').replace(/%20/g, ' ').trim();
  if (!s) return null;
  let ext = '';
  const em = s.match(EXT);
  if (em && s.slice(0, em.index).replace(/\D/g, '').length >= 6) { ext = em[1]; s = s.slice(0, em.index); }
  s = s.replace(/^[^\d+(]*/, '').replace(/\(0\)/g, ' ');
  const plus = s.startsWith('+');
  const d = s.replace(/\D/g, '');
  if (d.length < 6) return null;
  const home = COUNTRIES[String(country || '').toUpperCase()];
  let cc = '', nsn = '';
  const asIntl = digits => { const [c, rest] = splitCC(digits); const n = intlNsn(c, rest); return validFor(BY_CC[c], n) && digits.length <= 15 ? [c, n] : null; };
  const asHome = () => { if (!home) return null; const n = domesticNsn(home, d); return n ? [home.cc, n] : null; };
  let hit = null;
  if (plus) {                                          // "+512 555 0123": the 1 was dropped
    hit = asIntl(d);
    if (!hit || (!BY_CC[hit[0]] && home?.nanp)) hit = asHome() || hit;
  }
  else if (d.startsWith('00')) hit = asIntl(d.slice(2));
  else if (home?.nanp && d.startsWith('011')) hit = asIntl(d.slice(3));
  else hit = asHome();
  if (hit) [cc, nsn] = hit;
  if (!cc) return { e164: '', key: '', cc: '', nsn: d, ext, valid: false, raw: rawStr, type: '' };
  return { e164: `+${cc}${nsn}`, key: `${cc}:${nsn}`, cc, nsn, ext, valid: true, raw: rawStr, type: lineType(BY_CC[cc], nsn) };
}

// "040/6417939 oder 0176 1234567; +49 ..." → separate numbers.
export function splitPhones(raw) {
  const s = asciiDigits(Array.isArray(raw) ? raw.join(';') : raw);
  const parts = s.split(/\s*(?:[;,|\n\r]|\s(?:or|oder|ou|o|of|oppure|eller|tai|lub|nebo|veya|y|und|and|&)\s)\s*/i).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const sl = part.split(/\s*\/\s*/);
    if (sl.length === 2 && sl.every(x => x.replace(/\D/g, '').length >= 7)) out.push(...sl); else out.push(part);
  }
  return out.map(x => x.trim()).filter(x => x.replace(/\D/g, '').length >= 6);
}

const asPhone = (p, country) => (typeof p === 'string' ? parsePhone(p, { country }) : p);

// same | same_block (one switchboard: different extension or direct-dial suffix) | different
export function samePhone(a, b, { country } = {}) {
  a = asPhone(a, country); b = asPhone(b, country);
  if (!a?.key || !b?.key || a.cc !== b.cc) return 'different';
  if (a.key === b.key) return a.ext && b.ext && a.ext !== b.ext ? 'same_block' : 'same';
  const x = a.nsn, y = b.nsn; let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (i === short.length && short.length >= 6 && long.length - short.length <= 4) return 'same_block';    // 040 12345 vs 040 12345-67
  if (BY_CC[a.cc]?.ddi && i >= 6 && long.length - i <= 3 && x.length !== y.length) return 'same_block';
  return 'different';
}

const group = (n, sizes) => { const out = []; let i = 0; for (const z of sizes) { if (i >= n.length) break; out.push(n.slice(i, i + z)); i += z; } if (i < n.length) out.push(n.slice(i)); return out.join(' '); };

// National display format: (512) 555-0123 · 020 7555 0123 · 01 25 55 01 23
export function fmtPhone(ph) {
  if (typeof ph === 'string') return ph;
  if (!ph) return '';
  if (!ph.valid) return ph.raw || '';
  const c = BY_CC[ph.cc], n = ph.nsn, x = ph.ext ? ` ext. ${ph.ext}` : '';
  if (!c) return `+${ph.cc} ${group(n, [3, 3, 4])}${x}`;
  if (c.nanp) return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}${x}`;
  const t = c.trunk && !isTollFreeNsn(c, n, true) ? c.trunk : '';
  const nat = t + n;
  let body;
  const custom = FMT_GROUPS[c.iso]?.(nat);
  if (custom) body = group(nat, custom);
  else if (c.toll?.test(n) && /^1[38]00/.test(n)) body = group(nat, [4, 3, 3, 3]);
  else if (c.fmt === 'pairs') body = nat.length % 2 ? group(nat, [3, 2, 2, 2, 2]) : group(nat, [2, 2, 2, 2, 2]);
  else if (c.fmt === '333') body = group(nat, [3, 3, 3, 3]);
  else {
    const tail = n.length >= 10 ? [4, 4] : n.length >= 7 ? [3, 4] : [n.length];
    const head = nat.length - tail.reduce((s, v) => s + v, 0);
    body = group(nat, [head > 0 ? head : 0, ...tail].filter(Boolean));
  }
  return body + x;
}
// Country conventions the generic grouping gets wrong (nat = national digits incl. trunk prefix).
const FMT_GROUPS = {
  GB: n => (/^02/.test(n) ? [3, 4, 4] : /^0(1\d1|11\d|8|3|9)/.test(n) ? [4, 3, 4] : n.length === 11 ? [5, 6] : null),
  AU: n => (/^0[2378]/.test(n) && n.length === 10 ? [2, 4, 4] : n.length === 10 ? [4, 3, 3] : null),
  IT: n => (/^3/.test(n) ? [3, 3, 4] : /^0[26]/.test(n) ? [2, 4, 4] : null),
  NZ: n => (/^02/.test(n) ? [3, 3, 4] : null),
  IE: n => (/^08/.test(n) ? [3, 3, 4] : null),
};
// AU/IE/IN 1800 numbers are dialled without the trunk prefix.
const isTollFreeNsn = (c, n, noTrunkOnly = false) => !!c?.toll?.test(n) && (!noTrunkOnly || /^1/.test(n));
export const isTollFree = ph => { ph = asPhone(ph); return !!ph?.valid && isTollFreeNsn(BY_CC[ph.cc], ph.nsn); };

// ---------------- URLs ----------------
export const fixUrl = u => {
  u = String(u ?? '').trim().replace(/^<|>$/g, '');
  if (!u || /^(mailto|tel|javascript|data|sms|whatsapp):/i.test(u) || /\s/.test(u.replace(/\s+$/, ''))) return '';
  if (/^\/\//.test(u)) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try { const x = new URL(u); return x.hostname.includes('.') ? x.href : ''; } catch { return ''; }
};
// Host without www; a non-default port is kept ("127.0.0.1:8080") so local test sites stay distinct.
export const hostname = u => { try { const x = new URL(/^https?:\/\//i.test(String(u)) ? u : 'https://' + u); return x.hostname.replace(/^www\d?\./, '').replace(/\.$/, '').toLowerCase() + (x.port ? `:${x.port}` : ''); } catch { return ''; } };

// Multi-part public suffixes (a small built-in slice of the Public Suffix List) + hosting platforms
// where every subdomain belongs to a different owner.
const MULTI_SUFFIX = new Set(('co.uk org.uk me.uk ltd.uk plc.uk net.uk ac.uk gov.uk sch.uk nhs.uk com.au net.au org.au edu.au gov.au asn.au id.au ' +
  'co.nz net.nz org.nz govt.nz ac.nz school.nz geek.nz kiwi.nz com.br net.br org.br blog.br eng.br med.br adv.br art.br com.mx org.mx net.mx gob.mx ' +
  'co.za org.za net.za web.za co.in net.in org.in firm.in gen.in ind.in co.jp ne.jp or.jp com.tr net.tr org.tr gen.tr biz.tr av.tr co.ae net.ae org.ae ' +
  'com.cn com.sg com.hk com.tw co.il org.il co.kr or.kr com.ar com.co com.pe com.ve com.ec com.uy com.py com.bo co.at or.at gv.at com.es nom.es org.es ' +
  'com.pt org.pt com.pl net.pl org.pl com.ua com.ru co.th com.my com.ph com.vn com.pk com.ng co.ke com.eg com.sa com.qa com.kw com.bh com.om ' +
  'qc.ca on.ca bc.ca ab.ca mb.ca sk.ns.ca ns.ca nb.ca nl.ca pe.ca gc.ca com.cy com.mt com.gr co.hu ' +
  'github.io gitlab.io netlify.app vercel.app pages.dev web.app firebaseapp.com herokuapp.com azurewebsites.net ' +
  'wixsite.com blogspot.com wordpress.com weebly.com square.site business.site godaddysites.com myshopify.com webflow.io carrd.co ' +
  'jimdosite.com jimdofree.com site123.me mystrikingly.com framer.website framer.ai my.canva.site webnode.page simplesite.com').split(' '));
export function regDomain(host) {
  const full = hostname(host), [h, port] = full.split(/:(?=\d+$)/);
  if (port) return regDomain(h) + `:${port}`;
  if (!h || /^\d+(\.\d+){3}$/.test(h)) return h;
  const parts = h.split('.');
  for (let n = Math.min(3, parts.length - 1); n >= 2; n--) if (MULTI_SUFFIX.has(parts.slice(-n).join('.'))) return parts.slice(-(n + 1)).join('.');
  return parts.slice(-2).join('.');
}

const hostRe = list => new RegExp(`(^|\\.)(${list.map(h => String(h).toLowerCase().replace(/^www\./, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z.]+')).join('|')})$`, 'i');

export const SOCIAL_HOSTS = {
  instagram: hostRe(['instagram.com', 'instagr.am']),
  facebook: hostRe(['facebook.com', 'fb.com', 'fb.me', 'fb.watch']),
  linkedin: hostRe(['linkedin.com', 'lnkd.in']),
  tiktok: hostRe(['tiktok.com']),
  youtube: hostRe(['youtube.com', 'youtu.be']),
  x: hostRe(['twitter.com', 'x.com']),
  whatsapp: hostRe(['wa.me', 'whatsapp.com', 'whatsapp.net']),
  telegram: hostRe(['t.me', 'telegram.me', 'telegram.dog']),
};
const OTHER_SOCIAL = hostRe(['pinterest.*', 'snapchat.com', 'threads.net', 'threads.com', 'vk.com', 'tumblr.com', 'flickr.com', 'behance.net', 'dribbble.com', 'medium.com', 'reddit.com', 'discord.gg', 'discord.com']);
export const FREE_HOSTS = ['wixsite.com', 'wix.com', 'business.site', 'square.site', 'godaddysites.com', 'weebly.com', 'blogspot.com', 'blogspot.*',
  'wordpress.com', 'webnode.*', 'simplesite.com', 'jimdosite.com', 'jimdofree.com', 'jimdo.com', 'site123.me', 'mystrikingly.com', 'strikingly.com',
  'myshopify.com', 'ueniweb.com', 'my.canva.site', 'canva.site', 'framer.website', 'framer.ai', 'webflow.io', 'carrd.co', 'linktr.ee', 'linkin.bio',
  'beacons.ai', 'lnk.bio', 'bio.link', 'taplink.cc', 'campsite.bio', 'msha.ke', 'solo.to', 'bio.site', 'hoo.be', 'github.io', 'netlify.app',
  'vercel.app', 'pages.dev', 'web.app', 'firebaseapp.com', 'sites.google.com', 'yolasite.com', 'webs.com', 'tripod.com', 'over-blog.com', 'e-monsite.com'];
export const AGGREGATOR_HOSTS = ['yelp.*', 'ubereats.com', 'doordash.com', 'grubhub.com', 'skipthedishes.com', 'deliveroo.*', 'just-eat.*', 'justeat.*',
  'lieferando.*', 'thuisbezorgd.nl', 'wolt.com', 'glovoapp.com', 'menulog.com.au', 'seamless.com', 'postmates.com', 'opentable.*', 'resy.com',
  'thefork.*', 'tripadvisor.*', 'booksy.com', 'fresha.com', 'vagaro.com', 'treatwell.*', 'planity.com', 'salonkee.*', 'styleseat.com', 'mindbodyonline.com',
  'setmore.com', 'squareup.com', 'schedulicity.com', 'zocdoc.com', 'doctolib.*', 'healthgrades.com', 'ratemds.com', 'jameda.de', 'miodottore.it',
  'houzz.*', 'homestars.com', 'thumbtack.com', 'angi.com', 'angieslist.com', 'homeadvisor.com', 'porch.com', 'bark.com', 'taskrabbit.*', 'checkatrade.com',
  'mybuilder.com', 'ratedpeople.com', 'trustatrader.com', 'hipages.com.au', 'nextdoor.*', 'yellowpages.*', 'yellowpages.com.au', 'pagesjaunes.fr',
  'gelbeseiten.de', 'dasoertliche.de', '11880.com', 'paginegialle.it', 'paginasamarillas.es', 'goldenpages.ie', 'yell.com', 'cylex.*', 'hotfrog.*',
  'brownbook.net', 'foursquare.com', 'bbb.org', 'trustpilot.com', 'avvo.com', 'justia.com', 'lawyers.com', 'zillow.com', 'realtor.com', 'trulia.com',
  'google.com', 'google.*', 'goo.gl', 'g.page', 'g.co', 'maps.apple.com', 'bing.com', 'wikipedia.org', 'groupon.*', 'etsy.com', 'amazon.*', 'ebay.*'];
// Franchise / brokerage head-office pages: the business has a profile there, not its own site. Extend with config.
export const CORPORATE_HOSTS = ['remax.com', 'century21.com', 'kw.com', 'kellerwilliams.com', 'coldwellbanker.com', 'sothebysrealty.com', 'exprealty.com',
  'engelvoelkers.com', 'edwardjones.com', 'statefarm.com', 'allstate.com', 'primerica.com'];
const FREE_RE = hostRe(FREE_HOSTS), AGG_RE = hostRe(AGGREGATOR_HOSTS), CORP_RE = hostRe(CORPORATE_HOSTS);

// What kind of thing is this "website"? → none | site | social | free_subdomain | aggregator | corporate | directory
// sharedHosts (one site used by many businesses: a mall, a co-working space) count as corporate.
export function classifyUrl(u, { sharedHosts = [], corporateHosts = [], directoryHosts = [] } = {}) {
  const url = fixUrl(u); const h = hostname(url);
  if (!h || !h.includes('.')) return 'none';
  if (Object.values(SOCIAL_HOSTS).some(re => re.test(h)) || OTHER_SOCIAL.test(h)) return 'social';
  if (directoryHosts.length && hostRe(directoryHosts).test(h)) return 'directory';
  if (corporateHosts.length && hostRe(corporateHosts).test(h)) return 'corporate';
  if (sharedHosts.length && hostRe(sharedHosts).test(h)) return 'corporate';
  if (h === 'sites.google.com') return 'free_subdomain';
  if (AGG_RE.test(h)) return 'aggregator';
  if (CORP_RE.test(h)) return 'corporate';
  if (FREE_RE.test(h)) return 'free_subdomain';
  return 'site';
}

// ---------------- social profiles ----------------
const SOCIAL_SKIP = /\/(sharer|share|sharing|dialog|plugins|intent|home|login|signup|help|policies|privacy|legal|terms|about|explore|hashtag|search|watch|shorts|embed|reel|reels|p|tv|stories|status|statuses|groups|events|photo|photos|video|videos|media|posts|permalink|story\.php|home\.php|sharearticle|feed|pulse|jobs|tr|l\.php|joinchat|\+)(\/|\.|$|\?)/i;
const IGNORE_HANDLES = new Set(('wix squarespace shopify wordpress wordpressdotcom godaddy weebly elementor jimdo webflow hostinger strikingly ueni canva ' +
  'facebook instagram youtube twitter linkedin tiktok telegram whatsapp meta google apple yourpage yourusername username profile.php pages people company ' +
  'in channel c user share handle yourhandle youraccount your_handle your-page page name example test').split(' '));

// canonSocial('https://www.instagram.com/northwind.plumbing/?hl=en') → { network: 'instagram', handle: 'northwind.plumbing', url: 'https://instagram.com/northwind.plumbing' }
export function canonSocial(u, { ignoreHandles = [] } = {}) {
  const url = fixUrl(u); if (!url) return null;
  const h = hostname(url);
  const network = Object.keys(SOCIAL_HOSTS).find(k => SOCIAL_HOSTS[k].test(h));
  if (!network) return null;
  const U = new URL(url);
  const segs = U.pathname.split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch { return x; } });
  if (network === 'whatsapp') {
    if (h === 'chat.whatsapp.com') return null;                    // group invite, not a business number
    const num = (h === 'wa.me' ? segs[0] : U.searchParams.get('phone')) || '';
    const d = asciiDigits(num).replace(/\D/g, '');
    return d.length >= 7 ? { network, handle: d, url: `https://wa.me/${d}` } : null;
  }
  const fbProfile = network === 'facebook' && segs[0] === 'profile.php' && U.searchParams.get('id');
  const liProfile = network === 'linkedin' && ['company', 'in', 'school', 'showcase'].includes(segs[0]) && segs[1];
  if (!fbProfile && !liProfile && SOCIAL_SKIP.test(U.pathname)) return null;
  if (network === 'facebook' && /^(sharer|plugins|dialog)/i.test(segs[0] || '')) return null;
  let handle = '';
  if (fbProfile) handle = `profile.php?id=${U.searchParams.get('id')}`;
  else if (network === 'facebook' && segs[0] === 'pages') handle = segs.slice(1, 3).join('/');
  else if (network === 'linkedin') { if (!liProfile) return null; handle = `${segs[0]}/${segs[1]}`; }
  else if (network === 'youtube') {
    if (h === 'youtu.be') return null;
    handle = segs[0]?.startsWith('@') ? segs[0] : (['channel', 'c', 'user'].includes(segs[0]) && segs[1] ? `${segs[0]}/${segs[1]}` : '');
  } else if (network === 'tiktok') handle = segs[0]?.startsWith('@') ? segs[0] : '';
  else if (network === 'telegram') handle = segs[0] === 's' ? segs[1] : segs[0];
  else handle = segs[0] || '';
  if (!handle) return null;
  if (network === 'instagram' || network === 'x' || network === 'telegram') handle = handle.replace(/^@/, '').toLowerCase();
  const bare = handle.replace(/^@/, '').replace(/^(company|in|school|showcase|channel|c|user)\//, '').toLowerCase();
  if (bare.length < 2 || IGNORE_HANDLES.has(bare) || ignoreHandles.map(x => String(x).toLowerCase()).includes(bare)) return null;
  if ((network === 'instagram' || network === 'x' || network === 'telegram') && !/^[\w.]+$/.test(handle)) return null;
  const base = { instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', linkedin: 'https://linkedin.com/',
    telegram: 'https://t.me/', youtube: 'https://youtube.com/', tiktok: 'https://tiktok.com/', x: 'https://x.com/' }[network];
  return { network, handle, url: base + handle };
}

// ---------------- names ----------------
const LEGAL = 'inc incorporated llc l l c llp lp ltd limited corp corporation co company plc pty pvt gmbh mbh ug kg ohg ag e k ek gbr ev srl s r l spa s p a snc sas sarl eurl sa nv bv b v vof cv oy ab as aps asa sl slu lda kft sro s r o sp zoo z o o pc pllc dba';
const STOP = new Set((LEGAL + ' the and und et e y of di de del da van der den het la le les il lo el los las dr mr mrs ms').split(' '));
export const normName = s => String(s ?? '').normalize('NFKC').toLowerCase()
  .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/œ/g, 'oe').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ı/g, 'i')
  .normalize('NFD').replace(/\p{M}/gu, '').replace(/['’`´]/g, '').replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (s, extra) => normName(s).split(' ').filter(t => t && !STOP.has(t) && !extra?.has(t) && (t.length > 1 || /\d/.test(t)));
function trigrams(s) {
  const x = ` ${s} `; const m = new Map();
  for (let i = 0; i < x.length - 2; i++) { const g = x.slice(i, i + 3); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
function dice(a, b) {
  if (!a || !b) return 0;
  const A = trigrams(a), B = trigrams(b); let inter = 0, n = 0;
  for (const [g, c] of A) { n += c; if (B.has(g)) inter += Math.min(c, B.get(g)); }
  for (const c of B.values()) n += c;
  return n ? 2 * inter / n : 0;
}
const toSet = x => (x instanceof Set ? x : new Set((x || []).flatMap(v => normName(v).split(' ')).filter(Boolean)));

// 0..1. Legal suffixes and stop words ignored; `stop` adds words that say nothing here (e.g. the city names).
export function nameSim(a, b, { stop } = {}) {
  if (!a || !b) return 0;
  const extra = stop ? toSet(stop) : null;
  const ta = tokens(a, extra), tb = tokens(b, extra);
  if (!ta.length || !tb.length) return normName(a) === normName(b) ? 1 : 0;
  const ja = ta.join(' '), jb = tb.join(' ');
  if (ja === jb || ja.replace(/ /g, '') === jb.replace(/ /g, '')) return 1;
  const sb = new Set(tb), inter = [...new Set(ta)].filter(t => sb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  const minLen = Math.min(new Set(ta).size, sb.size);
  // Overlap coefficient only when the shorter name has 2+ distinctive words; else Jaccard.
  const tok = minLen >= 2 ? inter / minLen : inter / union;
  return Math.round(Math.max(tok, dice(ja.replace(/ /g, ''), jb.replace(/ /g, ''))) * 1000) / 1000;
}
export const bestNameSim = (namesA, namesB, opts) => {
  const A = [].concat(namesA || []).filter(Boolean), B = [].concat(namesB || []).filter(Boolean);
  let best = 0;
  for (const a of A) for (const b of B) best = Math.max(best, nameSim(a, b, opts));
  return best;
};
export const hasScript = (s, regex) => {
  if (!regex) return false;
  const re = regex instanceof RegExp ? regex : new RegExp(regex, 'u');
  return re.test(String(s ?? ''));
};

// ---------------- area ----------------
const toLatLng = p => Array.isArray(p) ? [+p[0], +p[1]] : p && typeof p === 'object' ? [+(p.lat ?? p.latitude), +(p.lng ?? p.lon ?? p.longitude)] : null;
export function haversineKm(a, b) {
  const [la1, lo1] = toLatLng(a), [la2, lo2] = toLatLng(b);
  const r = Math.PI / 180, dLat = (la2 - la1) * r, dLng = (lo2 - lo1) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(x)));
}
const hasGeo = l => l && l.lat != null && l.lng != null && l.lat !== '' && Number.isFinite(+l.lat) && Number.isFinite(+l.lng) && !(+l.lat === 0 && +l.lng === 0);

// Keep a listing when it matches any configured rule (bbox, center + radius_km, cities). No rules → keep.
export function inArea(listing, area = {}) {
  const bbox = Array.isArray(area?.bbox) && area.bbox.length === 4 ? area.bbox.map(Number) : null;
  const center = area?.center ? toLatLng(area.center) : null;
  const radius = Number(area?.radius_km) || 0;
  const cities = (area?.cities || []).map(c => normName(c)).filter(Boolean);
  if (!bbox && !(center && radius) && !cities.length) return { ok: true, reason: '' };
  const geo = hasGeo(listing);
  const lat = +listing?.lat, lng = +listing?.lng;
  const fails = [];
  if (bbox) {
    if (!geo) fails.push('no coordinates');
    else if (lat >= bbox[0] && lat <= bbox[2] && lng >= bbox[1] && lng <= bbox[3]) return { ok: true, reason: 'bbox' };
    else fails.push('outside bbox');
  }
  if (center && radius) {
    if (!geo) fails.includes('no coordinates') || fails.push('no coordinates');
    else { const km = haversineKm(center, [lat, lng]); if (km <= radius) return { ok: true, reason: 'radius' }; fails.push(`${km.toFixed(1)} km from center`); }
  }
  if (cities.length) {
    const city = normName(listing?.city);
    const text = ` ${normName([listing?.address, listing?.city, listing?.region].filter(Boolean).join(' '))} `;
    if (city && cities.includes(city)) return { ok: true, reason: 'city' };
    if (cities.some(c => text.includes(` ${c} `))) return { ok: true, reason: 'city' };
    fails.push(city ? `city "${listing.city}" not in list` : 'no city');
  }
  return { ok: false, reason: fails.join('; ') };
}

// ---------------- categories ----------------
const groupEntries = groups => Array.isArray(groups) ? groups : Object.entries(groups || {});
const kwRe = new Map();
const kwTest = (kw, text) => {
  let re = kwRe.get(kw);
  if (!re) kwRe.set(kw, re = new RegExp(`(?<![\\p{L}\\p{N}])${normName(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
  return re.test(text);
};
// First group (config order) with a keyword at the start of a word in any of the texts; else 'other'.
export function categoryGroup(texts, groups) {
  const text = normName([].concat(texts || []).flat().filter(Boolean).join(' '));
  if (!text) return 'other';
  for (const [key, kws] of groupEntries(groups)) if ([].concat(kws || []).some(k => k && kwTest(k, text))) return key;
  return 'other';
}
export const ticketFor = (group, config) => config?.categories?.ticket?.[group] || 'low';
