#!/usr/bin/env node
// Sales proposal: seven print-perfect pages a non-technical owner reads in a minute.
//   1 cover · 2 what customers find today · 3 what it costs · 4 the new page (markers + phone)
//   5 what changes (before/after + what you get) · 6 Google readiness · 7 plans and contact
// Data: <package>/proposal-data.json (schema.json, limits.json) + agency/market/offer from <package>/job.json.
//   node templates/proposal/proposal.mjs <packageDir> [--project <dir>]   -> <packageDir>/proposal/proposal.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..', '..');
export const PAGES = 7;

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v; return o; };

// ---- UI strings: strings/en.json, overlaid by strings/<lang>.json (and $L2P_STRINGS_DIR/<lang>.json first) ----
export function loadStrings(lang = 'en', overrides = {}) {
  const dirs = [process.env.L2P_STRINGS_DIR, path.join(HERE, 'strings')].filter(Boolean);
  const find = l => dirs.map(d => path.join(d, `${l}.json`)).find(f => fs.existsSync(f));
  let s = readJSON(path.join(HERE, 'strings', 'en.json'));
  const base = String(lang || 'en').toLowerCase().split('-')[0];
  for (const l of [...new Set([base, String(lang || '').toLowerCase()])]) {
    const f = l && l !== 'en' ? find(l) : null;
    if (f) s = { ...s, ...readJSON(f) };
  }
  return { ...s, ...overrides };
}
const fill = (t, vars = {}) => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// ---- colours ----
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (h, w, t) => hex(rgb(h).map((v, i) => v + (rgb(w)[i] - v) * t));
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const onColor = h => (lum(h) > 0.4 ? '#111418' : '#FFFFFF');
const color = (v, d) => (HEX.test(String(v || '')) ? v : d);

const ICON = {
  shield: '<path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  trend: '<path d="M3 17 9 11l4 4 8-8"/><path d="M14 7h7v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  map: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4V8Z"/><circle cx="12" cy="13.5" r="3.5"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.star}</svg>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const ok = s => Number(s) >= 70;
const GOOD = /\b(strong|solid|good|great|excellent|works well)\b/i;   // fallback when seo_big items are plain strings

// ---- files ----
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.woff2': 'font/woff2' };
const dataURI = f => `data:${MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(f).toString('base64')}`;
function fontFaces() {
  const F = path.join(HERE, 'fonts');
  const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF';
  const face = (fam, file, style, weight, range) => fs.existsSync(path.join(F, file))
    ? `@font-face{font-family:"${fam}";src:url(${dataURI(path.join(F, file))}) format("woff2");font-style:${style};font-weight:${weight};font-display:block;unicode-range:${range}}` : '';
  return [
    face('L2P Serif', 'fraunces-latin.woff2', 'normal', '300 700', LATIN), face('L2P Serif', 'fraunces-latin-ext.woff2', 'normal', '300 700', EXT),
    face('L2P Serif', 'fraunces-italic-latin.woff2', 'italic', '300 700', LATIN), face('L2P Serif', 'fraunces-italic-latin-ext.woff2', 'italic', '300 700', EXT),
    face('L2P Sans', 'inter-latin.woff2', 'normal', '400 700', LATIN), face('L2P Sans', 'inter-latin-ext.woff2', 'normal', '400 700', EXT),
    face('L2P Mono', 'jetbrains-mono-latin.woff2', 'normal', '500', LATIN),
  ].join('\n');
}

// Agency logo: URL, data URI, absolute path, or a path relative to the project / package folder. Embedded so the HTML is portable.
function agencyLogo(logo, dirs) {
  if (!logo) return '';
  if (/^(https?:|data:)/.test(logo)) return logo;
  const f = [logo, ...dirs.filter(Boolean).map(d => path.resolve(d, logo))].find(p => path.isAbsolute(p) && fs.existsSync(p));
  return f ? dataURI(f) : '';
}

