// Scoring: NEED (what is visibly wrong) x INTEREST (will they act) -> priority -> tier.
// Every signal lives in DEFAULT_SIGNALS below; project.json -> scoring.weights overrides
// weights by id (0 switches a signal off). docs/SCORING.md documents each one.
import { today } from './io.mjs';
import { parsePhone, fmtPhone, samePhone } from './normalize.mjs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const OWN_KINDS = new Set(['site', 'free_subdomain', 'corporate']);
const PLATFORM_KINDS = new Set(['social', 'aggregator', 'directory']);
const BROKEN_STATES = new Set(['broken', 'dns', 'timeout', 'redirect_offsite']);
const CONSUMER_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|gmx|web|t-online|proton|protonmail|mail|zoho|rogers|bell|sympatico|shaw|telus|comcast|verizon|att|sbcglobal|bigpond|optusnet|libero|orange|free|wanadoo)\./i;

export const hostOf = u => {
  try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase(); }   // host keeps a non-default port
  catch { return ''; }
};
// Same site on label boundaries: shop.example.com ~ example.com, but not myexample.com.
export const sameSite = (a, b) => !!a && !!b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

// ---------------------------------------------------------------------------------------
// Signal catalogue. fire(ctx) returns null (no), true (full weight) or { scale, text }.
// `when` says which data must exist for the signal to be considered at all.
// ---------------------------------------------------------------------------------------
const S = (kind, id, weight, when, text, detect, fire) => ({ kind, id, weight, when, text, detect, fire });

