// node apps/diner/store/source/serve.cjs <distDir> <port> : static server for an expo-router web export, mapping /place/x to place/[placeId].html
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 8099);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function resolve(urlPath) {
  const parts = decodeURIComponent(urlPath).split('/').filter(Boolean);
  const direct = path.join(root, ...parts);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  if (fs.existsSync(direct + '.html')) return direct + '.html';
  if (fs.existsSync(path.join(direct, 'index.html'))) return path.join(direct, 'index.html');
  // Walk the segments, letting a missing one match the folder's [param] entry.
  let dir = root;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const exact = last
      ? entries.find((e) => e === parts[i] + '.html')
      : entries.find((e) => e === parts[i]);
    if (exact) {
      dir = path.join(dir, exact);
      continue;
    }
    const dynamic = last
      ? entries.find((e) => /^\[.+\]\.html$/.test(e))
      : entries.find((e) => /^\[.+\]$/.test(e));
    if (dynamic) {
      dir = path.join(dir, dynamic);
      continue;
    }
    const group = entries.find((e) => /^\(.+\)$/.test(e));
    if (group) {
      dir = path.join(dir, group);
      i--;
      continue;
    }
    return null;
  }
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) return dir;
  if (fs.existsSync(path.join(dir, 'index.html'))) return path.join(dir, 'index.html');
  return null;
}

http
  .createServer((req, res) => {
    const file = resolve(req.url.split('?')[0]) || path.join(root, '+not-found.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log('serving', root, 'on', port));
