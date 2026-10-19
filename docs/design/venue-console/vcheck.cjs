// usage: node vcheck.cjs <file.dc.html>  -> syntax check + render once + call simple handlers
const fs = require('fs'); const f = process.argv[2];
const html = fs.readFileSync(f, 'utf8'); const src = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
global.document = { querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; } };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
const T = []; global.setTimeout = (fn) => { T.push(fn); return 1; }; global.clearTimeout = () => {}; global.setInterval = () => 1; global.clearInterval = () => {};
class DCLogic { constructor(p) { this.props = p || {}; } setState(c) { this.state = Object.assign({}, this.state, c); } }
const C = new Function('DCLogic', src + '\nreturn Component;')(DCLogic);
let bad = 0;
for (const role of ['owner', 'generalManager', 'manager']) {
  const c = new C({ role }); if (c.componentDidMount) c.componentDidMount();
  try { c.renderVals(); } catch (e) { bad++; console.log(role, 'RENDER', e.message); }
}
// template holes must exist in renderVals (top-level or loop vars)
const c = new C({}); const v = c.renderVals();
const loops = new Set([...html.matchAll(/as="(\w+)"/g)].map((m) => m[1]).concat(['$index']));
const holes = new Set([...html.split('<script type="text/x-dc"')[0].matchAll(/\{\{\s*([\w$.]+)\s*\}\}/g)].map((m) => m[1]));
const missing = [...holes].filter((h) => { const root = h.split('.')[0]; if (loops.has(root) || root === 'true' || root === 'false' || /^\d/.test(root)) return false; return !(root in v); });
if (missing.length) { bad++; console.log('MISSING HOLES', missing.join(', ')); }
console.log(f.split(/[\/]/).pop(), bad ? 'PROBLEMS ' + bad : 'ok');
