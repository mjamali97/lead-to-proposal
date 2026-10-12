// Find a usable Python and run the scripts in python/.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { UserError } from './io.mjs';
import { PLUGIN } from './project.mjs';

export function python() {
  const cands = [process.env.L2P_PYTHON, path.join(PLUGIN, '.venv', 'bin', 'python'), 'python3', 'python'].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ['-c', 'import sys; print(sys.version_info[:2] >= (3, 10))'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === 'True') return c;
  }
  return null;
}

export function runPython(script, argv, { quiet = false } = {}) {
  const py = python();
  if (!py) throw new UserError('Python 3.10+ not found. Install it, or set L2P_PYTHON to its path.');
  const r = spawnSync(py, [path.join(PLUGIN, 'python', script), ...argv], { stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (r.status !== 0) throw new UserError(`${script} failed (exit ${r.status})${quiet ? `\n${r.stderr}` : ''}`);
  return r;
}

