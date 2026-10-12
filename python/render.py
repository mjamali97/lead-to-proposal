#!/usr/bin/env python3
"""Render one proposal package: landing-page screenshots and PDF, the proposal HTML, PDF and previews.

  render.py <packageDir> [--proposal-only] [--project DIR]

Writes (inside the package):
  landing-page/screenshots/landing-desktop-fold.png   1440x900 @1.5x (the proposal's main picture; markers use it)
  landing-page/screenshots/landing-desktop-full.png   whole page, 1440 wide
  landing-page/screenshots/landing-mobile-fold.png    390x844 @2x, mobile call bar visible
  landing-page/screenshots/landing-mobile-full.png    whole page on a phone, call bar hidden
  landing-page/screenshots/landing-mobile-hires.png   1170x2532, phone resolution (for phones and iPads)
  <Business> - Landing Page.pdf                       one tall page built from a screenshot: looks the same in every viewer
  proposal/proposal.html                              from templates/proposal/proposal.mjs
  <Business> - Proposal.pdf                           Letter or A4 (job.market.paper)
  proposal/preview/page-N.png                         one image per page, for a quick visual check
  proposal/layout-report.json                         anything off the page, into the footer, clipped, overlapping or not loaded
"""
import json, os, pathlib, shutil, subprocess, sys
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
PLUGIN = HERE.parent
sys.path.insert(0, str(HERE))
import capture  # noqa: E402

LAYOUT_CHECK_JS = r"""() => {
  const out = [], seen = new Set();
  const add = (page, issue, el, by) => { const k = page + '|' + issue + '|' + el; if (seen.has(k)) return; seen.add(k);
    out.push(Object.assign({ page, issue, el }, by ? { by_px: Math.round(by) } : {})); };
  const desc = el => { const c = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44); return el.tagName.toLowerCase() + c + (t ? ` "${t}"` : ''); };
  const vis = el => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  document.querySelectorAll('.page').forEach((p, i) => {
    const n = i + 1, pr = p.getBoundingClientRect();
    const foot = p.querySelector('.pf');
    const limit = foot ? foot.getBoundingClientRect().top - 4 : pr.bottom - 40;
    p.querySelectorAll('*').forEach(el => {
      if (el.closest('.pf') || el.closest('.glow') || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') || !vis(el)) return;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
      if (r.bottom > limit + 0.5) add(n, 'runs into the footer / off the page', desc(el), r.bottom - limit);
      if (r.right > pr.right + 1 || r.left < pr.left - 1) add(n, 'outside the page width', desc(el));
      const cs = getComputedStyle(el);
      if (el.children.length === 0 && (el.textContent || '').trim() && cs.textOverflow !== 'ellipsis' &&
          cs.overflow !== 'visible' && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) add(n, 'text cut off', desc(el));
    });
    const boxes = [...p.querySelectorAll('[data-box]')].filter(vis);
    for (const bx of boxes) {
      const br = bx.getBoundingClientRect();
      bx.querySelectorAll('*').forEach(c => {
        if ((c.closest('svg') && c.tagName.toLowerCase() !== 'svg') || !vis(c)) return;
        const r = c.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
        const by = Math.max(r.right - br.right, br.left - r.left, r.bottom - br.bottom, br.top - r.top);
        if (by > 1) add(n, 'content spills out of its box', desc(bx), by);
      });
    }
    const rects = boxes.map(b => [b, b.getBoundingClientRect()]);
    for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
      const [ea, ra] = rects[a], [eb, rb] = rects[b];
      if (ea.contains(eb) || eb.contains(ea)) continue;
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 1 && oy > 1) add(n, 'boxes overlap', desc(ea).slice(0, 40) + ' / ' + desc(eb).slice(0, 40), Math.min(ox, oy));
    }
    p.querySelectorAll('img').forEach(im => { if (!im.complete || !im.naturalWidth) add(n, 'image did not load', (im.getAttribute('src') || '').slice(0, 90)); });
  });
  const h = document.querySelector('.cover .headline'), sub = document.querySelector('.cover .csub'), dv = document.querySelector('.cover .devices');
  if (h && dv) { const b = (sub || h).getBoundingClientRect().bottom, t = dv.getBoundingClientRect().top;
    if (b > t - 8) add(1, 'cover headline runs behind the device mock-ups', 'h1', b - t + 8); }
  const pins = [...document.querySelectorAll('.pin')];
  pins.forEach(pn => { const r = pn.getBoundingClientRect(), w = pn.closest('.shot').getBoundingClientRect();
    if (r.left < w.left - 1 || r.right > w.right + 1 || r.top < w.top - 1 || r.bottom > w.bottom + 1) add(4, 'marker outside the screenshot', 'marker ' + pn.textContent); });
  for (let a = 0; a < pins.length; a++) for (let b = a + 1; b < pins.length; b++) {
    const ra = pins[a].getBoundingClientRect(), rb = pins[b].getBoundingClientRect();
    if (Math.hypot(ra.x - rb.x, ra.y - rb.y) < ra.width + 2) add(4, 'markers overlap', `markers ${a + 1} and ${b + 1}`);
  }
  return out.slice(0, 80);
}"""

PAPER = {'A4': (794, 1123), 'LETTER': (816, 1056)}


def load(p, default=None):
    p = pathlib.Path(p)
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default


def node():
    return os.environ.get('L2P_NODE') or shutil.which('node') or 'node'


