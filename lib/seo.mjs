// SEO score from the crawled HTML: 8 categories, weighted to 100. Checks that need a rendered page
// (real speed, touch targets, contrast) are not guessed: measured_pct says how much was scored.
// Every finding has a plain-English version for the business owner and a technical one.
import { jsonLd, typeOf, clean, attr } from './http.mjs';

export const CATEGORIES = [
  ['crawl', 'Can Google find and read the site', 20], ['meta', 'Page titles and descriptions', 20], ['headings', 'Headlines', 10],
  ['images', 'Photos', 10], ['perf', 'Speed signals', 10], ['schema', 'Business details for Google', 10],
  ['links', 'Links between pages', 10], ['mobile', 'Phones and accessibility', 10],
];
export const band = s => s == null ? '' : s >= 90 ? 'Excellent' : s >= 70 ? 'Good' : s >= 50 ? 'Needs significant work' : 'Critical';

// True only if the * (or Googlebot) group disallows "/" without re-allowing the homepage.
function blocksAll(txt) {
  const groups = []; let cur = null, lastAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const m = raw.replace(/#.*/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastAgent) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(v.toLowerCase()); lastAgent = true; continue; }
    lastAgent = false;
    if (cur && (k === 'disallow' || k === 'allow')) cur.rules.push([k, v]);
  }
  const g = groups.find(x => x.agents.includes('googlebot')) || groups.find(x => x.agents.includes('*'));
  return !!g && g.rules.some(([k, v]) => k === 'disallow' && v === '/') && !g.rules.some(([k, v]) => k === 'allow' && (v === '/' || v === '/$'));
}
const BIZ_TYPE = /LocalBusiness|Organization|Store|Restaurant|Dentist|Physician|LegalService|Attorney|MedicalBusiness|HealthAndBeautyBusiness|BeautySalon|HairSalon|NailSalon|DaySpa|ProfessionalService|AutoRepair|AutomotiveBusiness|RealEstateAgent|FinancialService|InsuranceAgency|AccountingService|HomeAndConstructionBusiness|FoodEstablishment|Bakery|CafeOrCoffeeShop|BarOrPub|MedicalClinic|Optician|Pharmacy|Notary|Plumber|Electrician|HVACBusiness|GeneralContractor|RoofingContractor|HousePainter|Locksmith|MovingCompany|LodgingBusiness|ChildCare|EmploymentAgency|Florist|Store|TravelAgency|EducationalOrganization|SportsActivityLocation|EntertainmentBusiness|ExerciseGym|PetStore|VeterinaryCare|CleaningService|Landscaping|PestControl/;

