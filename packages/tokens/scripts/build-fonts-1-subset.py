# -*- coding: utf-8 -*-
"""Download Noto Sans + Noto Sans Armenian, subset to the three scripts, emit
woff2 (web) and ttf (React Native).

The subset is deliberately explicit rather than "latin,cyrillic,armenian":
`U+058F` ARMENIAN DRAM SIGN is the character the whole product is priced in and
it is exactly the sort of glyph a range-based subset quietly drops.
"""
import io, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(HERE, 'out')
os.makedirs(RAW, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

UA_TTF = 'Mozilla/4.0'
WEIGHTS = ('400', '500', '700')

FAMILIES = {
    'NotoSans': 'Noto+Sans',
    'NotoSansArmenian': 'Noto+Sans+Armenian',
}

# Latin (incl. supplement + extended-A for Armenian transliteration),
# punctuation, currency, Cyrillic, Armenian, and the dram sign explicitly.
UNICODES = ','.join([
    'U+0000-00FF',    # Basic Latin + Latin-1 Supplement
    'U+0100-017F',    # Latin Extended-A
    'U+0180-024F',    # Latin Extended-B
    'U+02B0-02FF',    # Spacing modifiers
    'U+0300-036F',    # Combining diacriticals
    'U+0370-03FF',    # Greek (µ, Ω turn up in units)
    'U+0400-04FF',    # Cyrillic
    'U+0500-052F',    # Cyrillic Supplement
    'U+0530-058F',    # Armenian, INCLUDING U+058F DRAM SIGN
    'U+FB13-FB17',    # Armenian ligatures
    'U+2000-206F',    # General punctuation (— · … ‘ ’ “ ”)
    'U+20A0-20BF',    # Currency symbols (₽ € ₾)
    'U+2100-214F',    # Letterlike (№)
    'U+2190-21BB',    # Arrows
    'U+2212',         # Minus sign
    'U+2E00-2E7F',    # Supplemental punctuation
    'U+FEFF',         # BOM / zero-width no-break
])

FEATURES = 'kern,liga,clig,calt,ccmp,mark,mkmk,locl,tnum,lnum,onum,pnum,frac,sups,subs'


def css_ttf_urls(family_query):
    url = f'https://fonts.googleapis.com/css2?family={family_query}:wght@{";".join(WEIGHTS)}'
    req = urllib.request.Request(url, headers={'User-Agent': UA_TTF})
    with urllib.request.urlopen(req, timeout=60) as response:
        css = response.read().decode('utf-8')

    # Blocks come back in the order the weights were requested.
    urls = re.findall(r'src:\s*url\((https://[^)]+\.ttf)\)', css)
    if len(urls) != len(WEIGHTS):
        raise SystemExit(f'expected {len(WEIGHTS)} ttf urls for {family_query}, got {len(urls)}')
    return dict(zip(WEIGHTS, urls))


def download(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': UA_TTF})
    with urllib.request.urlopen(req, timeout=120) as response:
        data = response.read()
    with open(path, 'wb') as fh:
        fh.write(data)
    return len(data)


def subset(src, dest, flavor):
    args = [
        sys.executable, '-m', 'fontTools.subset', src,
        f'--unicodes={UNICODES}',
        f'--layout-features={FEATURES}',
        '--name-IDs=*',
        '--notdef-outline',
        '--recommended-glyphs',
        f'--output-file={dest}',
    ]
    if flavor:
        args.append(f'--flavor={flavor}')
    subprocess.run(args, check=True, capture_output=True)
    return os.path.getsize(dest)


report = []
for name, query in FAMILIES.items():
    for weight, url in css_ttf_urls(query).items():
        raw_path = os.path.join(RAW, f'{name}-{weight}.ttf')
        before = download(url, raw_path)

        woff2_path = os.path.join(OUT, f'{name}-{weight}.woff2')
        ttf_path = os.path.join(OUT, f'{name}-{weight}.ttf')
        after_woff2 = subset(raw_path, woff2_path, 'woff2')
        after_ttf = subset(raw_path, ttf_path, None)

        report.append((name, weight, before, after_ttf, after_woff2))
        print(f'{name} {weight}: {before // 1024} KB -> ttf {after_ttf // 1024} KB, '
              f'woff2 {after_woff2 // 1024} KB')

print()
total = sum(r[4] for r in report)
print(f'total woff2 across 6 faces: {total // 1024} KB')
