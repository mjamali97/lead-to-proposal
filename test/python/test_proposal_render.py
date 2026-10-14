"""Render the fictional demo package (examples/demo/package) offline, then prove qa.py catches injected problems."""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PY = ROOT / 'python'
DEMO = ROOT / 'examples' / 'demo'
NAME = 'Northwind Plumbing'
sys.path.insert(0, str(PY))
import qa  # noqa: E402


def run(script, *args):
    return subprocess.run([sys.executable, str(PY / script), *map(str, args)], capture_output=True, text=True, timeout=600)


def copy_demo(dest):
    shutil.copytree(DEMO / 'package', dest / NAME, ignore=shutil.ignore_patterns('*.pdf', 'proposal'))
    shutil.copy(DEMO / 'agency-logo.png', dest / 'agency-logo.png')   # job.json: agency.logo = ../agency-logo.png
    return dest / NAME


@pytest.fixture(scope='module')
def rendered(tmp_path_factory):
    pkg = copy_demo(tmp_path_factory.mktemp('render'))
    r = run('render.py', pkg)
    assert r.returncode == 0, r.stdout + r.stderr
    return pkg


def test_render_outputs(rendered):
    pdf = rendered / f'{NAME} - Proposal.pdf'
    assert pdf.exists() and qa.pdf_pages(pdf) == 7
    assert qa.pdf_pages(rendered / f'{NAME} - Landing Page.pdf') == 1
    rep = json.loads((rendered / 'proposal' / 'layout-report.json').read_text())
    assert rep['pages'] == 7 and rep['issues'] == [], rep['issues']
    assert sorted(p.name for p in (rendered / 'proposal' / 'preview').glob('page-*.png')) == [f'page-{i}.png' for i in range(1, 8)]
    shots = rendered / 'landing-page' / 'screenshots'
    assert Image.open(shots / 'landing-desktop-fold.png').size == (2160, 1350)
    assert Image.open(shots / 'landing-mobile-fold.png').size == (780, 1688)
    assert Image.open(shots / 'landing-mobile-hires.png').size == (1170, 2532)
    assert Image.open(shots / 'landing-desktop-full.png').height > 3000
    html = (rendered / 'proposal' / 'proposal.html').read_text()
    assert 'Fieldwork Studio' in html and '$750' in html and '$1,500' in html, 'agency and prices come from job.json'
    assert 'size:Letter' in html


def test_demo_passes_qa(rendered):
    r = run('qa.py', rendered)
    assert r.returncode == 0 and 'QA PASSED' in r.stdout, r.stdout


def test_a4_render_is_clean(rendered, tmp_path):
    pkg = tmp_path / NAME
    shutil.copytree(rendered, pkg)
    shutil.copy(DEMO / 'agency-logo.png', tmp_path / 'agency-logo.png')
    job = json.loads((pkg / 'job.json').read_text())
    job['market']['paper'] = 'A4'
    (pkg / 'job.json').write_text(json.dumps(job))
    assert run('render.py', pkg, '--proposal-only').returncode == 0
    rep = json.loads((pkg / 'proposal' / 'layout-report.json').read_text())
    assert rep['paper'] == 'A4' and rep['pages'] == 7 and rep['issues'] == []
    box = re.search(rb'/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)', (pkg / f'{NAME} - Proposal.pdf').read_bytes())
    assert box and abs(float(box[1]) - 595) < 3 and abs(float(box[2]) - 842) < 3


# ---- qa.py must catch injected problems ----
def broken(rendered, tmp_path, change, job_change=None):
    pkg = tmp_path / NAME
    shutil.copytree(rendered, pkg)
    data = json.loads((pkg / 'proposal-data.json').read_text())
    change(data, pkg)
    (pkg / 'proposal-data.json').write_text(json.dumps(data, ensure_ascii=False))
    if job_change:
        job = json.loads((pkg / 'job.json').read_text())
        job_change(job)
        (pkg / 'job.json').write_text(json.dumps(job))
    r = run('qa.py', pkg, '--json')
    out = json.loads(r.stdout)
    assert r.returncode == 1 and not out['passed']
    return '\n'.join(out['problems'])


