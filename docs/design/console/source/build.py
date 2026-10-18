"""Assemble source/*.page.html into artboards/*.dc.html (run: python source/build.py [Name ...]).

Markers: /*SHELL*/ (shared shell CSS), /*UI*/ (shared form/dialog CSS),
<!--SIDE--> (sidebar with Venues active), <!--BRANCHHEAD:key--> (branch header
with the given sub-tab active), //KEYS (shared keyboard helpers for DCLogic).
"""
import io, os, glob, sys

here = os.path.dirname(os.path.abspath(__file__))
read = lambda n: io.open(os.path.join(here, n), encoding='utf-8').read()
shell, ui, side = read('_shell.css'), read('_ui.css'), read('_side.html')

def branch_head(active):
    tabs = [('public', 'BranchPublic.dc.html', 'Հանրային էջ', ''),
            ('rooms', 'BranchRooms.dc.html', 'Սրահներ և սեղաններ', ''),
            ('reviews', 'Reviews.dc.html', 'Կարծիքներ', '<span class="cnt" aria-label="2 բողոք">2</span>')]
    links = ''.join('<a href="%s"%s>%s%s</a>' % (h, ' class="on" aria-current="page"' if k == active else '', t, c) for k, h, t, c in tabs)
    return ('<ol class="crumbs"><li><a href="Venues.dc.html">Վայրեր</a></li><li><a href="VenueDetail.dc.html">Cascade Cafe</a></li><li aria-current="page">Կասկադ մասնաճյուղ</li></ol>\n'
            '<div class="bhead"><div><h1 class="h1">Կասկադ</h1><p class="sub">Cascade Cafe · Թամանյան 10, Կենտրոն</p></div>'
            '<div class="fld"><label for="br-switch" class="sr">Մասնաճյուղ</label><select id="br-switch" class="bsel"><option>Կասկադ</option><option>Արաբկիր</option></select></div></div>\n'
            '<nav class="subtabs" aria-label="Մասնաճյուղի բաժիններ">' + links + '</nav>')

keys = '''  focusLater(sel) { setTimeout(() => { const el = sel && document.querySelector(sel); if (el) el.focus(); }, 30); }
  trapTab(e) {
    const box = document.querySelector('.dialog');
    if (!box) return;
    const f = Array.from(box.querySelectorAll('button, input, select, textarea, a[href]')).filter((el) => !el.disabled);
    if (!f.length) return;
    const at = document.activeElement;
    if (!box.contains(at)) { e.preventDefault(); f[0].focus(); }
    else if (e.shiftKey && at === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && at === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  say(msg, undo) {
    this.setState({ toast: { msg: msg, undo: undo || null } });
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setState({ toast: null }), undo ? 7000 : 3500);
  }
'''

names = sys.argv[1:] or [os.path.basename(p)[:-len('.page.html')] for p in glob.glob(os.path.join(here, '*.page.html'))]
for n in names:
    s = read(n + '.page.html')
    s = s.replace('/*SHELL*/', shell).replace('/*UI*/', ui).replace('<!--SIDE-->', side).replace('  //KEYS\n', keys)
    for k in ('public', 'rooms', 'reviews'):
        s = s.replace('<!--BRANCHHEAD:%s-->' % k, branch_head(k))
    assert '/*SHELL*/' not in s and '<!--SIDE-->' not in s and '//KEYS' not in s and '<!--BRANCHHEAD' not in s, n
    io.open(os.path.join(here, '..', 'artboards', n + '.dc.html'), 'w', encoding='utf-8', newline='').write(s)
    print('built', n, len(s))
