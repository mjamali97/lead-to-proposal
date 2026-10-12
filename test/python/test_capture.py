"""python/capture.py against local fixtures served from 127.0.0.1 (no internet)."""
import functools
import http.server
import subprocess
import sys
import threading
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'python' / 'capture.py'
FIX = ROOT / 'test' / 'fixtures' / 'capture'


@pytest.fixture(scope='module')
def server():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(FIX))
    handler.log_message = lambda *a, **k: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f'http://127.0.0.1:{httpd.server_port}'
    httpd.shutdown()


def capture(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True, timeout=120)


def px(path, x, y):
    im = Image.open(path).convert('RGB')
    return im.getpixel((int(x * im.width), int(y * im.height)))


def is_red(c):
    return c[0] > 200 and c[1] < 60 and c[2] < 60


def is_blue(c):
    return c[2] > 200 and c[0] < 60 and c[1] < 60


def test_popups_and_cookie_bar_removed(server, tmp_path):
    out = tmp_path / 'site.png'
    r = capture('site', f'{server}/popup.html', out)
    assert r.returncode == 0, r.stdout + r.stderr
    assert 'pop-ups removed: ' in r.stdout and 'pop-ups removed: 0' not in r.stdout
    assert not is_red(px(out, 0.5, 0.5)), 'the full-screen pop-up is still there'
    assert not is_blue(px(out, 0.5, 0.97)), 'the cookie bar is still there'
    assert px(out, 0.5, 0.02)[1] > 60, 'the sticky header must stay'


def test_keep_popups_when_the_popup_is_the_point(server, tmp_path):
    out = tmp_path / 'kept.png'
    r = capture('site', f'{server}/popup.html', out, '--keep-popups')
    assert r.returncode == 0, r.stdout + r.stderr
    assert is_red(px(out, 0.08, 0.5))


def test_mobile_is_phone_resolution(server, tmp_path):
    out = tmp_path / 'm.png'
    assert capture('site', f'{server}/popup.html', out, '--mobile').returncode == 0
    assert Image.open(out).size == (1170, 2532)


def test_text_strip_is_full_width_and_centred_on_the_text(server, tmp_path):
    out = tmp_path / 'strip.png'
    r = capture('text', f'{server}/long.html', 'licensed and insured', out, '--height', '300')
    assert r.returncode == 0, r.stdout + r.stderr
    im = Image.open(out).convert('RGB')
    assert im.size == (int(1440 * 1.5), int(300 * 1.5)), 'strips are never cropped at the sides'
    yellow = [y for y in range(im.height) if im.getpixel((40, y))[0] > 230 and im.getpixel((40, y))[2] < 120]
    assert yellow and abs((yellow[0] + yellow[-1]) / 2 - im.height / 2) < im.height * 0.2


def test_text_not_found_fails_cleanly(server, tmp_path):
    r = capture('text', f'{server}/long.html', 'this text is nowhere', tmp_path / 'x.png')
    assert r.returncode == 1 and 'text not found' in r.stdout


def test_html_and_fetch(server, tmp_path):
    page = tmp_path / 'mark.html'
    page.write_text('<div class="mark" style="font:700 40px Arial;padding:10px;display:inline-block">Acme</div>')
    out = tmp_path / 'mark.png'
    r = capture('html', page, out, '--selector', '.mark', '--transparent')
    assert r.returncode == 0, r.stdout + r.stderr
    im = Image.open(out)
    assert im.mode == 'RGBA' and im.getpixel((0, 0))[3] == 0
    got = tmp_path / 'logo.png'
    r = capture('fetch', f'{server}/logo.png', got)
    assert r.returncode == 0 and '64x40' in r.stdout
    r = capture('fetch', f'{server}/long.html', tmp_path / 'not-an-image.png')
    assert r.returncode == 1 and 'not an image' in r.stdout
