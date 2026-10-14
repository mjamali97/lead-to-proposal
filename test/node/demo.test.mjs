import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../../lib/project.mjs';
import { readJSON } from '../../lib/io.mjs';
import * as demo from '../../stages/demo.mjs';
import * as queue from '../../stages/queue.mjs';

const quiet = async fn => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };

test('demo: the sample package belongs to the merged Northwind business, so the queue finds it', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'l2p-demo-')), 'demo');
  await quiet(() => demo.run(null, { _: [], out, noRender: true }));
  const project = loadProject(out);
  const nw = readJSON(project.paths.businesses).items.find(b => b.names.includes('Northwind Plumbing'));
  const job = readJSON(path.join(project.paths.proposals, 'Northwind Plumbing', 'job.json'));
  assert.equal(job.id, nw.id);
  assert.equal(job.business.id, nw.id);
  const r = await quiet(() => queue.run(project, { _: [], n: 20, today: '2026-10-12' }));
  const item = r.items.find(i => i.id === nw.id);
  assert.ok(item, 'Northwind is in the queue');
  assert.equal(item.package_dir, path.join('proposals', 'Northwind Plumbing'));
});