export const DEFAULT_SIGNALS = [
  // ---- NEED: problems a stranger can see from outside ----
  S('need', 'no_website', 24, 'listing', 'No website at all',
    'website_kind is none (no website on any source)',
    c => (c.kind === 'none' ? true : null)),
  S('need', 'aggregator_only', 20, 'listing', 'No website of their own, only a social or platform page',
    'website_kind is social, aggregator or directory',
    c => (PLATFORM_KINDS.has(c.kind) ? { text: { social: 'No website of their own, only a social media page', aggregator: 'No website of their own, only a listing on a booking or delivery platform', directory: 'No website of their own, only a directory listing' }[c.kind] } : null)),
  S('need', 'free_subdomain', 18, 'listing', 'Only a free subdomain page',
    'website_kind is free_subdomain (wixsite, business.site, blogspot, ...)',
    c => (c.kind === 'free_subdomain' ? { text: `Only a free subdomain page (${c.host})` } : null)),
  S('need', 'profile_page_only', 14, 'listing', 'Only a profile page on a larger company\'s site',
    'website_kind is corporate (a page on a brokerage, bank or franchisor site)',
    c => (c.kind === 'corporate' ? { text: `Only a profile page on ${c.host}` } : null)),
  S('need', 'broken_site', 20, 'crawled', 'Their website does not load',
    'site.state is broken, dns, timeout or redirect_offsite (blocked = our crawler was refused, never counted)',
    c => (BROKEN_STATES.has(c.state) ? { text: { broken: 'Their website returns an error', dns: 'Their domain no longer resolves', timeout: 'Their website times out', redirect_offsite: 'Their domain redirects to another site' }[c.state] } : null)),
  S('need', 'parked', 20, 'crawled', 'Their domain shows a parked or for-sale page',
    'site.state is parked or signals.parked',
    c => (c.state === 'parked' || c.sig.parked ? true : null)),
  S('need', 'coming_soon', 14, 'crawled', 'Their website is a "coming soon" placeholder',
    'site.state is coming_soon or signals.coming_soon',
    c => (c.state === 'coming_soon' || c.sig.coming_soon ? true : null)),
  S('need', 'not_responsive', 11, 'reached', 'Not built for phones (no mobile layout)',
    'site reached and signals.viewport === false',
    c => (c.sig.viewport === false ? true : null)),
  S('need', 'no_https', 8, 'reached', 'No secure connection (browsers show "Not secure")',
    'signals.https === false full; https works but visitors are not sent there (https_redirect === false) 0.5; mixed_content 0.6',
    c => (c.sig.https === false && c.sig.https_redirect === false ? { scale: 0.5, text: 'Secure version exists but visitors are not sent to it' }
      : c.sig.https === false ? true
      : c.sig.mixed_content ? { scale: 0.6, text: 'Secure page loads insecure content (browser warnings)' } : null)),
  S('need', 'no_phone_on_site', 9, 'reached', 'No phone number anywhere on the website',
    'site reached and no phone number found on any crawled page',
    c => (Array.isArray(c.s.phones) && !c.s.phones.length ? true : null)),
  S('need', 'no_tel_link', 7, 'reached', 'Phone number cannot be tapped to call on a mobile',
    'site reached, a phone number is shown, signals.tel_link === false',
    c => (c.sig.tel_link === false && (c.s.phones || []).length ? true : null)),
  S('need', 'no_booking', 11, 'reached', 'No way to book or request a quote online',
    'site reached, signals.form === false and no booking widget',
    c => (c.sig.form === false && !c.sig.booking_widget ? true : null)),
  S('need', 'slow_page', 14, 'reached', 'Slow to load on a phone',
    'signals.psi_mobile < 50 (measured, full weight); else seo.categories.perf < 40 (inferred, half weight)',
    c => {
      const psi = num(c.sig.psi_mobile), perf = num(c.s.seo?.categories?.perf);
      if (psi != null) return psi < 50 ? { text: `Slow on phones (PageSpeed mobile ${psi}/100)` } : null;
      return perf != null && perf < 40 ? { scale: 0.5, text: `Page speed checks score ${perf}/100` } : null;
    }),
  S('need', 'heavy_page', 6, 'reached', 'Very heavy home page',
    'signals.page_kb >= 4000 (or page_bytes >= 4 MB)',
    c => {
      const kb = num(c.sig.page_kb) ?? (num(c.sig.page_bytes) != null ? c.sig.page_bytes / 1000 : null);
      return kb >= 4000 ? { text: `Home page weighs ${(kb / 1000).toFixed(1)} MB` } : null;
    }),
  S('need', 'stale_site', 14, 'reached', 'Website not updated in years',
    'last content change (Wayback) or, failing that, footer year is 5+ years old',
    c => {
      if (c.lastChange) return c.year - c.lastChange >= 5 ? { text: `Website unchanged since ${c.lastChange} (Internet Archive)` } : null;
      return c.footerYear && c.year - c.footerYear >= 5 ? { text: `Footer still says ${c.footerYear}` } : null;
    }),
  S('need', 'old_footer', 6, 'reached', 'Old copyright year in the footer',
    'footer year 4+ years old, skipped when stale_site already used the footer year',
    c => (c.footerYear && c.year - c.footerYear >= 4 && !(c.fired.has('stale_site') && !c.lastChange) ? { text: `Footer copyright says ${c.footerYear}` } : null)),
  S('need', 'dead_ua_tag', 6, 'reached', 'Still runs Google Universal Analytics, which stopped working in July 2023',
    'signals.ua_tag (a UA-xxxx tag in the page source)',
    c => (c.sig.ua_tag ? true : null)),
  S('need', 'low_seo', 16, 'seo', 'Weak basic SEO',
    'seo.score < 40 full, < 55 at 0.7, < 70 at 0.4',
    c => {
      const sc = num(c.s.seo?.score);
      if (sc == null || sc >= 70) return null;
      return { scale: sc < 40 ? 1 : sc < 55 ? 0.7 : 0.4, text: `SEO score ${sc}/100${c.s.seo.band ? ` (${c.s.seo.band})` : ''}` };
    }),
  S('need', 'missing_legal_page', 10, 'reached', 'No legal notice page where the law requires one',
    'country in scoring.legal_page_countries (default DE, AT) and signals.has_impressum === false',
    c => (c.legalCountries.includes(c.country) && c.sig.has_impressum === false ? { text: 'No Impressum (legal notice), which the law requires here' } : null)),
  S('need', 'phone_mismatch', 8, 'google', 'Phone on the website differs from Google',
    'phone check verdict is MISMATCH (not a corporate profile page)',
    c => (c.phoneCheck.verdict === 'MISMATCH' && c.kind !== 'corporate' ? true : null)),
  S('need', 'unclaimed_google', 6, 'google', 'Google Business Profile not claimed',
    'google.claimed === false',
    c => (c.g.claimed === false ? true : null)),
  S('need', 'loved_but_weak_site', 22, 'google', 'Customers love them, the website does not show it',
    'Google rating >= 4.3 with >= 40 reviews and a weak web presence (partial 0.4 at >= 4.0 with >= 15)',
    c => {
      const { rating, reviews } = c;
      if (!c.weak || rating == null || reviews == null) return null;
      if (rating >= 4.3 && reviews >= 40) return { text: `${reviews} Google reviews at ${rating}, but a weak website` };
      return rating >= 4.0 && reviews >= 15 ? { scale: 0.4, text: `${reviews} Google reviews at ${rating}, but a weak website` } : null;
    }),

  // ---- INTEREST: will they pick up the phone and pay ----
  S('interest', 'google_ads', 18, 'reached', 'Already pays for Google Ads',
    'signals.google_ads (AW- tag / googleadservices)', c => (c.sig.google_ads ? true : null)),
  S('interest', 'meta_pixel', 14, 'reached', 'Meta (Facebook) Pixel installed',
    'signals.meta_pixel', c => (c.sig.meta_pixel ? true : null)),
  S('interest', 'tiktok_pixel', 6, 'reached', 'TikTok pixel installed',
    'signals.tiktok_pixel', c => (c.sig.tiktok_pixel ? true : null)),
  S('interest', 'gtm_only', 7, 'reached', 'Someone set up tracking once (tag manager)',
    'signals.gtm and no Google Ads or Meta tag', c => (c.sig.gtm && !c.sig.google_ads && !c.sig.meta_pixel ? true : null)),
  S('interest', 'chat_widget', 6, 'reached', 'Pays for a chat widget',
    'signals.chat_widget', c => (c.sig.chat_widget ? { text: `Pays for a chat widget (${c.sig.chat_widget})` } : null)),
  S('interest', 'booking_widget', 6, 'reached', 'Already buys booking software',
    'signals.booking_widget', c => (c.sig.booking_widget ? { text: `Already buys booking software (${c.sig.booking_widget})` } : null)),
  S('interest', 'replies_reviews', 15, 'reviews', 'Replies to Google reviews',
    '>= 40% of sampled reviews have an owner reply (any reply: 0.47)',
    c => {
      const n = c.sample.length, r = c.sample.filter(x => x.owner_reply).length;
      if (!r) return null;
      return { scale: r / n >= 0.4 ? 1 : 0.47, text: `Replied to ${r} of the last ${n} Google reviews` };
    }),
  S('interest', 'review_velocity', 13, 'reviews', 'Gets new reviews every month',
    '>= 3 new reviews a month from sampled dates (>= 1: 0.54), capped at reviews / 12',
    c => {
      const v = c.velocity;
      if (v == null || v < 1) return null;
      return { scale: v >= 3 ? 1 : 0.54, text: `About ${v} new Google reviews a month` };
    }),
  S('interest', 'fresh_review', 5, 'reviews', 'Reviewed in the last 30 days',
    'newest sampled review <= 30 days old', c => (c.newestDays != null && c.newestDays <= 30 ? true : null)),
  S('interest', 'well_reviewed', 6, 'google', 'Lots of Google reviews',
    '>= 100 Google reviews', c => (c.reviews >= 100 ? { text: `${c.reviews} Google reviews` } : null)),
  S('interest', 'instagram', 7, 'listing', 'Has an Instagram profile',
    'an Instagram profile on any source or on their site', c => (c.socials.instagram ? true : null)),
  S('interest', 'instagram_dead_site', 10, 'crawled', 'Keeps an Instagram profile while the website is down',
    'Instagram profile and the site is broken, parked or coming soon',
    c => (c.socials.instagram && (BROKEN_STATES.has(c.state) || c.state === 'parked' || c.state === 'coming_soon') ? true : null)),
  S('interest', 'owner_named', 7, 'listing', 'Owner-run, one decision-maker',
    'owner.name known (business or site)', c => (c.owner?.name ? { text: `Owner known: ${c.owner.name}` } : null)),
  S('interest', 'email_own_domain', 5, 'crawled', 'Uses an email address on their own domain',
    'an email whose domain is the website domain', c => (c.ownEmail ? true : null)),
  S('interest', 'ticket', 12, 'listing', 'One customer is worth a lot to them',
    'ticket premium full, mid 0.5, low 0.1 (from config.categories.ticket)',
    c => ({ premium: { text: 'High-value customers (premium ticket)' }, mid: { scale: 0.5, text: 'Mid-value customers' }, low: { scale: 0.1, text: 'Low-value customers' } }[c.b.ticket] || null)),
  S('interest', 'multi_source', 10, 'listing', 'Listed on several sources',
    '3+ distinct sources full, 2 sources 0.6',
    c => (c.sourceCount >= 2 ? { scale: c.sourceCount >= 3 ? 1 : 0.6, text: `Listed on ${c.sourceCount} sources` } : null)),
  S('interest', 'tried_diy', 14, 'listing', 'Already tried a do-it-yourself site',
    'website_kind is free_subdomain', c => (c.kind === 'free_subdomain' ? true : null)),
  S('interest', 'rents_platform', 8, 'listing', 'Rents their web presence from a platform',
    'website_kind is social, aggregator or directory', c => (PLATFORM_KINDS.has(c.kind) ? true : null)),
  S('interest', 'stalled_build', 10, 'crawled', 'A website build that stalled',
    'coming soon placeholder', c => (c.state === 'coming_soon' || c.sig.coming_soon ? true : null)),
  S('interest', 'new_business', 6, 'reached', 'Recently established',
    'Wayback first seen within the last 3 years', c => (c.firstSeen && c.year - c.firstSeen <= 3 ? { text: `Online since ${c.firstSeen}` } : null)),
  S('interest', 'community', 10, 'community', 'Part of the community you serve',
    'config.community enabled in boost mode and the name or reviews match (weight defaults to community.bonus)',
    c => (c.community ? true : null)),

  // ---- NEGATIVE: subtract from interest ----
  S('negative', 'incumbent_agency', -20, 'reached', 'An agency already credits itself on their site',
    'signals.incumbent_agency (outbound "designed by" link)',
    c => (c.sig.incumbent_agency ? { text: `Incumbent agency credited: ${c.sig.incumbent_agency}` } : null)),
  S('negative', 'dormant', -14, 'reviews', 'Dormant online',
    'reviews sampled, no owner replies, newest review older than a year',
    c => (!c.sample.some(x => x.owner_reply) && c.newestDays != null && c.newestDays > 365 ? { text: `Dormant online: newest review ${Math.floor(c.newestDays / 30)} months old, no replies` } : null)),
  S('negative', 'no_cem_statement', -8, 'reached', 'Says it refuses unsolicited email',
    'signals.no_cem_statement', c => (c.sig.no_cem_statement ? true : null)),
  S('negative', 'multi_location', -10, 'listing', 'Several locations share one website',
    'more than 2 businesses in this run share the website domain',
    c => (c.domainCount > 2 ? { text: `${c.domainCount} locations share ${c.host}` } : null)),
];

