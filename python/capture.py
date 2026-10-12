#!/usr/bin/env python3
"""Screenshots and downloads for building a proposal package (Playwright + headless Chromium).

  capture.py site  <url> <out.png> [--mobile] [--full] [--keep-popups] [--wait MS]
        first screen (or --full page) of a site. Pop-ups and cookie banners are removed unless
        --keep-popups (use that only when the pop-up itself is the problem you are showing).
  capture.py text  <url> "<visible text>" <out.png> [--height 420] [--mobile] [--keep-popups]
        a full-width strip of the page centred on some visible text (never cropped at the sides).
  capture.py html  <file.html | -> <out.png> [--w 1280] [--h 800] [--full] [--scale 2]
                   [--selector CSS] [--transparent]
        a local HTML file (or HTML on stdin): mock error pages, wordmark PNGs, small graphics.
  capture.py fetch <url> <out-file>
        download one image (logo, photo) with a normal browser user agent; checks it is an image.

Every command makes one page request. Exit 0 on success; otherwise prints "capture failed: <reason>"
and exits 1 (then do not use that screenshot or claim what it would have shown).
"""
import argparse, io, os, pathlib, sys, tempfile, urllib.request

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/126.0 Safari/537.36')
DESKTOP = {'width': 1440, 'height': 900}
MOBILE = {'width': 390, 'height': 844}
IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.ico'}

# Known consent/pop-up frameworks first, then a general rule: fixed overlays that cover most of the
# screen, and fixed bars whose text is about cookies, consent or newsletters. Sticky headers stay.
REMOVE_POPUPS_JS = r"""() => {
  const W = innerWidth, H = innerHeight; let n = 0;
  const kill = el => { if (el && el.isConnected && el !== document.body && el !== document.documentElement) { el.remove(); n++; } };
  const SEL = ['#onetrust-consent-sdk', '#onetrust-banner-sdk', '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',
    '#didomi-host', '#usercentrics-root', '#cmpbox', '#cmpbox2', '.qc-cmp2-container', '#truste-consent-track', '.osano-cm-window',
    '#iubenda-cs-banner', '.cc-window', '.cc-banner', '#cookie-law-info-bar', '.cli-modal-backdrop', '.cky-consent-container', '.cky-overlay',
    '#moove_gdpr_cookie_info_bar', '.termly-styles-root', '#hs-eu-cookie-confirmation', '.pum-overlay', '.mfp-wrap', '.mfp-bg',
    '.modal-backdrop', '.fancybox-container', '.elementor-popup-modal', '.klaviyo-form', '.wisepops-root', '#om-holder',
    '[id^="attentive_overlay"]', '.sumome-react-wysiwyg-popup-container', '.hustle-popup', '.privy-popup-container'];
  for (const s of SEL) { try { document.querySelectorAll(s).forEach(kill); } catch (e) {} }
  const WORDS = /cookie|consent|gdpr|privacy|newsletter|subscribe|sign ?up|we use|accept all|discount|% off|join our/i;
  for (const el of [...document.querySelectorAll('body *')]) {
    if (!el.isConnected) continue;
    const s = getComputedStyle(el);
    if (s.position !== 'fixed') continue;
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    const vis = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
    const text = (el.innerText || '').slice(0, 800);
    const dialog = el.matches('[role=dialog],[role=alertdialog],[aria-modal=true],dialog');
    const z = parseInt(s.zIndex, 10) || 0;
    if (r.top <= 2 && r.height < H * 0.22 && !WORDS.test(text)) continue;          // a normal sticky header
    if (vis > W * H * 0.3 && (z > 0 || dialog)) { kill(el); continue; }             // overlay over the page
    if (WORDS.test(text) && (dialog || r.bottom >= H - 4 || r.top <= 4 || vis > W * H * 0.08)) kill(el);   // cookie / newsletter bar or box
  }
  document.querySelectorAll('dialog[open]').forEach(kill);
  for (const e of [document.documentElement, document.body]) {
    e.style.setProperty('overflow', 'auto', 'important');
    e.classList.remove('modal-open', 'no-scroll', 'noscroll', 'overflow-hidden', 'is-locked', 'cky-modal-open', 'didomi-popup-open');
  }
  if (getComputedStyle(document.body).position === 'fixed') document.body.style.setProperty('position', 'static', 'important');
  document.querySelectorAll('body *').forEach(e => { const f = getComputedStyle(e).filter; if (f && f.includes('blur')) e.style.filter = 'none'; });
  return n;
}"""

# PDFs and screenshots must not depend on live embeds: every iframe becomes a static box (or the image
# in its data-static attribute, e.g. a static map picture), same size and classes.
STRIP_IFRAMES_JS = r"""() => {
  let n = 0;
  document.querySelectorAll('iframe').forEach(f => {
    const cs = getComputedStyle(f), st = f.getAttribute('data-static');
    const el = document.createElement(st ? 'img' : 'div');
    if (st) { el.src = st; el.alt = f.title || ''; el.style.objectFit = 'cover'; }
    else { el.textContent = f.title || 'Map'; Object.assign(el.style, { display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#EEF0F2', color: '#5D636B', font: '500 14px system-ui, sans-serif' }); }
    el.className = f.className; el.style.width = cs.width; el.style.height = cs.height; el.style.border = '0'; el.style.display = el.style.display || 'block';
    f.replaceWith(el); n++;
  });
  return n;
}"""

