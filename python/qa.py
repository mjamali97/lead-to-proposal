#!/usr/bin/env python3
"""Quality gate for one proposal package. Prints `QA PASSED: <name>` (exit 0) or `QA FAILED` and the list
of problems (exit 1). A package with skip.json prints `SKIPPED: <reason>` (exit 3).

  qa.py <packageDir> [--json]

Checks: required files; proposal-data.json against templates/proposal/schema.json and limits.json; the
render's layout report; every image exists; markers inside the picture, apart, and not on text; plain
words in sales copy; statistics only from facts/ with matching source lines; prices equal to the offer
in job.json; business name and phone consistent with job.json; no other business's name; landing-page
basics (one h1, title, description, Open Graph, JSON-LD, viewport, alt text, self-contained).
"""
import json, math, pathlib, re, sys
from html.parser import HTMLParser

HERE = pathlib.Path(__file__).resolve().parent
PLUGIN = HERE.parent
TEMPLATE = PLUGIN / 'templates' / 'proposal'
FACTS = PLUGIN / 'facts'
PAGES = 7
FRAME_W = 682                     # narrowest printed width of the page-4 screenshot (A4), px
FRAME_H = FRAME_W * 900 / 1440    # the desktop fold is 1440x900
PIN_R = 15                        # printed marker radius, px
BUSY = 0.18                       # marker_busy above this = the marker covers text, a face or a photo detail

JARGON = re.compile(r'\b(H1|H2|alt[ -]?text|alt tags?|schema|structured data|JSON-?LD|meta (?:tags?|descriptions?|titles?)|metadata|'
                    r'viewport|crawl\w*|index(?:ation|ing|ed)|canonical|render[- ]blocking|sitemap|robots\.txt|SSL|LCP|CLS|INP|'
                    r'core web vitals|above the fold|CTA|UX|UI|responsive|backlinks?|SERP|bounce rate)\b', re.I)
FORMULA = re.compile(r'\b(clients|customers|patients|people)\s+(love|rate|trust)\s+you\b.*\bwebsite\b.*\b(hides?|should|doesn.t)', re.I)
PLACEHOLDER = re.compile(r'lorem ipsum|\bTODO\b|\bTBD\b|\[your |\{\{|xxx-xxx|placeholder text', re.I)
MONEY = re.compile(r'(?:US\$|CA\$|A\$|NZ\$|[$€£¥₹]|CHF\s?|kr\s?)\s?\d[\d,.  ]*|\d[\d,.  ]*\s?(?:€|kr|zł|CHF|Kč|lei)')
PERCENT = re.compile(r'\d+(?:[.,]\d+)?\s?%')
SKIP_REASONS = {'permanently closed', 'not a local business', 'wrong listing'}


def load(p, default=None):
    p = pathlib.Path(p)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding='utf-8'))


def safe_name(s):
    s = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', ' ', str(s or ''))
    return re.sub(r'\s+', ' ', s).strip()[:80] or 'Business'


def digits(s):
    return re.sub(r'\D', '', str(s or ''))


def pdf_pages(path):
    """Page count without a PDF library (Chromium and Pillow write plain page objects)."""
    data = pathlib.Path(path).read_bytes()
    n = len(re.findall(rb'/Type\s*/Page(?![a-zA-Z])', data))
    if n:
        return n
    counts = [int(x) for x in re.findall(rb'/Type\s*/Pages\b[^>]*?/Count\s+(\d+)', data, re.S)]
    return max(counts) if counts else 0


# ---- limits.json ----
def resolve(node, parts, label=''):
    if not parts:
        yield label, node
        return
    tok = parts[0]
    arr = tok.endswith('[]')
    key = tok[:-2] if arr else tok
    if not isinstance(node, dict) or key not in node:
        return
    v = node[key]
    lab = f'{label}.{key}' if label else key
    if arr:
        if isinstance(v, list):
            for i, x in enumerate(v):
                yield from resolve(x, parts[1:], f'{lab}[{i}]')
    else:
        yield from resolve(v, parts[1:], lab)