def test_qa_catches_over_limit_text(rendered, tmp_path):
    def ch(d, _): d['sales']['cover_headline'] = 'Since 2004 in Austin. ' + 'Online it still says 2016 and more words. ' * 3
    assert 'sales.cover_headline is' in broken(rendered, tmp_path, ch)


def test_qa_catches_jargon(rendered, tmp_path):
    def ch(d, _): d['sales']['after'][0] = 'Proper H1 and schema'
    assert 'jargon in sales.after[0]' in broken(rendered, tmp_path, ch)


def test_qa_catches_missing_evidence(rendered, tmp_path):
    def ch(d, pkg): (pkg / d['sales']['evidence'][1]['img']).unlink()
    assert 'sales.evidence[1].img: image missing' in broken(rendered, tmp_path, ch)


def test_qa_catches_overlapping_markers(rendered, tmp_path):
    def ch(d, _):
        d['sales']['markers'][1]['x'] = d['sales']['markers'][0]['x'] + 1
        d['sales']['markers'][1]['y'] = d['sales']['markers'][0]['y'] + 1
    assert 'markers 1 and 2 overlap' in broken(rendered, tmp_path, ch)


def test_qa_catches_marker_on_text(rendered, tmp_path):
    def ch(d, _): d['sales']['markers'][0].update(x=22, y=27)   # on the headline letters
    assert 'marker 1 sits on text' in broken(rendered, tmp_path, ch)


def test_qa_catches_wrong_price(rendered, tmp_path):
    def ch(d, _): d['sales']['fact']['text2'] = 'Your new page costs $999 once, and brings in leads every day.'
    assert 'price $999 is not in the offer' in broken(rendered, tmp_path, ch)

    def ch2(d, _):
        d['sales']['plans'] = json.loads((rendered / 'job.json').read_text())['offer']['plans']
        d['sales']['plans'][0]['price'] = '$650'
    second = tmp_path / 'second'
    second.mkdir()
    assert 'the offer says Launch $750' in broken(rendered, second, ch2)


def test_qa_catches_unsourced_numbers(rendered, tmp_path):
    def ch(d, _):
        d['sales']['leave'] = '53% of visitors close the tab.'
        d['sales']['stats'][0]['number'] = '61%'
        d['sales']['stats'][1]['fact_id'] = 'made-up-study'
    p = broken(rendered, tmp_path, ch)
    assert 'statistic outside the cited facts' in p and 'number 61% is not in fact' in p and 'made-up-study' in p


def test_qa_catches_formula_headline_wrong_name_and_other_business(rendered, tmp_path):
    def ch(d, pkg):
        d['sales']['cover_headline'] = 'Customers love you. Your website hides it.'
        d['business']['name'] = 'Northwind Plumbing & Drain'
        other = pkg.parent / 'Harbor Dental Care'
        other.mkdir()
        (other / 'job.json').write_text(json.dumps({'business': {'name': 'Harbor Dental Care'}}))
        d['sales']['journey_title'] = 'Like Harbor Dental Care'
    p = broken(rendered, tmp_path, ch)
    assert 'worn-out formula' in p and 'differs from job.json' in p and 'Harbor Dental Care' in p


def test_qa_checks_the_landing_page(rendered, tmp_path):
    def ch(d, pkg):
        f = pkg / 'landing-page' / 'index.html'
        html = f.read_text().replace('<h2>From a dripping', '<h1>From a dripping', 1)
        html = html.replace('alt="Map of the Northwind Plumbing service area around Austin"', '')
        html = html.replace('</main>', '<iframe src="https://maps.example/embed"></iframe></main>')
        f.write_text(html)
    p = broken(rendered, tmp_path, ch)
    assert 'exactly one <h1>' in p and 'without alt text' in p and '<iframe>' in p


