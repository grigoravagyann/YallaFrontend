// Flow scenarios over the artboards' DCLogic, run in plain node: node checks/scen.cjs
const fs = require('fs');
global.document = { addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; } };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
const timers = []; global.setTimeout = (f) => { timers.push(f); return 1; }; global.clearTimeout = () => {};
const flush = () => { while (timers.length) timers.shift()(); };
class DCLogic { constructor(p) { this.props = p || {}; } setState(c) { this.state = Object.assign({}, this.state, c); } }
const load = (n, props) => { const html = fs.readFileSync(__dirname + '/../artboards/' + n + '.dc.html', 'utf8'); const src = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]; const C = new Function('DCLogic', src + '\nreturn Component;')(DCLogic); return new C(props || {}); };
const ev = (v) => ({ preventDefault() {}, target: { value: v }, currentTarget: null });
let fails = 0; const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
let c, r;
const R = () => (r = c.renderVals());

// Venues: tier refusal (Mountain, no menu) and allowed (Sunset)
c = load('Venues'); R();
r.rows.find((x) => x.name === 'Mountain View').askTierBtn(); R();
ok(r.tierRefused && /ճաշացանկ/i.test(r.tierRefuseText), 'Mountain View to paid is refused for no menu');
r.closeModal(); R();
r.rows.find((x) => x.name === 'Sunset Lounge').askTierBtn(); R();
ok(r.tierAllowed && r.tierBtn === 'Դարձնել վճարովի', 'Sunset Lounge to paid is allowed'); r.doTier(); R();
ok(r.rows.find((x) => x.name === 'Sunset Lounge').tierLabel === 'Վճարովի', 'Sunset Lounge is now paid');
r.rows.find((x) => x.name === 'Cascade Cafe').askDelete(); R();
ok(r.confirmOpen && r.delDisabled === 'true', 'delete needs typed name'); r.onDelTyped(ev('Cascade Cafe')); R();
ok(r.delDisabled === 'false', 'typed name enables delete'); r.doDelete(ev()); flush(); R();
ok(r.delBlocked && /15/.test(r.blockTabs), 'Cascade delete is blocked with 15 open tabs'); r.suspendInstead(); R();
ok(r.rows.find((x) => x.name === 'Cascade Cafe').statusLabel === 'Կասեցված', 'suspend instead works');
flush(); r.rows.find((x) => x.name === 'Sunset Lounge').askDelete(); flush(); R(); r.onDelTyped(ev('Sunset Lounge')); R(); r.doDelete(ev()); timers.shift()(); R(); console.log('  debug', r.delPhase, c.state.delPhase, c.state.confirm, !!c.state.toast, r.rows.map((x)=>x.name).join('|'));
ok(!r.rows.some((x) => x.name === 'Sunset Lounge') && r.hasUndo, 'Sunset deleted, hidden, undo offered'); r.undo(); R();
ok(r.rows.some((x) => x.name === 'Sunset Lounge'), 'undo restores Sunset');
r.openAdd(); R(); r.addNext(ev()); R();
ok(r.showEName && r.showESlug, 'step 1 errors shown on empty submit');
r.onAName(ev('Lumen Coffee')); R(); ok(r.aSlug === 'lumen-coffee', 'slug auto-filled'); r.addNext(ev()); R();
ok(r.addS2, 'step 2 reached'); r.onABranch(ev('Հյուսիս')); R(); r.addNext(ev()); R();
ok(r.showEBSlug && r.showEAddr && r.showEPin, 'step 2 errors: Armenian name gives no slug, address, pin');
r.onABSlug(ev('north')); R(); r.onAAddr(ev('Abovyan 12')); R(); r.onALat(ev('40.18')); R(); r.onALng(ev('200')); R(); r.addNext(ev()); R();
ok(r.showEPin && /իրական/.test(r.ePin), 'out-of-range pin refused'); r.onALng(ev('44.51')); R(); r.addNext(ev()); R();
ok(r.addS3, 'step 3 reached'); r.onAEmail(ev('owner@lumen.am')); R(); r.addNext(ev()); flush(); R();
ok(r.onceOpen && /reset-password/.test(r.onceLink) && r.rows.some((x) => x.name === 'Lumen Coffee'), 'venue created and link shown once');
r.onceDone(); R(); ok(r.copyNag, 'closing without copy nags once'); r.onceDone(); R(); ok(!r.onceOpen, 'second Done closes');

