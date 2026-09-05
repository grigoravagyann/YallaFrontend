# -*- coding: utf-8 -*-
"""Build the two self-hosted families: Yalla Sans (body) and Yalla Serif (display).

Each is a Google Noto Latin face merged with its Noto Armenian sibling, subset
to Latin, Cyrillic and Armenian, and emitted as woff2 for the web and ttf for
Expo, written straight into the two app folders.

Why merge rather than stack two families in CSS:

- Google's `Noto Sans` / `Noto Serif` contain no Armenian and, critically, no
  U+058F dram sign. The Armenian faces contain no Cyrillic. Neither alone
  covers the product.
- A CSS font stack solves this on the web, because browsers fall through per
  character. React Native does not do that reliably: Armenian in the diner
  app would render as tofu on iOS.

One merged face gives all three scripts plus the dram sign under a single
family name, identical on web and native. They are the same Noto skeleton,
drawn to be mixed, so this is one typeface in every sense that matters.

    python scripts/build-fonts.py                 # both families
    python scripts/build-fonts.py --only YallaSerif

Needs `fonttools` and `brotli` from pip. Intermediates go to a temp dir.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

from fontTools.merge import Merger
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
WEB_FONTS = os.path.join(ROOT, 'apps', 'web', 'public', 'fonts')
DINER_FONTS = os.path.join(ROOT, 'apps', 'diner', 'assets', 'fonts')

# The old UA makes Google Fonts serve static TTF instances per weight, which is
# what fontTools.merge needs: it cannot merge variable fonts.
UA_TTF = 'Mozilla/4.0'

PRODUCTS = {
    'YallaSans': dict(
        family='Yalla Sans',
        latin='Noto+Sans',
        armenian='Noto+Sans+Armenian',
        weights={'400': 'Regular', '500': 'Medium', '700': 'Bold'},
    ),
    'YallaSerif': dict(
        family='Yalla Serif',
        latin='Noto+Serif',
        armenian='Noto+Serif+Armenian',
        weights={'600': 'SemiBold', '700': 'Bold'},
    ),
}

# Latin (incl. supplement + extended for Armenian transliteration), punctuation,
# currency, Cyrillic, Armenian, and the dram sign explicitly: U+058F is the
# character the whole product is priced in and it lives at the very top of the
# Armenian block, exactly where a lazy range stops one codepoint short.
UNICODES = ','.join([
    'U+0000-00FF',    # Basic Latin + Latin-1 Supplement
    'U+0100-017F',    # Latin Extended-A
    'U+0180-024F',    # Latin Extended-B
    'U+02B0-02FF',    # Spacing modifiers
    'U+0300-036F',    # Combining diacriticals
    'U+0370-03FF',    # Greek (micro sign, ohm turn up in units)
    'U+0400-04FF',    # Cyrillic
    'U+0500-052F',    # Cyrillic Supplement
    'U+0530-058F',    # Armenian, INCLUDING U+058F DRAM SIGN
    'U+FB13-FB17',    # Armenian ligatures
    'U+2000-206F',    # General punctuation (dashes, bullets, curly quotes)
    'U+20A0-20BF',    # Currency symbols
    'U+2100-214F',    # Letterlike (numero sign)
    'U+2190-21BB',    # Arrows
    'U+2212',         # Minus sign
    'U+2E00-2E7F',    # Supplemental punctuation
    'U+FEFF',         # BOM / zero-width no-break
])

FEATURES = 'kern,liga,clig,calt,ccmp,mark,mkmk,locl,tnum,lnum,onum,pnum,frac,sups,subs'

PROBES = [
    ('֏', 'ARMENIAN DRAM SIGN'),
    ('Ա', 'Armenian capital Ayb'),
    ('ա', 'Armenian small ayb'),
    ('և', 'Armenian ligature ech-yiwn'),
    ('՝', 'Armenian comma'),
    ('։', 'Armenian full stop'),
    ('А', 'Cyrillic A'),
    ('ё', 'Cyrillic yo'),
    ('A', 'Latin A'),
    ('0', 'Digit zero'),
    ('—', 'Em dash'),
    ('·', 'Middle dot'),
]

# name IDs that carry the family/style identity we overwrite.
NAME_FAMILY, NAME_SUBFAMILY, NAME_FULL, NAME_PS = 1, 2, 4, 6
NAME_TYPO_FAMILY, NAME_TYPO_SUBFAMILY = 16, 17


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA_TTF})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def css_ttf_urls(family_query, weights):
    css = fetch(
        'https://fonts.googleapis.com/css2?family=%s:wght@%s' % (family_query, ';'.join(weights))
    ).decode('utf-8')
    # Blocks come back in the order the weights were requested.
    urls = re.findall(r'src:\s*url\((https://[^)]+\.ttf)\)', css)
    if len(urls) != len(weights):
        raise SystemExit('expected %d ttf urls for %s, got %d' % (len(weights), family_query, len(urls)))
    return dict(zip(weights, urls))


def subset(src, dest):
    subprocess.run(
        [
            sys.executable, '-m', 'fontTools.subset', src,
            '--unicodes=' + UNICODES,
            '--layout-features=' + FEATURES,
            '--name-IDs=*',
            '--notdef-outline',
            '--recommended-glyphs',
            '--output-file=' + dest,
        ],
        check=True, capture_output=True,
    )


def rename(font, family, postscript, style):
    full = '%s %s' % (family, style)
    ps = '%s-%s' % (postscript, style)
    table = font['name']
    for record in list(table.names):
        args = (record.nameID, record.platformID, record.platEncID, record.langID)
        if record.nameID == NAME_FAMILY:
            table.setName(family, *args)
        elif record.nameID == NAME_SUBFAMILY:
            table.setName(style, *args)
        elif record.nameID == NAME_FULL:
            table.setName(full, *args)
        elif record.nameID == NAME_PS:
            table.setName(ps, *args)
        elif record.nameID in (NAME_TYPO_FAMILY, NAME_TYPO_SUBFAMILY):
            table.removeNames(record.nameID)


def verify(path):
    font = TTFont(path)
    cmap = font.getBestCmap()
    missing = [label for ch, label in PROBES if ord(ch) not in cmap]
    has_tnum = False
    if 'GSUB' in font:
        has_tnum = any(
            f.FeatureTag == 'tnum' for f in font['GSUB'].table.FeatureList.FeatureRecord
        )
    status = 'OK' if not missing else 'MISSING: ' + ', '.join(missing)
    print('  %-24s glyphs=%5d tnum=%-3s %s' % (
        os.path.basename(path), len(cmap), 'yes' if has_tnum else 'no', status))
    return not missing


def build(key, spec, work):
    ok = True
    latin_urls = css_ttf_urls(spec['latin'], list(spec['weights']))
    armenian_urls = css_ttf_urls(spec['armenian'], list(spec['weights']))
    print(spec['family'])

    for weight, style in spec['weights'].items():
        parts = []
        for tag, url in (('latin', latin_urls[weight]), ('armenian', armenian_urls[weight])):
            raw = os.path.join(work, '%s-%s-%s.raw.ttf' % (key, tag, weight))
            sub = os.path.join(work, '%s-%s-%s.ttf' % (key, tag, weight))
            with open(raw, 'wb') as fh:
                fh.write(fetch(url))
            subset(raw, sub)
            parts.append(sub)

        # Latin first: its cmap and GSUB win on conflicts, which is what keeps
        # the tabular-figures feature the price columns depend on.
        merged = Merger().merge(parts)
        rename(merged, spec['family'], key, style)

        ttf_path = os.path.join(work, '%s-%s.ttf' % (key, weight))
        woff2_path = os.path.join(work, '%s-%s.woff2' % (key, weight))
        merged.save(ttf_path)
        subprocess.run(
            [sys.executable, '-m', 'fontTools.ttLib.woff2', 'compress', '-o', woff2_path, ttf_path],
            check=True, capture_output=True,
        )

        ok = verify(ttf_path) and ok
        print('  %-24s ttf %d KB, woff2 %d KB' % (
            '', os.path.getsize(ttf_path) // 1024, os.path.getsize(woff2_path) // 1024))

        shutil.copyfile(woff2_path, os.path.join(WEB_FONTS, '%s-%s.woff2' % (key, weight)))
        shutil.copyfile(ttf_path, os.path.join(DINER_FONTS, '%s-%s.ttf' % (key, weight)))
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--only', choices=sorted(PRODUCTS), help='build one family')
    args = parser.parse_args()

    os.makedirs(WEB_FONTS, exist_ok=True)
    os.makedirs(DINER_FONTS, exist_ok=True)

    work = tempfile.mkdtemp(prefix='yalla-fonts-')
    try:
        ok = True
        for key, spec in PRODUCTS.items():
            if args.only and key != args.only:
                continue
            ok = build(key, spec, work) and ok
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if not ok:
        raise SystemExit('a probe glyph is missing: see MISSING above')
    print('\nwrote woff2 to %s and ttf to %s' % (
        os.path.relpath(WEB_FONTS, ROOT), os.path.relpath(DINER_FONTS, ROOT)))


if __name__ == '__main__':
    main()
