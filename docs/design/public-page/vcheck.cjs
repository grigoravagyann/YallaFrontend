// usage: node vcheck.cjs artboards/<file>.dc.html -> render every tweak value, call every handler once, check template holes and tag balance
const fs = require('fs'); const f = process.argv[2];
const html = fs.readFileSync(f, 'utf8'); const m = /<script type="text\/x-dc"[^>]*data-props='([^']*)'[^>]*>([\s\S]*?)<\/script>/.exec(html);
const props = m[1] ? JSON.parse(m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&')) : {}; const src = m[2];
global.document = { querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; } };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.setTimeout = () => 1; global.clearTimeout = () => {}; global.setInterval = () => 1; global.clearInterval = () => {};
class DCLogic { constructor(p) { this.props = p || {}; } setState(c) { this.state = Object.assign({}, this.state, typeof c === 'function' ? c(this.state) : c); } forceUpdate() {} }
const C = new Function('DCLogic', src + '\nreturn Component;')(DCLogic);
const combos = [{}];
for (const [k, d] of Object.entries(props)) { if (k[0] === '$') continue; const vals = d.editor === 'enum' ? d.options : d.editor === 'boolean' ? [true, false] : []; for (const v of vals) combos.push({ [k]: v }); }
let bad = 0;
const ev = { target: { value: '2026-10-30', checked: true }, preventDefault() {}, key: 'Enter', currentTarget: { value: '' } };
const walk = (o, seen, path, c) => { if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o); for (const [k, v] of Object.entries(o)) { if (typeof v === 'function') { try { v(ev); c.renderVals(); } catch (e) { bad++; console.log('HANDLER', path + k, e.message); } } else walk(v, seen, path + k + '.', c); } };
for (const p of combos) { const c = new C(p); if (c.componentDidMount) c.componentDidMount(); try { const v = c.renderVals(); walk(v, new Set(), '', c); c.renderVals(); } catch (e) { bad++; console.log(JSON.stringify(p), 'RENDER', e.message); } }
const c = new C({}); const v = c.renderVals();
const loops = new Set([...html.matchAll(/as="(\w+)"/g)].map((x) => x[1]).concat(['$index']));
const holes = new Set([...html.split('<script type="text/x-dc"')[0].matchAll(/\{\{\s*([\w$.]+)\s*\}\}/g)].map((x) => x[1]));
const missing = [...holes].filter((h) => { const r = h.split('.')[0]; if (loops.has(r) || r === 'true' || r === 'false' || /^\d/.test(r)) return false; return !(r in v); });
if (missing.length) { bad++; console.log('MISSING HOLES', missing.join(', ')); }
const body = html.split('<script type="text/x-dc"')[0]; const tags = {}; for (const t of body.matchAll(/<(\/?)(div|section|sc-if|sc-for|ul|li|button|a|span|p|aside|main|header|footer|table|tbody|tr|td|label)\b/g)) { tags[t[2]] = (tags[t[2]] || 0) + (t[1] ? -1 : 1); }
const unbal = Object.entries(tags).filter(([, n]) => n !== 0); if (unbal.length) { bad++; console.log('UNBALANCED', JSON.stringify(unbal)); }
console.log(f.split(/[\/]/).pop(), bad ? 'PROBLEMS ' + bad : 'ok', '(' + combos.length + ' prop sets)');
