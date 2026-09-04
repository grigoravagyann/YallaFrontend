# -*- coding: utf-8 -*-
"""Confirm the subsets actually contain what the product needs.

The dram sign is the one to be paranoid about: it is the unit every price in
Yalla is quoted in, and it lives at the very top of the Armenian block where a
lazy subset range stops one codepoint short.
"""
import glob, os
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))

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

for path in sorted(glob.glob(os.path.join(HERE, 'out', '*.ttf'))):
    font = TTFont(path)
    cmap = font.getBestCmap()
    name = os.path.basename(path)
    missing = [label for ch, label in PROBES if ord(ch) not in cmap]
    has_tnum = False
    if 'GSUB' in font:
        features = font['GSUB'].table.FeatureList.FeatureRecord
        has_tnum = any(f.FeatureTag == 'tnum' for f in features)
    print(
        f'{name:34s} glyphs={len(cmap):5d} tnum={"yes" if has_tnum else "no ":3s} '
        f'{"OK" if not missing else "MISSING: " + ", ".join(missing)}'
    )
