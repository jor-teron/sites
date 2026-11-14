#!/usr/bin/env python3
"""IC7a: plain Files, Disk, Viewer and D-Pad Controller icons (no tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC8
(apps/media/ic1_plain_icons.py, apps/office/ic5_plain_icons.py,
apps/office/ic8_plain_icons.py): the shared dark #1c1f24 is a thin
outline and a soft shadow.

Files: off-white folder, blue tab, orange slot, two sparkles.
Disk: white drive outline, a divider and two lights. The teal
    interior was the tile, so it is not filled.
Viewer: sky, mountain, sun, and a play button.
D-Pad Controller: blue plus, green light, red light.
    controller_qr_icon.png is not drawn.

Symbol colours are the ones already on each glyph. The coloured
tile is not drawn.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC7a.png backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512  # 4x supersample
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # #1c1f24, the outline
WHITE = (255, 255, 255)

# Colours sampled from the current icons.
PAPER = (245, 248, 255)    # #f5f8ff folder
TAB = (60, 140, 255)       # #3c8cff folder tab
SLOT = (255, 170, 61)      # #ffaa3d, the orange tile showing through
SKY = (110, 168, 254)      # #6ea8fe
MOUNTAIN = (30, 70, 140)   # #1e468c
SUN = (255, 214, 102)      # #ffd666
PLAY = (244, 96, 96)       # #f46060
PLUS = (110, 168, 254)     # #6ea8fe
GREEN = (80, 200, 120)     # #50c878
RED = (220, 90, 90)        # #dc5a5a

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

# All four were measured on the 128px icons.
K128 = 4.0


def mask():
    return Image.new("L", (S, S), 0)


def union(*masks):
    out = masks[0]
    for m in masks[1:]:
        out = ImageChops.lighter(out, m)
    return out


def intersect(a, b):
    return ImageChops.multiply(a, b)


def subtract(a, b):
    return ImageChops.subtract(a, b)


def box(x0, y0, x1, y1, k):
    """Inclusive source-pixel box, scaled."""
    return [x0 * k, y0 * k, (x1 + 1) * k - 1, (y1 + 1) * k - 1]


def rrect(b, radius):
    m = mask()
    ImageDraw.Draw(m).rounded_rectangle(b, radius=radius, fill=255)
    return m


def ellipse(b):
    m = mask()
    ImageDraw.Draw(m).ellipse(b, fill=255)
    return m


def poly(points):
    m = mask()
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m


def circle(cx, cy, r, k):
    return ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k])


def star4(cx, cy, r_out, r_in, k):
    """Four-point sparkle. Points sit on the axes."""
    pts = []
    for i in range(8):
        ang = -math.pi / 2 + i * math.pi / 4
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx * k + r * k * math.cos(ang), cy * k + r * k * math.sin(ang)))
    return poly(pts)


def paint(base, shape, rgb):
    layer = Image.new("RGBA", (S, S), rgb + (255,))
    layer.putalpha(shape)
    base.alpha_composite(layer)


def fit_layers(layers, margin=MARGIN):
    """Scale every layer, as one group, into the same padding as IC1.

    A layer is (mask, colour). Colour is an RGB tuple or an RGBA image
    already aligned with the mask.
    """
    box_px = union(*(m for m, _ in layers)).getbbox()
    if not box_px:
        return layers
    x0, y0, x1, y1 = box_px
    bw, bh = x1 - x0, y1 - y0
    avail = S - 2 * margin
    scale = min(avail / bw, avail / bh)
    nw = max(1, int(round(bw * scale)))
    nh = max(1, int(round(bh * scale)))
    ox = (S - nw) // 2
    oy = (S - nh) // 2
    fitted = []
    for m, color in layers:
        sm = m.crop(box_px).resize((nw, nh), Image.Resampling.LANCZOS)
        canvas = mask()
        canvas.paste(sm, (ox, oy))
        if isinstance(color, Image.Image):
            sc = color.crop(box_px).resize((nw, nh), Image.Resampling.LANCZOS)
            cc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            cc.paste(sc, (ox, oy))
            fitted.append((canvas, cc))
        else:
            fitted.append((canvas, color))
    return fitted


def stamp(base, shape, color):
    rim = shape.filter(ImageFilter.MaxFilter(OUTLINE))
    edge = Image.new("RGBA", (S, S), TILE + (0,))
    edge.putalpha(rim.point(lambda a: int(a * 0.9)))
    if isinstance(color, Image.Image):
        fill = color.copy()
        fill.putalpha(shape)
    else:
        fill = Image.new("RGBA", (S, S), color + (0,))
        fill.putalpha(shape)
    base.alpha_composite(edge)
    base.alpha_composite(fill)


def shadow_of(shape):
    blurred = shape.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    shifted = Image.new("L", (S, S), 0)
    shifted.paste(blurred, SHADOW_SHIFT)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.putalpha(shifted.point(lambda a: int(a * SHADOW_ALPHA)))
    return layer


def finish(im):
    out = im.resize((OUT, OUT), Image.Resampling.LANCZOS)
    px = out.load()
    for y in range(OUT):
        for x in range(OUT):
            r, g, b, a = px[x, y]
            if a < 8:
                px[x, y] = (0, 0, 0, 0)
    return out


def compose(layers):
    layers = fit_layers(layers)
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    im.alpha_composite(shadow_of(union(*(m for m, _ in layers))))
    for shape, color in layers:
        stamp(im, shape, color)
    return finish(im)


def files_icon():
    """Off-white folder, blue tab, orange slot, two sparkles.

    Measured on the 128px icon. The orange gradient tile is not drawn.
    The slot was that tile showing through, so it stays orange.
    """
    k = K128
    body = rrect(box(22, 40, 105, 97, k), 6 * k)
    tab = rrect(box(23, 33, 62, 42, k), 4 * k)
    slot = rrect(box(38, 70, 90, 76, k), 3.5 * k)
    color = Image.new("RGBA", (S, S), PAPER + (255,))
    paint(color, tab, TAB)
    paint(color, slot, SLOT)
    # Sparkles are fat four-point stars (inner radius about half the
    # point length), matching the glyphs on the old icon.
    return compose([
        (union(body, tab), color),
        (star4(104.5, 21.5, 9.0, 5.0, k), WHITE),
        (star4(24.5, 109.5, 5.0, 2.8, k), WHITE),
    ])


def disk():
    """White drive: outline, divider, two lights.

    Measured on the 128px icon. The teal gradient tile is not drawn.
    The window was that tile, so it stays empty.
    """
    k = K128
    outer = rrect(box(25, 38, 102, 90, k), 7 * k)
    upper = rrect(box(32, 44, 95, 69, k), 3 * k)
    lower = rrect(box(32, 75, 95, 83, k), 3 * k)
    frame = subtract(outer, union(upper, lower))
    # The lights sit on the inner bottom edge, so the lower half is
    # part of the stroke and the top reads as two bumps.
    lights = union(circle(73.5, 83.6, 4.3, k), circle(86.0, 83.6, 4.3, k))
    return compose([(union(frame, lights), WHITE)])


def viewer():
    """Photo card and a play button.

    Measured on the 128px icon. The dark tile (#20283a) is not drawn.
    """
    k = K128
    card = rrect(box(20, 28, 107, 99, k), 8 * k)
    mountain = intersect(card, poly([
        (54 * k, 63 * k),
        (75 * k, 93 * k),
        (28 * k, 93 * k),
    ]))
    sun = circle(82, 45, 7.2, k)
    color = Image.new("RGBA", (S, S), SKY + (255,))
    paint(color, mountain, MOUNTAIN)
    paint(color, sun, SUN)
    play = circle(92, 92, 17, k)
    play_color = Image.new("RGBA", (S, S), PLAY + (255,))
    paint(play_color, poly([
        (88 * k, 85 * k),
        (101 * k, 92.5 * k),
        (88 * k, 100 * k),
    ]), WHITE)
    return compose([(card, color), (play, play_color)])


def controller():
    """Blue plus, green light, red light.

    Measured on the 128px icon. The dark tile (#1a1e26) is not drawn.
    The red light sits just over the green one.
    """
    k = K128
    plus = union(
        rrect(box(33, 42, 47, 86, k), 1.5 * k),
        rrect(box(18, 57, 62, 71, k), 1.5 * k),
    )
    return compose([
        (plus, PLUS),
        (circle(93, 57, 15.5, k), GREEN),
        (circle(107, 83, 15.5, k), RED),
    ])


def check(im, name):
    if im.size != (OUT, OUT) or im.mode != "RGBA":
        raise SystemExit(f"{name}: expected {OUT}x{OUT} RGBA, got {im.size} {im.mode}")
    px = im.load()
    bad = []
    for y in range(OUT):
        for x in range(OUT):
            if x < 8 or y < 8 or x >= OUT - 8 or y >= OUT - 8:
                if px[x, y][3] != 0:
                    bad.append((x, y, px[x, y]))
                    if len(bad) >= 6:
                        break
        if len(bad) >= 6:
            break
    corners = [px[0, 0], px[OUT - 1, 0], px[0, OUT - 1], px[OUT - 1, OUT - 1]]
    if bad or any(c[3] != 0 for c in corners):
        raise SystemExit(f"{name}: outer 8px or corner not clear: {bad} corners {corners}")
    print(name, "OK", im.size, im.mode, "bbox", im.getbbox())


def main():
    icons = {
        "apps/system/files/files_icon.png": files_icon(),
        "apps/system/disk/disk_icon.png": disk(),
        "apps/system/viewer/viewer_icon.png": viewer(),
        "hub/controller/controller_icon.png": controller(),
    }
    for path, im in icons.items():
        check(im, path)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
