#!/usr/bin/env python3
"""Generate every asset of the fictional demo package (Northwind Plumbing is not a real business).

  python examples/demo/make_assets.py            illustrations, logos, map, today/evidence screenshots
  python examples/demo/make_assets.py --no-shots  only the Pillow drawings (no browser needed)

The pictures are flat illustrations drawn here with Pillow. They stand in for the business's own
photos, which a real package downloads from the business's website or listings. They are clearly
illustrations on purpose: a real package never uses stock photos pretending to be the business.
The "today" screenshots are taken from examples/demo/old-site/, a deliberately dated fictional site.
"""
import pathlib, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
PKG = HERE / 'package'
ASSETS = PKG / 'landing-page' / 'assets'
SHOTS = PKG / 'landing-page' / 'screenshots'
FONTS = HERE.parent.parent / 'templates' / 'proposal' / 'fonts'
ARCHIVO = ASSETS / 'fonts' / 'archivo-latin.woff2'
INTER = FONTS / 'inter-latin.woff2'

NAVY, DEEP, COPPER, COPPER_L = (23, 50, 77), (15, 34, 54), (217, 130, 43), (242, 184, 128)
CREAM, SKY, SLATE, WHITE, INK = (247, 242, 234), (215, 230, 239), (107, 123, 140), (255, 255, 255), (17, 20, 24)
SKIN, STEEL, STEEL_D, WATER = (226, 178, 140), (184, 196, 206), (130, 145, 158), (120, 178, 214)
S = 2   # draw at 2x, then downsample for smooth edges


def font(path, size, **axes):
    f = ImageFont.truetype(str(path), size * S)
    try:
        names = [a['name'].decode() if isinstance(a['name'], bytes) else a['name'] for a in f.get_variation_axes()]
        vals = []
        for n, a in zip(names, f.get_variation_axes()):
            key = {'Weight': 'wght', 'Width': 'wdth', 'Optical size': 'opsz', 'Optical Size': 'opsz'}.get(n, n)
            vals.append(axes.get(key, a['default']))
        f.set_variation_by_axes(vals)
    except Exception:
        pass
    return f


class Canvas:
    def __init__(self, w, h, bg):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * S, h * S), bg + (255,) if len(bg) == 3 else bg)
        self.d = ImageDraw.Draw(self.im)

    def _s(self, xy):
        return [v * S for v in xy]

    def rect(self, xy, fill, r=0, outline=None, width=0):
        self.d.rounded_rectangle(self._s(xy), radius=r * S, fill=fill, outline=outline, width=width * S)

    def ellipse(self, xy, fill, outline=None, width=0):
        self.d.ellipse(self._s(xy), fill=fill, outline=outline, width=width * S)

    def poly(self, pts, fill):
        self.d.polygon([(x * S, y * S) for x, y in pts], fill=fill)

    def line(self, pts, fill, width, curve=False):
        self.d.line([(x * S, y * S) for x, y in pts], fill=fill, width=width * S, joint='curve' if curve else None)

    def arc(self, xy, start, end, fill, width):
        self.d.arc(self._s(xy), start, end, fill=fill, width=width * S)

    def text(self, xy, s, f, fill, anchor='la', spacing=0):
        if spacing:
            x, y = xy
            for ch in s:
                self.d.text((x * S, y * S), ch, font=f, fill=fill, anchor=anchor)
                x += f.getlength(ch) / S + spacing
        else:
            self.d.text((xy[0] * S, xy[1] * S), s, font=f, fill=fill, anchor=anchor)

    def blob_shadow(self, xy, alpha=40):
        sh = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse(self._s(xy), fill=(0, 0, 0, alpha))
        self.im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14 * S)))

    def save(self, path, quality=84):
        im = self.im.resize((self.w, self.h), Image.LANCZOS)
        path = pathlib.Path(path); path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix.lower() in ('.jpg', '.jpeg'):
            im.convert('RGB').save(path, 'JPEG', quality=quality, optimize=True, progressive=True)
        else:
            im.save(path, optimize=True)
        print('wrote', path.relative_to(HERE.parent.parent), f'{path.stat().st_size // 1024} KB')