def check_limits(data, job=None, limits=None):
    limits = limits or load(TEMPLATE / 'limits.json')
    job = job or {}
    ctx = dict(data, agency=job.get('agency') or {}, offer=job.get('offer') or {})
    out = []
    for path, mx in limits['chars'].items():
        for label, v in resolve(ctx, path.split('.')):
            if isinstance(v, str) and len(v) > mx:
                out.append(f'{label} is {len(v)} characters, max {mx}: "{v[:50]}…"')
    for path, (lo, hi) in limits['counts'].items():
        for label, v in resolve(ctx, path.split('.')):
            if isinstance(v, list) and not lo <= len(v) <= hi:
                out.append(f'{label} has {len(v)} items, needs {lo}' + (f'-{hi}' if hi != lo else ''))
    return out


# ---- schema.json (the subset of JSON Schema it uses) ----
TYPES = {'string': str, 'object': dict, 'array': list, 'boolean': bool, 'null': type(None)}


def _is(v, t):
    if t == 'integer':
        return isinstance(v, int) and not isinstance(v, bool)
    if t == 'number':
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    return isinstance(v, TYPES[t])


def validate(v, s, root, path='$'):
    if '$ref' in s:
        node = root
        for part in s['$ref'].lstrip('#/').split('/'):
            node = node[part]
        return validate(v, node, root, path)
    errs = []
    if 'anyOf' in s:
        if all(validate(v, sub, root, path) for sub in s['anyOf']):
            errs.append(f'{path}: does not match any allowed shape')
        return errs
    t = s.get('type')
    if t and not any(_is(v, x) for x in (t if isinstance(t, list) else [t])):
        return [f'{path}: should be {t}, got {type(v).__name__}']
    if 'enum' in s and v not in s['enum']:
        errs.append(f'{path}: "{v}" is not one of {s["enum"]}')
    if isinstance(v, str):
        if len(v) < s.get('minLength', 0):
            errs.append(f'{path}: too short')
        if 'pattern' in s and not re.search(s['pattern'], v):
            errs.append(f'{path}: "{v}" has the wrong format')
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if 'minimum' in s and v < s['minimum'] or 'maximum' in s and v > s['maximum']:
            errs.append(f'{path}: {v} out of range')
    if isinstance(v, dict):
        for k in s.get('required', []):
            if k not in v:
                errs.append(f'{path}.{k}: missing')
        props = s.get('properties', {})
        for k, x in v.items():
            if k in props:
                errs += validate(x, props[k], root, f'{path}.{k}')
            elif s.get('additionalProperties') is False:
                errs.append(f'{path}.{k}: unknown field')
    if isinstance(v, list) and 'items' in s:
        for i, x in enumerate(v):
            errs += validate(x, s['items'], root, f'{path}[{i}]')
    return errs


# ---- facts ----
def fact_index():
    web = load(FACTS / 'web-facts.json', {'facts': []})
    ads = load(FACTS / 'ads-benchmarks.json', {'industries': {}, 'sources': []})
    return {f['id']: f for f in web.get('facts', [])}, ads


def _nums(s):
    return [float(x.replace(',', '')) for x in re.findall(r'\d[\d,]*(?:\.\d+)?', str(s or ''))]


