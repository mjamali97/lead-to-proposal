#!/usr/bin/env python3
"""Place and check the numbered markers on page 4 (the new page's first screen).

  markers.py <packageDir>                         draw the preview (default proposal/preview/markers.png) and list the markers
  markers.py <packageDir> --preview out.png       same, to another file
  markers.py <packageDir> --set '[[x,y],[x,y],[x,y],[x,y]]'   write new positions (percent of the image) to proposal-data.json
  markers.py <packageDir> --auto                  move each marker to clear space just beside the element it points at

The preview shows the screenshot with a labelled 5% grid and every marker at its printed size. A marker
belongs on plain background right beside the element its label names (end of the headline's first line,
the gap next to the button row, outside the rating card), never on letters, faces, stars or buttons, and
never touching another marker. Open the preview with the Read tool and look before you move on.
After --set or --auto: run render.py again, then qa.py.
"""
import json, math, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qa  # noqa: E402

FONT = HERE.parent / 'templates' / 'proposal' / 'fonts' / 'inter-latin.woff2'
ACCENT, INK = (255, 255, 255), (17, 20, 24)

ELEMENTS_JS = r"""() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    if (r.width > innerWidth * 0.62 && r.height > 160) continue;
    const tag = el.tagName.toLowerCase();
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ').trim();
    const media = tag === 'img' || tag === 'picture' || tag === 'video' || (s.backgroundImage !== 'none' && r.width > 120 && r.height > 120);
    const btn = tag === 'a' || tag === 'button';
    if (!own && !media && !btn && !/^h[1-6]$/.test(tag)) continue;
    out.push({ tag, x: r.left, y: r.top, w: r.width, h: r.height, text: (el.innerText || '').slice(0, 120), media, btn, h1: tag === 'h1' || !!el.closest('h1') });
  }
  return out;
}"""


def load_data(d):
    p = d / 'proposal-data.json'
    return p, json.loads(p.read_text(encoding='utf-8'))


def font(size):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(str(FONT), size)
    except Exception:
        return ImageFont.load_default()


def overlaps(ms):
    bad = set()
    for i in range(len(ms)):
        for j in range(i + 1, len(ms)):
            dx = (ms[i]['x'] - ms[j]['x']) / 100 * qa.FRAME_W
            dy = (ms[i]['y'] - ms[j]['y']) / 100 * qa.FRAME_H
            if math.hypot(dx, dy) < 2 * qa.PIN_R + 4:
                bad |= {i, j}
    return bad


def preview(d, data, out):
    from PIL import Image, ImageDraw
    ms = data['sales']['markers']
    src = Image.open(d / data['landing']['desktop']).convert('RGB')
    W = 1400
    im = src.resize((W, round(src.height * W / src.width)), Image.LANCZOS)
    H = im.height
    pad, leg = 40, 40 + 34 * len(ms)
    c = Image.new('RGB', (W + pad, H + pad + leg), 'white')
    c.paste(im, (pad, pad))
    dr = ImageDraw.Draw(c, 'RGBA')
    f, fb = font(15), font(20)
    for k in range(0, 101, 5):
        x, y = pad + W * k / 100, pad + H * k / 100
        a = 120 if k % 10 == 0 else 55
        dr.line([(x, pad), (x, pad + H)], fill=(220, 0, 160, a), width=1)
        dr.line([(pad, y), (pad + W, y)], fill=(220, 0, 160, a), width=1)
        if k % 10 == 0:
            dr.text((x, 12), str(k), fill=(200, 0, 150), font=f, anchor='mt')
            dr.text((20, y), str(k), fill=(200, 0, 150), font=f, anchor='mm')
    r = qa.PIN_R / qa.FRAME_W * W
    bad = overlaps(ms)
    lines = []
    for i, m in enumerate(ms):
        busy = qa.marker_busy(src, m['x'], m['y'])
        cx, cy = pad + m['x'] / 100 * W, pad + m['y'] / 100 * H
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(31, 78, 121, 255), outline=(255, 255, 255, 255), width=4)
        dr.ellipse([cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2], outline=INK, width=2)
        dr.text((cx, cy), str(i + 1), fill=ACCENT, font=fb, anchor='mm')
        state = 'ON TEXT/BUSY - move it' if busy > qa.BUSY else 'clear'
        if i in bad:
            state += ', OVERLAPS another marker'
        lines.append(f"{i + 1}. ({m['x']}, {m['y']})  {m.get('label', '')}  -> busy {busy:.2f}, {state}")
    for k, t in enumerate(lines):
        dr.text((pad, H + pad + 20 + 34 * k), t, fill=INK, font=font(18))
    out = pathlib.Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    c.save(out)
    return lines


