#!/usr/bin/env python3
"""Prove the proposal template cannot overflow with valid data.

  stress_test.py [--keep]

Copies the demo package, fills every text field in templates/proposal/limits.json to its maximum length
(and every list to its maximum and minimum size), renders the proposal on Letter and A4, and fails if
render.py reports any layout issue (text off the page, into the footer, clipped, spilling out of a box,
boxes overlapping, images not loading). Run it after changing proposal.mjs or limits.json.

The landing-page screenshots the proposal shows are build outputs (git-ignored). On a fresh clone they are
missing, so the copy is rendered once in full (render.py makes them from landing-page/index.html, offline)
before the stress runs.
"""
import copy, json, pathlib, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
PLUGIN = HERE.parent
DEMO = PLUGIN / 'examples' / 'demo'
sys.path.insert(0, str(HERE))
import qa  # noqa: E402

WORDS = ('Family owned plumbing heating cooling crew serving homeowners across Greater Riverside with Weekend '
         'emergency visits Master licensed technicians Workmanship guaranteed Upfront pricing every booking '
         'Measured Wellbeing Maintenance Warranty Midtown Westbrook').split()
TOKEN_FIELDS = ('website', 'url', 'current_url', 'email')


def filler(n, token=False):
    if token:
        return ('www.' + 'westbrook-mechanical-services' * 3)[:n - 4] + '.com'
    out, i = '', 0
    while True:
        w = WORDS[i % len(WORDS)]; i += 1
        nxt = (out + ' ' + w).strip()
        if len(nxt) > n:
            break
        out = nxt
    return (out + ' ' + 'W' * n)[:n].rstrip() if len(out) < n - 2 else out


def set_path(node, parts, n, key=''):
    tok = parts[0]
    arr = tok.endswith('[]')
    k = tok[:-2] if arr else tok
    if not isinstance(node, dict) or k not in node:
        return
    if len(parts) == 1:
        if arr and isinstance(node[k], list):
            node[k] = [filler(n) if isinstance(x, str) else x for x in node[k]]
        elif isinstance(node[k], str):
            node[k] = filler(n, token=k in TOKEN_FIELDS)
        return
    for child in (node[k] if arr else [node[k]]):
        set_path(child, parts[1:], n)


def resize(lst, size):
    while len(lst) < size:
        lst.append(copy.deepcopy(lst[len(lst) % max(1, len(lst))]))
    del lst[size:]


def variant(data, job, kind):
    d, j = copy.deepcopy(data), copy.deepcopy(job)
    S = d['sales']
    lim = json.loads((PLUGIN / 'templates' / 'proposal' / 'limits.json').read_text())
    sizes = {'max': 1, 'min': 0}.get(kind)
    for path, (lo, hi) in lim['counts'].items():
        if '[]' in path:
            continue
        root = j if path.startswith('offer.') else d
        node = root
        *head, last = path.split('.')
        for h in head:
            node = node.setdefault(h, {})
        if last not in node:
            if last == 'plans':
                node[last] = copy.deepcopy(job['offer']['plans'])
            elif last == 'stats':
                node[last] = copy.deepcopy(data['sales'].get('stats') or [data['sales']['fact']])
            else:
                continue
        n = hi if sizes == 1 else lo if sizes == 0 else {'evidence': int(kind[-1]), 'plans': 2, 'stats': 1, 'markers': 4}.get(last, hi)
        resize(node[last], n)
    for p in S.get('plans', []) + j['offer']['plans']:
        resize(p['items'], 5 if kind == 'max' else 1)
    # sales.plans must mirror the offer (names, prices)
    S['plans'] = [dict(copy.deepcopy(p), items=list(p['items'])) for p in j['offer']['plans']]
    ctx = dict(d, agency=j['agency'], offer=j['offer'])
    for path, n in lim['chars'].items():
        if path in ('sales.fact.number', 'sales.stats[].number'):
            continue
        set_path(ctx, path.split('.'), n)
    # Prices at the limit: a right-to-left one in Persian digits (max) and a long Latin one (ev3).
    long_price = {'max': '۱۲۵٬۵۰۰٬۰۰۰ تومان ماهانه', 'ev3': 'US$12,500.00 one payment'}.get(kind, '$12,500.00')
    assert len(long_price) <= lim['chars']['offer.plans[].price']
    for p in S['plans'] + j['offer']['plans']:
        p['price'] = long_price
    for i, p in enumerate(S['plans']):
        p['name'], p['tag'], p['price'] = j['offer']['plans'][i]['name'], j['offer']['plans'][i].get('tag', ''), j['offer']['plans'][i]['price']
    S['fact']['number'] = 'US$1,234'
    for s in S.get('stats', []):
        s['number'] = '100.0%'
    if S.get('seo_big'):
        S['seo_big'][-1] = {'text': filler(lim['chars']['sales.seo_big[].text']), 'good': True}
    S['markers'] = [{'x': x, 'y': y, 'label': m['label']} for (x, y), m in zip([(8, 12), (40, 50), (70, 30), (92, 88)], S['markers'])]
    if kind == 'min':
        S.pop('cover_sub', None)
        S['fact'].pop('text2', None)
        d['seo']['score'] = None
        for c in d['seo']['categories']:
            c['score'] = 100 if c['score'] >= 50 else 0
    return d, j


