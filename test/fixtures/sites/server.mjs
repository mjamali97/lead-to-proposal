// Serves a fixture site folder on 127.0.0.1 for tests (no network). Not a test file itself.
//   const s = await serveSite('modern'); s.url → 'http://127.0.0.1:PORT/'; s.hits → paths requested; await s.close()
// Folder layout: index.html = "/", about.html = "/about/" or "/about", files served as-is.
// Optional _routes.json: { "/path": { "status": 503, "body": "...", "location": "/x", "delay": 5000, "type": "text/html" } }
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { internalLinks } from '../../../lib/site.mjs';

export const FIXTURES = import.meta.dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.txt': 'text/plain', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

export function serveSite(name, { routes = {} } = {}) {
  const dir = path.join(FIXTURES, name);
  const fileRoutes = fs.existsSync(path.join(dir, '_routes.json')) ? JSON.parse(fs.readFileSync(path.join(dir, '_routes.json'), 'utf8')) : {};
  const all = { ...fileRoutes, ...routes };
  const hits = [];
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    hits.push(p);
    const r = all[p];
    if (r) {
      if (r.delay) return setTimeout(() => res.end(''), r.delay);
      res.writeHead(r.status || 200, { 'content-type': r.type || 'text/html; charset=utf-8', ...(r.location && { location: r.location }) });
      return res.end(r.body || '');
    }
    const clean = p.replace(/\/+$/, '') || '/index';
    const cands = [clean, `${clean}.html`, `${clean}/index.html`].map(c => path.join(dir, c));
    const f = cands.find(c => c.startsWith(dir) && fs.existsSync(c) && fs.statSync(c).isFile() && !path.basename(c).startsWith('_'));
    if (!f) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>Not found</h1>'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? '' : fs.readFileSync(f));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    resolve({ url, hits, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) });
  }));
}

// A crawl-shaped record straight from fixture files, for pure tests (SEO, brand) with a chosen public URL.
export function fixtureCrawl(name, { url = 'https://fixture.example/', pages = {}, stylesheets = [], robots = null, sitemap = { ok: false, locs: 0 } } = {}) {
  const dir = path.join(FIXTURES, name);
  const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const home = read('index.html');
  return {
    url, key: new URL(url).hostname, final_url: url, status: 200, ok: true, state: 'ok', state_detail: '', country: 'US',
    home: { url, status: 200, body: home, bytes: home.length, headers: null },
    pages: [{ url, status: 200, kind: 'home', body: home }, ...Object.entries(pages).map(([kind, f]) => ({ url: new URL(f.replace(/\.html$/, '/'), url).href, status: 200, kind, body: read(f) }))],
    skipped: [], robots, sitemap, internal_links: internalLinks(home, url), links_checked: [],
    stylesheets: stylesheets.map(f => ({ url: new URL(f, url).href, body: read(f) })), assets: {},
  };
}