// ---------------------------------------------------------------------------------------
export function tierFor(priority, tiers = {}) {
  const t = { A: 55, B: 38, C: 24, ...tiers };
  return priority >= t.A ? 'A' : priority >= t.B ? 'B' : priority >= t.C ? 'C' : 'D';
}

const regex = (p, flags = 'i') => { try { return new RegExp(p, flags); } catch { return null; } };
const anyMatch = (patterns, text) => (patterns || []).map(p => regex(p)).filter(Boolean).find(re => re.test(text));

export function phoneObj(raw, country) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return parsePhone(raw, { country }); } catch { return null; }
}
const showPhone = p => { try { return fmtPhone(p) || p?.raw || p?.e164 || ''; } catch { return p?.raw || p?.e164 || ''; } };

function phoneCheck(c) {
  const { s, gm } = c;
  const g = gm ? phoneObj(gm.phone, c.country) : null;
  const gKey = g?.valid !== false ? g?.key : '';
  const sitePhones = c.reached ? (s.phones || []).filter(p => p?.key) : [];
  const out = { verdict: '', site: sitePhones.slice(0, 3).map(showPhone).join(' · '), google: gKey ? showPhone(g) : '', note: '' };
  if (!c.ownSite) out.verdict = 'NO WEBSITE';
  else if (!c.crawled) { out.verdict = 'NOT CHECKED'; out.note = 'website not crawled yet'; }
  else if (!c.reached) { out.verdict = c.state === 'blocked' ? 'NOT CHECKED' : 'SITE UNREACHABLE'; out.note = `site ${c.state}`; }
  else if (!sitePhones.length) out.verdict = 'NO PHONE ON WEBSITE';
  else if (!gm) { out.verdict = 'NOT CHECKED'; out.note = 'no Google match to compare with'; }
  else if (!gKey) out.verdict = 'SITE ONLY';
  else {
    const cmp = sitePhones.map(p => samePhone(p, g, { country: c.country }));
    if (cmp.includes('same')) out.verdict = 'MATCH';
    else if (cmp.includes('same_block')) out.verdict = 'MATCH (different extension)';
    else {
      out.verdict = 'MISMATCH';
      if (c.kind === 'corporate') out.note = 'profile page on a larger company site, an office number may differ';
      else if (c.sig.call_tracking) out.note = `site uses call tracking (${c.sig.call_tracking}), may be intentional`;
    }
  }
  return out;
}

