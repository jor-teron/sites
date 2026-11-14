#!/usr/bin/env python3
"""IC9b: colourful Connectivity Chat icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC8 and IC9a
(apps/connectivity/ic9a_colour_icons.py): the shared dark #1c1f24 is a
thin outline and a soft shadow. There is no baked tile and no rounded
coloured background.

IC9b is the colourful release for the Chat section. Each symbol uses
several clear, friendly colours, and each app has its own palette.
The recognisable mark is kept: Pooh Chat's two quotation marks,
Video Chat's camera, Screen Share's monitor and up arrow, Intercom's
microphone and waves, Telephone's handset and rotary dial, Messages'
speech bubble and three dots, Contacts' head and shoulders.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC9b.png / .svg backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

import math
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


def arc(x0, y0, x1, y1, start, end, width):
    m = mask()
    ImageDraw.Draw(m).arc(box(x0, y0, x1, y1), start, end, fill=255, width=width)
    return m


def disc(cx, cy, r):
    return ellipse(box(cx - r, cy - r, cx + r, cy + r))


def cubic(p0, p1, p2, p3, n=18):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x * K, y * K))
    return pts


def quote_parts(x, scale=3.8):
    """One mark from the old Pooh Chat bitmap (14×24).

    A short backslash sits on the left of a heavy bar. The bar is the
    lower half and the full width; the stroke does not run down the
    middle (that read as a lollipop).
    """
    # Glyph corners, in its own 14×24 cell: slash, then the bar.
    cell = [(5, 0), (10, 0), (7, 11), (14, 11), (14, 24), (0, 24), (0, 11)]
    pts = [((x + px * scale) * K, (6 + py * scale) * K) for px, py in cell]
    shape = poly(pts)
    bar = rrect(box(x, 6 + 11 * scale, x + 14 * scale, 6 + 24 * scale), 2 * K)
    return shape, bar


def pooh_chat():
    """Two quotation marks. The orange tile is not drawn.

    Left mark is cream with a gold bar. Right mark is orange with a
    rose bar. Same side-by-side pair, same lean, as the old icon.
    """
    def one(x, stroke_rgb, bar_rgb):
        shape, bar = quote_parts(x)
        return coloured(shape, stroke_rgb, [(intersect(bar, shape), bar_rgb)])

    # 14*3.8 = 53 wide. The old gap was 4px on a 14px mark.
    left = one(6, (254, 243, 199), (245, 158, 11))
    right = one(74, (249, 115, 22), (251, 113, 133))
    return compose([left, right])


def video_chat():
    """Camera: rounded body, round lens, triangle. The dark tile is not drawn.

    The lens hole was that tile, so it stays clear. Body is sky, the
    ring around the hole is gold, the triangle is rose.
    """
    body = rrect(box(4, 36, 90, 96), 16 * K)
    hole = disc(46, 66, 16)
    ring = subtract(disc(46, 66, 26), hole)
    cam = subtract(body, hole)
    tri = poly([(96 * K, 46 * K), (124 * K, 66 * K), (96 * K, 86 * K)])
    cam_s, cam_c = coloured(cam, (56, 189, 248), [
        (intersect(ring, cam), (250, 204, 21)),
    ])
    return compose([(cam_s, cam_c), (tri, (244, 63, 94))])


def screen_share():
    """Monitor, up arrow and stand. The dark tile is not drawn.

    The screen was that tile, so it is not filled. Bezel is blue, the
    arrow is amber with a gold head, the stand is teal.
    """
    outer = rrect(box(8, 6, 120, 82), 10 * K)
    inner = rrect(box(20, 16, 108, 70), 6 * K)
    frame = subtract(outer, inner)
    shaft = rrect(box(56, 34, 72, 60), 3 * K)
    head = poly([(42 * K, 40 * K), (86 * K, 40 * K), (64 * K, 18 * K)])
    arrow = intersect(union(shaft, head), inner)
    neck = rrect(box(52, 76, 76, 100), 3 * K)
    foot = rrect(box(30, 96, 98, 114), 5 * K)
    stand = union(neck, foot)
    arrow_s, arrow_c = coloured(arrow, (245, 158, 11), [
        (intersect(head, arrow), (250, 204, 21)),
    ])
    return compose([
        (frame, (37, 99, 235)),
        (arrow_s, arrow_c),
        (stand, (13, 148, 136)),
    ])


def intercom():
    """Microphone and two waves. The teal tile is not drawn.

    Capsule is rose with a cream band, the cradle and stand are gold,
    the waves are cyan and mint.
    """
    cap = rrect(box(44, 6, 84, 74), 18 * K)
    band = rrect(box(44, 28, 84, 46), 4 * K)
    arm_l = rrect(box(30, 44, 46, 82), 5 * K)
    arm_r = rrect(box(82, 44, 98, 82), 5 * K)
    bowl = subtract(ellipse(box(30, 58, 98, 102)), ellipse(box(44, 52, 84, 96)))
    stem = rrect(box(58, 92, 70, 112), 3 * K)
    foot = rrect(box(36, 106, 92, 122), 6 * K)
    stand = union(arm_l, arm_r, bowl, stem, foot)
    cap_s, cap_c = coloured(cap, (251, 113, 133), [
        (intersect(band, cap), (255, 247, 237)),
    ])
    # Both arcs stay inside the 128 source square. The second used to
    # fall off the 4x canvas and drew nothing.
    wave_a = arc(96, 22, 118, 62, 280, 440, int(6 * K))
    wave_b = arc(106, 14, 126, 70, 285, 435, int(6 * K))
    return compose([
        (stand, (245, 158, 11)),
        (cap_s, cap_c),
        (wave_a, (34, 211, 238)),
        (wave_b, (52, 211, 153)),
    ])


def telephone():
    """Handset over a rotary dial. The green tile is not drawn.

    Handset is emerald. The base is aqua, the dial cream, the finger
    holes stay clear (they were the tile), the centre is gold and the
    finger stop is rose.
    """
    hand = rrect(box(10, 6, 118, 40), 14 * K)
    post_l = rrect(box(30, 36, 42, 56), 3 * K)
    post_r = rrect(box(86, 36, 98, 56), 3 * K)
    base = rrect(box(20, 48, 108, 120), 14 * K)
    body = union(base, post_l, post_r)
    dial = disc(64, 86, 30)
    holes = []
    for i in range(10):
        # Leave the lower-right open for the finger stop.
        ang = math.radians(-210 + i * (300 / 9))
        hx = 64 + 19 * math.cos(ang)
        hy = 86 + 19 * math.sin(ang)
        holes.append(disc(hx, hy, 4.2))
    ring = subtract(intersect(dial, body), union(*holes))
    centre = disc(64, 86, 10)
    stop = rrect(box(84, 100, 98, 114), 3 * K)
    ring_s, ring_c = coloured(ring, (255, 247, 237), [
        (intersect(centre, ring), (250, 204, 21)),
    ])
    return compose([
        (body, (45, 212, 191)),
        (ring_s, ring_c),
        (intersect(stop, body), (244, 63, 94)),
        (hand, (5, 150, 105)),
    ])


def messages():
    """Speech bubble and three dots. The blue tile is not drawn.

    The dots were that tile showing through, so they are drawn as
    violet, emerald and amber dots. The bubble is cream and the tail
    is sky.
    """
    bubble = rrect(box(8, 8, 120, 88), 18 * K)
    tail = poly([(26 * K, 74 * K), (54 * K, 74 * K), (16 * K, 118 * K)])
    shape = union(bubble, tail)
    dots = (
        (disc(40, 48, 8), (124, 58, 237)),
        (disc(64, 48, 8), (16, 185, 129)),
        (disc(88, 48, 8), (245, 158, 11)),
    )
    shape_s, shape_c = coloured(shape, (255, 251, 235), [
        (intersect(tail, shape), (56, 189, 248)),
        *[(intersect(d, shape), rgb) for d, rgb in dots],
    ])
    return compose([(shape_s, shape_c)])


def contacts():
    """Head and shoulders, the same bust as the old SVG. The blue tile is not drawn.

    Hair is violet, the face is peach, the shoulders are blue.
    """
    head = disc(64, 36, 24)
    hair = intersect(head, ellipse(box(36, 4, 92, 40)))
    # Same shoulders path as contacts_icon.svg, scaled by 2.
    left = cubic((28, 104), (32, 84), (46, 74), (64, 74))
    right = cubic((64, 74), (82, 74), (96, 84), (100, 104))
    shoulders = poly(left + right + [(28 * K, 104 * K)])
    head_s, head_c = coloured(head, (253, 186, 116), [
        (hair, (124, 58, 237)),
    ])
    return compose([(shoulders, (37, 99, 235)), (head_s, head_c)])


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
        "apps/connectivity/pooh-chat/pooh-chat_icon.png": pooh_chat(),
        "apps/connectivity/video-chat/video-chat_icon.png": video_chat(),
        "apps/connectivity/screen-share/screenshare_icon.png": screen_share(),
        "apps/connectivity/intercom/intercom_icon.png": intercom(),
        "apps/connectivity/telephone/telephone_icon.png": telephone(),
        "apps/connectivity/messages/messages_icon.png": messages(),
        "apps/connectivity/contacts/contacts_icon.png": contacts(),
    }
    for path, im in icons.items():
        check(im, path)
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