def render_landing(d, name, data, browser):
    lp = d / 'landing-page' / 'index.html'
    shots = d / 'landing-page' / 'screenshots'
    shots.mkdir(parents=True, exist_ok=True)

    def open_lp(viewport, scale, mobile=False):
        pg = capture.new_page(browser, mobile=mobile, scale=scale, viewport=viewport, ua=False, reduced_motion=True)
        pg.goto(lp.as_uri(), wait_until='load', timeout=60000)
        capture.settle(pg, 500)
        pg.evaluate(capture.STRIP_IFRAMES_JS)
        capture.scroll_through(pg)
        return pg

    pg = open_lp(capture.DESKTOP, 1.5)
    pg.screenshot(path=str(shots / 'landing-desktop-fold.png'))
    pg.context.close()
    pg = open_lp(capture.DESKTOP, 1)
    pg.evaluate(capture.HIDE_BOTTOM_FIXED_JS)
    pg.screenshot(path=str(shots / 'landing-desktop-full.png'), full_page=True)
    pg.context.close()
    for scale, fold in ((2, 'landing-mobile-fold.png'), (3, 'landing-mobile-hires.png')):
        pg = open_lp(capture.MOBILE, scale, mobile=True)
        pg.screenshot(path=str(shots / fold))
        capture.exact_size(shots / fold, capture.MOBILE['width'] * scale, capture.MOBILE['height'] * scale)
        if scale == 2:
            pg.evaluate(capture.HIDE_BOTTOM_FIXED_JS)
            pg.screenshot(path=str(shots / 'landing-mobile-full.png'), full_page=True)
        pg.context.close()

    # Landing Page PDF: one tall page from a full screenshot, so every viewer shows exactly the same thing.
    probe = open_lp(capture.DESKTOP, 1)
    height = probe.evaluate('document.documentElement.scrollHeight')
    probe.context.close()
    scale = max(1.0, min(2.0, 30000 / max(height, 1)))
    pg = open_lp(capture.DESKTOP, scale)
    pg.evaluate(capture.HIDE_BOTTOM_FIXED_JS)
    tmp = shots / '.landing-pdf.png'
    pg.screenshot(path=str(tmp), full_page=True)
    pg.context.close()
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(tmp).convert('RGB')
    im.save(d / f'{name} - Landing Page.pdf', 'PDF', resolution=72.0 * scale, quality=90)
    tmp.unlink(missing_ok=True)

    # Today's site, only when the agent has not captured it already (never overwrite a hand-made capture).
    cur, site = data.get('landing', {}).get('current'), data.get('business', {}).get('website')
    if cur and site and not (d / cur).exists():
        try:
            capture.shot_site(site, str(d / cur))
        except Exception as e:
            print('today screenshot failed:', str(e).splitlines()[0][:200])


def render_proposal(d, name, paper, browser, project=None):
    cmd = [node(), str(PLUGIN / 'templates' / 'proposal' / 'proposal.mjs'), str(d)] + (['--project', project] if project else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f'proposal.mjs failed:\n{r.stderr or r.stdout}')
    html = d / 'proposal' / 'proposal.html'
    w, h = PAPER.get(paper.upper(), PAPER['LETTER'])
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto(html.as_uri(), wait_until='load', timeout=60000)
    try:
        pg.wait_for_function("document.body.dataset.fit === '1'", timeout=20000)
    except Exception:
        print('warning: the proposal page did not finish fitting within 20 s')
    pages = pg.evaluate("document.querySelectorAll('.page').length")
    issues = pg.evaluate(LAYOUT_CHECK_JS)
    pdf = d / f'{name} - Proposal.pdf'
    pg.pdf(path=str(pdf), print_background=True, prefer_css_page_size=True)
    prev = d / 'proposal' / 'preview'
    shutil.rmtree(prev, ignore_errors=True)
    prev.mkdir(parents=True)
    for i, el in enumerate(pg.query_selector_all('.page'), 1):
        el.scroll_into_view_if_needed()
        pg.wait_for_timeout(120)
        el.screenshot(path=str(prev / f'page-{i}.png'))
    ctx.close()
    return pages, issues, pdf


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    if not args:
        print(__doc__); return 2
    d = pathlib.Path(args[0]).resolve()
    project = argv[argv.index('--project') + 1] if '--project' in argv else None
    if project in args:
        args.remove(project)
    data = load(d / 'proposal-data.json')
    job = load(d / 'job.json', {})
    if data is None:
        print('proposal-data.json missing in', d); return 1
    name = data.get('business', {}).get('name') or job.get('business', {}).get('name') or d.name
    name = ''.join(ch if ch not in '\\/:*?"<>|' else ' ' for ch in name).strip()
    paper = (job.get('market') or {}).get('paper') or data.get('paper') or 'Letter'
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = capture.launch(p)
        if '--proposal-only' not in argv and (d / 'landing-page' / 'index.html').exists():
            render_landing(d, name, data, b)
        pages, issues, pdf = render_proposal(d, name, paper, b, project)
        b.close()
    report = {'rendered': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'paper': paper, 'pages': pages, 'issues': issues}
    (d / 'proposal' / 'layout-report.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(f'{name}: proposal {pages} pages ({paper}), {len(issues)} layout issue(s)' + ('' if '--proposal-only' in argv else ', landing screenshots + PDF'))
    for it in issues[:12]:
        print(f"  page {it['page']}: {it['issue']}: {it['el']}" + (f" by {it['by_px']}px" if it.get('by_px') else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
