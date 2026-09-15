// Serves a built app for the end-to-end run, on loopback only.
//
//   node scripts/serve-static.mjs --root <dir> --port <port> --mode expo|spa
//
// expo  the diner's `expo export --platform web` output. Expo Router writes one
//       HTML file per route, with dynamic segments kept in the file name
//       (`place/[placeId].html`), so `/place/<id>` is resolved to that file the way
//       a static host with rewrites would. Anything unmatched gets `index.html`.
// spa   the console's Vite build: a real file, or `index.html` for every route.
//
// It is a test fixture, not a production server: no caching, no compression, and
// it refuses any path that resolves outside the root.
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    port: { type: 'string' },
    host: { type: 'string', default: '127.0.0.1' },
    mode: { type: 'string', default: 'spa' },
  },
});

if (!values.root || !values.port) {
  console.error('serve-static: --root and --port are required.');
  process.exit(2);
}

const root = resolve(values.root);
const port = Number(values.port);
const mode = values.mode === 'expo' ? 'expo' : 'spa';

if (!existsSync(join(root, 'index.html'))) {
  console.error(`serve-static: ${root} has no index.html. Build the app first.`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const isDir = (path) => existsSync(path) && statSync(path).isDirectory();
const isFile = (path) => existsSync(path) && statSync(path).isFile();

/** Expo Router's file for a route, walking literal names before `[param]` ones. */
function expoRoute(dir, parts) {
  if (parts.length === 0) return isFile(join(dir, 'index.html')) ? join(dir, 'index.html') : null;

  const [head, ...rest] = parts;
  if (rest.length === 0 && isFile(join(dir, `${head}.html`))) return join(dir, `${head}.html`);
  if (isDir(join(dir, head))) {
    const hit = expoRoute(join(dir, head), rest);
    if (hit) return hit;
  }
  if (!isDir(dir)) return null;

  const entries = readdirSync(dir);
  // Route groups such as `(tabs)` do not appear in the URL.
  for (const entry of entries) {
    if (!/^\(.+\)$/.test(entry) || !isDir(join(dir, entry))) continue;
    const hit = expoRoute(join(dir, entry), parts);
    if (hit) return hit;
  }
  for (const entry of entries) {
    const name = entry.replace(/\.html$/, '');
    if (!/^\[.+\]$/.test(name)) continue;
    if (rest.length === 0 && entry.endsWith('.html')) return join(dir, entry);
    if (isDir(join(dir, entry))) {
      const hit = expoRoute(join(dir, entry), rest);
      if (hit) return hit;
    }
  }
  return null;
}

createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }

  const file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }

  if (extname(pathname) && isFile(file)) {
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
    return;
  }

  const html =
    (mode === 'expo' ? expoRoute(root, pathname.split('/').filter(Boolean)) : null) ??
    join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES['.html'] });
  res.end(readFileSync(html));
}).listen(port, values.host, () => {
  console.log(`serve-static: ${mode} ${root} on http://${values.host}:${port}`);
});