# Fixed bars at the bottom (mobile call bars) would float in the middle of a full-page screenshot.
HIDE_BOTTOM_FIXED_JS = r"""() => { let n = 0;
  document.querySelectorAll('body *').forEach(e => { const s = getComputedStyle(e);
    if (e.matches('[data-capture-hide]') || (s.position === 'fixed' && e.getBoundingClientRect().top > innerHeight * 0.55)) { e.style.setProperty('display', 'none', 'important'); n++; } });
  return n; }"""

READY_JS = r"""async () => {
  await document.fonts.ready;
  const pending = [...document.images].filter(i => !i.complete && i.loading !== 'lazy');   // lazy ones load in scroll_through
  await Promise.race([Promise.all(pending.map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); }))),
                      new Promise(r => setTimeout(r, 8000))]);
  await Promise.race([Promise.all([...document.images].filter(i => i.complete).map(i => i.decode ? i.decode().catch(() => {}) : 0)),
                      new Promise(r => setTimeout(r, 4000))]);
}"""

FIND_TEXT_JS = r"""(needle) => {
  const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase(); const want = norm(needle);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let best = null;
  while (walker.nextNode()) {
    const el = walker.currentNode, r = el.getBoundingClientRect();
    if (!r.width || !r.height || !norm(el.innerText || '').includes(want)) continue;
    if (!best || r.width * r.height < best.w * best.h) best = { el, w: r.width, h: r.height };
  }
  if (!best) return null;
  best.el.scrollIntoView({ block: 'center' });
  const r = best.el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}"""


def launch(p):
    return p.chromium.launch()


def new_page(browser, mobile=False, scale=None, viewport=None, ua=True, reduced_motion=False):
    ctx = browser.new_context(
        viewport=viewport or (MOBILE if mobile else DESKTOP),
        device_scale_factor=scale or (3 if mobile else 1.5),
        is_mobile=mobile, has_touch=mobile, user_agent=UA if ua else None,
        reduced_motion='reduce' if reduced_motion else 'no-preference', locale='en-US')
    return ctx.new_page()


def settle(pg, ms=1200):
    try:
        pg.wait_for_load_state('networkidle', timeout=15000)
    except Exception:
        pass
    try:
        pg.evaluate(READY_JS)
    except Exception:
        pass
    pg.wait_for_timeout(ms)


def scroll_through(pg):
    """Load lazy images and fire scroll-triggered reveals, then return to the top."""
    pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')")
    h = pg.evaluate('document.documentElement.scrollHeight')
    step = pg.viewport_size['height'] * 0.8
    y = 0
    while y < h:
        pg.evaluate(f'window.scrollTo(0, {int(y)})')
        pg.wait_for_timeout(80)
        y += step
    pg.evaluate('window.scrollTo(0, 0)')
    settle(pg, 600)


def remove_popups(pg):
    n = 0
    for _ in range(2):   # some pop-ups re-appear once after the first removal
        try:
            n += pg.evaluate(REMOVE_POPUPS_JS)
        except Exception:
            pass
        pg.wait_for_timeout(350)
    return n


def goto(pg, url, wait_ms=1500):
    if not url.startswith(('http://', 'https://', 'file://', 'data:')):
        p = pathlib.Path(url)
        url = p.resolve().as_uri() if p.exists() else 'https://' + url
    pg.goto(url, wait_until='load', timeout=60000)
    settle(pg, wait_ms)


def exact_size(path, w, h):
    """Chromium's mobile emulation can round a screenshot 1 px short; make phone shots exactly w x h."""
    from PIL import Image
    im = Image.open(path)
    if im.size != (w, h) and abs(im.width - w) <= 2 and abs(im.height - h) <= 2:
        fixed = Image.new(im.mode, (w, h), im.getpixel((0, im.height - 1)))
        fixed.paste(im, (0, 0))
        fixed.save(path)


def _out(path):
    out = pathlib.Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def shot_site(url, out, mobile=False, full=False, keep_popups=False, wait_ms=1500):
    from playwright.sync_api import sync_playwright
    out = _out(out)
    with sync_playwright() as p:
        b = launch(p)
        pg = new_page(b, mobile=mobile)
        goto(pg, url, wait_ms)
        removed = 0 if keep_popups else remove_popups(pg)
        if full:
            scroll_through(pg)
            if not keep_popups:
                removed += remove_popups(pg)
        pg.screenshot(path=str(out), full_page=full)
        b.close()
    if mobile and not full:
        exact_size(out, MOBILE['width'] * 3, MOBILE['height'] * 3)
    return {'out': str(out), 'popups_removed': removed}


