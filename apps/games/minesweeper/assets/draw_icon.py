"""MINE-1 original 128 px mine-on-grid icon. Requires Pillow."""
from pathlib import Path
from math import cos, sin, pi
from PIL import Image, ImageDraw
s = 4
im = Image.new('RGB', (128*s, 128*s), '#152a44')
d = ImageDraw.Draw(im)
for y in range(3):
    for x in range(3):
        d.rounded_rectangle(tuple(n*s for n in (8+x*38,8+y*38,43+x*38,43+y*38)),radius=7*s,fill='#83abc8' if (x+y)%2 else '#c4ddeb')
for i in range(8):
    a = i*pi/4
    d.line((64*s+cos(a)*21*s,64*s+sin(a)*21*s,64*s+cos(a)*35*s,64*s+sin(a)*35*s),fill='#152a44',width=7*s)
d.ellipse((38*s,38*s,90*s,90*s),fill='#152a44')
d.ellipse((47*s,45*s,59*s,57*s),fill='#f5fbff')
im.resize((128,128),Image.Resampling.LANCZOS).save(Path(__file__).resolve().parent.parent/'minesweeper_icon.png')