def droplet(c, cx, cy, r, fill, accent=None):
    """The Northwind mark: a water drop with two wave strokes."""
    import math
    c.poly([(cx, cy - r * 1.55), (cx - r * 0.86, cy - r * 0.35), (cx + r * 0.86, cy - r * 0.35)], fill)
    c.ellipse((cx - r, cy - r, cx + r, cy + r), fill)
    if accent:
        w = max(2, round(r * 0.15))
        second = NAVY if fill == WHITE else WHITE
        for dy, col in ((-0.05, accent), (0.33, second)):
            pts = [(cx + r * (-0.58 + 1.16 * i / 24), cy + r * dy + r * 0.11 * math.sin(i / 24 * 2 * math.pi)) for i in range(25)]
            c.line(pts, col, w, curve=True)


def van(path):
    c = Canvas(1200, 900, CREAM)
    c.ellipse((260, 40, 1060, 840), SKY)
    for x, y, r in [(150, 560, 80), (1080, 600, 95), (1000, 540, 60)]:       # trees
        c.rect((x - 8, y, x + 8, y + 130), (122, 96, 70), 4)
        c.ellipse((x - r, y - r * 1.4, x + r, y + r * 0.4), (109, 152, 120))
    c.rect((0, 700, 1200, 900), (226, 219, 206))
    c.rect((0, 760, 1200, 772), (240, 235, 226))
    c.blob_shadow((210, 690, 1010, 760), 70)
    c.rect((300, 250, 900, 268), SLATE, 6)                                    # ladder
    for x in range(320, 900, 60):
        c.rect((x, 236, x + 10, 282), SLATE, 3)
    c.rect((200, 290, 830, 690), NAVY, 34)                                    # body
    c.poly([(800, 290), (900, 290), (1010, 480), (1010, 690), (800, 690)], NAVY)
    c.rect((960, 470, 1012, 690), NAVY, 26)
    c.poly([(845, 320), (905, 320), (985, 470), (845, 470)], (190, 214, 230))  # windshield
    c.poly([(860, 335), (895, 335), (960, 455), (900, 455)], (222, 236, 244))
    c.rect((200, 560, 1012, 600), COPPER)                                     # stripe
    c.rect((980, 600, 1016, 640), COPPER_L, 8)                                # headlight
    c.rect((250, 330, 760, 520), (30, 62, 94), 22)                            # side panel
    droplet(c, 330, 425, 46, WHITE, COPPER_L)
    c.text((400, 380), 'NORTHWIND', font(ARCHIVO, 58, wght=850, wdth=100), WHITE)
    c.text((404, 452), 'PLUMBING', font(ARCHIVO, 24, wght=650, wdth=110), COPPER_L, spacing=7)
    c.rect((860, 520, 905, 530), (12, 28, 44), 4)                             # handle
    for x in (360, 860):                                                      # wheels
        c.ellipse((x - 72, 618, x + 72, 762), (24, 26, 30))
        c.ellipse((x - 36, 654, x + 36, 726), STEEL)
        c.ellipse((x - 12, 678, x + 12, 702), STEEL_D)
    c.save(path)


