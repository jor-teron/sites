"""BRK-1 original icon. Run from this folder; requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
s = 4
im = Image.new('RGB', (128*s, 128*s), '#101b2c')
d = ImageDraw.Draw(im)
def rect(box, fill, radius=0):
    box = tuple(int(v*s) for v in box)
    d.rounded_rectangle(box, radius=radius*s, fill=fill)
for y, color in enumerate(['#f4b76a', '#ab9dff', '#52c4cb']):
    for x in range(4):
        rect((10+x*28, 15+y*17, 34+x*28, 28+y*17), color, 2)
        rect((12+x*28, 17+y*17, 32+x*28, 19+y*17), '#ffffff66')
rect((36, 105, 92, 114), '#e5eefb', 3)
rect((61, 105, 67, 114), '#45b7bf')
d.line((64*s, 96*s, 87*s, 71*s), fill='#587a99', width=3*s)
d.ellipse((82*s, 65*s, 94*s, 77*s), fill='white')
im.resize((128, 128), Image.Resampling.LANCZOS).save(Path(__file__).resolve().parents[1] / 'breakout_icon.png')
