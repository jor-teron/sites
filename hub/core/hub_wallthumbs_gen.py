#!/usr/bin/env python3
"""R36: writes small wallpaper thumbnails for Settings > Wallpaper.
For every picture listed in shared/wallpaper/wallpapers.js (window.HUB_PICTURES) it writes
shared/wallpaper/thumbs/<same base name>.webp, 320 px wide (height kept to the picture's ratio),
WebP quality 70. Rerunnable: a thumb newer than its picture is skipped (--force redoes all).
Thumbs of pictures no longer listed are reported, not deleted.
Needs Pillow:  python3 hub/core/hub_wallthumbs_gen.py [--force]"""
import os, re, sys
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WALL = os.path.join(ROOT, 'shared', 'wallpaper')
OUT = os.path.join(WALL, 'thumbs')
W, Q = 320, 70
force = '--force' in sys.argv
src = open(os.path.join(WALL, 'wallpapers.js'), encoding='utf-8').read()
files = re.findall(r"\[\s*'([\w.-]+\.(?:jpe?g|png|webp))'", src, re.I)
os.makedirs(OUT, exist_ok=True)
made = skipped = 0
for f in files:
    pic = os.path.join(WALL, f)
    out = os.path.join(OUT, os.path.splitext(f)[0] + '.webp')
    if not os.path.exists(pic):
        print('missing picture:', f); continue
    if not force and os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(pic):
        skipped += 1; continue
    im = Image.open(pic)
    im = im.convert('RGB')
    h = max(1, round(im.height * W / im.width))
    im.resize((W, h), Image.LANCZOS).save(out, 'WEBP', quality=Q, method=6)
    made += 1
    print('%-16s %4dx%-4d %6.1f KB' % (f, W, h, os.path.getsize(out) / 1024))
want = {os.path.splitext(f)[0] + '.webp' for f in files}
for extra in sorted(set(os.listdir(OUT)) - want):
    print('not listed any more (kept):', extra)
print('%d written, %d up to date' % (made, skipped))