def tech(path):
    c = Canvas(900, 1100, (239, 233, 222))
    c.ellipse((90, 160, 810, 880), SKY)
    c.rect((0, 900, 900, 1100), (226, 219, 206))
    c.blob_shadow((230, 950, 670, 1010), 60)
    c.rect((300, 560, 600, 980), NAVY, 60)                                    # body
    c.rect((322, 960, 432, 990), INK, 14); c.rect((468, 960, 578, 990), INK, 14)   # boots
    c.rect((446, 600, 454, 960), DEEP)                                        # seam
    c.rect((330, 620, 420, 690), (30, 62, 94), 12)                            # pocket
    droplet(c, 375, 657, 20, WHITE, COPPER_L)
    c.rect((250, 570, 320, 820), NAVY, 34)                                    # arms
    c.rect((580, 570, 650, 760), NAVY, 34)
    c.ellipse((250, 800, 320, 860), SKIN); c.ellipse((585, 740, 655, 800), SKIN)
    c.rect((612, 640, 640, 790), STEEL_D, 12)                                 # wrench
    c.ellipse((594, 600, 658, 664), STEEL_D); c.ellipse((612, 610, 640, 640), SKY)
    c.rect((415, 500, 485, 570), SKIN, 20)                                    # neck
    c.ellipse((360, 330, 540, 520), SKIN)                                     # head (no face: an illustration)
    c.poly([(352, 420), (548, 420), (540, 360), (450, 315), (360, 360)], COPPER)   # cap
    c.rect((352, 405, 600, 432), COPPER, 12)
    c.ellipse((436, 340, 464, 368), COPPER_L)
    c.save(path)


def sink(path):
    c = Canvas(1200, 900, (241, 236, 228))
    c.rect((0, 0, 1200, 300), (226, 233, 236))
    for x in range(0, 1200, 120):                                             # tiles
        for y in range(0, 300, 60):
            c.rect((x + 2, y + 2, x + 118, y + 58), (235, 241, 243), 4)
    c.rect((160, 280, 1040, 320), (200, 186, 166), 6)                         # counter
    c.rect((200, 320, 1000, 860), (184, 140, 98), 18)                         # cabinet
    c.rect((230, 350, 970, 840), (58, 46, 40), 12)                            # open inside
    c.rect((560, 310, 640, 380), STEEL, 10)                                   # drain
    c.rect((585, 380, 615, 520), STEEL, 10)
    c.arc((545, 450, 705, 610), 0, 180, STEEL, 30)                            # p-trap
    c.rect((660, 420, 690, 530), STEEL, 10)
    c.rect((660, 420, 930, 450), STEEL, 10)
    c.rect((300, 330, 324, 700), COPPER, 8); c.rect((360, 330, 384, 700), COPPER, 8)   # supply lines
    c.ellipse((288, 600, 336, 648), (200, 60, 50)); c.ellipse((348, 600, 396, 648), (60, 110, 200))
    droplet(c, 640, 690, 22, WATER)
    c.rect((700, 720, 930, 820), COPPER, 14)                                  # toolbox
    c.rect((760, 700, 870, 724), DEEP, 8)
    c.rect((700, 760, 930, 772), (190, 110, 36))
    c.rect((420, 780, 640, 800), STEEL_D, 8)                                  # wrench
    c.ellipse((400, 766, 448, 814), STEEL_D); c.ellipse((412, 778, 436, 802), (58, 46, 40))
    c.save(path)


def heater(path):
    c = Canvas(1200, 900, (234, 238, 240))
    c.rect((0, 760, 1200, 900), (214, 208, 198))
    c.blob_shadow((420, 740, 780, 800), 70)
    c.rect((470, 120, 500, 240), COPPER, 8); c.rect((700, 120, 730, 240), COPPER, 8)   # pipes
    c.rect((470, 110, 1200, 140), COPPER, 8); c.rect((0, 150, 500, 180), COPPER, 8)
    c.rect((440, 220, 760, 760), (246, 246, 244), 60)                         # tank
    c.rect((440, 220, 760, 300), (228, 230, 230), 40)
    c.rect((440, 690, 760, 760), (210, 214, 216), 30)
    c.rect((520, 360, 680, 520), NAVY, 20)                                    # label
    droplet(c, 600, 430, 34, WHITE, COPPER_L)
    c.ellipse((560, 560, 640, 640), WHITE, outline=SLATE, width=6)            # gauge
    c.line([(600, 600), (622, 578)], (200, 60, 50), 5)
    c.rect((760, 600, 830, 620), STEEL_D, 6)                                  # valve
    for x, y in [(200, 640), (260, 700), (980, 640)]:
        droplet(c, x, y, 16, WATER)
    c.save(path)


