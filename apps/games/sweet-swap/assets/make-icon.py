"""Recreate Sweet Swap's original 128px icon. Requires Pillow; no downloaded artwork."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageColor

im = Image.new('RGB', (512, 512), '#362344')
draw = ImageDraw.Draw(im)
draw.rounded_rectangle((18, 18, 494, 494), radius=100, fill='#f5e3f5')
colours = [('#ffb0cb', '#cf2768'), ('#ffdd97', '#db790c'), ('#fff7a4', '#c9a30b'),
           ('#adffe1', '#158c72'), ('#abe6ff', '#247fb7'), ('#edc5ff', '#9956c5')]
for k, (light, deep) in enumerate(colours):
    x, y = 43 + k % 3 * 153, 100 + k // 3 * 165
    mask = Image.new('L', (130, 130))
    m = ImageDraw.Draw(mask)
    if k == 0:
        m.ellipse((4, 4, 126, 126), fill=255)
    elif k == 1:
        m.polygon([(65, 0), (130, 65), (65, 130), (0, 65)], fill=255)
    elif k == 2:
        m.polygon([(65, 0), (130, 124), (0, 124)], fill=255)
    elif k == 3:
        m.rounded_rectangle((4, 4, 126, 126), radius=23, fill=255)
    elif k == 4:
        m.ellipse((4, 0, 126, 122), fill=255)
        m.polygon([(10, 65), (7, 130), (75, 115)], fill=255)
    else:
        m.polygon([(65 + (65 if i % 2 == 0 else 43) * math.cos(i * math.pi / 8),
                    65 + (65 if i % 2 == 0 else 43) * math.sin(i * math.pi / 8))
                   for i in range(16)], fill=255)
    gradient = Image.new('RGB', (130, 130))
    g = ImageDraw.Draw(gradient)
    a, b = ImageColor.getrgb(light), ImageColor.getrgb(deep)
    for row in range(130):
        g.line((0, row, 130, row), fill=tuple(round(a[j] * (1 - row / 129) + b[j] * row / 129) for j in range(3)))
    im.paste(gradient, (x, y), mask)
    draw.ellipse((x + 39, y + 19, x + 60, y + 29), fill='#fff8ff')
im.resize((128, 128), Image.Resampling.LANCZOS).save(Path(__file__).resolve().parents[1] / 'sweet-swap_icon.png')
