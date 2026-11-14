#!/usr/bin/env python3
"""IC8: plain Write and Scan & Print icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC6
(apps/media/ic1_plain_icons.py, apps/office/ic5_plain_icons.py,
apps/office/ic6_plain_icons.py): the shared dark #1c1f24 is a thin
outline and a soft shadow.

Notely: off-white notepad, three binding rings, blue rules.
MS Word Diff: white W and a not-equal sign, in the face already on
    the icon. The teal tile is not drawn.
OCR: white page with a folded corner, grey rules, blue scan bar and
    four corner brackets.
Paper Scan: white page with a folded corner, grey rules, orange scan bar.
Print: white printer, sheet in and sheet out, with the two rules that
    were the old tile showing through the output page.

Symbol colours are the ones already on each glyph. The coloured
tile is not drawn.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC8.png backups are left alone).
Uses Pillow, which is not a repo dependency. The W and the
not-equal sign are set in DejaVu Sans Bold (a system font, not a
repo file) because that is the face already on the icon.
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

S = 512  # 4x supersample
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # #1c1f24, the outline
WHITE = (255, 255, 255)

# Colours sampled from the current icons.
NOTE_PAPER = (232, 234, 237)   # #e8eaed
NOTE_RING = (150, 156, 166)    # #969ca6
NOTE_LINE = (110, 168, 254)    # #6ea8fe
OCR_PAPER = (245, 247, 250)    # #f5f7fa
OCR_FOLD = (200, 206, 216)     # #c8ced8
OCR_LINE = (70, 78, 92)        # #464e5c
OCR_BLUE = (110, 168, 254)     # #6ea8fe
SCAN_FOLD = (200, 215, 240)    # #c8d7f0
SCAN_LINE = (150, 165, 190)    # #96a5be
SCAN_BAR = (255, 178, 46)      # #ffb22e
PRINT_INK = (30, 110, 170)     # #1e6eaa, the old tile showing through

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

# Notely and OCR were measured on the 192px icons.
K192 = 2.4
# MS Word Diff, Paper Scan and Print were measured on the 128px icons.
K128 = 4.0

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


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


def notely():
    """Off-white pad, three rings, five blue rules.

    Measured on the 192px icon. The dark tile is not drawn.
    """
    k = K192
    page = rrect(box(48, 35, 143, 159, k), 8 * k)
    rings = union(
        rrect(box(63, 25, 71, 46, k), 4 * k),
        rrect(box(92, 25, 100, 46, k), 4 * k),
        rrect(box(120, 25, 128, 46, k), 4 * k),
    )
    color = Image.new("RGBA", (S, S), NOTE_PAPER + (255,))
    paint(color, rings, NOTE_RING)
    long_rules = ((63, 68, 128, 72), (63, 88, 128, 92), (63, 108, 128, 112))
    short_rules = ((63, 128, 103, 132), (63, 148, 103, 152))
    for rule in long_rules + short_rules:
        paint(color, rrect(box(*rule, k), 2.5 * k), NOTE_LINE)
    return compose([(union(page, rings), color)])


def fit_glyph(text, x0, y0, x1, y1, k):
    """Draw text large, then fit the ink into a measured source-pixel box."""
    if not os.path.isfile(FONT):
        raise SystemExit("DejaVu Sans Bold is required to redraw the Word mark: " + FONT)
    font = ImageFont.truetype(FONT, int(round(80 * k)))
    tmp = Image.new("L", (int(500 * k), int(300 * k)), 0)
    ImageDraw.Draw(tmp).text((10, 10), text, font=font, fill=255)
    glyph = tmp.crop(tmp.getbbox())
    tw = max(1, int(round((x1 - x0 + 1) * k)))
    th = max(1, int(round((y1 - y0 + 1) * k)))
    glyph = glyph.resize((tw, th), Image.Resampling.LANCZOS)
    m = mask()
    m.paste(glyph, (int(round(x0 * k)), int(round(y0 * k))))
    return m


def word_diff():
    """White W and a not-equal sign. The teal tile (#00796b) is not drawn.

    Measured on the 128px icon. Ink boxes: W is x 17–68, y 47–82;
    the sign is x 76–106, y 52–82. Both are DejaVu Sans Bold, the
    face already on the icon.
    """
    k = K128
    glyph = fit_glyph("W", 17, 47, 68, 82, k)
    sign = fit_glyph("\u2260", 76, 52, 106, 82, k)
    return compose([(union(glyph, sign), WHITE)])


def ocr():
    """Page, folded corner, rules, scan bar and four brackets.

    Measured on the 192px icon. The dark tile is not drawn.
    """
    k = K192
    page = rrect(box(55, 33, 139, 159, k), 5 * k)
    # The top-right corner is missing. The cut runs from (117, 33) to (139, 55).
    cut = poly([
        (117 * k, 33 * k),
        ((139 + 4) * k, 33 * k),
        ((139 + 4) * k, 55 * k),
    ])
    page = subtract(page, cut)
    band = mask()
    ImageDraw.Draw(band).line(
        [(117 * k, 33 * k), (139 * k, 55 * k)],
        fill=255, width=max(1, int(round(11 * k))),
    )

    def bracket(hx0, hy0, hx1, hy1, vx0, vy0, vx1, vy1):
        return union(
            rrect(box(hx0, hy0, hx1, hy1, k), 3.5 * k),
            rrect(box(vx0, vy0, vx1, vy1, k), 3.5 * k),
        )

    marks = union(
        bracket(30, 25, 56, 31, 30, 25, 36, 51),
        bracket(135, 25, 161, 31, 155, 25, 161, 51),
        bracket(30, 160, 56, 166, 30, 140, 36, 166),
        bracket(135, 160, 161, 166, 155, 140, 161, 166),
    )
    bar = rrect(box(38, 100, 156, 104, k), 2.5 * k)
    shape = union(page, marks, bar)

    color = Image.new("RGBA", (S, S), OCR_PAPER + (255,))
    paint(color, intersect(band, page), OCR_FOLD)
    rules = (
        (66, 68, 139, 72),
        (66, 84, 139, 88),
        (66, 114, 139, 118),
        (66, 130, 139, 134),
        (66, 145, 116, 150),
    )
    for rule in rules:
        paint(color, rrect(box(*rule, k), 2.2 * k), OCR_LINE)
    paint(color, bar, OCR_BLUE)
    paint(color, marks, OCR_BLUE)
    return compose([(shape, color)])


def paper_scan():
    """White page, folded corner, grey rules, orange scan bar.

    Measured on the 128px icon. The blue tile (#2b7cff) is not drawn.
    The fold is the triangle from (80, 20) to (96, 36).
    """
    k = K128
    page = rrect(box(34, 20, 96, 108, k), 3 * k)
    cut = poly([
        (80 * k, 20 * k),
        ((96 + 3) * k, 20 * k),
        ((96 + 3) * k, 36 * k),
    ])
    page = subtract(page, cut)
    fold = poly([(80 * k, 20 * k), (96 * k, 36 * k), (80 * k, 36 * k)])
    bar = rrect(box(22, 62, 106, 67, k), 2 * k)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    paint(color, intersect(fold, page), SCAN_FOLD)
    rules = (
        (44, 48, 86, 52),
        # A short rule sits on the top edge of the scan bar (y 60–61).
        (44, 60, 86, 61),
        (44, 72, 86, 76),
        (44, 84, 86, 88),
        (44, 96, 86, 100),
    )
    for rule in rules:
        paint(color, rrect(box(*rule, k), 2 * k), SCAN_LINE)
    paint(color, bar, SCAN_BAR)
    return compose([(union(page, bar), color)])


def printer():
    """White printer. The blue tile (#1e6eaa) is not drawn.

    Measured on the 128px icon: a sheet in the top, a body with a
    round button hole, and a sheet leaving the front slot. Two rules
    on the output sheet were the tile showing through, so they stay
    that blue.
    """
    k = K128
    body = rrect(box(20, 48, 108, 92, k), 8 * k)
    slot = rrect(box(36, 76, 92, 96, k), 3 * k)
    button = ellipse([
        (96 - 4.5) * k, (62 - 4.5) * k,
        (96 + 4.5) * k, (62 + 4.5) * k,
    ])
    body = subtract(body, union(slot, button))
    top = rrect(box(40, 22, 88, 50, k), 2 * k)
    out = rrect(box(40, 80, 88, 106, k), 2 * k)
    shape = union(body, top, out)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    paint(color, rrect(box(44, 87, 84, 89, k), 1 * k), PRINT_INK)
    paint(color, rrect(box(44, 97, 76, 99, k), 1 * k), PRINT_INK)
    return compose([(shape, color)])


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
        "apps/office/notely/notely_icon.png": notely(),
        "apps/tools/msword_diff/msword_diff_icon.png": word_diff(),
        "apps/office/ocr/ocr_icon.png": ocr(),
        "apps/office/paper-scan/paper-scan_icon.png": paper_scan(),
        "apps/office/print/print_icon.png": printer(),
    }
    for path, im in icons.items():
        check(im, path)
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