def check_fact(f, label, web, ads, job):
    out = []
    fid = f.get('fact_id', '')
    if fid.startswith('ads:'):
        key = fid[4:]
        ind = ads.get('industries', {}).get(key)
        if not ind:
            return [f'{label}: unknown ads benchmark "{key}" (keys: {", ".join(ads.get("industries", {}))})']
        allowed = [ind.get(k) for k in ('cpl_usd', 'cpc_usd', 'conversion_rate_pct', 'ctr_pct') if isinstance(ind.get(k), (int, float))]
        for n in _nums(f.get('number')):
            if not any(abs(n - a) <= 1 for a in allowed):
                out.append(f'{label}: number {f.get("number")} does not match the {key} benchmark ({", ".join(map(str, allowed))})')
        if not re.search(r'wordstream|localiq', f.get('source', ''), re.I):
            out.append(f'{label}: source must name WordStream by LocaliQ')
        want = ((job.get('facts') or {}).get('ad_cost') or {}).get('fact_id')
        rep = load(pathlib.Path(job.get('_dir', '.')) / 'agent-report.json', {}) or {}
        if want and fid != want and not rep.get('industry_note'):
            out.append(f'{label}: uses {fid} but the job\'s category maps to {want}. If the job is mis-categorised, '
                       'explain it in agent-report.json "industry_note"; otherwise use the job\'s benchmark')
        return out
    fact = web.get(fid)
    if not fact:
        return [f'{label}: fact_id "{fid}" is not in facts/web-facts.json (only cited facts may be used)']
    if not fact.get('verified', False):
        out.append(f'{label}: fact "{fid}" is not verified')
    pool = ' '.join(str(fact.get(k, '')) for k in ('number', 'quote', 'claim'))
    have = _nums(pool)
    for n in _nums(f.get('number')):
        if not any(abs(n - h) < 0.51 for h in have):
            out.append(f'{label}: number {f.get("number")} is not in fact "{fid}"')
    pub = re.sub(r'[^\w ]', ' ', fact.get('source', {}).get('publisher', '')).split()
    if pub and pub[0].lower() not in f.get('source', '').lower():
        out.append(f'{label}: source should name "{fact["source"]["publisher"]}"')
    return out


# ---- landing page ----
class Landing(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.h1 = self.title = self.desc = self.viewport = self.og = 0
        self.jsonld, self.imgs, self.iframes, self.ext, self.tels, self.srcs = [], [], 0, [], [], []
        self._ld = False
        self._buf = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'h1':
            self.h1 += 1
        elif tag == 'title':
            self.title += 1
        elif tag == 'meta':
            n, p = (a.get('name') or '').lower(), (a.get('property') or '').lower()
            self.desc += n == 'description' and bool(a.get('content'))
            self.viewport += n == 'viewport'
            self.og += p == 'og:title'
        elif tag == 'script':
            if (a.get('type') or '').lower() == 'application/ld+json':
                self._ld, self._buf = True, []
            elif re.match(r'(https?:)?//', a.get('src') or ''):
                self.ext.append(a['src'])
        elif tag == 'link' and 'stylesheet' in (a.get('rel') or '') and re.match(r'(https?:)?//', a.get('href') or ''):
            if not re.match(r'(https?:)?//fonts\.(googleapis|gstatic)\.com', a['href']):
                self.ext.append(a['href'])
        elif tag == 'img':
            self.imgs.append(a)
            self.srcs.append(a.get('src') or '')
        elif tag == 'iframe':
            self.iframes += 1
        elif tag == 'a' and (a.get('href') or '').startswith('tel:'):
            self.tels.append(a['href'])

    def handle_endtag(self, tag):
        if tag == 'script' and self._ld:
            self.jsonld.append(''.join(self._buf))
            self._ld = False

    def handle_data(self, data):
        if self._ld:
            self._buf.append(data)
        else:
            self.text.append(data)


def check_landing(d, name, phone, problems):
    f = d / 'landing-page' / 'index.html'
    if not f.exists():
        return ''
    src = f.read_text(encoding='utf-8', errors='ignore')
    p = Landing()
    p.feed(src)
    need = lambda c, m: c or problems.append('landing page: ' + m)
    need(p.h1 == 1, f'needs exactly one <h1> (found {p.h1})')
    need(p.title == 1, 'needs one <title>')
    need(p.desc == 1, 'needs one meta description')
    need(p.viewport == 1, 'needs a viewport meta tag (for phones)')
    need(p.og >= 1, 'needs Open Graph tags (og:title, og:description, og:image)')
    need(len(p.jsonld) >= 1, 'needs JSON-LD with the business details')
    for block in p.jsonld:
        try:
            ld = json.loads(block)
            need(name.lower() in json.dumps(ld, ensure_ascii=False).lower(), 'JSON-LD does not contain the business name')
        except Exception as e:
            problems.append(f'landing page: JSON-LD is not valid JSON ({str(e)[:60]})')
    no_alt = [i.get('src', '?') for i in p.imgs if 'alt' not in i or (not i['alt'].strip() and i.get('aria-hidden') != 'true' and i.get('role') != 'presentation')]
    need(not no_alt, f'images without alt text: {", ".join(no_alt[:4])}')
    need(p.iframes == 0, 'has an <iframe> (use a static map image with a link instead: iframes do not print)')
    need(not p.ext, f'must be self-contained (only Google Fonts may load from outside): {", ".join(p.ext[:3])}')
    for s in p.srcs:
        if s and not re.match(r'(https?:|data:)', s) and not (f.parent / s.split('?')[0]).exists():
            problems.append(f'landing page: image file missing: {s}')
    text = ' '.join(p.text)
    need(not PLACEHOLDER.search(src), 'placeholder or filler text left in the page')
    if phone:
        tel_ok = any(digits(t)[-9:] == digits(phone)[-9:] for t in p.tels)
        need(tel_ok, f'needs a tap-to-call link (tel:) with the business phone {phone}')
    return src + ' ' + text


# ---- markers ----
def marker_busy(img, x, y):
    """How busy the picture is under a marker (0 = plain background). Letters, faces, buttons and photos
    give a high spread of brightness; empty background gives almost none."""
    from PIL import Image, ImageDraw, ImageStat
    w, h = img.size
    r = PIN_R / FRAME_W * w
    box = (int(x / 100 * w - r), int(y / 100 * h - r), int(x / 100 * w + r), int(y / 100 * h + r))
    crop = img.crop(box).convert('L')
    mask = Image.new('L', crop.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, crop.size[0] - 1, crop.size[1] - 1), fill=255)
    return ImageStat.Stat(crop, mask).stddev[0] / 100


