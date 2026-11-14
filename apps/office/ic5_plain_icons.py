#!/usr/bin/env python3
"""IC5: plain Office PDF Tools and Mail icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC3
(apps/media/ic1_plain_icons.py): the shared dark #1c1f24 is a thin
outline and a soft shadow.

PDF Tools: two document pages. The back page is the old pink, the
front page is white, with the rose rules and the red PDF letters.
Mail: white envelope with the teal flap stroke.

Symbol colours are the ones already on each glyph. The coloured
tile is not drawn.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC5.png backups are left alone).
Uses Pillow, which is not a repo dependency. The PDF letters are
set in DejaVu Sans Bold (a system font, not a repo file) because
that is the face already on the icon.
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
PINK = (255, 205, 205)    # #ffcdcd back page
LINE = (230, 151, 151)    # #e69797 rules on the front page
INK = (214, 48, 49)       # #d63031 PDF letters
FLAP = (31, 143, 134)     # #1f8f86 envelope flap

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

# PDF artwork was measured on the 192px icon.
K192 = 2.4
# Mail artwork was measured on the 128px icon.
K128 = 4.0

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def mask():
    return Image.new("L", (S, S), 0)


def union(*masks):
    out = masks[0]
    for m in masks[1:]:
        out = ImageChops.lighter(out, m)
    return out


def box(x0, y0, x1, y1, k):
    return [x0 * k, y0 * k, x1 * k, y1 * k]


def rrect(b, radius):
    m = mask()
    ImageDraw.Draw(m).rounded_rectangle(b, radius=radius, fill=255)
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


def pdf_letters(k):
    """Red PDF, in the face and the box already on the icon."""
    if not os.path.isfile(FONT):
        raise SystemExit("DejaVu Sans Bold is required to redraw the PDF letters: " + FONT)
    # Draw large, then fit the ink into the measured letter box.
    font = ImageFont.truetype(FONT, int(round(64 * k)))
    tmp = Image.new("L", (int(400 * k), int(160 * k)), 0)
    ImageDraw.Draw(tmp).text((10, 10), "PDF", font=font, fill=255)
    glyph = tmp.crop(tmp.getbbox())
    # Ink on the 192px icon: x 57–119, y 107–128.
    tw = max(1, int(round((119 - 57) * k)))
    th = max(1, int(round((128 - 107) * k)))
    glyph = glyph.resize((tw, th), Image.Resampling.LANCZOS)
    m = mask()
    m.paste(glyph, (int(round(57 * k)), int(round(107 * k))))
    return m


def pdf_tools():
    """Back pink page, front white page, rules, PDF."""
    k = K192
    back = rrect(box(62, 40, 145, 145, k), 9 * k)
    front = rrect(box(47, 55, 130, 160, k), 9 * k)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    rules = (
        (60, 70, 117, 75),
        (60, 82, 107, 87),
        (60, 94, 97, 99),
    )
    for rule in rules:
        paint(color, rrect(box(*rule, k), 2.2 * k), LINE)
    paint(color, pdf_letters(k), INK)
    return compose([(back, PINK), (front, color)])


def chevron(pts, width, k):
    """Thick V. pts are the centre line, width is the stroke."""
    m = mask()
    d = ImageDraw.Draw(m)
    sc = [(p[0] * k, p[1] * k) for p in pts]
    d.line(sc, fill=255, width=max(1, int(round(width * k))), joint="curve")
    r = width * k / 2.0
    for x, y in sc:
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    return m


def mail():
    """White envelope and the teal flap."""
    k = K128
    body = rrect(box(25, 38, 104, 90, k), 6.5 * k)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    flap = chevron([(30, 43.5), (64.5, 72), (98, 43.5)], 10.5, k)
    paint(color, flap, FLAP)
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
        "apps/office/pdf-tools/pdf-tools_icon.png": pdf_tools(),
        "apps/office/mail/mail_icon.png": mail(),
    }
    for path, im in icons.items():
        check(im, path)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