def shot_text(url, text, out, height=420, mobile=False, keep_popups=False, wait_ms=1500):
    from playwright.sync_api import sync_playwright
    out = _out(out)
    with sync_playwright() as p:
        b = launch(p)
        pg = new_page(b, mobile=mobile)
        goto(pg, url, wait_ms)
        if not keep_popups:
            remove_popups(pg)
        box = pg.evaluate(FIND_TEXT_JS, text)
        if not box:
            b.close()
            raise RuntimeError(f'text not found on the page: "{text}"')
        pg.wait_for_timeout(400)
        box = pg.evaluate(FIND_TEXT_JS, text)
        vw, vh = pg.viewport_size['width'], pg.viewport_size['height']
        h = min(height, vh)
        y = max(0, min(box['y'] + box['h'] / 2 - h / 2, vh - h))
        pg.screenshot(path=str(out), clip={'x': 0, 'y': y, 'width': vw, 'height': h})
        b.close()
    return {'out': str(out)}


def shot_html(src, out, w=1280, h=800, full=False, scale=2, selector=None, transparent=False):
    from playwright.sync_api import sync_playwright
    out = _out(out)
    tmp = None
    if src == '-':
        tmp = tempfile.NamedTemporaryFile('w', suffix='.html', dir=os.getcwd(), delete=False, encoding='utf-8')
        tmp.write(sys.stdin.read()); tmp.close()
        src = tmp.name
    try:
        with sync_playwright() as p:
            b = launch(p)
            pg = new_page(b, viewport={'width': int(w), 'height': int(h)}, scale=float(scale), ua=False)
            pg.goto(pathlib.Path(src).resolve().as_uri(), wait_until='load', timeout=60000)
            settle(pg, 400)
            if selector:
                pg.locator(selector).first.screenshot(path=str(out), omit_background=transparent)
            else:
                pg.screenshot(path=str(out), full_page=full, omit_background=transparent)
            b.close()
    finally:
        if tmp:
            os.unlink(tmp.name)
    return {'out': str(out)}


def fetch(url, out, max_bytes=15_000_000):
    out = _out(out)
    if url.startswith('file://') or pathlib.Path(url).exists():
        data = pathlib.Path(url.replace('file://', '')).read_bytes()
    else:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise RuntimeError(f'file is larger than {max_bytes // 1_000_000} MB')
    ext = out.suffix.lower()
    info = f'{len(data)} bytes'
    if ext in IMAGE_EXT:
        head = data[:600].lstrip().lower()
        if ext == '.svg' or head.startswith(b'<svg') or head.startswith(b'<?xml'):
            if b'<svg' not in data[:4000].lower():
                raise RuntimeError('not an SVG image (the server sent something else, maybe an HTML page)')
        else:
            from PIL import Image
            try:
                im = Image.open(io.BytesIO(data)); im.load()
            except Exception:
                raise RuntimeError('not an image (the server sent something else, maybe an HTML page)')
            fmt = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP', '.gif': 'GIF'}.get(ext)
            if fmt and im.format != fmt:          # e.g. a .png name for WebP data: convert so the name tells the truth
                buf = io.BytesIO()
                im = im.convert('RGBA' if fmt in ('PNG', 'WEBP') else 'RGB')
                im.save(buf, fmt, quality=90)
                data = buf.getvalue()
            info += f', {im.width}x{im.height} {im.format}'
    out.write_bytes(data)
    return {'out': str(out), 'info': info}


def main(argv=None):
    ap = argparse.ArgumentParser(prog='capture.py', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('site'); s.add_argument('url'); s.add_argument('out')
    s.add_argument('--mobile', action='store_true'); s.add_argument('--full', action='store_true')
    s.add_argument('--keep-popups', action='store_true'); s.add_argument('--wait', type=int, default=1500)
    t = sub.add_parser('text'); t.add_argument('url'); t.add_argument('text'); t.add_argument('out')
    t.add_argument('--height', type=int, default=420); t.add_argument('--mobile', action='store_true')
    t.add_argument('--keep-popups', action='store_true'); t.add_argument('--wait', type=int, default=1500)
    h = sub.add_parser('html'); h.add_argument('src'); h.add_argument('out')
    h.add_argument('--w', type=int, default=1280); h.add_argument('--h', type=int, default=800)
    h.add_argument('--full', action='store_true'); h.add_argument('--scale', type=float, default=2)
    h.add_argument('--selector'); h.add_argument('--transparent', action='store_true')
    f = sub.add_parser('fetch'); f.add_argument('url'); f.add_argument('out')
    a = ap.parse_args(argv)
    try:
        if a.cmd == 'site':
            r = shot_site(a.url, a.out, a.mobile, a.full, a.keep_popups, a.wait)
            print(f"saved {r['out']} (pop-ups removed: {r['popups_removed']})")
        elif a.cmd == 'text':
            print('saved', shot_text(a.url, a.text, a.out, a.height, a.mobile, a.keep_popups, a.wait)['out'])
        elif a.cmd == 'html':
            print('saved', shot_html(a.src, a.out, a.w, a.h, a.full, a.scale, a.selector, a.transparent)['out'])
        elif a.cmd == 'fetch':
            r = fetch(a.url, a.out)
            print('saved', r['out'], r['info'])
    except Exception as e:
        print('capture failed:', (str(e).splitlines() or [repr(e)])[0][:300])
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