def check_markers(d, data, problems):
    ms = (data.get('sales') or {}).get('markers') or []
    for i, m in enumerate(ms, 1):
        x, y = m.get('x', -1), m.get('y', -1)
        if not (100 * PIN_R / FRAME_W <= x <= 100 - 100 * PIN_R / FRAME_W and 100 * PIN_R / FRAME_H <= y <= 100 - 100 * PIN_R / FRAME_H):
            problems.append(f'marker {i} at ({x}, {y}) is partly outside the screenshot')
    for i in range(len(ms)):
        for j in range(i + 1, len(ms)):
            dx = (ms[i]['x'] - ms[j]['x']) / 100 * FRAME_W
            dy = (ms[i]['y'] - ms[j]['y']) / 100 * FRAME_H
            if math.hypot(dx, dy) < 2 * PIN_R + 4:
                problems.append(f'markers {i + 1} and {j + 1} overlap (move them apart: python/markers.py --preview)')
    shot = d / ((data.get('landing') or {}).get('desktop') or '')
    if ms and shot.is_file():
        from PIL import Image
        img = Image.open(shot)
        for i, m in enumerate(ms, 1):
            b = marker_busy(img, m['x'], m['y'])
            if b > BUSY:
                problems.append(f'marker {i} sits on text or a busy area ({b:.2f}); put it on plain background beside the element')


# ---- main check ----
def walk(x, path='sales'):
    if isinstance(x, dict):
        for k, v in x.items():
            yield from walk(v, f'{path}.{k}')
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from walk(v, f'{path}[{i}]')
    elif isinstance(x, str):
        yield path, x


