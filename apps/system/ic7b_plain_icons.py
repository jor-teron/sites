#!/usr/bin/env python3
"""IC7b: plain System-section icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC8 and IC7a
(apps/office/ic8_plain_icons.py, apps/system/ic7a_plain_icons.py):
the shared dark #1c1f24 is a thin outline and a soft shadow.

Settings: white gear, rainbow ring, white hub, three sparkles.
API Keys: blue key, ring bow with a hole, two teeth.
System Monitor: monitor outline, grid, green graph, white dot.
Mesh Viewer: five blue nodes, green hub, blue edges, green spokes.
Notification Centre: white bell, clapper, red badge.
Terminal: green window frame and a prompt.
App Hub: four rounded squares, three white and one gold.
Search: white magnifier, gold inner ring, empty lens.

Symbol colours are the ones already on each glyph. The coloured
tile is not drawn. system_icon.png is not drawn.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC7b.png backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512  # 4x supersample of the 128px icon
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # #1c1f24, the outline
WHITE = (255, 255, 255)

# Colours sampled from the current icons.
KEY_BLUE = (110, 168, 254)       # #6ea8fe
FRAME = (93, 114, 176)           # monitor bezel
GRAPH = (80, 230, 170)           # #50e6aa
NODE_BLUE = (110, 168, 254)      # #6ea8fe
NODE_GREEN = (80, 230, 170)      # #50e6aa
BADGE = (220, 38, 38)            # #dc2626
TERM = (51, 255, 102)            # #33ff66
GOLD_SQ = (243, 208, 100)        # App Hub square
LENS_GOLD = (255, 200, 60)       # #ffc83c

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

# Settings, Terminal, App Hub and Search were measured on the 128px icons.
K128 = 4.0
# API Keys, System Monitor and Mesh Viewer were measured on the 192px icons.
K192 = 2.4
# Notification Centre was measured on the 256px icon.
K256 = 2.0

# Hue stops around the Settings wheel, sampled at r=14.
# Angle 0 is east; positive is toward the bottom of the icon.
WHEEL = (
    (0, (255, 170, 40)),
    (45, (255, 220, 60)),
    (90, (180, 214, 80)),
    (120, (60, 210, 120)),
    (165, (40, 180, 255)),
    (210, (86, 146, 255)),
    (240, (150, 100, 255)),
    (270, (228, 85, 155)),
    (300, (255, 80, 120)),
    (330, (255, 136, 70)),
    (360, (255, 170, 40)),
)


def mask():
    return Image.new("L", (S, S), 0)


def union(*masks):
    out = masks[0]
    for m in masks[1:]:
        out = ImageChops.lighter(out, m)
    return out


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


def capsule(x0, y0, x1, y1, radius, k):
    """Round-ended stroke from one source point to another."""
    m = mask()
    d = ImageDraw.Draw(m)
    w = max(1, int(round(radius * 2 * k)))
    d.line([(x0 * k, y0 * k), (x1 * k, y1 * k)], fill=255, width=w)
    r = radius * k
    d.ellipse([x0 * k - r, y0 * k - r, x0 * k + r, y0 * k + r], fill=255)
    d.ellipse([x1 * k - r, y1 * k - r, x1 * k + r, y1 * k + r], fill=255)
    return m


def stroke(points, width, k):
    """Round polyline through source points."""
    m = mask()
    d = ImageDraw.Draw(m)
    seq = [(x * k, y * k) for x, y in points]
    w = max(1, int(round(width * k)))
    d.line(seq, fill=255, width=w, joint="curve")
    r = w / 2.0
    for x, y in seq:
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return m


def paint(base, shape, rgb):
    layer = Image.new("RGBA", (S, S), rgb + (255,))
    layer.putalpha(shape)
    base.alpha_composite(layer)


def wheel(deg):
    deg = deg % 360
    for i in range(len(WHEEL) - 1):
        a0, c0 = WHEEL[i]
        a1, c1 = WHEEL[i + 1]
        if a0 <= deg <= a1:
            t = 0 if a1 == a0 else (deg - a0) / (a1 - a0)
            return tuple(int(c0[j] + (c1[j] - c0[j]) * t) for j in range(3))
    return WHEEL[0][1]


def paint_wheel(base, cx, cy, r0, r1, k):
    px = base.load()
    cx *= k
    cy *= k
    r0 *= k
    r1 *= k
    x_from = max(0, int(cx - r1) - 1)
    x_to = min(S, int(cx + r1) + 2)
    y_from = max(0, int(cy - r1) - 1)
    y_to = min(S, int(cy + r1) + 2)
    for y in range(y_from, y_to):
        dy = y - cy
        for x in range(x_from, x_to):
            dx = x - cx
            d = math.hypot(dx, dy)
            if r0 <= d <= r1:
                px[x, y] = wheel(math.degrees(math.atan2(dy, dx))) + (255,)


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


def gear_tooth(cx, cy, ang, r_base, r_tip, spread_base, spread_tip, k):
    """One trapezoid tooth. ang is radians, 0 = east, + = downward."""
    pts = []
    for da, r in (
        (-spread_base, r_base),
        (-spread_tip, r_tip),
        (spread_tip, r_tip),
        (spread_base, r_base),
    ):
        a = ang + da
        pts.append((cx * k + r * k * math.cos(a), cy * k + r * k * math.sin(a)))
    return poly(pts)


def settings_icon():
    """White gear, rainbow ring, white hub, three sparkles.

    Measured on the 128px icon. The purple-to-blue gradient tile
    is not drawn. Gear centre (63.5, 66): hub r=8, rainbow to r=21,
    valley r=37, eight teeth out to r=47 at 22.5° + n*45°.
    """
    k = K128
    cx, cy = 63.5, 66.0
    body = circle(cx, cy, 37, k)
    teeth = [
        gear_tooth(cx, cy, math.radians(22.5 + i * 45), 33, 47,
                   math.radians(15), math.radians(7.5), k)
        for i in range(8)
    ]
    shape = union(body, *teeth)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    paint_wheel(color, cx, cy, 9, 21, k)
    return compose([
        (shape, color),
        (star4(104.5, 22.5, 9.2, 4.4, k), WHITE),
        (star4(24.0, 104.5, 5.6, 2.6, k), WHITE),
        (star4(109.5, 102.0, 3.6, 1.7, k), WHITE),
    ])


def shaft_xy(t, v):
    """API Keys shaft coordinates. t runs down-right, v runs up-right."""
    ox, oy = 96.4, 100.5
    ax, ay = 0.70710678, 0.70710678
    vx, vy = 0.70710678, -0.70710678
    return (ox + t * ax + v * vx, oy + t * ay + v * vy)


def key_icon():
    """Blue key. The dark tile is not drawn.

    Measured on the 192px icon. Bow centre (72, 74), outer r=36,
    hole r=18. Shaft width 23 along 45°, two teeth on the upper side.
    The hole was the tile, so it stays empty.
    """
    k = K192
    bow = subtract(circle(72, 74, 36, k), circle(72, 74, 18, k))
    p0 = shaft_xy(0, 0)
    p1 = shaft_xy(72, 0)
    shaft = capsule(p0[0], p0[1], p1[0], p1[1], 11.5, k)

    def tooth(t0, t1, v1):
        corners = (shaft_xy(t0, 8), shaft_xy(t1, 8), shaft_xy(t1, v1), shaft_xy(t0, v1))
        return poly([(x * k, y * k) for x, y in corners])

    shape = union(bow, shaft, tooth(29, 43, 23), tooth(51, 66, 24))
    return compose([(shape, KEY_BLUE)])


def sysmon_icon():
    """Monitor outline, three rules, a green graph and a white dot.

    Measured on the 192px icon. The dark gradient tile is not drawn,
    so the screen stays empty. Bezel is the blue-grey that was the
    stroke. The graph is the bright core of the old line.
    """
    k = K192
    outer = rrect(box(26, 34, 165, 142, k), 12 * k)
    inner = rrect(box(29, 37, 162, 139, k), 9 * k)
    neck = rrect(box(77, 141, 114, 156, k), 2 * k)
    foot = rrect(box(58, 153, 133, 167, k), 4 * k)
    rules = [rrect(box(36, y, 156, y + 1, k), 1 * k) for y in (62, 88, 114)]
    frame = union(subtract(outer, inner), neck, foot, *rules)
    line = stroke((
        (38, 119), (50, 114), (62, 104), (72, 94), (84, 103),
        (94, 82), (102, 66), (116, 84), (128, 77), (142, 62),
        (152, 56), (154, 48),
    ), 6, k)
    return compose([
        (frame, FRAME),
        (line, GRAPH),
        (circle(154, 48, 6.5, k), WHITE),
    ])


def mesh_icon():
    """Five blue nodes around a green hub.

    Measured on the 192px icon. The dark tile is not drawn.
    Outer nodes sit on a pentagon of radius 52 around (95.5, 99.5).
    Blue edges join the outer nodes. Green spokes join the hub.
    Each node is a white ring with a coloured centre.
    """
    k = K192
    cx, cy = 95.5, 99.5
    nodes = []
    for i in range(5):
        ang = math.radians(-90 + i * 72)
        nodes.append((cx + 52 * math.cos(ang), cy + 52 * math.sin(ang)))

    def shortened(p, q, trim_p, trim_q):
        dx, dy = q[0] - p[0], q[1] - p[1]
        length = math.hypot(dx, dy)
        ux, uy = dx / length, dy / length
        return (p[0] + ux * trim_p, p[1] + uy * trim_p,
                q[0] - ux * trim_q, q[1] - uy * trim_q)

    edges = []
    spokes = []
    for i, p in enumerate(nodes):
        q = nodes[(i + 1) % 5]
        x0, y0, x1, y1 = shortened(p, q, 15, 15)
        edges.append(capsule(x0, y0, x1, y1, 2.2, k))
        x0, y0, x1, y1 = shortened((cx, cy), p, 20, 15)
        spokes.append(capsule(x0, y0, x1, y1, 2.2, k))

    node_shape = union(*(circle(x, y, 13, k) for x, y in nodes), circle(cx, cy, 18, k))
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    for x, y in nodes:
        paint(color, circle(x, y, 9.5, k), NODE_BLUE)
    paint(color, circle(cx, cy, 13.5, k), NODE_GREEN)
    return compose([
        (union(*edges), NODE_BLUE),
        (union(*spokes), NODE_GREEN),
        (node_shape, color),
    ])


def notifications_icon():
    """White bell, clapper and a red badge.

    Measured on the 256px icon. The orange gradient tile is not drawn.
    The bell outline is the left edge of the white glyph, mirrored
    about x=127.5. Badge centre (194.5, 59.5), white to r=25, red to r=18.5.
    """
    k = K256
    left = (
        (117, 56), (105, 60), (98, 64), (93, 68), (88, 72), (85, 76),
        (82, 80), (80, 84), (78, 88), (76, 92), (75, 96), (74, 100),
        (73, 112), (72, 120), (70, 132), (68, 140), (67, 148), (65, 156),
        (63, 164), (62, 168), (52, 172), (49, 176), (48, 180), (50, 184),
        (55, 188),
    )
    pts = [(x * k, y * k) for x, y in left]
    pts += [((255 - x) * k, y * k) for x, y in reversed(left)]
    bell = union(poly(pts), circle(127.5, 50, 10, k))
    clapper = ellipse([
        (127.5 - 19.5) * k, (201 - 12) * k,
        (127.5 + 19.5) * k, (201 + 12) * k,
    ])
    badge = circle(194.5, 59.5, 25, k)
    badge_color = Image.new("RGBA", (S, S), WHITE + (255,))
    paint(badge_color, circle(194.5, 59.5, 18.5, k), BADGE)
    return compose([
        (bell, WHITE),
        (clapper, WHITE),
        (badge, badge_color),
    ])


def terminal_icon():
    """Green window and a prompt. The dark tile is not drawn.

    Measured on the 128px icon. The frame is the green rounded
    stroke (x 16–111, y 24–103, corner 8); it was translucent over
    the tile, so it is drawn in the same green as the prompt.
    The chevron runs through the point at (52, 64). The underscore
    is the capsule at y=78, x=66 to 87.
    """
    k = K128
    outer = rrect(box(16, 24, 111, 103, k), 8 * k)
    inner = rrect(box(19, 27, 108, 100, k), 5 * k)
    mark = union(
        subtract(outer, inner),
        capsule(33, 50, 52, 64, 5.2, k),
        capsule(52, 64, 33, 78, 5.2, k),
        capsule(66, 78, 87, 78, 4.5, k),
    )
    return compose([(mark, TERM)])


def apphub_icon():
    """Four rounded squares. The blue-purple tile is not drawn.

    Measured on the 128px icon. Each square is 29px with an 8px
    corner. The top-right square is gold; the other three are white.
    """
    k = K128
    squares = (
        (30, 30, 58, 58, False),
        (69, 30, 97, 58, True),
        (30, 69, 58, 97, False),
        (69, 69, 97, 97, False),
    )
    shape = union(*(rrect(box(x0, y0, x1, y1, k), 8 * k) for x0, y0, x1, y1, _ in squares))
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    for x0, y0, x1, y1, gold in squares:
        if gold:
            paint(color, rrect(box(x0, y0, x1, y1, k), 8 * k), GOLD_SQ)
    return compose([(shape, color)])


def search_icon():
    """White magnifier with a gold inner ring.

    Measured on the 128px icon. The blue gradient tile is not drawn.
    Lens centre (55.5, 55.5): white ring r=20 to 28, gold r=16 to 20.
    The lens hole was the tile, so it stays empty. The handle runs
    down-right, radius 6.
    """
    k = K128
    cx, cy = 55.5, 55.5
    ring = subtract(circle(cx, cy, 28, k), circle(cx, cy, 16, k))
    ang = math.radians(45)
    ux, uy = math.cos(ang), math.sin(ang)
    handle = capsule(cx + 22 * ux, cy + 22 * uy, cx + 57 * ux, cy + 57 * uy, 6, k)
    shape = union(ring, handle)
    color = Image.new("RGBA", (S, S), WHITE + (255,))
    paint(color, circle(cx, cy, 20, k), LENS_GOLD)
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
        "apps/system/settings/settings_icon.png": settings_icon(),
        "apps/system/api-keys/api-keys_icon.png": key_icon(),
        "apps/system/sysmon/sysmon_icon.png": sysmon_icon(),
        "apps/system/mesh-viewer/mesh-viewer_icon.png": mesh_icon(),
        "apps/system/notifications/notifications_icon.png": notifications_icon(),
        "apps/system/terminal/terminal_icon.png": terminal_icon(),
        "apps/system/apphub/apphub_icon.png": apphub_icon(),
        "apps/system/search/search_icon.png": search_icon(),
    }
    for path, im in icons.items():
        check(im, path)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