def kind(label):
    l = label.lower()
    if re.search(r'★|review|rating|stars?\b', l): return 'rating'
    if re.search(r'headline|title|promise|since|name', l): return 'h1'
    if re.search(r'tap|book|call|whatsapp|order|reserve|quote|consult|button|enrol|apply|text', l): return 'btn'
    if re.search(r'photo|picture|team|van|work|gallery|your own|colours|colors|logo', l): return 'media'
    return ''


def auto(d, data):
    """Move each marker to the first clear spot beside the element its label names."""
    from PIL import Image
    from playwright.sync_api import sync_playwright
    import capture
    ms = data['sales']['markers']
    img = Image.open(d / data['landing']['desktop'])
    vw, vh = capture.DESKTOP['width'], capture.DESKTOP['height']
    with sync_playwright() as p:
        b = capture.launch(p)
        pg = capture.new_page(b, viewport=capture.DESKTOP, scale=1, ua=False, reduced_motion=True)
        pg.goto((d / 'landing-page' / 'index.html').as_uri(), wait_until='load')
        capture.settle(pg, 400)
        els = pg.evaluate(ELEMENTS_JS)
        b.close()
    rpx = qa.PIN_R / qa.FRAME_W * vw + 8
    placed, log = [], []

    def score(el, px, py, k):
        dx = max(el['x'] - px, 0, px - el['x'] - el['w']); dy = max(el['y'] - py, 0, py - el['y'] - el['h'])
        t = el['text']; bonus = 0
        if k == 'rating' and re.search(r'\b[1-5][.,]\d\b', t) and len(t) < 60: bonus = 900
        if k == 'h1' and el['h1']: bonus = 300
        if k == 'btn' and el['btn'] and len(t) < 50: bonus = 200
        if k == 'media' and el['media']: bonus = 250
        return math.hypot(dx, dy) - bonus

    for i, m in enumerate(ms):
        px, py, k = m['x'] / 100 * vw, m['y'] / 100 * vh, kind(m.get('label', ''))
        el = min(els, key=lambda e: score(e, px, py, k)) if els else None
        cands = [(px, py)]
        if el:
            x, y, w, h = el['x'], el['y'], el['w'], el['h']
            cy = y + min(h, 110) / 2
            for g in (rpx + 6, rpx * 1.8):
                if el['media'] and w > 160 and h > 160:
                    cands += [(x + g, y + g), (x + w - g, y + g), (x + g, y + h - g), (x + w - g, y + h - g)]
                cands += [(x + w + g, y + 36 if el['h1'] else cy), (x - g, cy), (x + w + g, y - 4), (x + w + g, y + h + 4),
                          (x - g, y - 4), (x + w / 2, y - g), (x + w / 2, y + h + g), (x + 24, y + h + g)]
        best = None
        for cx, cy in cands:
            mx, my = cx / vw * 100, cy / vh * 100
            if not (3 <= mx <= 97 and 5 <= my <= 95):
                continue
            if any(math.hypot((mx - qx) / 100 * qa.FRAME_W, (my - qy) / 100 * qa.FRAME_H) < 2 * qa.PIN_R + 6 for qx, qy in placed):
                continue
            busy = qa.marker_busy(img, mx, my)
            if best is None or busy < best[2]:
                best = (mx, my, busy)
            if busy < 0.05:
                break
        if best is None:
            best = (m['x'], m['y'], qa.marker_busy(img, m['x'], m['y']))
        m['x'], m['y'] = round(best[0], 1), round(best[1], 1)
        placed.append((m['x'], m['y']))
        log.append(f"{i + 1}. [{k or '-'}] -> {el['tag'] if el else '?'} \"{(el or {}).get('text', '')[:28]}\" at ({m['x']}, {m['y']}) busy {best[2]:.2f}")
    return log


def main(argv):
    if not argv:
        print(__doc__); return 2
    d = pathlib.Path(argv[0]).resolve()
    p, data = load_data(d)
    if '--set' in argv:
        xy = json.loads(argv[argv.index('--set') + 1])
        ms = data['sales']['markers']
        if len(xy) != len(ms):
            print(f'--set needs {len(ms)} pairs'); return 2
        for m, (x, y) in zip(ms, xy):
            m['x'], m['y'] = round(float(x), 1), round(float(y), 1)
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('saved', [(m['x'], m['y']) for m in ms])
    if '--auto' in argv:
        for line in auto(d, data):
            print(line)
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    out = argv[argv.index('--preview') + 1] if '--preview' in argv else d / 'proposal' / 'preview' / 'markers.png'
    for line in preview(d, data, out):
        print(line)
    print('preview:', out)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