// VenueDetail
c = load('VenueDetail', { tab: 'staff' }); R();
r.openStaff(); R(); r.onWName(ev('Test Waiter')); R(); r.staffNext(ev()); R(); r.staffNext(ev()); R();
r.staffNext(ev()); R(); ok(r.showWPinErr, 'PIN required'); r.onWPin(ev('12a34')); R(); ok(r.wPin === '1234', 'PIN keeps digits only');
r.staffNext(ev()); R(); ok(r.w4 && r.noSignIn, 'waiter needs no console sign-in'); r.staffNext(ev()); R();
ok(r.dlgOnce && r.oncePin && !r.onceLink, 'waiter: PIN shown once, no link'); r.onceDone(); R(); ok(!r.dlgOnce, 'closed without nag when no link');
r.staff.find((p) => p.name === 'Gor Sahakyan').issue(); R(); r.sendLink(ev()); R(); ok(r.showIEmailErr, 'issue needs email');
r.onIEmail(ev('gor@cascade.am')); R(); r.sendLink(ev()); R(); ok(r.dlgOnce && r.onceLink, 'link shown once');
c = load('VenueDetail'); R(); r.openDelete(); R(); r.onTyped(ev('Cascade Cafe')); R(); r.doDelete(ev()); flush(); R();
ok(r.delBlocked, 'venue page delete blocked'); r.suspendInstead(); R(); ok(r.suspended, 'suspended banner shown'); r.resume(); R(); ok(r.active, 'resume works');
r.openBranch(); R(); r.onBName(ev('Northern')); R(); r.onBAddr(ev('x')); R(); r.onBLat(ev('40.1')); R(); r.onBLng(ev('44.5')); R(); r.addBranch(ev()); R();
ok(r.branchCount === 3, 'branch added');
r.openEdit(); R(); r.onESlug(ev('luna-cafe')); R(); r.saveEdit(ev()); R(); ok(r.showESlugErr, 'taken slug refused');

// Rooms
c = load('BranchRooms'); R();
r.pins.find((p) => p.label === '4').pick(); R(); r.askDelete(); R(); ok(r.dlgOnlyOk && /զբաղված/.test(r.dlgTitle), 'seated table refused'); r.closeDlg(); R();
r.pins.find((p) => p.label === '3').pick(); R(); r.askRegen(); R(); ok(r.goDisabled === 'true', 'regen needs label'); r.onTyped(ev('3')); R(); ok(r.goDisabled === 'false', 'typing label enables regen'); r.dlgSubmit(ev()); R();
r.askDelete(); R(); r.dlgSubmit(ev()); R(); ok(r.inactive.some((t) => t.label === '3'), 'table with history taken out of service');
r.addCenter(); R(); ok(r.selNew && r.dirty, 'new table added unsaved'); r.save(); flush(); R(); ok(!r.dirty, 'saved');
ok(r.warnings.length === 1, 'warning for bookable unpinned table 11'); r.warnings[0].act(); R(); ok(/11/.test(r.hint), 'placing mode for 11');

// Reviews
c = load('Reviews'); R(); r.rows[0].startHide(); R(); r.rows[0].confirmHide(ev()); R(); ok(r.showReasonErr, 'reason required');
r.reasonChips[1].pick(); R(); r.rows.find((x) => x.editing).confirmHide(ev()); R(); ok(r.filters[2].n === 2 && r.hasUndo, 'hidden with undo');

// Settings
c = load('Settings'); R(); r.people[1].toggleMenu(); R(); r.people[1].askOff(); R(); ok(r.askOpen, 'deactivate asks'); r.doAsk(); R(); ok(r.people[1].statusLabel === 'Ապաակտիվ', 'admin deactivated');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
