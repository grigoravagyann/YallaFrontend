# -*- coding: utf-8 -*-
"""Merge Noto Sans + Noto Sans Armenian into one face per weight.

Why merge rather than stack two families in CSS:

- Google's `Noto Sans` contains no Armenian and, critically, no U+058F dram
  sign. `Noto Sans Armenian` contains no Cyrillic. Neither alone covers the
  product.
- A CSS font stack solves this on the web, because browsers fall through per
  character. React Native does not do that reliably — Armenian in the diner app
  would render as tofu on iOS.

One merged face gives all three scripts plus the dram sign under a single family
name, identical on web and native. They are both Noto Sans, drawn by the same
team on the same skeleton to be mixed, so this is one typeface in every sense
that matters visually.
"""
import os, subprocess, sys
from fontTools.ttLib import TTFont
from fontTools.merge import Merger

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FINAL = os.path.join(HERE, 'final')
os.makedirs(FINAL, exist_ok=True)

FAMILY = 'Yalla Sans'
POSTSCRIPT = 'YallaSans'
STYLE = {'400': 'Regular', '500': 'Medium', '700': 'Bold'}

# name IDs that carry the family/style identity we are overwriting.
NAME_FAMILY, NAME_SUBFAMILY, NAME_FULL, NAME_PS = 1, 2, 4, 6
NAME_TYPO_FAMILY, NAME_TYPO_SUBFAMILY = 16, 17


def rename(font, weight):
    style = STYLE[weight]
    full = f'{FAMILY} {style}'
    ps = f'{POSTSCRIPT}-{style}'
    table = font['name']
    for record in list(table.names):
        if record.nameID == NAME_FAMILY:
            table.setName(FAMILY, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID == NAME_SUBFAMILY:
            table.setName(style, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID == NAME_FULL:
            table.setName(full, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID == NAME_PS:
            table.setName(ps, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID in (NAME_TYPO_FAMILY, NAME_TYPO_SUBFAMILY):
            table.removeNames(record.nameID)


for weight in ('400', '500', '700'):
    latin = os.path.join(OUT, f'NotoSans-{weight}.ttf')
    armenian = os.path.join(OUT, f'NotoSansArmenian-{weight}.ttf')
    merged_path = os.path.join(FINAL, f'YallaSans-{weight}.ttf')

    # Latin first: its cmap and GSUB win on conflicts, which is what keeps the
    # tabular-figures feature the price columns depend on.
    merger = Merger()
    merged = merger.merge([latin, armenian])
    rename(merged, weight)
    merged.save(merged_path)

    # woff2 for the web build; the ttf is what Expo loads.
    woff2_path = os.path.join(FINAL, f'YallaSans-{weight}.woff2')
    subprocess.run(
        [sys.executable, '-m', 'fontTools.ttLib.woff2', 'compress',
         '-o', woff2_path, merged_path],
        check=True, capture_output=True,
    )

    ttf_kb = os.path.getsize(merged_path) // 1024
    woff2_kb = os.path.getsize(woff2_path) // 1024
    print(f'YallaSans {weight}: ttf {ttf_kb} KB, woff2 {woff2_kb} KB')
