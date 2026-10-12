#!/usr/bin/env node
// Fails if the repo contains things that must never be published:
// tokens, local paths, real-looking phone numbers or emails outside the fictional ranges,
// and any term in an optional, git-ignored `.privacy-denylist` (one term per line).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIR = /(^|\/)(\.git|node_modules|\.venv|__pycache__|\.pytest_cache|demo-output|test\/\.tmp)(\/|$)/;
const TEXT = /\.(m?js|py|json|md|html|css|csv|txt|yml|yaml|svg|toml|sh)$|(^|\/)(LICENSE|\.gitignore|\.env\.example)$/;
const NO_PHONE_CHECK = /^facts\//;   // citations contain long digit strings (DOIs, sample sizes)

let files;
try { files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
catch { files = walk(ROOT).map(f => path.relative(ROOT, f)); }
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => { const p = path.join(d, e.name); const rel = path.relative(ROOT, p); return SKIP_DIR.test(rel) ? [] : e.isDirectory() ? walk(p) : [p]; }); }

const deny = fs.existsSync(path.join(ROOT, '.privacy-denylist'))
  ? fs.readFileSync(path.join(ROOT, '.privacy-denylist'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')) : [];

const RULES = [
  ['API token', /\b(apify_api_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,})\b/],
  ['local path', /\/Users\/[A-Za-z0-9._-]+\/|C:\\Users\\[A-Za-z0-9._-]+\\/],
  ['email outside example domains', /\b[A-Za-z0-9._%+-]+@(?!(?:[a-z0-9-]+\.)*(?:example|test|invalid|localhost)\b)(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/],
];
// Fictional addresses at real consumer mail domains, used to test personal-mailbox handling.
const ALLOWED_EMAIL = /^(noreply@anthropic\.com|quillstone\.books@gmail\.com)$/i;
// NANP numbers must be in the fictional 555-01xx range; other formats with 10+ digits are flagged.
const PHONE = /(?<![\w.\/=-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{2,4}[\s.-]\d{3,4}(?![\w\/])/g;
const fictional = s => { const d = s.replace(/\D/g, ''); return /555(01\d\d)$/.test(d) || /^1?555\d{7}$/.test(d) || d.length < 10; };

const problems = [];
for (const rel of files) {
  if (SKIP_DIR.test(rel) || !TEXT.test(rel) || rel === 'scripts/privacy-scan.mjs') continue;
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [name, re] of RULES) {
      const m = line.match(re);
      if (m && !(name.startsWith('email') && ALLOWED_EMAIL.test(m[0]))) problems.push(`${rel}:${i + 1} ${name}: ${m[0]}`);
    }
    if (!NO_PHONE_CHECK.test(rel)) for (const m of line.matchAll(PHONE)) if (!fictional(m[0])) problems.push(`${rel}:${i + 1} phone outside the fictional 555-01xx range: ${m[0].trim()}`);
    for (const t of deny) if (line.toLowerCase().includes(t.toLowerCase())) problems.push(`${rel}:${i + 1} denylisted term`);
  });
}
if (problems.length) { console.error(`privacy scan: ${problems.length} problem(s)\n` + problems.slice(0, 200).join('\n')); process.exit(1); }
console.log(`privacy scan: ${files.length} files clean${deny.length ? ` (incl. ${deny.length} private terms)` : ''}`);
