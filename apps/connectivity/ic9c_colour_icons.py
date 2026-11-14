#!/usr/bin/env python3
"""IC9c: colourful Connectivity Remote icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC8, IC9a and IC9b
(apps/connectivity/ic9b_colour_icons.py): the shared dark #1c1f24 is a
thin outline and a soft shadow. There is no baked tile and no rounded
coloured background.

IC9c is the colourful release for the Remote section. Each symbol uses
several clear, friendly colours, and each app has its own palette.
The recognisable mark is kept: SSH's terminal window, traffic lights
and prompt, VNC's monitor with a play triangle, Remote's monitor with
a right arrow and a stand.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC9c.png / .svg backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512  # 4x supersample
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # #1c1f24, the outline

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

K = 4.0


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


def box(x0, y0, x1, y1, k=K):
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


def stroke(points, width):
    """Thick polyline with round caps, in scaled source pixels."""
    m = mask()
    draw = ImageDraw.Draw(m)
    scaled = [(x * K, y * K) for x, y in points]
    draw.line(scaled, fill=255, width=width, joint="curve")
    r = width / 2
    for x, y in scaled:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=255)
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


def coloured(shape, base, spots):
    """One silhouette. spots are (mask, rgb) painted over the base colour."""
    color = Image.new("RGBA", (S, S), base + (255,))
    for m, rgb in spots:
        paint(color, m, rgb)
    return shape, color


def disc(cx, cy, r):
    return ellipse(box(cx - r, cy - r, cx + r, cy + r))


def ssh():
    """Terminal window, traffic lights, prompt and cursor.

    Measured on the old 192px icon. The window ran almost to the edge
    (about x 6–186, y 6–186). The title band was blue down to y≈45;
    the body was the dark tile colour, so it is not filled. Dots sat
    near (28, 24), (49, 24) and (70, 24). The chevron point was near
    (84, 109) and the underscore near y=133, x=92–150.

    Frame is the old title blue. Dots stay red, gold and green. The
    prompt is the old green. The cursor stays light.
    """
    outer = rrect(box(8, 8, 120, 120), 16 * K)
    # Hole starts under the title band, so the top of the frame reads
    # as the title bar and the screen stays clear.
    inner = rrect(box(18, 40, 110, 110), 8 * K)
    frame = subtract(outer, inner)
    dots = (
        (disc(28, 24, 5), (248, 88, 80)),
        (disc(44, 24, 5), (248, 184, 40)),
        (disc(60, 24, 5), (40, 200, 64)),
    )
    # Same > as the old bitmap: two arms meeting at the point, kept
    # inside the screen.
    chev = intersect(union(
        stroke([(32, 56), (62, 76)], int(13 * K)),
        stroke([(62, 76), (32, 96)], int(13 * K)),
    ), inner)
    cursor = intersect(rrect(box(70, 88, 104, 98), 4 * K), inner)
    frame_s, frame_c = coloured(frame, (47, 111, 228), [
        (intersect(d, frame), rgb) for d, rgb in dots
    ])
    return compose([
        (frame_s, frame_c),
        (chev, (72, 192, 104)),
        (cursor, (229, 231, 235)),
    ])


def vnc():
    """Monitor, play triangle and a short stand. The blue tile is not drawn.

    Same parts as vnc_icon.svg: white bezel, gold play mark, short
    bar under the screen. The navy screen was a fill, so it is not
    filled. Bezel is cream, the triangle is gold, the stand is sky.
    """
    outer = rrect(box(14, 16, 114, 78), 8 * K)
    inner = rrect(box(26, 26, 102, 66), 4 * K)
    frame = subtract(outer, inner)
    # Play triangle, optically a little left of centre, pointing right.
    tri = poly([(46 * K, 60 * K), (84 * K, 46 * K), (46 * K, 32 * K)])
    play = intersect(tri, inner)
    stand = rrect(box(44, 88, 84, 100), 5 * K)
    return compose([
        (frame, (255, 247, 237)),
        (play, (250, 204, 21)),
        (stand, (56, 189, 248)),
    ])


def remote():
    """Monitor, right arrow and stand. The teal tile is not drawn.

    Same parts as rm_icon.svg: bezel, a right-pointing arrow on the
    screen, a neck and a foot. The dark screen was a fill, so it is
    not filled. Bezel is teal, the arrow is orange with a rose head,
    the stand is indigo.
    """
    outer = rrect(box(12, 6, 116, 68), 8 * K)
    inner = rrect(box(22, 14, 106, 58), 4 * K)
    frame = subtract(outer, inner)
    shaft = rrect(box(36, 30, 62, 44), 3 * K)
    head = poly([(56 * K, 22 * K), (90 * K, 37 * K), (56 * K, 52 * K)])
    arrow = intersect(union(shaft, head), inner)
    neck = rrect(box(50, 62, 78, 92), 3 * K)
    foot = rrect(box(28, 86, 100, 108), 5 * K)
    stand = union(neck, foot)
    arrow_s, arrow_c = coloured(arrow, (249, 115, 22), [
        (intersect(head, arrow), (251, 113, 133)),
    ])
    return compose([
        (frame, (20, 184, 166)),
        (arrow_s, arrow_c),
        (stand, (99, 102, 241)),
    ])


def check(im, name):
    if im.size != (OUT, OUT) or im.mode != "RGBA":
        raise SystemExit(f"{name}: expected {OUT}x{OUT} RGBA, got {im.size} {im.mode}")
    px = im.load()
    bad = []
    buckets = set()
    for y in range(OUT):
        for x in range(OUT):
            r, g, b, a = px[x, y]
            if x < 8 or y < 8 or x >= OUT - 8 or y >= OUT - 8:
                if a != 0:
                    bad.append((x, y, (r, g, b, a)))
                    if len(bad) >= 6:
                        break
            elif a >= 128:
                buckets.add((r // 28 * 28, g // 28 * 28, b // 28 * 28))
        if len(bad) >= 6:
            break
    corners = [px[0, 0], px[OUT - 1, 0], px[0, OUT - 1], px[OUT - 1, OUT - 1]]
    if bad or any(c[3] != 0 for c in corners):
        raise SystemExit(f"{name}: outer 8px or corner not clear: {bad} corners {corners}")
    # Outline and shadow are near-black. Several other buckets means
    # the symbol itself is multi-colour.
    colourful = [b for b in buckets if b[0] > 40 or b[1] > 40 or b[2] > 40]
    if len(colourful) < 3:
        raise SystemExit(f"{name}: expected several colours, saw {sorted(buckets)}")
    print(name, "OK", im.size, im.mode, "bbox", im.getbbox(), "colours", len(colourful))


def main():
    icons = {
        "apps/connectivity/ssh/ssh_icon.png": ssh(),
        "apps/connectivity/vnc/vnc_icon.png": vnc(),
        "apps/connectivity/remote/remote_icon.png": remote(),
    }
    for path, im in icons.items():
        check(im, path)
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
