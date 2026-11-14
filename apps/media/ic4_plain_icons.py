#!/usr/bin/env python3
"""IC4: plain Media 3D and Read icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1 / IC2 / IC3
(ic1_plain_icons.py, ic2_plain_icons.py, ic3_plain_icons.py):
the shared dark #1c1f24 is a thin outline and a soft shadow.

3D Viewer: the white "3D" wordmark. The old purple rounded tile
(#7b3fa0) is not drawn.
3D Builder: the isometric cube (two-tone top, front face) with the
short green and red axis ticks. The old slate rounded tile
(#0f172a) is not drawn. The right-hand face was the same colour as
that tile, so it is not a separate face here either. The wordmark
and the cube stay different marks.
News: the newspaper (white sheet, red masthead, blue picture,
grey lines) and the pale sheet behind it. The old blue rounded
tile (#2563eb) is not drawn.

Symbol colours are the ones already on each glyph.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC4.png backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512  # 4x supersample
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # #1c1f24, the outline
WHITE = (255, 255, 255)

# Colours sampled from the current icons.
CUBE_TL = (37, 99, 235)       # #2563eb top-left
CUBE_TR = (147, 197, 253)     # #93c5fd top-right
CUBE_FRONT = (30, 64, 175)    # #1e40af front face
CUBE_EDGE = (241, 245, 249)   # #f1f5f9
AXIS_GREEN = (74, 222, 128)   # #4ade80
AXIS_RED = (248, 113, 113)    # #f87171

NEWS_BACK = (219, 234, 254)   # #dbeafe
NEWS_RED = (244, 63, 94)      # #f43f5e
NEWS_PHOTO = (147, 197, 253)  # #93c5fd
NEWS_LINE = (148, 163, 184)   # #94a3b8

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38


def mask():
    return Image.new("L", (S, S), 0)


def union(*masks):
    out = masks[0]
    for m in masks[1:]:
        out = ImageChops.lighter(out, m)
    return out


def box(x0, y0, x1, y1, k=1):
    return [x0 * k, y0 * k, x1 * k, y1 * k]


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


def stroke(draw, segments, width, fill):
    """Thick segments with round caps, so the cube edges meet cleanly."""
    r = width / 2.0
    for a, b in segments:
        draw.line([a, b], fill=fill, width=width)
        draw.ellipse([a[0] - r, a[1] - r, a[0] + r, a[1] + r], fill=fill)
        draw.ellipse([b[0] - r, b[1] - r, b[0] + r, b[1] + r], fill=fill)


def open_bowl(cx, cy, rx, ry, thick):
    """Right-hand bowl of a 3: a ring with the left side cut away."""
    outer = ellipse([cx - rx, cy - ry, cx + rx, cy + ry])
    inner = ellipse([
        cx - rx + thick * 0.15,
        cy - ry + thick,
        cx + rx - thick,
        cy + ry - thick,
    ])
    ring = ImageChops.subtract(outer, inner)
    cut = mask()
    ImageDraw.Draw(cut).rectangle([cx - rx - 4, cy - ry - 4, cx - rx * 0.15, cy + ry + 4], fill=255)
    return ImageChops.subtract(ring, cut)


def viewer_3d():
    """White 3D wordmark. Not the Builder's cube.

    Letter proportions follow the old glyph: a 3 with a shorter
    middle bar, and a D with a straight stem and a round bowl.
    Drawn inside the 512 canvas (an earlier scale ran off it).
    """
    H = 250
    y0 = (S - H) / 2
    three_w = H * 0.70
    gap = H * 0.28
    dee_w = H * 0.92
    total = three_w + gap + dee_w
    x0 = (S - total) / 2
    thick = H * 0.20
    stem = H * 0.22

    upper = open_bowl(x0 + three_w * 0.55, y0 + H * 0.27, three_w * 0.55, H * 0.28, thick)
    lower = open_bowl(x0 + three_w * 0.55, y0 + H * 0.73, three_w * 0.55, H * 0.28, thick)
    # Middle bar, shorter than the bowls and right-aligned, as on the old 3.
    mid = rrect(
        [x0 + three_w * 0.22, y0 + H * 0.42, x0 + three_w + thick * 0.05, y0 + H * 0.58],
        thick * 0.45,
    )
    three = union(upper, lower, mid)

    dx = x0 + three_w + gap
    stem_m = rrect([dx, y0 + thick * 0.15, dx + stem, y0 + H - thick * 0.15], thick * 0.25)
    bowl = ellipse([dx + stem * 0.35, y0, dx + dee_w, y0 + H])
    hole = ellipse([
        dx + stem * 0.95,
        y0 + thick * 0.85,
        dx + dee_w - thick * 0.85,
        y0 + H - thick * 0.85,
    ])
    dee = ImageChops.subtract(union(stem_m, bowl), hole)
    return compose([(union(three, dee), WHITE)])


def builder_3d():
    """Isometric cube, the same three faces as the old glyph.

    The right-hand face was painted in the tile colour, so it is
    left out. Green and red ticks mark the near corner.
    """
    cx, top = 256, 36
    hx, hy = 168, 84
    vz = 148
    T = (cx, top)
    L = (cx - hx, top + hy)
    R = (cx + hx, top + hy)
    J = (cx, top + 2 * hy)
    FL = (L[0], L[1] + vz)
    B = (J[0], J[1] + vz)

    top_left = poly([T, L, J])
    top_right = poly([T, J, R])
    front = poly([L, J, B, FL])
    shape = union(top_left, top_right, front)

    # Axis ticks at the lower-left corner. Green runs up the outside
    # of the left edge; red sits on the front face, pointing right.
    g_w = 14
    green = rrect(
        [L[0] - g_w - 4, L[1] + vz * 0.42, L[0] - 3, FL[1] - 6],
        g_w / 2,
    )
    red = mask()
    ImageDraw.Draw(red).line(
        [(FL[0] + 8, FL[1] - 16), (FL[0] + 58, FL[1] - 30)],
        fill=255,
        width=12,
    )
    # Round the red cap so it does not end in a square.
    rx, ry = FL[0] + 58, FL[1] - 30
    ImageDraw.Draw(red).ellipse([rx - 6, ry - 6, rx + 6, ry + 6], fill=255)
    shape = union(shape, green, red)

    color = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    paint(color, top_left, CUBE_TL)
    paint(color, top_right, CUBE_TR)
    paint(color, front, CUBE_FRONT)
    edges = [
        (T, L), (T, R), (T, J),
        (L, J), (J, R),
        (L, FL), (J, B), (FL, B),
    ]
    stroke(ImageDraw.Draw(color), edges, 11, CUBE_EDGE + (255,))
    paint(color, green, AXIS_GREEN)
    paint(color, red, AXIS_RED)
    return compose([(shape, color)])


def news():
    """Newspaper: pale sheet behind, white front page, red masthead."""
    k = 2.4
    # Back sheet is shorter and sits lower, shifted right, which is
    # the strip that showed beside the old page.
    back = rrect(box(54, 64, 156, 158, k), 12 * k)
    front = rrect(box(36, 42, 138, 156, k), 12 * k)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    paint(color, rrect(box(51, 56, 123, 78, k), 7 * k), NEWS_RED)
    paint(color, rrect(box(51, 90, 84, 120, k), 5 * k), NEWS_PHOTO)
    paint(color, rrect(box(93, 90, 123, 98, k), 3.5 * k), NEWS_LINE)
    paint(color, rrect(box(93, 106, 123, 114, k), 3.5 * k), NEWS_LINE)
    paint(color, rrect(box(51, 132, 123, 140, k), 3.5 * k), NEWS_LINE)
    return compose([(back, NEWS_BACK), (front, color)])


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
        "apps/media/3d-viewer/3d-viewer_icon.png": viewer_3d(),
        "apps/media/3d-builder/3d-builder_icon.png": builder_3d(),
        "apps/media/news/news_icon.png": news(),
    }
    for path, im in icons.items():
        check(im, path)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