def static_map(path):
    c = Canvas(1200, 700, (236, 240, 233))
    for xy in [(40, 60, 300, 260), (820, 420, 1120, 660), (500, 500, 700, 640)]:
        c.rect(xy, (213, 230, 204), 40)                                        # parks
    c.line([(0, 470), (200, 420), (420, 470), (640, 380), (900, 430), (1200, 330)], WATER, 34, curve=True)   # river
    for pts in [[(0, 200), (1200, 260)], [(0, 600), (1200, 520)], [(300, 0), (360, 700)], [(760, 0), (700, 700)], [(1050, 0), (980, 700)], [(0, 340), (520, 0)]]:
        c.line(pts, (210, 212, 206), 22); c.line(pts, WHITE, 16)
    c.line([(0, 120), (1200, 150)], (246, 214, 160), 26); c.line([(0, 120), (1200, 150)], (252, 232, 196), 18)   # highway
    area = Image.new('RGBA', c.im.size, (0, 0, 0, 0))
    ImageDraw.Draw(area).ellipse([v * S for v in (330, 70, 890, 630)], fill=COPPER + (46,), outline=COPPER + (180,), width=4 * S)
    c.im.alpha_composite(area)
    droplet(c, 610, 330, 30, NAVY)
    c.ellipse((598, 318, 622, 342), WHITE)
    c.save(path)


def logo(path, light=False):
    c = Canvas(760, 200, (0, 0, 0, 0))
    droplet(c, 86, 112, 52, (WHITE if light else NAVY), COPPER)
    c.text((168, 44), 'NORTHWIND', font(ARCHIVO, 70, wght=850, wdth=100), WHITE if light else NAVY)
    c.text((172, 132), 'PLUMBING', font(ARCHIVO, 30, wght=650, wdth=112), COPPER_L if light else COPPER, spacing=10)
    c.save(path)


def agency_logo(path):
    c = Canvas(520, 120, (0, 0, 0, 0))
    c.rect((8, 14, 100, 106), (47, 93, 80), 24)
    c.rect((38, 38, 48, 84), WHITE, 3); c.rect((38, 38, 74, 48), WHITE, 3); c.rect((38, 57, 66, 66), WHITE, 3)
    c.text((122, 60), 'Fieldwork Studio', font(INTER, 40, wght=650), INK, anchor='lm')
    c.save(path)


def shots():
    sys.path.insert(0, str(HERE.parent.parent / 'python'))
    import capture
    old = HERE / 'old-site'
    ev = SHOTS / 'evidence'
    jobs = [
        (lambda: capture.shot_site(str(old / 'index.html'), str(SHOTS / 'current-site.png'))),
        (lambda: capture.shot_text(str(old / 'contact.html'), 'Failed to connect to mailserver', str(ev / '1-quote-form-error.png'), height=300)),
        (lambda: capture.shot_site(str(old / 'index.html'), str(ev / '2-newsletter-popup.png'), keep_popups=True)),
        (lambda: capture.shot_site(str(old / 'services.html'), str(ev / '3-under-construction.png'))),
    ]
    for j in jobs:
        out = pathlib.Path(j()['out'])
        im = Image.open(out).convert('RGB')
        if im.width > 1440:                     # keep the repo small: 1440 px wide is plenty for print
            im = im.resize((1440, round(im.height * 1440 / im.width)), Image.LANCZOS)
        im.save(out, optimize=True)
        print('wrote', out.relative_to(HERE.parent.parent), f'{out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    van(ASSETS / 'van.jpg')
    tech(ASSETS / 'technician.jpg')
    sink(ASSETS / 'under-sink.jpg')
    heater(ASSETS / 'water-heater.jpg')
    static_map(ASSETS / 'service-area-map.png')
    logo(ASSETS / 'logo.png')
    logo(ASSETS / 'logo-light.png', light=True)
    agency_logo(HERE / 'agency-logo.png')
    if '--no-shots' not in sys.argv:
        shots()