export function seoAudit(c) {
  const homePage = c.pages?.find(p => p.kind === 'home');
  if (!homePage?.body || !['ok', 'redirect_offsite'].includes(c.state)) return null;
  const h = homePage.body, final = c.final_url || c.url;
  const head = (h.match(/<head\b[\s\S]*?<\/head>/i) || [h.slice(0, 30000)])[0];
  const text = clean(h.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' '));
  const shell = text.length < 300 && /id=["'](root|app|__next|__nuxt)["']|<app-root/i.test(h);
  const others = c.pages.filter(p => p !== homePage);
  const checks = [], cat = {};
  // check(id, category, points, result, plain, technical, severity 1-3, partial points when not ok)
  const check = (id, k, pts, ok, plain, technical, sev = 2, partial = 0) => {
    const got = ok ? pts : Math.max(0, Math.min(pts, partial || 0));
    (cat[k] ||= { got: 0, max: 0 }); cat[k].got += got; cat[k].max += pts;
    checks.push({ id, cat: k, points: pts, got, ok: !!ok, severity: ok ? 0 : sev, plain: ok ? '' : plain, technical: ok ? '' : technical });
  };
  const meta = name => { const m = head.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i')); return m ? attr(m[0], 'content') : null; };

  // 1. Crawlability & indexation
  const rob = c.robots;
  check('robots_txt', 'crawl', 3, !!rob, 'Missing the small file that tells Google how to read the site', 'No robots.txt', 1);
  check('robots_block', 'crawl', 5, !(rob && blocksAll(rob)), 'The site tells Google not to look at it at all', 'robots.txt disallows / for all agents', 3);
  check('sitemap', 'crawl', 4, !!c.sitemap?.ok && c.sitemap.locs > 0, 'No page list (sitemap) to help Google find every page', 'No XML sitemap', 2);
  const noindex = /noindex/i.test(meta('robots') || '') || /noindex/i.test(c.home?.headers?.['x-robots-tag'] || '');
  check('noindex', 'crawl', 5, !noindex, 'The homepage is hidden from Google search', 'Homepage has noindex', 3);
  const canon = attr((head.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [''])[0], 'href');
  let canonOk = false;
  if (canon) { try { const a = new URL(canon, final), b = new URL(final); canonOk = a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '') && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, ''); } catch { canonOk = false; } }
  check('canonical', 'crawl', 3, canonOk, canon ? 'The homepage points Google to a different address' : 'Google is not told which address is the main one',
    canon ? 'Canonical points to a different URL' : 'No canonical URL', canon ? 2 : 1, canon ? 0 : 1);

  // 2. Meta tags & head
  const title = clean((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  check('title', 'meta', 4, !!title, 'The page has no title in Google results', 'Missing <title>', 3);
  check('title_length', 'meta', 2, title.length >= 30 && title.length <= 65, title ? `The page title is ${title.length < 30 ? 'too short' : 'too long'} for Google results` : 'The page has no title in Google results',
    `Title is ${title.length} characters (aim for 30-65)`, 1, title.length >= 15 && title.length <= 80 ? 1 : 0);
  const generic = /^(home|homepage|start|startseite|accueil|inicio|welcome|willkommen|bienvenue|benvenuti|untitled|index|my site|new page|just another wordpress site)$/i.test(title);
  const repeated = !!title && others.some(p => clean((p.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') === title);
  check('title_unique', 'meta', 2, !!title && !generic && !repeated, 'Page titles are generic or the same on every page', 'Title is generic or duplicated across pages', 2);
  const desc = meta('description');
  check('description', 'meta', 4, !!desc, 'No short description under the name in Google results', 'Missing meta description', 2);
  check('description_length', 'meta', 2, !!desc && desc.length >= 70 && desc.length <= 165, desc ? 'The Google description is too short or gets cut off' : 'No short description under the name in Google results',
    `Meta description is ${desc ? desc.length : 0} characters (aim for 70-165)`, 1, desc && desc.length >= 40 && desc.length <= 220 ? 1 : 0);
  const og = ['og:title', 'og:description', 'og:image', 'og:url'].filter(t => meta(t) != null).length;
  check('open_graph', 'meta', 4, og === 4, 'Links shared on WhatsApp or Facebook show no picture or summary', og ? `Open Graph incomplete (${og}/4 tags)` : 'No Open Graph tags', 1, og);
  check('twitter_card', 'meta', 2, meta('twitter:card') != null, 'Links shared on X/Twitter show no preview card', 'No Twitter Card tags', 1);

  // 3. Headings (not measurable on a JavaScript-only shell)
  if (!shell) {
    const hs = [...h.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => ({ l: +m[1], t: clean(m[2]) }));
    const h1 = hs.filter(x => x.l === 1);
    check('h1', 'headings', 4, h1.length === 1, h1.length ? 'The page has several main headlines, which confuses Google' : 'The page has no main headline saying what the business does',
      h1.length ? `${h1.length} <h1> headings` : 'No <h1>', h1.length ? 1 : 2, h1.length > 1 ? 2 : 0);
    let skip = false; for (let i = 1; i < hs.length; i++) if (hs[i].l > hs[i - 1].l + 1) skip = true;
    check('heading_order', 'headings', 2, !skip && hs.length > 0, 'Headlines are out of order, so the page is harder to follow', 'Heading levels skip (e.g. h1 to h3)', 1);
    check('heading_empty', 'headings', 2, !hs.some(x => !x.t), 'Some headlines are empty', 'Empty heading tags', 1);
    const tw = new Set(title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3));
    check('h1_title_match', 'headings', 2, h1.length > 0 && h1[0].t.toLowerCase().split(/[^\p{L}\p{N}]+/u).some(w => tw.has(w)),
      'The main headline and the page title talk about different things', 'H1 and <title> share no keyword', 1);
  }

  // 4. Images
  const imgs = shell ? [] : (h.match(/<img\b[^>]*>/gi) || []);
  if (imgs.length) {
    const withAlt = imgs.filter(t => attr(t, 'alt').trim());
    const share = withAlt.length / imgs.length;
    check('img_alt', 'images', 4, share >= 0.9, `${imgs.length - withAlt.length} of ${imgs.length} photos have no description for Google and screen readers`,
      `${imgs.length - withAlt.length}/${imgs.length} images missing alt text`, 2, Math.round(share * 3));
    const fileAlt = withAlt.filter(t => /\.(jpe?g|png|webp|gif)$|^(image|img|photo|picture|bild|foto|immagine)\s*\d*$/i.test(attr(t, 'alt').trim())).length;
    check('img_alt_quality', 'images', 2, fileAlt === 0, 'Some photo descriptions are just file names', `${fileAlt} images use file names as alt text`, 1);
    const modern = imgs.filter(t => /\.(webp|avif)|format=(webp|avif)|_next\/image|wixstatic|imgix|cloudinary|squarespace-cdn|shopify\.com\/s\/files/i.test(t)).length + (h.match(/<source[^>]+type=["']image\/(webp|avif)/gi) || []).length;
    check('img_format', 'images', 2, modern / imgs.length >= 0.5, 'Photos use older, heavier file types that load slowly on phones', 'Images not in WebP/AVIF', 1);
    const sized = imgs.filter(t => /\swidth=/i.test(t) && /\sheight=/i.test(t)).length;
    check('img_dimensions', 'images', 2, sized / imgs.length >= 0.7, 'The page jumps around while photos load', 'Images lack width/height (layout shift)', 1);
  }

  // 5. Performance signals (from the HTML; real load speed is not measured)
  const blocking = (head.match(/<script\b(?![^>]*\b(async|defer|type=["']module["']))[^>]*\bsrc=/gi) || []).length + (head.match(/<link[^>]+rel=["']?stylesheet/gi) || []).length;
  check('render_blocking', 'perf', 3, blocking <= 4, 'Many files must load before anything shows, so the page feels slow',
    `${blocking} render-blocking scripts/stylesheets in <head>`, blocking > 15 ? 2 : 1, blocking <= 8 ? 2 : blocking <= 15 ? 1 : 0);
  check('lazy_images', 'perf', 2, imgs.length <= 3 || /loading=["']?lazy|data-src=|lazyload/i.test(h), 'All photos load at once instead of as you scroll', 'Images not lazy-loaded', 1);
  const scripts = (h.match(/<script\b[^>]*\bsrc=/gi) || []).length;
  check('script_count', 'perf', 2, scripts <= 12, `The page loads ${scripts} separate scripts`, `${scripts} external scripts`, 1, scripts <= 25 ? 1 : 0);
  if (c.home?.headers) check('compression', 'perf', 1, !!c.home.headers['content-encoding'], 'The server sends the page uncompressed', 'No gzip/brotli content-encoding', 1);
  const kb = (c.home?.bytes || h.length) / 1024;
  check('html_size', 'perf', 2, kb <= 200, `The page itself is heavy (${Math.round(kb)} KB before photos)`, `Homepage HTML is ${Math.round(kb)} KB`, 1, kb <= 500 ? 1 : 0);

  // 6. Structured data
  const ld = c.pages.flatMap(p => p.kind === 'home' || p.kind === 'contact' ? jsonLd(p.body) : []);
  check('jsonld', 'schema', 4, ld.length > 0, 'Google sees no business details (hours, address, phone) built into the page', 'No structured data (JSON-LD)', 2);
  const biz = ld.find(n => BIZ_TYPE.test(typeOf(n)));
  check('jsonld_business', 'schema', 3, !!biz, 'Google is not told what kind of business this is', 'No LocalBusiness/Organization schema', 2, ld.some(n => /WebSite|WebPage/.test(typeOf(n))) ? 1 : 0);
  const req = biz ? ['name', 'address', 'telephone', 'url'].filter(k => biz[k]).length : 0;
  check('jsonld_nap', 'schema', 2, req === 4, 'Name, address and phone are not all given to Google in a form it can read',
    `Business schema has ${req}/4 of name, address, telephone, url`, 1, req >= 2 ? 1 : 0);
  check('jsonld_extra', 'schema', 1, !!(biz && (biz.openingHours || biz.openingHoursSpecification || biz.geo || biz.sameAs)), 'Opening hours and map location are not given to Google', 'Business schema has no openingHours, geo or sameAs', 1);

  // 7. Internal linking
  if (!shell) {
    const internal = c.internal_links || [];
    const uniq = new Set(internal.map(l => l.href));
    check('internal_links', 'links', 3, uniq.size >= 5, `The homepage links to only ${uniq.size} other page${uniq.size === 1 ? '' : 's'}`, `${uniq.size} unique internal links on the homepage`, 2, uniq.size >= 2 ? 1 : 0);
    const all = (h.match(/<a\b[^>]*href=/gi) || []).length;
    check('link_count', 'links', 1, all <= 150, 'The homepage is crowded with links', `${all} links on the homepage`, 1);
    const checked = c.links_checked || [];
    if (checked.length) {
      const bad = checked.filter(x => !x.ok).length;
      check('broken_links', 'links', 4, bad === 0, `${bad} of ${checked.length} links we tried lead to an error page`, `${bad}/${checked.length} sampled internal links broken`, 3, bad === 1 && checked.length > 1 ? 2 : 0);
    }
    const generic = internal.filter(l => /^(click here|here|more|read more|learn more|mehr|weiter|hier|en savoir plus|ici|leggi|qui|lees meer|klik hier|más|leer más)$/i.test(l.text)).length;
    if (internal.length) check('anchor_text', 'links', 2, generic / internal.length < 0.3, 'Many links just say "click here" instead of where they go', 'Generic anchor text', 1);
  }

  // 8. Mobile & accessibility (touch targets, font sizes and contrast need a rendered page)
  const vp = (head.match(/<meta[^>]+name=["']?viewport["']?[^>]*>/i) || [''])[0];
  check('viewport', 'mobile', 5, !!vp, 'The site is not built for phones: visitors have to pinch and zoom', 'No viewport meta tag', 3);
  check('html_lang', 'mobile', 1, /<html\b[^>]*\blang=["']?[a-z]/i.test(h), 'The page does not say which language it is in', 'No lang attribute on <html>', 1);
  check('zoom', 'mobile', 1, !vp || !/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp), 'Visitors cannot zoom in on phones', 'Viewport disables zoom', 1);
  const css = [h, ...(c.stylesheets || []).map(s => s.body)].join('\n');
  check('responsive', 'mobile', 2, /@media[^{]*(max|min)-width|\bcol-(xs|sm|md)-|\b(sm|md|lg):|srcset=/i.test(css), 'The layout does not adapt to phone screens', 'No responsive CSS detected', 1);
  const inputs = h.match(/<input\b(?![^>]*type=["']?(hidden|submit|button))[^>]*>/gi) || [];
  if (inputs.length) {
    const labelled = inputs.filter(t => /aria-label|placeholder|\sid=/i.test(t)).length;
    check('form_labels', 'mobile', 1, labelled === inputs.length, 'Some form fields have no label', 'Form inputs without labels', 1);
  }

  // Each category scores got/max; the total is weighted over the categories we could measure.
  let wsum = 0, wmax = 0;
  const categories = {};
  for (const [k, , w] of CATEGORIES) {
    const s = cat[k];
    if (!s?.max) { categories[k] = null; continue; }
    categories[k] = Math.round(100 * s.got / s.max);
    wsum += w * s.got / s.max; wmax += w;
  }
  const score = wmax ? Math.round(100 * wsum / wmax) : null;
  const failed = checks.filter(x => !x.ok && x.plain).sort((a, b) => b.severity - a.severity || b.points - a.points);
  return {
    score, band: band(score) + (shell ? ' (partial: JavaScript-only page)' : ''), measured_pct: wmax,
    categories, issues: failed.map(x => x.plain), technical: failed.map(x => x.technical),
    checks,
  };
}
