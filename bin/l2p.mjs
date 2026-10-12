#!/usr/bin/env node
// lead-to-proposal command line. `l2p help` lists commands.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, UserError } from '../lib/io.mjs';
import { loadProject, initProject, PLUGIN, logRun } from '../lib/project.mjs';
import { python, runPython } from '../lib/python.mjs';

const HELP = `lead-to-proposal (l2p)

  l2p init <folder>                 create a project folder with project.json and .env
  l2p doctor                        check Node, Python, Playwright, Chromium and your Apify token

  l2p collect [--source <type|name>] [--go] [--limit N] [--fresh]
                                    gather listings (Google Maps is paid: dry run unless --go)
  l2p collect --source google_maps --reviews 5 [--min-reviews 30 --min-rating 4] [--go]
                                    buy a few reviews for the Google Maps shortlist only
  l2p merge                         normalise, keep the area, merge duplicates
  l2p google [--go] [--budget USD] [--limit N] [--batch N]
                                    look up non-Google businesses on Google Maps (paid)
  l2p enrich [--limit N] [--only <url>] [--refresh] [--wayback]
                                    crawl each website once: audit, SEO, contacts, owner, brand
  l2p score                         need, interest, priority, tier, disqualify
  l2p export                        write out/leads.xlsx
  l2p status                        counts per stage and money spent

  l2p proposals queue [--tiers A,B] [--limit N] [--only <id>]
  l2p proposals run [--concurrency N]   build queued packages with headless Claude
  l2p proposals render <package-dir>    screenshots + PDFs for one package
  l2p proposals qa <package-dir>        check one package
  l2p proposals status

  l2p queue [--n 20] [--tier A,B] [--group trades]   this week's outreach list (never sends anything)
  l2p queue --due                   follow-ups and booked demos due today
  l2p queue --sent <id> --channel phone|whatsapp|telegram|sms|email|walk-in|dm [--note ".."]
  l2p queue --replied <id> | --booked <id> --at <ISO> | --won <id> | --lost <id> --reason ".."
  l2p queue --stop <email|phone|id>  one-way: never contact again
  l2p demo [--out <folder>]         run the whole pipeline offline on fictional data

Global: --project <folder> (default: nearest folder with project.json)
`;

const STAGES = {
  collect: 'collect', merge: 'merge', google: 'google', enrich: 'enrich', score: 'score',
  proposals: 'proposals', queue: 'queue', status: 'status', demo: 'demo',
};

function doctor(args) {
  const rows = [];
  const ok = (name, pass, detail) => rows.push(`${pass ? 'ok  ' : 'FIX '} ${name}${detail ? `  ${detail}` : ''}`);
  const [maj] = process.versions.node.split('.').map(Number);
  ok('Node >= 20', maj >= 20, process.version);
  const py = python();
  ok('Python >= 3.10', !!py, py || 'not found (set L2P_PYTHON)');
  if (py) {
    for (const mod of ['openpyxl', 'playwright', 'PIL']) {
      const r = spawnSync(py, ['-c', `import ${mod}`]);
      ok(`python: ${mod === 'PIL' ? 'Pillow' : mod}`, r.status === 0, r.status === 0 ? '' : `pip install -r ${path.join(PLUGIN, 'requirements.txt')}`);
    }
    const r = spawnSync(py, ['-c', 'from playwright.sync_api import sync_playwright\nwith sync_playwright() as p:\n  b=p.chromium.launch(); b.close()'], { encoding: 'utf8' });
    ok('Chromium for Playwright', r.status === 0, r.status === 0 ? '' : `${py} -m playwright install chromium`);
  }
  let project = null;
  try { project = loadProject(args.project); } catch { /* optional */ }
  if (project) {
    const paid = project.config.sources.some(s => s.type === 'google_maps' && s.enabled !== false) || project.config.google_lookup?.enabled;
    ok('project.json', true, project.dir);
    ok('APIFY_TOKEN', !paid || !!project.env.APIFY_TOKEN, paid ? (project.env.APIFY_TOKEN ? 'set' : 'needed for Google Maps: put it in .env') : 'not needed (no paid source enabled)');
  } else ok('project.json', true, 'none here yet (run `l2p init <folder>`)');
  console.log(rows.join('\n'));
  if (rows.some(r => r.startsWith('FIX'))) process.exitCode = 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return console.log(HELP);
  if (cmd === 'init') {
    if (!args._[0]) throw new UserError('Usage: l2p init <folder>');
    const r = initProject(args._[0], { name: args.name });
    return console.log(`Created ${r.dir}\nNext: edit project.json (or ask Claude to fill it in), then \`l2p doctor\`.`);
  }
  if (cmd === 'doctor') return doctor(args);
  if (cmd === 'export') {
    const project = loadProject(args.project);
    runPython('export_xlsx.py', [project.dir]);
    return logRun(project, { stage: 'export' });
  }
  const mod = STAGES[cmd];
  if (!mod) throw new UserError(`Unknown command "${cmd}". Run \`l2p help\`.`);
  const file = path.join(PLUGIN, 'stages', `${mod}.mjs`);
  if (!fs.existsSync(file)) throw new UserError(`Stage "${cmd}" is not installed (${file} missing).`);
  const stage = await import(file);
  // `proposals render|qa <package>` works on any package folder, inside a project or not.
  const standalone = cmd === 'demo' || (cmd === 'proposals' && ['render', 'qa'].includes(args._[0]) && !args.project);
  const project = standalone ? null : loadProject(args.project);
  const t0 = Date.now();
  const result = await stage.run(project, args);
  if (project && cmd !== 'status') logRun(project, { stage: cmd, args: Object.fromEntries(Object.entries(args).filter(([k]) => k !== '_')), ms: Date.now() - t0, ...(result?.log || {}) });
}

main().catch(e => {
  if (e instanceof UserError) { console.error(e.message); process.exit(2); }
  console.error(e); process.exit(1);
});
