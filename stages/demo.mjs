// `l2p demo [--out <folder>] [--no-render]`: the whole pipeline, offline, on fictional businesses.
// Serves the demo websites from 127.0.0.1 (one port per site, so each is its own "domain"),
// then runs collect → merge → enrich → score → export → proposals queue, and renders the sample package.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { PLUGIN, loadProject, logRun } from '../lib/project.mjs';
import { python, runPython } from '../lib/python.mjs';
import { readJSON, writeJSON, load, log, fail } from '../lib/io.mjs';

const DEMO = path.join(PLUGIN, 'examples', 'demo');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain', '.xml': 'application/xml' };

function serve(dir) {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
    const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>Not found</h1>'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true });

export async function run(_project, args) {
  const out = path.resolve(args.out && args.out !== true ? args.out : 'l2p-demo');
  if (fs.existsSync(out) && fs.readdirSync(out).length && !args.force) fail(`${out} is not empty. Use --out <new folder> or --force.`);
  fs.mkdirSync(out, { recursive: true });

  const servers = {};
  for (const name of fs.readdirSync(path.join(DEMO, 'sites'))) servers[name] = await serve(path.join(DEMO, 'sites', name));
  try {
    const cfg = readJSON(path.join(DEMO, 'project.json'));
    writeJSON(path.join(out, 'project.json'), cfg);
    const csv = fs.readFileSync(path.join(DEMO, 'leads.csv'), 'utf8')
      .replace(/\{\{([\w-]+)\}\}/g, (_, n) => servers[n] ? `http://127.0.0.1:${servers[n].address().port}/` : '');
    fs.writeFileSync(path.join(out, 'leads.csv'), csv);
    for (const d of ['data/raw', 'out', 'proposals']) fs.mkdirSync(path.join(out, d), { recursive: true });

    const project = loadProject(out);
    const stage = async (name, a = {}) => {
      log(`\n── ${name} ${'─'.repeat(Math.max(0, 50 - name.length))}`);
      const mod = await import(path.join(PLUGIN, 'stages', `${name}.mjs`));
      const t0 = Date.now();
      const r = await mod.run(project, { _: [], ...a });
      logRun(project, { stage: name, demo: true, ms: Date.now() - t0, ...(r?.log || {}) });
      return r;
    };

    await stage('collect');
    await stage('merge');
    await stage('enrich');
    await stage('score');

    const py = python();
    if (py) { log('\n── export'); runPython('export_xlsx.py', [out]); }
    else log('\n(skipped export: Python 3.10+ with openpyxl not found)');

    await stage('proposals', { _: ['queue'], limit: '3' });

    // The sample package is pre-written (by a person or Claude, as in real use); render + QA it here.
    const sample = path.join(DEMO, 'package');
    let pkg = null;
    if (fs.existsSync(sample)) {
      const job = load(path.join(sample, 'job.json'), {});
      pkg = path.join(project.paths.proposals, job.folder || 'Northwind Plumbing');
      copyDir(sample, pkg);
      // The sample job points at the agency logo next to it; keep that file reachable from the copy.
      const logo = path.join(DEMO, 'agency-logo.png');
      if (fs.existsSync(logo)) {
        fs.copyFileSync(logo, path.join(out, 'agency-logo.png'));
        const jf = path.join(pkg, 'job.json'), j = readJSON(jf);
        if (j.agency) { j.agency.logo = path.join(out, 'agency-logo.png'); writeJSON(jf, j); }
      }
      if (py && !args.noRender) {
        log('\n── render sample package');
        runPython('render.py', [pkg]);
        runPython('qa.py', [pkg]);
        writeJSON(path.join(pkg, 'status.json'), { stage: 'done', updated: new Date().toISOString(), attempts: 0, note: 'demo sample, rendered and QA passed' });
      }
    }

    log(`\nDemo finished in ${out}`);
    log(`  workbook   ${path.join(out, 'out', 'leads.xlsx')}`);
    if (pkg) for (const f of fs.readdirSync(pkg).filter(f => f.endsWith('.pdf'))) log(`  pdf        ${path.join(pkg, f)}`);
    log('Everything here is fictional. Nothing was fetched from the internet.');
    return { log: { out } };
  } finally {
    for (const s of Object.values(servers)) s.close();
  }
}