def check(d):
    d = pathlib.Path(d).resolve()
    problems = []
    need = lambda c, m: c or problems.append(m)
    job = load(d / 'job.json')
    data = load(d / 'proposal-data.json')
    need(job is not None, 'job.json missing')
    need(data is not None, 'proposal-data.json missing')
    if data is None:
        return problems, ''
    job = job or {}
    job['_dir'] = str(d)
    errs = validate(data, load(TEMPLATE / 'schema.json'), load(TEMPLATE / 'schema.json'))
    problems += [f'proposal-data.json {e}' for e in errs[:20]]
    if errs:
        return problems, (data.get('business') or {}).get('name', '')
    problems += check_limits(data, job)
    B, S, L, seo = data['business'], data['sales'], data['landing'], data['seo']
    name = B['name']
    fname = safe_name(name)

    # files
    for rel in ['landing-page/index.html', 'landing-page/content.json', 'landing-page/README.md']:
        need((d / rel).exists(), f'missing file: {rel}')
    for rel in ['proposal/proposal.html', 'proposal/layout-report.json', f'{fname} - Proposal.pdf', f'{fname} - Landing Page.pdf',
                'landing-page/screenshots/landing-desktop-full.png', 'landing-page/screenshots/landing-mobile-full.png',
                'landing-page/screenshots/landing-mobile-hires.png']:
        need((d / rel).exists(), f'missing file: {rel} (run render.py)')
    imgs = [('business.logo', B.get('logo'))] + [(f'landing.{k}', L.get(k)) for k in ('desktop', 'desktop_full', 'mobile', 'mobile_full', 'current')]
    imgs += [(f'sales.evidence[{i}].img', e.get('img')) for i, e in enumerate(S.get('evidence', []))]
    for label, rel in imgs:
        if rel:
            need('..' not in pathlib.PurePath(rel).parts, f'{label} must point inside the package: {rel}')
            need((d / rel).is_file(), f'{label}: image missing: {rel}')
    cj = load(d / 'landing-page' / 'content.json', {})
    need(bool(cj.get('sources')) if cj else True, 'landing-page/content.json needs "sources" (where every fact came from)')
    pdf = d / f'{fname} - Proposal.pdf'
    if pdf.exists():
        n = pdf_pages(pdf)
        need(n == PAGES, f'{pdf.name} has {n} pages, expected {PAGES}')
        need(pdf.stat().st_mtime >= (d / 'proposal-data.json').stat().st_mtime - 1, 'proposal-data.json changed after the last render: run render.py again')
    lpdf = d / f'{fname} - Landing Page.pdf'
    if lpdf.exists():
        need(pdf_pages(lpdf) == 1, f'{lpdf.name} should be one tall page')
    fold, lp = d / 'landing-page/screenshots/landing-desktop-fold.png', d / 'landing-page/index.html'
    if fold.exists() and lp.exists():
        need(fold.stat().st_mtime >= lp.stat().st_mtime - 1, 'landing-page/index.html changed after the last render: run render.py again')
    rep = load(d / 'proposal' / 'layout-report.json')
    if rep:
        need(rep.get('pages') == PAGES, f'proposal has {rep.get("pages")} pages, expected {PAGES}')
        for it in rep.get('issues', [])[:10]:
            problems.append(f"layout page {it['page']}: {it['issue']}: {it['el']}" + (f" by {it['by_px']}px" if it.get('by_px') else ''))

    # plain, specific, sourced copy
    for path, txt in walk(S):
        if re.search(r'\.(img|url|source|fact_id|icon)$', path):
            continue
        if JARGON.search(txt):
            problems.append(f'jargon in {path}: "{txt[:60]}" (say it the way the owner would)')
    for c in seo.get('categories', []):
        if JARGON.search(c.get('label', '')):
            problems.append(f'jargon in seo.categories: "{c["label"]}"')
    if FORMULA.search(S.get('cover_headline', '')):
        problems.append('cover_headline is the worn-out formula ("... love you. Your website hides it."): lead with what only this business has')
    web, ads = fact_index()
    facts = [('sales.fact', S.get('fact'))] + [(f'sales.stats[{i}]', s) for i, s in enumerate(S.get('stats', []))]
    for label, f in facts:
        if f:
            problems += check_fact(f, label, web, ads, job)
    for path, txt in walk({k: v for k, v in S.items() if k not in ('fact', 'stats')}):
        if PERCENT.search(txt) and not path.endswith(('.img', '.url')):
            problems.append(f'{path}: "{PERCENT.search(txt).group()}" is a statistic outside the cited facts (put numbers in sales.fact / sales.stats)')
    if seo.get('score') is None:
        need(all(c.get('score') in (0, 100) for c in seo.get('categories', [])), 'no website: seo.categories must be yes/no checks scored 100 or 0')

    # prices: same as the offer in job.json
    offer = job.get('offer') or {}
    oplans = offer.get('plans') or []
    if S.get('plans'):
        need(len(S['plans']) == len(oplans), f'sales.plans has {len(S["plans"])} plans, the offer has {len(oplans)}')
        for i, (a, b) in enumerate(zip(S['plans'], oplans)):
            need(a.get('name') == b.get('name') and str(a.get('price')) == str(b.get('price')),
                 f'sales.plans[{i}] is {a.get("name")} {a.get("price")}, the offer says {b.get("name")} {b.get("price")}')
    norm = lambda s: re.sub(r'[\s  ]', '', s).rstrip('.,')
    allowed = {norm(m) for p in oplans for m in MONEY.findall(str(p.get('price', '')))}
    allowed |= {norm(m) for m in MONEY.findall(str(offer.get('care_plan', '')))}
    allowed |= {norm(f.get('number', '')) for _, f in facts if f}
    for path, txt in walk({k: v for k, v in S.items() if k not in ('fact_id',)}):
        if path.endswith(('.source', '.img', '.url')) or path.startswith(('sales.fact.number', 'sales.stats')):
            continue
        for m in MONEY.findall(txt):
            if norm(m) not in allowed and not path.startswith('sales.fact.number'):
                problems.append(f'{path}: price {m.strip()} is not in the offer ({", ".join(sorted(allowed)) or "none"})')

    # identity: right business, right phone, nobody else's name
    jb = job.get('business') or {}
    if jb.get('name'):
        need(name in [jb['name']] + list(jb.get('names') or []), f'business.name "{name}" differs from job.json "{jb["name"]}"')
    if B.get('phone') and jb:
        known = [p.get('e164') or p.get('raw') for p in jb.get('phones') or []] + [(jb.get('google') or {}).get('phone')]
        need(any(k and digits(k)[-9:] == digits(B['phone'])[-9:] for k in known), f'business.phone {B["phone"]} is not one of the phones in job.json')
    page_text = check_landing(d, name, B.get('phone') or ((jb.get('phones') or [{}])[0].get('e164')), problems)
    hay = (page_text + ' ' + json.dumps(data, ensure_ascii=False)).lower()
    for other in d.parent.glob('*/job.json'):
        if other.parent == d:
            continue
        on = ((load(other, {}) or {}).get('business') or {}).get('name', '')
        if len(on) >= 6 and on.lower() not in name.lower() and re.search(r'(?<!\w)' + re.escape(on.lower()) + r'(?!\w)', hay):
            problems.append(f'another business\'s name appears in this package: "{on}"')
    check_markers(d, data, problems)
    return problems, name


def main(argv):
    if not argv:
        print(__doc__); return 2
    d = pathlib.Path(argv[0]).resolve()
    skip = load(d / 'skip.json')
    if skip is not None:
        if skip.get('reason') not in SKIP_REASONS or not skip.get('evidence'):
            print(f'QA FAILED\n - skip.json needs "reason" (one of: {", ".join(sorted(SKIP_REASONS))}) and "evidence"'); return 1
        print('SKIPPED:', skip['reason']); return 3
    problems, name = check(d)
    if '--json' in argv:
        print(json.dumps({'passed': not problems, 'name': name, 'problems': problems}, ensure_ascii=False, indent=1))
    elif problems:
        print('QA FAILED')
        for p in problems:
            print(' -', p)
    else:
        print('QA PASSED:', name)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