function communityMatch(b, cfg) {
  if (!cfg?.enabled) return false;
  const texts = [b.name, ...(b.names || []), b.google?.name, ...(b.google?.reviews_sample || []).map(r => r.text)].filter(Boolean).join(' \n ');
  const re = cfg.script_regex ? regex(cfg.script_regex, 'u') : null;
  if (re && re.test(texts)) return true;
  const names = [b.name, ...(b.names || [])].join(' ').toLowerCase();
  return (cfg.name_tokens || []).some(t => t && new RegExp(`(^|[^\\p{L}])${String(t).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(names));
}

// Everything the signals look at, computed once per business.
function context(b, s, config, opts) {
  const now = opts.today || today();
  const year = Number(now.slice(0, 4));
  const kind = b.website_kind || (b.website ? 'site' : 'none');
  const ownSite = !!b.website && OWN_KINDS.has(kind);
  const crawled = ownSite && !!s;
  const state = crawled ? (s.state || (s.ok === false ? 'broken' : 'ok')) : '';
  const reached = crawled && state === 'ok' && s.ok !== false;
  const sig = crawled ? (s.signals || {}) : {};
  const host = hostOf(crawled && s.final_url ? s.final_url : b.website);
  const g = b.google && typeof b.google === 'object' ? b.google : null;
  const gm = g && (g.place_id || g.name || g.rating != null) && g.match?.confidence !== 'none' ? g : null;
  const sample = (gm?.reviews_sample || []).filter(r => r && r.date && !Number.isNaN(Date.parse(r.date)))
    .sort((x, y) => Date.parse(y.date) - Date.parse(x.date));
  const reviews = num(gm?.reviews), rating = num(gm?.rating);
  let velocity = null, newestDays = null;
  if (sample.length) {
    newestDays = daysBetween(sample[0].date, now);
    if (sample.length >= 2) {
      const months = Math.max(1, daysBetween(sample.at(-1).date, now) / 30.4);
      velocity = sample.length / months;
      if (reviews) velocity = Math.min(velocity, reviews / 12);
      velocity = Math.round(velocity * 10) / 10;
    }
  }
  const siteSoc = crawled ? (s.socials || {}) : {};
  const socials = { ...(b.socials || {}) };
  for (const [k, v] of Object.entries(siteSoc)) if (v && !socials[k]) socials[k] = v;
  const owner = b.owner?.name ? b.owner : (crawled && s.owner?.name ? s.owner : (b.owner || null));
  const siteEmails = crawled ? (s.emails || []).filter(e => e?.email) : [];
  const ownEmail = siteEmails.find(e => sameSite(e.email.split('@')[1]?.toLowerCase(), host))
    || (b.emails || []).map(e => ({ email: e })).find(e => sameSite(e.email.split('@')[1]?.toLowerCase(), host));
  const yearOf = v => (v ? Number(String(v).slice(0, 4)) || null : null);
  const c = {
    b, s: s || {}, g: gm || {}, gm, config, year, now, kind, ownSite, crawled, reached, state, sig, host,
    country: b.country || config.market?.country || '',
    legalCountries: config.scoring?.legal_page_countries || ['DE', 'AT'],
    footerYear: num(sig.footer_year), lastChange: yearOf(sig.wayback_last_change), firstSeen: yearOf(sig.wayback_first),
    sample, reviews, rating, velocity, newestDays,
    socials, owner, siteEmails, ownEmail: ownEmail || null,
    sourceCount: new Set((b.sources || []).map(x => x.source)).size,
    domainCount: kind === 'site' ? (opts.domainCount?.get(hostOf(b.website)) || 0) : 0,
    community: config.community?.enabled && (config.community.mode || 'boost') === 'boost' && communityMatch(b, config.community),
    fired: new Set(),
  };
  // "Weak" web presence: no working site of their own, or a reached site with a visible defect.
  const seo = num(c.s.seo?.score);
  c.weak = !ownSite || kind !== 'site' || (crawled && state !== 'ok' && state !== 'blocked')
    || (reached && (sig.viewport === false || sig.https === false || (sig.form === false && !sig.booking_widget)
      || sig.tel_link === false || sig.coming_soon || (c.footerYear && year - c.footerYear >= 4) || (seo != null && seo < 50)));
  c.phoneCheck = phoneCheck(c);
  return c;
}

const available = (c, when) => ({
  listing: true, crawled: c.crawled, reached: c.reached, seo: c.reached && num(c.s.seo?.score) != null,
  google: !!c.gm, reviews: !!c.gm && c.sample.length > 0, community: c.community,
}[when] ?? true);

export function weightOf(sig, config) {
  const w = config.scoring?.weights || {};
  if (sig.id === 'community' && w.community === undefined && config.community?.bonus != null) return Number(config.community.bonus);
  const v = w[sig.id] === undefined ? sig.weight : Number(w[sig.id]);
  if (!Number.isFinite(v)) return sig.weight;
  return sig.kind === 'negative' ? -Math.abs(v) : v;
}

function disqualify(c, config) {
  const { b } = c, dq = config.scoring?.disqualify || {};
  const names = [b.name, ...(b.names || []), c.gm?.name].filter(Boolean).join(' | ');
  const cats = [b.category, ...(c.gm?.categories || [])].filter(Boolean).join(' | ');
  if (c.gm?.status === 'CLOSED_PERMANENTLY') return { reason: 'closed', detail: 'Permanently closed on Google' };
  const chain = anyMatch([...(dq.chain_patterns || []), ...(dq.brand_patterns || [])], names);
  if (chain) return { reason: 'chain', detail: `Chain or franchise brand (matches "${chain.source}")` };
  const maxLoc = dq.max_locations ?? 3;
  if (c.domainCount > maxLoc) return { reason: 'chain', detail: `${c.domainCount} locations share ${c.host}` };
  const comp = anyMatch(dq.competitor_patterns, `${names} | ${cats}`);
  if (comp) return { reason: 'competitor', detail: `Web, SEO or marketing business (matches "${comp.source}")` };
  if (config.community?.enabled && config.community.mode === 'filter' && !communityMatch(b, config.community))
    return { reason: 'outside_community', detail: 'Name and reviews do not match the community lens' };
  const reachable = (b.phones || []).length || (b.emails || []).length || c.siteEmails.length || c.gm?.phone
    || (c.reached && (c.s.phones || []).length) || Object.values(c.socials).some(Boolean) || b.address;
  if (!reachable) return { reason: 'unreachable', detail: 'No phone, email, social profile or address' };
  const ws = dq.well_served;
  if (ws && c.reached && c.kind === 'site') {
    const seo = num(c.s.seo?.score);
    const modern = (!ws.modern_builders?.length || ws.modern_builders.includes(c.sig.builder))
      && c.footerYear >= (ws.min_footer_year ?? 0)
      && (!ws.requires_form_or_widget || c.sig.form || c.sig.booking_widget)
      && c.sig.viewport !== false && c.sig.https !== false
      && seo != null && seo >= (ws.min_seo ?? 70);
    if (modern) return { reason: 'well_served', detail: `Modern site that already converts (SEO ${seo}${c.sig.builder ? `, ${c.sig.builder}` : ''})` };
  }
  return null;
}

// ---- outreach: who may be emailed, and how to approach them under the configured law ----
export function regimeOf(r) {
  const x = String(r || '').toUpperCase();
  if (x.includes('CASL')) return 'CASL';
  if (x.includes('PECR')) return 'PECR';
  if (x.includes('GDPR')) return 'GDPR';
  if (x.includes('SPAM ACT') || x.includes('SPAM-ACT')) return 'SPAM_ACT';
  if (x.replace(/[^A-Z]/g, '') === 'CANSPAM') return 'CAN-SPAM';
  return 'UNKNOWN';
}

// Address conspicuously published by the business itself: found on a page of their own
// site, with an address on that domain (or a consumer mailbox shown there).
export function publishedEmail(c) {
  if (!c.reached || c.kind !== 'site') return null;
  return c.siteEmails.find(e => {
    const dom = e.email.split('@')[1]?.toLowerCase() || '';
    return (!e.page || sameSite(hostOf(e.page), c.host)) && (sameSite(dom, c.host) || CONSUMER_MAIL.test(dom));
  }) || null;
}

function outreach(c, config, row) {
  const comp = config.compliance || {};
  const regime = regimeOf(comp.regime);
  const refuses = comp.honor_no_cem_statement !== false && !!c.sig.no_cem_statement;
  const pub = publishedEmail(c);
  const anyEmail = pub?.email || c.ownEmail?.email || c.siteEmails[0]?.email || (c.b.emails || [])[0] || '';
  const hasPhone = !!row.phone;
  let emailOk = false, rule;
  if (regime === 'CASL' || regime === 'SPAM_ACT') {
    const law = regime === 'CASL' ? 'CASL' : 'Spam Act (AU)';
    emailOk = !!pub && !refuses;
    rule = emailOk
      ? `${law}: email allowed to ${pub.email}, published on their own site${pub.page ? ` (${pub.page})` : ''} with no refusal notice, about their business only. Identify yourself and include an unsubscribe.`
      : `${law}: do not email (${refuses ? 'their site refuses unsolicited email' : anyEmail ? 'address not published on their own site' : 'no published address'}). Call or visit.${regime === 'CASL' ? ' Business numbers are exempt from the National DNCL; keep your own do-not-call list.' : ''}`;
  } else if (regime === 'GDPR') {
    const de = ['DE', 'AT'].includes(c.country) ? ' Germany/Austria: no cold email or fax; call only where interest can be presumed, a letter is the safe first touch.' : '';
    rule = `GDPR: phone or letter first for cold B2B outreach; email only after they agree. Document your legitimate-interest assessment, say where you got their details, honour objections at once.${de}`;
  } else if (regime === 'PECR') {
    const corporate = /\b(ltd|limited|llp|plc)\b/i.test(c.b.name || '');
    emailOk = !!anyEmail && corporate && !refuses;
    rule = emailOk
      ? 'PECR: email to a company (Ltd/LLP/plc) allowed; identify yourself and give a simple opt-out. Check TPS/CTPS before calling.'
      : 'PECR: sole traders and partnerships need prior consent for email; call (check TPS/CTPS first) or write.';
  } else if (regime === 'CAN-SPAM') {
    emailOk = !!anyEmail && !refuses;
    rule = emailOk
      ? `CAN-SPAM: email allowed. Use your real identity and postal address (${comp.sender_identity || 'sender identity'}), an honest subject line, and an opt-out honoured within 10 business days.`
      : `CAN-SPAM: ${refuses ? 'their site refuses unsolicited email; respect it and call instead' : 'no email address found; call or visit'}.`;
  } else {
    rule = `Compliance regime "${comp.regime || ''}" not recognised: call or visit first and check your local law before emailing.`;
  }
  const channel = emailOk ? 'email' : hasPhone ? 'phone' : c.socials.instagram || c.socials.facebook || c.socials.whatsapp ? 'dm' : 'walk-in';
  return { email_ok: emailOk, email: emailOk ? (pub?.email || anyEmail) : anyEmail, email_page: pub?.page || '', channel, outreach_rule: rule };
}

const sentence = (parts, empty) => {
  const s = parts.filter(Boolean).join('; ');
  return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : empty;
};

// ---------------------------------------------------------------------------------------
export function scoreRow(business, site, config = {}, opts = {}) {
  const c = context(business, site || null, config, opts);
  const need = [], interest = [], negatives = [];
  const bucket = { need, interest, negative: negatives };
  for (const sig of opts.signals || DEFAULT_SIGNALS) {
    const w = weightOf(sig, config);
    if (!w || !available(c, sig.when)) continue;
    const hit = sig.fire(c);
    if (!hit) continue;
    const scale = hit === true ? 1 : (hit.scale ?? 1);
    const points = Math.round(Math.abs(w) * scale) * Math.sign(w);
    if (!points) continue;
    c.fired.add(sig.id);
    bucket[sig.kind].push({ id: sig.id, points, text: (hit !== true && hit.text) || sig.text });
  }
  const byPoints = (a, b) => Math.abs(b.points) - Math.abs(a.points);
  need.sort(byPoints); interest.sort(byPoints); negatives.sort(byPoints);
  const sum = a => a.reduce((t, x) => t + x.points, 0);
  const N = clamp(sum(need), 0, 100), I = clamp(sum(interest) + sum(negatives), 0, 100);
  const priority = Math.round(Math.sqrt(N * I));

  const b = business, s = c.s;
  const mainPhone = (b.phones || [])[0] || phoneObj(c.gm?.phone, c.country) || (c.reached ? (s.phones || [])[0] : null);
  const row = {
    ...b,
    socials: c.socials, owner: c.owner || b.owner || null,
    phone: mainPhone ? showPhone(mainPhone) : '',
    site_key: opts.siteKey ?? (c.ownSite ? siteKeyDefault(b) : ''), site_state: c.ownSite ? (c.crawled ? c.state : 'not_crawled') : 'none',
    seo_score: num(s.seo?.score), seo_band: s.seo?.band || '', seo_measured_pct: num(s.seo?.measured_pct), seo_issues: s.seo?.issues || [],
    builder: c.sig.builder || '', footer_year: c.footerYear, wayback_last_change: c.sig.wayback_last_change || null,
    ads: c.reached ? [c.sig.google_ads && 'Google Ads', c.sig.meta_pixel && 'Meta Pixel', c.sig.tiktok_pixel && 'TikTok'].filter(Boolean) : null,
    incumbent_agency: c.sig.incumbent_agency || '',
    community_match: config.community?.enabled ? communityMatch(b, config.community) : null,
    need: N, interest: I, priority, tier: tierFor(priority, config.scoring?.tiers),
    need_reasons: need, interest_reasons: interest, negatives,
    disqualified: disqualify(c, config),
    phone_check: c.phoneCheck,
  };
  const defects = need.filter(r => r.id !== 'loved_but_weak_site');
  row.why_they_need_you = defects.length ? sentence(need.slice(0, 3).map(r => r.text))
    : 'No website problem found yet; research before calling.';
  row.why_they_care = sentence(interest.filter(r => r.points >= 3).slice(0, 3).map(r => r.text), 'No buying signal found.');
  row.risk = sentence([
    ...negatives.map(r => r.text),
    c.state === 'blocked' && 'Site blocked our check, so site problems are unverified',
    c.gm?.match?.confidence === 'low' && 'Google match is uncertain, verify before quoting it',
    (b.flags || []).includes('verify-match') && 'Merged listings flagged for review',
    c.phoneCheck.note && c.phoneCheck.verdict === 'MISMATCH' && c.phoneCheck.note,
  ], '');
  Object.assign(row, outreach(c, config, row));
  return row;
}

// Same rule as siteKey() in lib/site.mjs: one site = the hostname without www.
const siteKeyDefault = b => (b.website ? hostOf(b.website) : '');

// Score every business. sites = sites.json items ({ siteKey: Site }); keyOf = siteKey function.
export function scoreAll(businesses, sites = {}, config = {}, { keyOf = siteKeyDefault, today: day } = {}) {
  const domainCount = new Map();
  for (const b of businesses) if (b.website && (b.website_kind || 'site') === 'site') {
    const h = hostOf(b.website);
    domainCount.set(h, (domainCount.get(h) || 0) + 1);
  }
  const rows = businesses.map(b => {
    const key = b.website && OWN_KINDS.has(b.website_kind || 'site') ? keyOf(b) : '';
    return scoreRow(b, key ? sites[key] || null : null, config, { siteKey: key, domainCount, today: day });
  });
  return rows.sort((a, b) => (!!a.disqualified - !!b.disqualified) || b.priority - a.priority || b.need - a.need
    || String(a.name).localeCompare(String(b.name)));
}
