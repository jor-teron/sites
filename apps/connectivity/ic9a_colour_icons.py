#!/usr/bin/env python3
"""IC9a: colourful Connectivity Share icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1–IC8
(apps/office/ic8_plain_icons.py): the shared dark #1c1f24 is a thin
outline and a soft shadow. There is no baked tile and no rounded
coloured background.

IC9a is the colourful release. Each symbol uses several clear,
friendly colours, and each app has its own palette. The recognisable
mark is kept: File Drop's two arrows, Torrent's magnet (there was no
icon file), QR Scanner's code, Code Maker's barcode plus QR corners,
Whiteboard's board and marks, Shared Clipboard's clipped pages and
arrow, Multi-Screen Wall's four screens and ring, Live Location's
map pin, Find My Device's phone, glass and waves.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC9a.png / .svg backups are left alone).
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


def arc(x0, y0, x1, y1, start, end, width):
    m = mask()
    ImageDraw.Draw(m).arc(box(x0, y0, x1, y1), start, end, fill=255, width=width)
    return m


def frame(x0, y0, x1, y1, thick, radius):
    outer = rrect(box(x0, y0, x1, y1), radius)
    inner = rrect(box(x0 + thick, y0 + thick, x1 - thick, y1 - thick), max(1, radius * 0.6))
    return subtract(outer, inner)


def ring(x0, y0, x1, y1, inset):
    outer = ellipse(box(x0, y0, x1, y1))
    inner = ellipse(box(x0 + inset, y0 + inset, x1 - inset, y1 - inset))
    return subtract(outer, inner)


def file_drop():
    """Up arrow and down arrow. The light-blue tile is not drawn.

    Up arrow is blue with a cyan head. Down arrow is amber with a
    red head. The shaft runs into the head so each arrow is one shape.
    Same side-by-side arrangement as the old icon.
    """
    up_shaft = rrect(box(24, 36, 40, 100), 4 * K)
    up_head = poly([(8 * K, 52 * K), (56 * K, 52 * K), (32 * K, 14 * K)])
    up = coloured(union(up_shaft, up_head), (47, 128, 237), [
        (up_head, (86, 204, 242)),
    ])
    down_shaft = rrect(box(84, 28, 100, 92), 4 * K)
    down_head = poly([(68 * K, 70 * K), (116 * K, 70 * K), (92 * K, 114 * K)])
    down = coloured(union(down_shaft, down_head), (242, 153, 74), [
        (down_head, (235, 87, 87)),
    ])
    return compose([up, down])


def torrent():
    """Horseshoe magnet. There was no previous icon file.

    Steel curve, rose left pole, blue right pole, gold caps.
    The mark is a magnet, for magnets and .torrent files.
    """
    outer = rrect(box(22, 28, 106, 112), 30 * K)
    inner = rrect(box(44, 0, 84, 80), 12 * K)
    body = subtract(outer, inner)
    left = rrect(box(22, 28, 50, 74), 8 * K)
    right = rrect(box(78, 28, 106, 74), 8 * K)
    cap_l = rrect(box(24, 28, 48, 42), 5 * K)
    cap_r = rrect(box(80, 28, 104, 42), 5 * K)
    shape, color = coloured(body, (226, 232, 240), [
        (intersect(left, body), (244, 63, 94)),
        (intersect(right, body), (37, 99, 235)),
        (intersect(cap_l, body), (250, 204, 21)),
        (intersect(cap_r, body), (250, 204, 21)),
    ])
    return compose([(shape, color)])


def qr_cells():
    """15×15 QR-like grid. Finders are 7 modules; the rest is a code."""
    n = 15
    finders = ((0, 0), (8, 0), (0, 8))
    finder = set()
    hole = set()
    for fx, fy in finders:
        for r in range(7):
            for c in range(7):
                finder.add((fx + c, fy + r))
                edge = r in (0, 6) or c in (0, 6)
                center = 2 <= r <= 4 and 2 <= c <= 4
                if not edge and not center:
                    hole.add((fx + c, fy + r))
    data = set()
    # Row 7 and column 7 sit in the gap between the finders (a timing cross).
    for i in range(n):
        if i % 2 == 0:
            data.add((i, 7))
            data.add((7, i))
    # Bottom-right block, kept off the finders.
    block = (
        "###.#.#",
        "#..#..#",
        "#.###.#",
        ".#...#.",
        "#.#.###",
        "..#..#.",
        "###.#.#",
    )
    for r, row in enumerate(block):
        for c, ch in enumerate(row):
            if ch == "#":
                data.add((8 + c, 8 + r))
    # A few modules on the free edges so the code is not only a corner.
    for c, r in ((6, 2), (6, 4), (2, 6), (4, 6), (12, 6), (6, 12)):
        data.add((c, r))
    data -= finder
    return finder, hole, data


def module(c, r, cell, origin):
    x = origin + c * cell
    y = origin + r * cell
    return rrect(box(x, y, x + cell - 1, y + cell - 1), 1.2 * K)


def qr_scanner():
    """QR code. The white sheet behind the old mark is not drawn.

    Three finder patterns in blue, green and orange. The other modules
    are indigo, with a rose timing cross so the code stays readable.
    """
    cell, origin = 7, 10
    finder, hole, data = qr_cells()
    on = (finder - hole) | data
    shape = union(*(module(c, r, cell, origin) for c, r in on))
    blue = union(*(module(c, r, cell, origin) for c, r in finder - hole if c < 7 and r < 7))
    green = union(*(module(c, r, cell, origin) for c, r in finder - hole if c >= 8 and r < 7))
    orange = union(*(module(c, r, cell, origin) for c, r in finder - hole if c < 7 and r >= 8))
    timing = union(*(module(c, r, cell, origin) for c, r in data if c == 6 or r == 6))
    shape, color = coloured(shape, (49, 46, 129), [
        (blue, (37, 99, 235)),
        (green, (22, 163, 74)),
        (orange, (234, 88, 12)),
        (intersect(timing, shape), (244, 114, 182)),
    ])
    return compose([(shape, color)])


def finder_mark(x, y, size):
    """Square finder: frame plus a centre block. The gap is clear."""
    thick = max(4, size // 5)
    outer = rrect(box(x, y, x + size, y + size), 3 * K)
    hole = rrect(box(x + thick, y + thick, x + size - thick, y + size - thick), 2 * K)
    inner_at = thick + max(3, thick // 2)
    inner = rrect(box(x + inner_at, y + inner_at, x + size - inner_at, y + size - inner_at), 2 * K)
    return union(subtract(outer, hole), inner)


def code_maker():
    """Barcode between QR corners. The blue tile and white card are not drawn.

    Finders are violet and magenta. Bars cycle teal, green and lime.
    The small modules are amber. Same arrangement as the old mark:
    two finders on top, bars between them, a finder and modules below.
    """
    tl = finder_mark(8, 8, 36)
    tr = finder_mark(84, 8, 36)
    bl = finder_mark(8, 84, 36)
    x = 50
    widths = (4, 2, 5, 2, 3, 6, 2, 4)
    bar_colours = ((15, 118, 110), (20, 184, 166), (132, 204, 22), (5, 150, 105))
    shapes = []
    for i, w in enumerate(widths):
        shapes.append((rrect(box(x, 14, x + w, 58), 1.5 * K), bar_colours[i % len(bar_colours)]))
        x += w + 3
    spots = (
        (50, 78, 62, 90), (66, 78, 86, 90), (90, 78, 102, 90),
        (106, 78, 118, 90), (50, 94, 70, 106), (74, 94, 86, 114),
        (90, 96, 102, 108), (106, 96, 118, 118), (50, 110, 62, 118),
        (90, 112, 102, 118),
    )
    for i, (x0, y0, x1, y1) in enumerate(spots):
        m = rrect(box(x0, y0, x1, y1), 2 * K)
        shapes.append((m, (245, 158, 11) if i % 2 == 0 else (251, 113, 133)))
    top = union(tl, tr)
    return compose([
        (top, (124, 58, 237)),
        (bl, (219, 39, 119)),
        *shapes,
    ])


def whiteboard():
    """Board on a stand, with the check, square and circle.

    The blue tile is not drawn. The board is the warm sheet, the legs
    are amber, and the three marks keep their red, blue and green.
    """
    board = rrect(box(14, 16, 114, 90), 6 * K)
    leg_l = rrect(box(36, 86, 46, 112), 2 * K)
    leg_r = rrect(box(82, 86, 92, 112), 2 * K)
    foot_l = rrect(box(28, 108, 54, 116), 3 * K)
    foot_r = rrect(box(74, 108, 100, 116), 3 * K)
    stand = union(leg_l, leg_r, foot_l, foot_r)
    check = stroke([(28, 52), (40, 66), (58, 36)], int(7 * K))
    square = frame(74, 26, 102, 50, 5, 3 * K)
    circle = ring(76, 54, 102, 80, 6)
    return compose([
        (board, (255, 247, 237)),
        (stand, (244, 162, 97)),
        (intersect(check, board), (239, 68, 68)),
        (intersect(square, board), (37, 99, 235)),
        (intersect(circle, board), (34, 197, 94)),
    ])


def clipboard():
    """Two pages, a clip, three lines and a right arrow.

    The purple tile is not drawn. Back page sky, front page cream,
    clip rose, lines teal, arrow amber.
    """
    back = rrect(box(16, 30, 92, 108), 8 * K)
    front = rrect(box(36, 42, 116, 118), 8 * K)
    clip = rrect(box(60, 32, 96, 50), 5 * K)
    lines = union(
        rrect(box(50, 64, 102, 70), 2 * K),
        rrect(box(50, 78, 102, 84), 2 * K),
        rrect(box(50, 92, 86, 98), 2 * K),
    )
    shaft = rrect(box(8, 112, 28, 122), 2 * K)
    head = poly([(24 * K, 104 * K), (24 * K, 130 * K), (44 * K, 117 * K)])
    arrow = union(shaft, head)
    page, page_color = coloured(front, (255, 251, 235), [
        (intersect(lines, front), (13, 148, 136)),
    ])
    return compose([
        (back, (125, 211, 252)),
        (page, page_color),
        (clip, (251, 113, 133)),
        (arrow, (245, 158, 11)),
    ])


def screen_wall():
    """Four screens and a centre ring. The dark tile is not drawn.

    Each screen has its own colour: blue, green, amber, pink.
    The ring is white and its hole stays clear.
    """
    panels = (
        (rrect(box(12, 14, 56, 58), 7 * K), (96, 165, 250)),
        (rrect(box(68, 14, 112, 58), 7 * K), (52, 211, 153)),
        (rrect(box(12, 70, 56, 114), 7 * K), (251, 191, 36)),
        (rrect(box(68, 70, 112, 114), 7 * K), (244, 114, 182)),
    )
    outer = ellipse(box(40, 42, 84, 86))
    inner = ellipse(box(50, 52, 74, 76))
    ring = subtract(outer, inner)
    return compose([*panels, (ring, (255, 255, 255))])


def live_location():
    """Map pin. The blue tile is not drawn.

    Rose pin, gold inner disc, teal centre. The same teardrop as the
    old mark.
    """
    circ = ellipse(box(28, 8, 100, 80))
    point = poly([(36 * K, 58 * K), (92 * K, 58 * K), (64 * K, 118 * K)])
    body = union(circ, point)
    inner = ellipse(box(44, 24, 84, 64))
    centre = ellipse(box(54, 34, 74, 54))
    shape, color = coloured(body, (255, 77, 109), [
        (inner, (255, 214, 74)),
        (centre, (20, 184, 166)),
    ])
    return compose([(shape, color)])


def find_device():
    """Phone, magnifier and a wave on each side. The orange tile is not drawn.

    Phone is pale, screen sky blue, glass amber with an orange handle,
    waves mint.
    """
    phone = rrect(box(40, 16, 92, 114), 10 * K)
    screen = rrect(box(46, 26, 86, 92), 4 * K)
    body, body_color = coloured(phone, (238, 242, 255), [
        (screen, (56, 189, 248)),
    ])
    glass = ring(48, 40, 84, 76, 7)
    handle = stroke([(74, 70), (96, 94)], int(7 * K))
    # Radio arcs, the same pair on each side as the old mark.
    wave_l = union(
        arc(16, 40, 36, 72, 100, 260, int(4 * K)),
        arc(8, 32, 34, 80, 110, 250, int(4 * K)),
    )
    wave_r = union(
        arc(96, 40, 116, 72, 280, 440, int(4 * K)),
        arc(98, 32, 124, 80, 290, 430, int(4 * K)),
    )
    return compose([
        (body, body_color),
        (glass, (245, 158, 11)),
        (handle, (234, 88, 12)),
        (union(wave_l, wave_r), (74, 222, 128)),
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
        "apps/connectivity/filedrop/filedrop_icon.png": file_drop(),
        "apps/connectivity/torrent/torrent_icon.png": torrent(),
        "apps/connectivity/qr-scanner/qr-scanner_icon.png": qr_scanner(),
        "apps/connectivity/code-maker/code-maker_icon.png": code_maker(),
        "apps/connectivity/whiteboard/whiteboard_icon.png": whiteboard(),
        "apps/connectivity/shared-clipboard/clipboard_icon.png": clipboard(),
        "apps/connectivity/screen-wall/screenwall_icon.png": screen_wall(),
        "apps/connectivity/live-location/live-location_icon.png": live_location(),
        "apps/connectivity/find-device/find-device_icon.png": find_device(),
    }
    for path, im in icons.items():
        check(im, path)
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