// Digits of any script count: "$750", "۱۸ میلیون تومان", "١٥٠٠ درهم".
export const hasDigit = s => /\p{Nd}/u.test(String(s ?? ''));
// Right-to-left script letters (Hebrew, Arabic, Persian, Urdu …); digits alone (۱۸) are not.
const RTL_LETTERS = /(?=\p{L})[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
export const textDir = s => (RTL_LETTERS.test(String(s ?? '')) ? 'rtl' : 'ltr');
const priceOf = plans => (plans.find(p => p.rec && hasDigit(p.price)) || plans.find(p => hasDigit(p.price)) || {}).price || '';

// Fonts declared by a language's strings (`_fonts_css` + `_font_stack`). Persian and Arabic default to
// Vazirmatn (Google Fonts, OFL) so headings never fall back to whatever the system has.
const SCRIPT_FONTS = {
  fa: { css: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300..700&display=block', stack: 'Vazirmatn, Vazir, Tahoma' },
  ar: { css: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300..700&display=block', stack: 'Vazirmatn, Tahoma' },
};
export function fontsFor(T, lang) {
  const def = SCRIPT_FONTS[String(lang || '').toLowerCase().split('-')[0]] || {};
  const css = T._fonts_css || (T._font_stack ? '' : def.css || '');
  const stack = String(T._font_stack || def.stack || '').split(',').map(f => f.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return { css, families: stack.map(f => `"${f.replace(/["\\<>]/g, '')}"`).join(',') };
}

// ---- the document ----
export function renderProposal({ data, job = {}, pkgDir = '.', projectDir = '' }) {
  const d = data, S = d.sales || {}, B = d.business || {}, L = d.landing || {}, seo = d.seo || {};
  const agency = job.agency || {}, market = job.market || {}, offer = job.offer || {};
  const lang = d.language || job.language || market.language || 'en';
  const T = loadStrings(lang, { ...(job.strings || {}), ...(d.strings || {}) });
  const t = (k, v) => esc(fill(T[k], v));
  const dir = T._dir === 'rtl' ? 'rtl' : 'ltr';
  const A4 = String(market.paper || d.paper || 'Letter').toUpperCase() === 'A4';
  const rel = p => (p && /^(https?:|data:)/.test(p) ? p : path.relative(path.join(pkgDir, 'proposal'), path.join(pkgDir, String(p || ''))).split(path.sep).map(encodeURIComponent).join('/'));
  const accent = color(agency.color, '#1F4E79'), brand = color(B.brand_color, accent);
  const plans = (S.plans && S.plans.length ? S.plans : offer.plans || []).map(p => ({ ...p, price: String(p.price ?? ''), items: p.items || [] }));
  const price = priceOf(plans);
  const days = offer.delivery_days || 14;
  const logo = agencyLogo(agency.logo, [projectDir, job.paths?.project, pkgDir]);
  const agencyName = agency.name || '';
  const site = B.website || '';
  const date = d.date || job.date_label || job.date || '';
  const ltr = s => `<bdi dir="ltr" class="n">${esc(s)}</bdi>`;   // phones, domains, numbers inside RTL text
  // Prices are isolated with their own direction: "$750" left-to-right, "۱۸ میلیون تومان" right-to-left (never "میلیون ۱۸").
  const money = s => `<bdi dir="${textDir(s)}" class="n">${esc(s)}</bdi>`;

  const brandMark = (cls = '') => logo
    ? `<span class="ag ${cls}"><img src="${esc(logo)}" alt="${esc(agencyName)}"></span>`
    : `<span class="ag ag-word ${cls}"><i></i>${esc(agencyName)}</span>`;
  const footer = (n, dark) => `<footer class="pf${dark ? ' on-dark' : ''}">${dark ? `<span class="ag ag-word small"><i></i>${esc(agencyName)}</span>` : brandMark('small')}<span class="pf-r"><span class="pf-b">${esc(B.name)}</span><bdi dir="ltr">${t('page_of', { n, total: PAGES })}</bdi></span></footer>`;
  const page = (n, cls, body, dark = false) => `<section class="page ${cls}" data-page="${n}">${body}${footer(n, dark)}</section>`;
  const kicker = k => `<p class="kicker">${t(k)}</p>`;
  const browser = (src, { url = site || T.your_new_website, cls = '', extra = '' } = {}) =>
    `<div class="browser ${cls}"><div class="bar"><i></i><i></i><i></i><span class="url">${esc(url)}</span></div><div class="shot">${src ? `<img src="${esc(rel(src))}" alt="">` : ''}${extra}</div></div>`;
  const factBox = (f, cls) => f ? `<div class="stat ${cls}" data-box><b>${ltr(f.number)}</b><p>${esc(f.text)}<small>${t('source')}: ${esc(f.source)}</small></p></div>` : '';

  // 1 cover
  const headline = esc(S.cover_headline).replace(/^(.+?[.!?])(?=\s)/, '<em>$1</em>');
  const cover = page(1, 'cover dark', `<div class="glow"></div>
  <div class="top">${brandMark('big')}<div class="for">${t('prepared_for')}<br><b>${esc(B.person || B.name)}</b><br>${esc(date)}</div></div>
  <div class="client"><div class="chip" style="background:${color(B.logo_bg, '#FFFFFF')}"><img src="${esc(rel(B.logo))}" alt="${esc(B.name)}"></div>
    <div class="cname"><b>${esc(B.name)}</b><span>${esc([B.category, B.city].filter(Boolean).join(' · '))}</span></div></div>
  <h1 class="headline">${headline}</h1>
  ${S.cover_sub ? `<p class="csub">${esc(S.cover_sub)}</p>` : ''}
  <div class="devices">${browser(L.desktop, { cls: 'dev-desk' })}<div class="phone"><img src="${esc(rel(L.mobile))}" alt=""></div></div>
  <div class="ribbon" data-box><b data-fit>${fill(esc(T.cover_ribbon_title), { price: `<span class="pr">${money(price)}</span>` })}</b>
    <span>${t('cover_ribbon_ready', { days })}<br>${esc(agency.contact_name)}${agency.contact_name && agency.phone ? ' · ' : ''}${ltr(agency.phone)}</span></div>`, true);

  // 2 today
  const ev = S.evidence || [];
  const today = page(2, 'today', `${kicker('today_kicker')}<h2>${esc(S.journey_title)}</h2>
  <div class="path">
    ${(S.found || []).map(f => `<div class="node good" data-box><span class="ok">${CHECK}</span><div><b>${esc(f.label)}</b><small>${esc(f.sub)}</small></div></div>`).join('')}
    <div class="arrow" aria-hidden="true">${dir === 'rtl' ? '←' : '→'}</div>
    <div class="node bad" data-box><span class="no">${CROSS}</span><b>${t('then_they_see')}</b></div>
  </div>
  <div class="evid n${ev.length}">${ev.map(e => `<figure class="ev">${browser(e.img, { url: e.url || site || '', cls: 'fit' })}<figcaption data-box><span class="no">${CROSS}</span>${esc(e.label)}</figcaption></figure>`).join('')}</div>
  <div class="leave" data-box><span class="no">${CROSS}</span>${esc(S.leave)}</div>`);

  // 3 what it costs
  const F = S.fact || {};
  const cost = page(3, 'cost', `${kicker('cost_kicker')}<h2>${t('cost_title')}</h2>
  <div class="bigfact" data-box><b data-fit>${ltr(F.number)}</b><p>${esc(F.text)}</p><small>${t('source')}: ${esc(F.source)}</small></div>
  ${F.text2 ? `<div class="vs"><p data-box>${esc(F.text2)}</p><div data-box><span>${t('cost_page_label')}</span><b data-fit>${money(price)}</b></div></div>` : ''}
  ${(S.stats || []).length ? `<div class="stats n${S.stats.length}">${S.stats.map(s => factBox(s, '')).join('')}</div>` : ''}`);

  // 4 the new page
  const pins = (S.markers || []).map((m, i) => `<span class="pin" style="left:${Math.max(0, Math.min(100, Number(m.x) || 0))}%;top:${Math.max(0, Math.min(100, Number(m.y) || 0))}%">${i + 1}</span>`).join('');
  const mine = page(4, 'mine', `${kicker('new_kicker')}<h2>${t('new_title')} <em>${t('new_title_em')}</em></h2>
  <div class="annot">${browser(L.desktop, { extra: pins, cls: 'full' })}</div>
  <div class="mrow"><div class="phone sm"><img src="${esc(rel(L.mobile))}" alt=""></div>
    <div class="legend">${(S.markers || []).map((m, i) => `<div data-box><i>${i + 1}</i><span>${esc(m.label)}</span></div>`).join('')}
    <p class="mnote">${t('new_mobile_note')}</p></div></div>`);

  // 5 what changes
  const change = page(5, 'change', `${kicker('change_kicker')}<h2>${t('change_title')}</h2>
  <div class="ba">
    <div class="row before">${browser(L.current || ev[0]?.img, { url: L.current_url || site || (L.current ? '' : ev[0]?.url || ''), cls: 'fit' })}
      <div class="chips" data-box><span class="badge b">${t('badge_today')}</span>${(S.before || []).map(x => `<div><span class="no">${CROSS}</span>${esc(x)}</div>`).join('')}</div></div>
    <div class="row after">${browser(L.desktop)}
      <div class="chips" data-box><span class="badge a">${t('badge_new')}</span>${(S.after || []).map(x => `<div><span class="ok">${CHECK}</span>${esc(x)}</div>`).join('')}</div></div>
  </div>
  <h3 class="sub">${t('values_title')}</h3>
  <div class="tiles">${(S.values || []).map(v => `<div class="tile" data-box><span class="ic">${icon(v.icon)}</span><div><b>${esc(v.title)}</b><p>${esc(v.detail)}</p></div></div>`).join('')}</div>`);

  // 6 Google readiness
  const score = seo.score == null || seo.score === '' ? null : Math.max(0, Math.min(100, Math.round(Number(seo.score))));
  const tone = score == null ? 'var(--bad)' : score >= 70 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
  let pn = 0;
  const big = (S.seo_big || []).map(x => {
    const txt = typeof x === 'string' ? x : x.text, good = typeof x === 'string' ? GOOD.test(x) : !!x.good;
    return good ? `<div class="good" data-box><i>${t('what_works')}</i>${esc(txt)}</div>` : `<div data-box><i>${t('problem_n', { n: ++pn })}</i>${esc(txt)}</div>`;
  }).join('');
  const google = page(6, 'google', `${kicker('google_kicker')}<h2>${esc(S.seo_title || T.google_title)}</h2>
  <div class="gwrap"><div class="donut" style="--v:${score ?? 0};--tone:${tone}"><div>${score == null
    ? `<b class="nows">${t('no_website')}</b><span>${t('no_website_sub')}</span>`
    : `<b>${ltr(score)}</b><span>${t('score_out_of')}</span>`}</div></div>
    <div class="gtext"><p class="gline">${esc(S.seo_line)}</p>${seo.band ? `<span class="band" style="--tone:${tone}">${esc(seo.band)}</span>` : ''}<small>${t(score == null ? 'google_presence_note' : 'google_checks_note')}</small></div></div>
  <div class="ticks">${(seo.categories || []).map(c => `<div class="${ok(c.score) ? 'y' : 'n'}" data-box><span class="${ok(c.score) ? 'ok' : 'no'}">${ok(c.score) ? CHECK : CROSS}</span>${esc(c.label)}</div>`).join('')}</div>
  <div class="probs">${big}</div>`);

  // 7 offer
  const foot = p => p.note ? esc(p.note) : !hasDigit(p.price) ? t('plan_foot_quote') : /\//.test(p.price) ? '' : p.rec ? t('plan_foot_rec') : t('plan_foot');
  const offerPage = page(7, 'offer', `${kicker('offer_kicker')}<h2>${t('offer_title')}</h2>
  <div class="plans n${plans.length}">${plans.map(p => `<div class="plan${p.rec ? ' rec' : ''}" data-box>${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}<h3>${esc(p.name)}</h3>
    <div class="price" data-fit>${hasDigit(p.price) ? money(p.price) : esc(p.price || T.plan_price_quote)}</div>
    <ul>${p.items.map(x => `<li><span class="ok">${CHECK}</span>${esc(x)}</li>`).join('')}</ul><div class="foot">${foot(p)}</div></div>`).join('')}</div>
  <div class="extras">${offer.care_plan ? `<div data-box><b>${t('care_plan')}</b>${esc(offer.care_plan)}</div>` : ''}<div data-box><b>${icon('clock')}</b>${t('delivery', { days })}</div></div>
  <div class="trust3">${['trust_1', 'trust_2', 'trust_3'].map(k => `<div data-box><span class="ok">${CHECK}</span>${t(k)}</div>`).join('')}</div>
  <div class="sign">${brandMark('big')}<span>${t('prepared_by', { name: [agency.contact_name, agencyName].filter(Boolean).join(', ') })}<br>${esc(date)}</span></div>
  <div class="cta" data-box><b>${t('cta_title')}</b><span>${t('cta_or_call', { name: agency.contact_name || agencyName })}<br><strong>${ltr(agency.phone)}</strong>${agency.email ? `<br>${ltr(agency.email)}` : ''}${agency.website ? `<br>${ltr(agency.website)}` : ''}</span></div>`);

  const W = A4 ? 794 : 816, H = A4 ? 1123 : 1056;
  const fonts = fontsFor(T, lang), extra = fonts.families ? `${fonts.families},` : '';
  return `<!doctype html><html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8">
<title>${t('doc_title', { business: B.name, agency: agencyName })}</title>
${fonts.css ? `<link rel="stylesheet" href="${esc(fonts.css)}">` : ''}
<style>
${fontFaces()}
@page{size:${A4 ? 'A4' : 'Letter'};margin:0}
:root{--W:${W}px;--H:${H}px;--ink:#111418;--ink2:#2B3037;--muted:#5D636B;--line:#E4E2DC;--soft:#F5F4F0;--paper:#FFFFFF;
  --accent:${accent};--on-accent:${onColor(accent)};--accent-soft:${mix(accent, '#FFFFFF', 0.9)};--accent-tint:${mix(accent, '#FFFFFF', 0.78)};
  --accent-deep:${mix(accent, '#07090C', 0.78)};--accent-light:${mix(accent, '#FFFFFF', 0.55)};--accent-text:${lum(accent) > 0.35 ? mix(accent, '#000000', 0.45) : accent};
  --brand:${brand};--good:#177A4F;--good-soft:#E5F2EA;--bad:#BF3F12;--bad-soft:#FBEBE3;--warn:#B26B00;
  --serif:"L2P Serif",${extra}Georgia,"Times New Roman",serif;--sans:${extra}"L2P Sans","Helvetica Neue",Arial,sans-serif;--mono:"L2P Mono",${extra}ui-monospace,Menlo,monospace}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#D9D8D3}
body{font:16px/1.45 var(--sans);color:var(--ink);font-kerning:normal;-webkit-font-smoothing:antialiased}
bdi{unicode-bidi:isolate}
bdi.n{display:inline-block}
/* Arabic-script letters join: letter-spacing tears the words apart and the mono labels have no such glyphs.
   Whole right-to-left documents, and any Persian/Arabic text inside an English one (tagged .ar by the script below). */
html[dir=rtl] *,:lang(fa),:lang(ar),:lang(ur),:lang(ps),:lang(ckb),.ar{letter-spacing:0!important}
html[dir=rtl]{--mono:var(--sans)}
.ar-sans{font-family:var(--sans)!important}
/* right-to-left pages: each text takes its own direction, so a Latin name or quote is never mirrored */
html[dir=rtl] :is(h1,h2,h3,p,li,figcaption,small,b,.legend span,.chips div,.ticks div,.probs div){unicode-bidi:plaintext}
/* No CSS shadows or filters anywhere: some PDF viewers draw them as grey boxes. */
.page{width:var(--W);height:var(--H);position:relative;overflow:hidden;background:var(--paper);padding:54px 56px 84px;margin:0 auto;page-break-after:always;break-after:page;display:flex;flex-direction:column}
.page>*{flex-shrink:0}
.page:last-child{page-break-after:auto;break-after:auto}
h1,h2,h3,p,figure{margin:0}
h2{font:400 48px/1.04 var(--serif);letter-spacing:-.018em;text-wrap:balance;font-optical-sizing:auto}
h2 em{font-style:italic;color:var(--muted)}
.kicker{font:500 11.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 16px;display:flex;gap:10px;align-items:center}
.kicker::before{content:"";width:24px;height:2px;background:var(--accent)}
.pf{position:absolute;left:56px;right:56px;bottom:30px;height:22px;display:flex;justify-content:space-between;align-items:center;gap:20px;font:500 10.5px/1 var(--mono);color:var(--muted);border-top:1px solid var(--line);padding-top:12px;box-sizing:content-box}
.pf-r{display:flex;gap:14px;align-items:center;min-width:0}
.pf-b{max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5}
.pf.on-dark{color:rgba(255,255,255,.6);border-top-color:rgba(255,255,255,.14)}
.ag{display:inline-flex;align-items:center;gap:8px;font:600 15px/1 var(--sans);letter-spacing:-.02em;color:var(--ink);white-space:nowrap}
.ag img{display:block;height:24px;width:auto;max-width:170px;object-fit:contain}
.ag.small img{height:16px;max-width:120px}.ag.small{font-size:12px}
.ag-word i{width:9px;height:9px;border-radius:50%;background:var(--accent);display:block}
.on-dark .ag,.dark .ag{color:#fff}
.on-dark .ag-word i,.dark .ag-word i{background:var(--accent-light)}
.ok,.no{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;color:#fff;flex:none}
.ok{background:var(--good)}.no{background:var(--bad)}
.ok svg,.no svg{width:15px;height:15px}
.browser{border-radius:10px;overflow:hidden;background:#fff;border:1px solid rgba(17,20,24,.14)}
.browser .bar{height:24px;background:#EEEDE9;display:flex;align-items:center;gap:5px;padding:0 10px;direction:ltr}
.browser .bar i{width:7px;height:7px;border-radius:50%;background:#CDCCC6;display:block;flex:none}
.browser .url{margin-left:9px;flex:1;min-width:0;height:14px;border-radius:5px;background:#fff;font:500 8.5px/14px var(--mono);color:#80848A;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.shot{position:relative;background:#fff}
.browser img{display:block;width:100%}
.phone{border-radius:28px;padding:6px;background:#15181C;border:1px solid rgba(255,255,255,.16)}
.phone img{display:block;width:100%;border-radius:22px}

/* 1 cover */
.cover{background:linear-gradient(160deg,var(--accent-deep) 0%,#0B0D10 72%);color:#fff}
.cover .glow{position:absolute;right:-260px;top:-260px;width:720px;height:720px;border-radius:50%;background:radial-gradient(circle,${mix(accent, '#FFFFFF', 0.35)}66 0%,${mix(accent, '#FFFFFF', 0.35)}00 66%)}
.cover .top{display:flex;justify-content:space-between;align-items:flex-start;position:relative}
.cover .ag.big{font-size:21px}
.cover .ag.big img{height:34px;max-width:220px;background:#fff;border-radius:8px;padding:6px 10px;box-sizing:content-box}
.cover .for{font:500 10.5px/1.6 var(--mono);color:rgba(255,255,255,.62);text-align:end;text-transform:uppercase;letter-spacing:.1em;max-width:300px}
.cover .for b{color:#fff;font-weight:500}
.cover .client{display:flex;align-items:center;gap:16px;margin:46px 0 26px;position:relative}
.cover .chip{border-radius:12px;padding:8px 14px;height:62px;display:flex;align-items:center;flex:none;max-width:260px}
.cover .chip img{max-height:46px;max-width:232px;width:auto;height:auto;display:block}
.cover .cname{display:flex;flex-direction:column;gap:5px;min-width:0}
.cover .cname b{font:600 17px/1.2 var(--sans)}
.cover .cname span{font-size:13.5px;color:rgba(255,255,255,.62)}
.cover .headline{font:400 62px/1.02 var(--serif);letter-spacing:-.02em;max-width:640px;text-wrap:balance;position:relative}
.cover .headline em{color:var(--accent-light);font-style:italic}
.cover .csub{margin-top:16px;font-size:16.5px;color:rgba(255,255,255,.74);max-width:520px;position:relative}
.cover .devices{position:absolute;left:56px;right:56px;bottom:178px;height:356px}
.cover .dev-desk{position:absolute;inset-inline-start:0;top:0;width:566px;border-color:rgba(255,255,255,.2)}
.cover .dev-desk .shot{height:330px;overflow:hidden}
.cover .dev-desk img{height:100%;object-fit:cover;object-position:top}
.cover .devices .phone{position:absolute;inset-inline-end:0;top:-10px;width:168px}
.ribbon{position:absolute;left:56px;right:56px;bottom:84px;display:flex;justify-content:space-between;align-items:center;gap:24px;background:#fff;color:var(--ink);border-radius:16px;padding:20px 26px}
.ribbon b{font:400 33px/1.05 var(--serif);letter-spacing:-.01em;white-space:nowrap;flex:1 1 auto;min-width:0}
.ribbon .pr{color:var(--accent-text)}
.ribbon>span{font:600 13.5px/1.5 var(--sans);text-align:end;color:var(--ink2);flex:none}

/* 2 today */
.today h2{margin-bottom:22px}
.path{display:grid;grid-template-columns:1fr 1fr 26px 1.12fr;gap:10px;align-items:stretch}
.node{border-radius:14px;padding:13px 14px;display:flex;gap:11px;align-items:center;min-width:0}
.node.good{background:var(--good-soft)}
.node b{display:block;font:600 15.5px/1.2 var(--sans)}
.node small{display:block;font-size:12.5px;color:var(--muted);margin-top:2px}
.node.bad{background:var(--bad-soft);color:var(--bad)}
.node.bad b{font:400 22px/1.05 var(--serif)}
.arrow{display:grid;place-items:center;font:400 24px/1 var(--sans);color:var(--muted)}
.evid{display:grid;gap:16px 14px;margin-top:18px}
.evid.n1 .shot{height:470px}
.evid.n2 .shot{height:228px}
.evid.n3{grid-template-columns:1fr 1fr}.evid.n3 .ev:first-child{grid-column:1/-1}.evid.n3 .ev:first-child .shot{height:240px}.evid.n3 .shot{height:190px}
.evid.n4{grid-template-columns:1fr 1fr}.evid.n4 .shot{height:188px}
.fit .shot img{height:100%;object-fit:cover;object-position:top}
.ev figcaption{display:flex;gap:10px;align-items:center;margin-top:9px;font:600 14.5px/1.25 var(--sans)}
.leave{margin-top:20px;display:flex;gap:14px;align-items:center;background:var(--bad);color:#fff;border-radius:14px;padding:15px 20px;font:400 25px/1.1 var(--serif)}
.leave .no{background:#fff;color:var(--bad)}

/* 3 cost */
.cost h2{margin-bottom:22px;max-width:600px}
.bigfact{background:var(--accent-soft);border-radius:22px;padding:30px 34px 26px;display:flex;flex-direction:column;justify-content:center;gap:10px;flex:1 1 auto;max-height:350px}
.bigfact b{font:400 128px/.92 var(--serif);white-space:nowrap;letter-spacing:-.03em;color:var(--accent-text)}
.bigfact p{font:500 22px/1.32 var(--sans);max-width:560px;margin-top:8px}
.bigfact small{font-size:11.5px;color:var(--muted);line-height:1.4}
.vs{margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:24px;background:var(--ink);color:#fff;border-radius:22px;padding:22px 28px}
.vs p{font:400 27px/1.18 var(--serif);max-width:400px;flex:1 1 auto;min-width:0}
.vs div{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:none;text-align:end}
.vs span{font:500 10.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.vs div b{font:400 60px/1.15 var(--serif);color:var(--accent-light);white-space:nowrap}
.vs div{max-width:230px;flex:none}
.stats{display:grid;gap:14px;margin-top:14px}
.stats.n2{grid-template-columns:1fr 1fr}
.stat{display:flex;gap:16px;align-items:flex-start;border-radius:18px;padding:18px 20px;background:var(--soft);border:1px solid var(--line)}
.stat b{font:400 46px/1 var(--serif);flex:none;letter-spacing:-.02em}
.stat p{font:600 15px/1.35 var(--sans)}
.stat small{display:block;font:400 11px/1.35 var(--sans);color:var(--muted);margin-top:6px}

/* 4 new page */
.mine h2{margin-bottom:22px}
.annot .shot{position:relative}
.pin{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font:700 14px/1 var(--sans);border:2.5px solid #fff;outline:1.5px solid var(--ink)}
.mrow{display:grid;grid-template-columns:140px 1fr;gap:30px;margin-top:22px;align-items:start}
.legend{display:grid;gap:10px;align-content:start}
.legend div{display:flex;gap:12px;align-items:center;font:500 16.5px/1.25 var(--sans);padding:9px 0;border-bottom:1px solid var(--line)}
.legend i{flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font:700 13px/1 var(--sans);font-style:normal}
.mnote{margin-top:10px;font:400 21px/1.25 var(--serif);color:var(--ink2)}

/* 5 change */
.change h2{margin-bottom:20px}
.ba{display:grid;gap:14px}
.ba .row{display:grid;grid-template-columns:1fr 206px;gap:18px;align-items:center}
.ba .shot{height:232px;overflow:hidden}
.ba .shot img{height:100%;object-fit:cover;object-position:top}
.row.before .browser{border:2.5px solid var(--bad)}
.row.after .browser{border:2.5px solid var(--good)}
.badge{display:inline-block;font:700 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;padding:7px 11px;border-radius:99px;color:#fff;margin-bottom:12px}
.badge.b{background:var(--bad)}.badge.a{background:var(--good)}
.chips{display:flex;flex-direction:column;align-items:flex-start}
.chips div{display:flex;gap:10px;align-items:center;font:600 15px/1.2 var(--sans);margin-top:9px}
.sub{font:500 11.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:26px 0 12px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tile{display:flex;gap:12px;align-items:flex-start;border-radius:16px;padding:15px 14px;background:var(--soft);min-width:0}
.tile .ic{flex:none;width:40px;height:40px;border-radius:12px;background:var(--accent);color:var(--on-accent);display:grid;place-items:center}
.tile svg{width:21px;height:21px}
.tile b{display:block;font:600 15px/1.2 var(--sans)}
.tile p{font-size:12.5px;line-height:1.35;color:var(--muted);margin-top:3px}

/* 6 google */
.google h2{margin-bottom:24px}
.gwrap{display:grid;grid-template-columns:250px 1fr;gap:34px;align-items:center}
.donut{width:250px;height:250px;border-radius:50%;background:conic-gradient(var(--tone) calc(var(--v)*1%),var(--soft) 0);display:grid;place-items:center}
.donut>div{width:192px;height:192px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.donut b{display:block;font:700 76px/.95 var(--sans);letter-spacing:-.04em}
.donut b.nows{font:400 34px/1.02 var(--serif);max-width:150px;letter-spacing:-.01em}
.donut span{font:500 11px/1 var(--mono);color:var(--muted);margin-top:8px;text-transform:uppercase;letter-spacing:.1em}
.gtext{display:flex;flex-direction:column;align-items:flex-start;gap:14px}
.gline{font:400 29px/1.16 var(--serif);letter-spacing:-.01em}
.band{font:600 12.5px/1 var(--sans);padding:8px 12px;border-radius:99px;color:var(--tone);border:1.5px solid var(--tone)}
.gtext small{font-size:12px;color:var(--muted)}
.ticks{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:28px}
.ticks div{display:flex;gap:11px;align-items:center;padding:12px 14px;border-radius:13px;font:500 15px/1.25 var(--sans);min-height:58px}
.ticks .y{background:var(--good-soft)}.ticks .n{background:var(--bad-soft)}
.probs{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.probs div{border-radius:16px;background:var(--bad);color:#fff;padding:18px 18px 20px;font:400 23px/1.12 var(--serif);min-height:150px;display:flex;flex-direction:column;gap:10px}
.probs i{font:700 10.5px/1 var(--mono);font-style:normal;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
.probs div.good{background:var(--good)}

/* 7 offer */
.offer h2{margin-bottom:26px}
.plans{display:grid;gap:12px;align-items:stretch}
.plans.n2{grid-template-columns:1fr 1fr}.plans.n3{grid-template-columns:1.22fr 1fr 1fr}
.plan{border:1.5px solid var(--line);border-radius:20px;padding:22px 20px;display:flex;flex-direction:column;min-width:0;min-height:400px}
.plan h3{font:700 15px/1.2 var(--sans)}
.plan .price{font:400 50px/1 var(--serif);margin:12px 0 4px;letter-spacing:-.02em;white-space:nowrap}
.plan ul{list-style:none;margin:14px 0 0;padding:14px 0 0;display:grid;gap:9px;font-size:14px;border-top:1px solid var(--line)}
.plan.rec ul{border-top-color:rgba(255,255,255,.14)}
.plan li{display:flex;gap:9px;align-items:flex-start;line-height:1.3}
.plan li .ok{width:18px;height:18px;margin-top:-1px}.plan li .ok svg{width:11px;height:11px}
.plan.rec{background:var(--ink);color:#fff;border-color:var(--ink)}
.plan.rec .price{font-size:66px;color:var(--accent-light)}
.plan.rec li .ok{background:var(--accent-light);color:var(--ink)}
.tag{align-self:flex-start;background:var(--accent-soft);color:var(--accent-text);font:700 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;border-radius:99px;padding:7px 10px;margin-bottom:14px;white-space:nowrap}
.plan.rec .tag{background:var(--accent-light);color:var(--ink)}
.plan .foot{margin-top:auto;padding-top:14px;font:600 13px/1.3 var(--sans);color:var(--muted)}
.plan.rec .foot{color:var(--accent-light)}
.extras{display:flex;gap:10px;margin-top:14px}
.extras div{display:flex;gap:10px;align-items:center;background:var(--soft);border-radius:13px;padding:12px 15px;font:500 13.5px/1.35 var(--sans)}
.extras div:first-child{flex:1}
.extras b{font-weight:700;white-space:nowrap;display:inline-flex}
.extras svg{width:18px;height:18px}
.trust3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}
.trust3 div{display:flex;gap:10px;align-items:center;border:1.5px solid var(--line);border-radius:13px;padding:12px 14px;font:600 13.5px/1.25 var(--sans)}
.trust3 .ok{width:22px;height:22px}.trust3 .ok svg{width:13px;height:13px}
.sign{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 4px 18px;font:500 12px/1.5 var(--mono);color:var(--muted);text-align:end}
.sign .ag.big{font-size:19px}.sign .ag.big img{height:30px;max-width:200px}
.cta{display:flex;justify-content:space-between;align-items:center;gap:24px;background:var(--accent);color:var(--on-accent);border-radius:20px;padding:22px 28px}
.cta b{font:400 32px/1.05 var(--serif);letter-spacing:-.01em;flex:1 1 auto}
.cta span{font:500 13.5px/1.5 var(--sans);text-align:end;flex:0 1 auto;max-width:330px;overflow-wrap:anywhere}
.cta strong{font-weight:700;font-size:17px}
</style></head><body>
${cover}
${today}
${cost}
${mine}
${change}
${google}
${offerPage}
<script>
(async () => {
  // Persian/Arabic text inside a left-to-right document: no letter-spacing, and not in the Latin-only mono face.
  const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/, walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (RTL.test(n.data) && n.parentElement) {
    const el = n.parentElement; el.classList.add('ar');
    if (getComputedStyle(el).fontFamily.includes('L2P Mono')) el.classList.add('ar-sans');
  }
  await document.fonts.ready;
  await Promise.all([...document.images].map(i => i.decode ? i.decode().catch(() => {}) : 0));
  // Screenshots wider than their frame are shown whole (never cut at the sides): the frame gets shorter instead.
  document.querySelectorAll('.fit .shot img, .ba .shot img').forEach(im => {
    const box = im.parentElement.getBoundingClientRect();
    if (im.naturalWidth && im.naturalWidth / im.naturalHeight > (box.width / box.height) * 1.02) {
      im.parentElement.style.height = (box.width * im.naturalHeight / im.naturalWidth) + 'px';   // shorter frame, whole picture
    }
  });
  // Big numbers and prices: shrink until they fit their box.
  document.querySelectorAll('[data-fit]').forEach(el => {
    const p = el.parentElement, cs = getComputedStyle(p);
    const avail = () => p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let px = parseFloat(getComputedStyle(el).fontSize);
    while ((el.scrollWidth > avail() + 1 || el.scrollWidth > el.clientWidth + 1) && px > 14) { px -= 2; el.style.fontSize = px + 'px'; }
  });
  // Page 7: the signature line is the first thing to go when long plans need the room.
  const offerPg = document.querySelector('.offer'), sign = document.querySelector('.offer .sign');
  if (offerPg && sign && offerPg.querySelector('.cta').getBoundingClientRect().bottom > offerPg.querySelector('.pf').getBoundingClientRect().top - 6) sign.style.display = 'none';
  // Page 2: give leftover height to the evidence rows (never taller than the picture itself, so nothing is cut at the sides).
  const today = document.querySelector('.today');
  if (today) {
    const free = today.querySelector('.pf').getBoundingClientRect().top - 28 - today.querySelector('.leave').getBoundingClientRect().bottom;
    const shots = [...today.querySelectorAll('.ev .shot')].filter(s => !s.style.height);
    const tops = shots.map(s => Math.round(s.getBoundingClientRect().top));
    const rows = [...new Set(tops)].map(t => shots.filter((s, i) => tops[i] === t));
    if (free > 4) for (const row of rows) {
      const cap = Math.min(...row.map(s => { const im = s.querySelector('img'), w = s.getBoundingClientRect().width;
        return im && im.naturalWidth ? w * im.naturalHeight / im.naturalWidth : 0; }));
      row.forEach(s => { const h = s.getBoundingClientRect().height; s.style.height = Math.max(h, Math.min(h + free / rows.length, cap)) + 'px'; });
    }
  }
  // Cover headline: shrink until it clears the device mock-ups.
  const h = document.querySelector('.cover .headline'), sub = document.querySelector('.cover .csub'), dv = document.querySelector('.cover .devices');
  if (h && dv) {
    const last = () => (sub || h).getBoundingClientRect().bottom;
    let px = 62;
    while (last() > dv.getBoundingClientRect().top - 22 && px > 34) { px -= 2; h.style.fontSize = px + 'px'; }
  }
  document.body.dataset.fit = '1';
})();
</script>
</body></html>`;
}

// ---- CLI ----
function argVal(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

export function loadJob(pkgDir, projectDir) {
  const jf = path.join(pkgDir, 'job.json');
  let job = fs.existsSync(jf) ? readJSON(jf) : {};
  const proj = projectDir || job.paths?.project;
  if (proj && fs.existsSync(path.join(proj, 'project.json')) && (!job.agency || !job.offer || !job.market)) {
    const defaults = readJSON(path.join(PLUGIN, 'config', 'defaults.json'));
    const cfg = merge(defaults, readJSON(path.join(proj, 'project.json')));
    job = { agency: cfg.agency, market: cfg.market, offer: cfg.offer, strings: cfg.proposals?.strings, ...job };
  }
  return job;
}

export function buildPackage(pkgDir, { projectDir } = {}) {
  pkgDir = path.resolve(pkgDir);
  const data = readJSON(path.join(pkgDir, 'proposal-data.json'));
  const job = loadJob(pkgDir, projectDir);
  const html = renderProposal({ data, job, pkgDir, projectDir: projectDir || job.paths?.project || '' });
  const out = path.join(pkgDir, 'proposal', 'proposal.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2);
  const pkg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--project');
  if (!pkg) { console.error('Usage: node templates/proposal/proposal.mjs <packageDir> [--project <dir>]'); process.exit(2); }
  try { console.log('wrote', buildPackage(pkg, { projectDir: argVal(argv, '--project') })); }
  catch (e) { console.error('proposal.mjs:', e.message); process.exit(1); }
}