def main(argv):
    base = pathlib.Path(tempfile.mkdtemp(prefix='l2p-stress-'))
    pkg = base / 'Stress Test'
    shutil.copytree(DEMO / 'package', pkg)
    shutil.copy(DEMO / 'agency-logo.png', base / 'agency-logo.png')
    data = json.loads((pkg / 'proposal-data.json').read_text())
    job = json.loads((pkg / 'job.json').read_text())
    failed = 0
    missing = [p for p in (data.get('landing') or {}).values() if isinstance(p, str) and p.endswith('.png') and not (pkg / p).exists()]
    if missing:
        print(f'making {len(missing)} missing screenshot(s) first: {", ".join(pathlib.Path(p).name for p in missing)}')
        r = subprocess.run([sys.executable, str(HERE / 'render.py'), str(pkg)], capture_output=True, text=True)
        still = [p for p in missing if not (pkg / p).exists()]
        if r.returncode or still:
            print('could not make them (is Playwright with Chromium installed? `l2p doctor`):', (r.stdout + r.stderr)[-600:])
            shutil.rmtree(base, ignore_errors=True)
            print('STRESS TEST FAILED (setup)')
            return 1
    for kind in ('max', 'min', 'ev2', 'ev3'):
        d, j = variant(data, job, kind)
        probs = qa.check_limits(d, j)
        if probs:
            print(f'[{kind}] stress data breaks its own limits (test bug):', probs[:3]); failed += 1; continue
        for paper in ('Letter', 'A4'):
            j['market']['paper'] = paper
            (pkg / 'proposal-data.json').write_text(json.dumps(d, ensure_ascii=False, indent=1))
            (pkg / 'job.json').write_text(json.dumps(j, ensure_ascii=False, indent=1))
            r = subprocess.run([sys.executable, str(HERE / 'render.py'), str(pkg), '--proposal-only'], capture_output=True, text=True)
            rep = json.loads((pkg / 'proposal' / 'layout-report.json').read_text()) if r.returncode == 0 else {'issues': [{'page': 0, 'issue': r.stdout + r.stderr, 'el': ''}], 'pages': 0}
            bad = rep['issues'] + ([{'page': 0, 'issue': f'{rep["pages"]} pages', 'el': ''}] if rep['pages'] != qa.PAGES else [])
            print(f'[{kind:>3} {paper:<6}] {"ok" if not bad else f"{len(bad)} issue(s)"}')
            for it in bad[:12]:
                print(f"    page {it['page']}: {it['issue'][:300]} {it.get('el', '')[:80]} {it.get('by_px', '')}")
            failed += bool(bad)
            if bad and '--keep' in argv:
                keep = base / f'failed-{kind}-{paper}'
                shutil.copytree(pkg / 'proposal', keep)
    if '--keep' not in argv:
        shutil.rmtree(base, ignore_errors=True)
    else:
        print('kept', base)
    print('STRESS TEST', 'PASSED' if not failed else f'FAILED ({failed})')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
