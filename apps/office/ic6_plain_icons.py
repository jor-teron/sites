#!/usr/bin/env python3
"""IC6: plain Hub Office icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC5
(apps/media/ic1_plain_icons.py, apps/office/ic5_plain_icons.py):
the shared dark #1c1f24 is a thin outline and a soft shadow.

Writer: white page, folded corner, blue title bar, grey lines.
Spreadsheet: white sheet, mint header, teal grid, green cell.
Base: white database cylinder (the stroke from base_icon.svg / the
    128px png). The purple tile is not drawn.
Tables: white table, pale header, blue rules. The blue tile is
    not drawn. This file is new (the old icon was an SVG).
Slides: orange screen and stand, white title and lines, dark dots.

Symbol colours are the ones already on each glyph. The coloured
tile is not drawn.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC6.png / .svg backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512  # 4x supersample
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # #1c1f24, the outline
WHITE = (255, 255, 255)

# Colours sampled from the current icons.
TITLE = (91, 91, 240)         # #5b5bf0 writer title bar
LINE_GREY = (200, 200, 225)   # #c8c8e1 writer text lines
FOLD = (214, 206, 255)        # pale dog-ear on the writer page
HEADER = (210, 245, 228)      # #d2f4e4 spreadsheet header
GRID = (48, 168, 132)         # #30a884 tile showing through the sheet gaps
CELL = (16, 163, 108)         # #10a36c selected cell
TABLE_HEAD = (232, 240, 254)  # #e8f0fe
TABLE_LINE = (26, 115, 232)   # #1a73e8
SLIDE = (244, 122, 40)        # #f47a28 screen and stand
DOT = (28, 31, 36)            # #1c1f24 bullets (the old tile showing through)

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

# Writer, Spreadsheet and Slides were measured on the 192px icons.
K192 = 2.4
# Base and Tables artwork follows the 64-unit SVG, drawn large.
K64 = 8.0


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


def rect(x0, y0, x1, y1):
    m = mask()
    ImageDraw.Draw(m).rectangle([x0, y0, x1, y1], fill=255)
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


def writer():
    """White page, dog-ear, blue title, four grey lines.

    Measured on the 192px icon. The purple gradient tile is not drawn.
    The corner cut is the fold: the page's top-right is missing, and a
    pale band sits along the cut.
    """
    k = K192
    x0, y0, x1, y1 = 52, 39, 139, 156
    page = rrect(box(x0, y0, x1, y1, k), 8 * k)
    fold = 26
    # Cut the top-right corner. The triangle runs past the page so the
    # rounded corner goes with it.
    cut = poly([
        ((x1 - fold) * k, (y0 - 2) * k),
        ((x1 + 4) * k, (y0 - 2) * k),
        ((x1 + 4) * k, (y0 + fold) * k),
    ])
    page = subtract(page, cut)

    color = Image.new("RGBA", (S, S), WHITE + (255,))
    band = mask()
    ImageDraw.Draw(band).line(
        [((x1 - fold) * k, y0 * k), (x1 * k, (y0 + fold) * k)],
        fill=255, width=max(1, int(round(8 * k))),
    )
    paint(color, intersect(band, page), FOLD)
    paint(color, rrect(box(66, 76, 102, 82, k), 3 * k), TITLE)
    rules = (
        (66, 94, 113, 98),
        (66, 110, 109, 114),
        (66, 126, 113, 130),
        (66, 143, 94, 147),
    )
    for rule in rules:
        paint(color, rrect(box(*rule, k), 2 * k), LINE_GREY)
    return compose([(page, color)])


def spreadsheet():
    """White rounded sheet, mint header, grid, one green cell.

    Measured on the 192px icon: three columns and a header plus three
    rows. The teal gradient tile is not drawn. Grid lines use the teal
    that showed through the gaps (#30a884).
    """
    k = K192
    x0, y0, x1, y1 = 38, 42, 152, 149
    sheet = rrect(box(x0, y0, x1, y1, k), 11 * k)
    cols, rows = 3, 4
    cw = (x1 - x0 + 1) / cols
    rh = (y1 - y0 + 1) / rows
    color = Image.new("RGBA", (S, S), WHITE + (255,))

    header = intersect(sheet, rect(x0 * k, y0 * k, (x1 + 1) * k, (y0 + rh) * k))
    paint(color, header, HEADER)

    # Centre cell of the body (column 2, second body row).
    gx0 = x0 + cw
    gy0 = y0 + 2 * rh
    cell = intersect(sheet, rect(gx0 * k, gy0 * k, (gx0 + cw) * k, (gy0 + rh) * k))
    paint(color, cell, CELL)

    # About 1.5px on the 192px icon: the gaps were a thin show-through.
    lw = max(1, int(round(1.6 * k)))
    for i in range(1, cols):
        x = x0 + i * cw
        line = rrect([x * k - lw / 2, y0 * k, x * k + lw / 2, (y1 + 1) * k], lw / 2)
        paint(color, intersect(sheet, line), GRID)
    for i in range(1, rows):
        y = y0 + i * rh
        line = rrect([x0 * k, y * k - lw / 2, (x1 + 1) * k, y * k + lw / 2], lw / 2)
        paint(color, intersect(sheet, line), GRID)
    return compose([(sheet, color)])


def stroke_ellipse(cx, cy, rx, ry, sw):
    """Elliptical ring. rx/ry are the centre-line radii, sw the stroke."""
    outer = ellipse([cx - rx - sw / 2, cy - ry - sw / 2, cx + rx + sw / 2, cy + ry + sw / 2])
    irx, iry = rx - sw / 2, ry - sw / 2
    if irx <= 1 or iry <= 1:
        return outer
    inner = ellipse([cx - irx, cy - iry, cx + irx, cy + iry])
    return subtract(outer, inner)


def lower_rim(cx, cy, rx, ry, sw):
    """Front rim: the lower half of an elliptical ring (SVG cylinder)."""
    ring = stroke_ellipse(cx, cy, rx, ry, sw)
    above = rect(0, 0, S - 1, cy)
    return subtract(ring, above)


def base():
    """White database cylinder. Same geometry as base_icon.svg.

    The SVG is a 64-unit viewBox: full top ellipse, two sides, and the
    front rims of the middle and bottom ellipses. Stroke 4. The purple
    tile (#7c4dff) is not drawn. The 128px png is that drawing at 2x.
    """
    k = K64
    sw = 4 * k
    cx, rx, ry = 32 * k, 16 * k, 6 * k
    y_top, y_mid, y_bot = 18 * k, 32 * k, 46 * k
    top = stroke_ellipse(cx, y_top, rx, ry, sw)
    left = rect(cx - rx - sw / 2, y_top, cx - rx + sw / 2, y_bot)
    right = rect(cx + rx - sw / 2, y_top, cx + rx + sw / 2, y_bot)
    mid = lower_rim(cx, y_mid, rx, ry, sw)
    bot = lower_rim(cx, y_bot, rx, ry, sw)
    return compose([(union(top, left, right, mid, bot), WHITE)])


def tables():
    """White table, pale header, blue rules. From tables_icon.svg.

    The SVG table is x 12–52, y 14–50, rx 3, on a 64-unit viewBox.
    Header #e8f0fe is the top 10 units. Rules are #1a73e8, stroke 2.5.
    The blue rounded tile is not drawn.
    """
    k = K64
    table = rrect(box(12, 14, 51, 49, k), 3 * k)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    header = intersect(table, rect(12 * k, 14 * k, 52 * k, 24 * k))
    paint(color, header, TABLE_HEAD)
    sw = 2.5 * k
    # Horizontal rules at y 24, 34, 44 and vertical rules at x 24, 36,
    # matching the SVG paths (the stroke is centred on those lines).
    for y in (24, 34, 44):
        line = rect(12 * k, y * k - sw / 2, 52 * k, y * k + sw / 2)
        paint(color, intersect(table, line), TABLE_LINE)
    for x in (24, 36):
        line = rect(x * k - sw / 2, 14 * k, x * k + sw / 2, 50 * k)
        paint(color, intersect(table, line), TABLE_LINE)
    return compose([(table, color)])


def slides():
    """Orange screen, neck and base, white title and lines, three dots.

    Measured on the 192px icon. The dark tile (#1c1c24) is not drawn.
    The dots were that tile showing through the screen, so they stay
    #1c1f24.
    """
    k = K192
    screen = rrect(box(30, 44, 161, 127, k), 8 * k)
    # Neck overlaps the screen and the base so the stand is one shape.
    neck = rrect(box(92, 122, 99, 149, k), 1 * k)
    foot = rrect(box(66, 148, 125, 155, k), 3 * k)
    body = union(screen, neck, foot)
    color = Image.new("RGBA", (S, S), SLIDE + (255,))
    paint(color, rrect(box(45, 56, 123, 67, k), 5 * k), WHITE)
    rules = (
        (60, 81, 126, 87),
        (60, 95, 113, 101),
        (60, 109, 121, 115),
    )
    for rule in rules:
        paint(color, rrect(box(*rule, k), 3 * k), WHITE)
    for cy in (84, 98, 112):
        paint(color, ellipse(box(45, cy - 4, 54, cy + 4, k)), DOT)
    return compose([(body, color)])


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
        "apps/office/writer/writer_icon.png": writer(),
        "apps/office/spreadsheet/spreadsheet_icon.png": spreadsheet(),
        "apps/office/base/base_icon.png": base(),
        "apps/office/tables/tables_icon.png": tables(),
        "apps/office/slides/slides_icon.png": slides(),
    }
    for path, im in icons.items():
        check(im, path)
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
