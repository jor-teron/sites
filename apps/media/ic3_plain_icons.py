#!/usr/bin/env python3
"""IC3: plain Media Photo icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1 / IC2
(ic1_plain_icons.py, ic2_plain_icons.py): the shared dark
#1c1f24 is a thin outline and a soft shadow.

Photo Editor v2: one landscape, plus the two white crop corners.
Photo Studio: three stacked cards, a landscape on the front, a sparkle.
Camera: body, lens, red dot.
Gallery: four photo thumbnails.
GIF Maker: film strip, sprockets, GIF letters.
Image Converter: framed landscape and the two convert arrows.

Symbol colours are the ones already on each glyph. The coloured
tile is not drawn. Photo Editor v2 and Photo Studio stay different
marks (crop corners versus a stack and a sparkle).

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC3.png backups are left alone).
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
PE_SKY = (84, 140, 230)       # #548ce6
PE_GREEN = (46, 170, 110)     # #2eaa6e
PE_SUN = (255, 206, 84)       # #ffce54

PS_SKY = (110, 170, 255)      # #6eaaff
PS_GREEN = (52, 168, 83)      # #34a853
PS_SUN = (255, 205, 70)       # #ffcd46
PS_SPARK = (255, 214, 90)     # #ffd65a

CAM_BODY = (240, 242, 248)    # #f0f2f8
CAM_LENS = (74, 140, 247)     # #4a8cf7
CAM_RED = (229, 57, 53)       # #e53935

GAL_MTN = (14, 165, 233)      # #0ea5e9
GAL_SUN = (250, 204, 21)      # #facc15

GIF_PURPLE = (124, 58, 237)   # #7c3aed

IC_SKY = (186, 230, 253)      # #bae6fd
IC_BACK = (14, 165, 233)      # #0ea5e9
IC_FRONT = (2, 132, 199)      # #0284c7
IC_SUN = (253, 224, 71)       # #fde047
IC_BADGE = (251, 191, 36)     # #fbbf24
IC_ARROW = (37, 99, 235)      # #2563eb

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

# Source icons are 192 or 256. Map them into the 512 canvas, then
# fit() scales the group into the same padding as IC1.
K192 = 2.4
K256 = 1.85


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


def ellipse(b):
    m = mask()
    ImageDraw.Draw(m).ellipse(b, fill=255)
    return m


def circ(cx, cy, r, k):
    return ellipse(box(cx - r, cy - r, cx + r, cy + r, k))


def poly(points):
    m = mask()
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m


def paint(base, shape, rgb):
    layer = Image.new("RGBA", (S, S), rgb + (255,))
    layer.putalpha(shape)
    base.alpha_composite(layer)


def rounded_ring(b, radius, stroke):
    outer = rrect(b, radius)
    inner = [b[0] + stroke, b[1] + stroke, b[2] - stroke, b[3] - stroke]
    hole = rrect(inner, max(0, radius - stroke))
    return ImageChops.subtract(outer, hole)


def mountain(points, bottom, k):
    sc = [(x * k, y * k) for x, y in points]
    sc.append((points[-1][0] * k, bottom * k))
    sc.append((points[0][0] * k, bottom * k))
    return poly(sc)


def ell(x0, y0, x1, y1, thick, k, corner):
    """White crop corner. corner is 'tl' or 'br' of its own box."""
    if corner == "tl":
        hbar = rrect(box(x0, y0, x0 + (x1 - x0), y0 + thick, k), thick * k / 2)
        vbar = rrect(box(x0, y0, x0 + thick, y1, k), thick * k / 2)
    else:
        hbar = rrect(box(x0, y1 - thick, x1, y1, k), thick * k / 2)
        vbar = rrect(box(x1 - thick, y0, x1, y1, k), thick * k / 2)
    return union(hbar, vbar)


def star4(cx, cy, rx, ry, k):
    """Four-point sparkle: a wide diamond crossed with a tall one."""
    horiz = poly([
        (cx * k, (cy - ry) * k),
        ((cx + rx) * k, cy * k),
        (cx * k, (cy + ry) * k),
        ((cx - rx) * k, cy * k),
    ])
    vert = poly([
        (cx * k, (cy - rx) * k),
        ((cx + ry) * k, cy * k),
        (cx * k, (cy + rx) * k),
        ((cx - ry) * k, cy * k),
    ])
    return union(horiz, vert)


def arrow(x, y, w, h, direction, k):
    """Chunky horizontal arrow. direction 1 points right, -1 points left."""
    shaft = h * 0.46
    head = h * 0.92
    cy = y + h / 2.0
    m = mask()
    d = ImageDraw.Draw(m)
    if direction > 0:
        d.rectangle(
            [x * k, (cy - shaft / 2) * k, (x + w - head * 0.45) * k, (cy + shaft / 2) * k],
            fill=255,
        )
        d.polygon(
            [
                ((x + w - head) * k, y * k),
                ((x + w) * k, cy * k),
                ((x + w - head) * k, (y + h) * k),
            ],
            fill=255,
        )
    else:
        d.rectangle(
            [(x + head * 0.45) * k, (cy - shaft / 2) * k, (x + w) * k, (cy + shaft / 2) * k],
            fill=255,
        )
        d.polygon(
            [
                ((x + head) * k, y * k),
                (x * k, cy * k),
                ((x + head) * k, (y + h) * k),
            ],
            fill=255,
        )
    return m


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


def photo_editor():
    """One picture and the two crop corners. Not the Photo Studio stack."""
    k = K192
    card = rrect(box(34, 49, 158, 144, k), 8 * k)
    color = Image.new("RGBA", (S, S), PE_SKY + (255,))
    peaks = [
        (36, 131), (48, 117), (60, 104), (68, 95), (76, 89),
        (88, 102), (100, 116), (108, 120), (116, 110), (124, 103),
        (136, 113), (148, 124), (156, 132),
    ]
    paint(color, mountain(peaks, 144, k), PE_GREEN)
    paint(color, ellipse(box(110, 60, 134, 84, k)), PE_SUN)
    tl = ell(22, 37, 70, 85, 8, k, "tl")
    br = ell(122, 107, 170, 155, 8, k, "br")
    return compose([(card, color), (tl, WHITE), (br, WHITE)])


def photo_studio():
    """Stacked cards, picture on the front, sparkle. No crop corners."""
    k = K192
    back = rrect(box(63, 38, 159, 109, k), 8 * k)
    mid = rrect(box(48, 52, 144, 124, k), 8 * k)
    front = rrect(box(32, 70, 131, 151, k), 8 * k)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    paint(color, rrect(box(38, 76, 125, 145, k), 4 * k), PS_SKY)
    peaks = [
        (40, 143), (52, 126), (64, 109), (76, 118), (88, 133),
        (100, 120), (112, 128), (124, 141),
    ]
    paint(color, mountain(peaks, 145, k), PS_GREEN)
    paint(color, ellipse(box(100, 83, 114, 97, k)), PS_SUN)
    # White border, painted last so it frames the picture.
    paint(color, rounded_ring(box(32, 70, 131, 151, k), 8 * k, 6 * k), WHITE)
    spark = star4(149.5, 149, 16, 6.5, k)
    return compose([
        (back, WHITE),
        (mid, WHITE),
        (front, color),
        (spark, PS_SPARK),
    ])


def camera():
    k = K192
    body = rrect(box(29, 62, 163, 150, k), 16 * k)
    hump = rrect(box(67, 42, 125, 80, k), 10 * k)
    shape = union(body, hump)
    color = Image.new("RGBA", (S, S), CAM_BODY + (255,))
    paint(color, circ(96, 102, 30, k), TILE)
    paint(color, circ(96, 102, 19, k), CAM_LENS)
    paint(color, circ(144, 72, 6, k), CAM_RED)
    return compose([(shape, color)])


def gallery():
    k = K256
    cells = [
        (40, 40, 120, 120),
        (136, 40, 216, 120),
        (40, 136, 120, 216),
        (136, 136, 216, 216),
    ]
    # Two peaks, measured on the top-left thumbnail and repeated.
    rel = [
        (12, 70), (22, 58), (30, 48), (34, 39), (42, 46),
        (50, 56), (58, 50), (66, 60), (74, 74),
    ]
    shapes = []
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    for x0, y0, x1, y1 in cells:
        shapes.append(rrect(box(x0, y0, x1, y1, k), 10 * k))
        pts = [(x0 + dx, y0 + dy) for dx, dy in rel]
        paint(color, mountain(pts, y1 - 6, k), GAL_MTN)
        paint(color, ellipse(box(x0 + 52, y0 + 14, x0 + 66, y0 + 28, k)), GAL_SUN)
    return compose([(union(*shapes), color)])


def gif_maker():
    k = K256
    film = rrect(box(40, 64, 216, 192, k), 14 * k)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    for cx in (84, 110, 136, 162, 188):
        paint(color, rrect(box(cx - 6.5, 73, cx + 6.5, 84, k), 2 * k), GIF_PURPLE)
        paint(color, rrect(box(cx - 6.5, 172, cx + 6.5, 183, k), 2 * k), GIF_PURPLE)
    # Bold GIF, in the purple of the old badge.
    g_outer = rrect(box(74, 104, 120, 154, k), 12 * k)
    g_hole = rrect(box(88, 118, 128, 140, k), 6 * k)
    g = ImageChops.subtract(g_outer, g_hole)
    g_bar = rrect(box(98, 124, 118, 138, k), 3 * k)
    paint(color, union(g, g_bar), GIF_PURPLE)
    paint(color, rrect(box(130, 104, 143, 154, k), 3 * k), GIF_PURPLE)
    stem = rrect(box(154, 104, 167, 154, k), 3 * k)
    top = rrect(box(154, 104, 190, 117, k), 3 * k)
    mid = rrect(box(154, 124, 184, 137, k), 3 * k)
    paint(color, union(stem, top, mid), GIF_PURPLE)
    return compose([(film, color)])


def image_converter():
    k = K256
    frame = box(36, 32, 220, 168, k)
    shape_f = rrect(frame, 16 * k)
    sky = Image.new("RGBA", (S, S), IC_SKY + (255,))
    back = [
        (50, 138), (68, 119), (86, 101), (98, 88), (110, 80),
        (128, 98), (146, 114), (164, 104), (176, 90), (194, 116), (206, 136),
    ]
    paint(sky, mountain(back, 156, k), IC_BACK)
    front = [(48, 154), (78, 132), (110, 118), (150, 128), (184, 140), (210, 154)]
    paint(sky, mountain(front, 156, k), IC_FRONT)
    paint(sky, ellipse(box(142, 56, 180, 94, k)), IC_SUN)
    paint(sky, rounded_ring(frame, 16 * k, 14 * k), WHITE)

    badge = rrect(box(68, 180, 188, 240, k), 10 * k)
    yellow = Image.new("RGBA", (S, S), IC_BADGE + (255,))
    paint(yellow, arrow(82, 188, 92, 20, 1, k), IC_ARROW)
    paint(yellow, arrow(82, 212, 92, 20, -1, k), IC_ARROW)
    return compose([(shape_f, sky), (badge, yellow)])


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
        "apps/media/photo-editor-v2/photo-editor-v2_icon.png": photo_editor(),
        "apps/media/photo-studio/photo-studio_icon.png": photo_studio(),
        "apps/media/camera/camera_icon.png": camera(),
        "apps/media/gallery/gallery_icon.png": gallery(),
        "apps/media/gif-maker/gifmaker_icon.png": gif_maker(),
        "apps/media/image-converter/image-converter_icon.png": image_converter(),
    }
    for path, im in icons.items():
        check(im, path)
        im.save(path, "PNG")
    # The Media page and the hub index resolve an empty CSV icon to
    # gif-maker/gif-maker_icon.png. That file was missing (the tile was
    # a letter). The app artwork lived in gifmaker_icon.png. Same PNG.
    icons["apps/media/gif-maker/gifmaker_icon.png"].save(
        "apps/media/gif-maker/gif-maker_icon.png", "PNG"
    )
    check(
        icons["apps/media/gif-maker/gifmaker_icon.png"],
        "apps/media/gif-maker/gif-maker_icon.png",
    )


if __name__ == "__main__":
    main()
