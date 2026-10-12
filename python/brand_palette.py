#!/usr/bin/env python3
"""Dominant colours of a logo, sign or photo, for when a website's CSS colours are generic template ones.

  brand_palette.py <image> [--n 5] [--json]

Prints the strongest non-neutral colours first (hex, share of the coloured pixels, contrast on white,
and the text colour that reads on it), then the darkest neutral (often the logo's ink colour).
Transparent pixels are ignored; near-white, near-black and grey pixels are counted as neutrals.
"""
import argparse, colorsys, json, sys
from PIL import Image


def lum(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def hexc(rgb):
    return '#%02X%02X%02X' % tuple(rgb)


def palette(path, n=5):
    im = Image.open(path)
    im = im.convert('RGBA')
    im.thumbnail((160, 160))
    data = im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()
    px = [p[:3] for p in data if p[3] > 200]
    if not px:
        return {'colors': [], 'neutral': None}
    colored, neutral = [], []
    buckets = {}
    for p in px:
        h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in p))
        if s < 0.18 or l > 0.94 or l < 0.07:
            neutral.append(p)
            continue
        colored.append(p)
        b = buckets.setdefault((round(h * 24) % 24, round(l * 5), round(s * 3)), [0, 0, 0, 0])
        b[0] += p[0]; b[1] += p[1]; b[2] += p[2]; b[3] += 1
    merged = []
    for r, g, bl, cnt in sorted(buckets.values(), key=lambda v: -v[3]):
        rgb = (round(r / cnt), round(g / cnt), round(bl / cnt))
        for m in merged:                          # merge near-identical shades
            if sum((x - y) ** 2 for x, y in zip(m['rgb'], rgb)) < 1600:
                m['count'] += cnt
                break
        else:
            merged.append({'rgb': rgb, 'count': cnt})
    out = []
    total = sum(m['count'] for m in merged) or 1
    for m in sorted(merged, key=lambda m: -m['count'])[:n]:
        rgb = m['rgb']
        if m['count'] / total < 0.01:
            continue
        out.append({'hex': hexc(rgb), 'share': round(100 * m['count'] / total, 1),
                    'contrast_on_white': round(contrast(rgb, (255, 255, 255)), 2),
                    'text_on_it': '#FFFFFF' if contrast(rgb, (255, 255, 255)) >= contrast(rgb, (17, 20, 24)) else '#111418'})
    dark = min(neutral, key=lum) if neutral else None
    return {'colors': out, 'neutral': hexc(dark) if dark and lum(dark) < 0.2 else None,
            'colored_share': round(100 * len(colored) / len(px), 1)}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image')
    ap.add_argument('--n', type=int, default=5)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args(argv)
    try:
        r = palette(a.image, a.n)
    except Exception as e:
        print('brand_palette failed:', e)
        return 1
    if a.json:
        print(json.dumps(r, indent=1))
        return 0
    if not r['colors']:
        print('no strong colours (the image is black, white or grey)')
    for c in r['colors']:
        print(f"{c['hex']}  {c['share']:5.1f}%  contrast on white {c['contrast_on_white']:>5}  text on it {c['text_on_it']}")
    if r.get('neutral'):
        print(f"{r['neutral']}  darkest neutral (ink)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
