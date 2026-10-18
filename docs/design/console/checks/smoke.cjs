// Calls every handler of one artboard with fake events: node checks/smoke.cjs artboards/Venues.dc.html
// Errors from handlers of closed dialogs are expected noise; scen.cjs is the real check.
const fs = require('fs');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8'); let src = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
global.document = { addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, activeElement: null };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
const timers = [];
global.setTimeout = (f) => { timers.push(f); return timers.length; };
global.clearTimeout = () => {};
class DCLogic { constructor(props) { this.props = props || {}; } setState(c) { this.state = Object.assign({}, this.state, typeof c === 'function' ? c(this.state) : c); } }
const Component = new Function('DCLogic', src + '\nreturn Component;')(DCLogic);
const ev = (v) => ({ preventDefault() {}, stopPropagation() {}, key: 'ArrowRight', shiftKey: false, clientX: 40, clientY: 40, target: { value: v, select() {}, closest: () => null, getModifierState: () => false }, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }, getModifierState: () => false });
let errors = 0, calls = 0;
const propsList = JSON.parse(process.argv[3] || '[{}]');
for (const props of propsList) {
  const c = new Component(props);
  if (c.componentDidMount) c.componentDidMount();
  const seen = new Set();
  const walk = (depth) => {
    let vals;
    try { vals = c.renderVals(); } catch (e) { errors++; console.log('RENDER', e.message); return; }
    const fns = [];
    const collect = (o, path) => { for (const k in o) { const v = o[k]; if (typeof v === 'function') fns.push([path + k, v]); else if (Array.isArray(v)) v.slice(0, 3).forEach((x, i) => x && typeof x === 'object' && collect(x, path + k + '[' + i + '].')); } };
    collect(vals, '');
    for (const [name, fn] of fns) {
      const key = depth + ':' + name.replace(/\[\d+\]/g, '[]');
      if (seen.has(key)) continue; seen.add(key);
      for (const v of ['', 'Cascade Cafe', 'test@yalla.am', '40.18']) {
        calls++;
        try { fn(ev(v)); while (timers.length) timers.shift()(); c.renderVals(); } catch (e) { errors++; console.log('CALL', name, JSON.stringify(v), '->', e.message); }
      }
    }
    if (depth < 2) walk(depth + 1);
  };
  walk(0);
}
console.log(file.split(/[\/]/).pop(), 'calls', calls, 'errors', errors);