def test_skip_json(rendered, tmp_path):
    pkg = tmp_path / NAME
    shutil.copytree(rendered, pkg)
    (pkg / 'skip.json').write_text(json.dumps({'reason': 'permanently closed', 'evidence': 'Google shows Permanently closed (fictional)'}))
    r = run('qa.py', pkg)
    assert r.returncode == 3 and 'SKIPPED: permanently closed' in r.stdout
    (pkg / 'skip.json').write_text(json.dumps({'reason': 'weak website'}))
    assert run('qa.py', pkg).returncode == 1


def test_limits_and_schema_helpers():
    data = json.loads((DEMO / 'package' / 'proposal-data.json').read_text())
    job = json.loads((DEMO / 'package' / 'job.json').read_text())
    schema = json.loads((ROOT / 'templates' / 'proposal' / 'schema.json').read_text())
    assert qa.validate(data, schema, schema) == []
    assert qa.check_limits(data, job) == []
    bad = json.loads(json.dumps(data))
    bad['sales']['values'] = bad['sales']['values'][:5]
    bad['sales']['markers'][0]['x'] = 140
    assert any('sales.values has 5 items' in p for p in qa.check_limits(bad, job))
    assert any('out of range' in e for e in qa.validate(bad, schema, schema))


def test_persian_prices_render_and_pass_qa(rendered, tmp_path):
    """Prices in Persian digits reach the cover, read right-to-left, fit their boxes and pass QA."""
    pkg = tmp_path / NAME
    shutil.copytree(rendered, pkg)
    shutil.copy(DEMO / 'agency-logo.png', tmp_path / 'agency-logo.png')
    job = json.loads((pkg / 'job.json').read_text())
    for p, price in zip(job['offer']['plans'], ['۱۸ میلیون تومان', '۳۲٬۵۰۰٬۰۰۰ تومان', 'توافقی']):
        p['price'] = price
    job['offer']['care_plan'] = '۹۰۰ هزار تومان ماهانه: میزبانی و ویرایش‌های کوچک'
    (pkg / 'job.json').write_text(json.dumps(job, ensure_ascii=False))
    data = json.loads((pkg / 'proposal-data.json').read_text())
    data['sales']['fact']['text2'] = 'صفحهٔ تازه‌تان یک‌بار 18 میلیون تومان است و هر روز مشتری می‌آورد.'
    (pkg / 'proposal-data.json').write_text(json.dumps(data, ensure_ascii=False))
    assert qa.check_limits(data, job) == []                       # 15 characters: within the price limit
    assert run('render.py', pkg, '--proposal-only').returncode == 0
    rep = json.loads((pkg / 'proposal' / 'layout-report.json').read_text())
    assert rep['issues'] == [], rep['issues']
    html = (pkg / 'proposal' / 'proposal.html').read_text()
    cover = html.split('class="ribbon"', 1)[1].split('</b>', 1)[0]
    assert '<bdi dir="rtl" class="n">۱۸ میلیون تومان</bdi>' in cover, 'the recommended price is on the cover, right-to-left'
    assert '<bdi dir="ltr" class="n">+1 512 555 0100</bdi>' in html, 'phones stay left-to-right'
    r = run('qa.py', pkg)
    assert r.returncode == 0 and 'QA PASSED' in r.stdout, r.stdout
    # A Persian price that is not in the offer is still caught.
    data['sales']['fact']['text2'] = 'صفحهٔ تازه‌تان فقط ۲۰ میلیون تومان است.'
    (pkg / 'proposal-data.json').write_text(json.dumps(data, ensure_ascii=False))
    out = json.loads(run('qa.py', pkg, '--json').stdout)
    assert any('price ۲۰ میلیون تومان is not in the offer' in p for p in out['problems']), out['problems']


def test_qa_reads_any_digits():
    assert qa.digits('۰۹۱۲ ۵۵۵ ۰۱۲۳') == '09125550123'
    assert qa.digits('٠٢١-٨٥٥٥٠١٢٣') == '02185550123'
    assert qa.MONEY.findall('فقط ۱۸ میلیون تومان، یا $750') == ['۱۸ میلیون تومان', '$750']
