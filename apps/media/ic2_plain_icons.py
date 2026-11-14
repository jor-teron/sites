#!/usr/bin/env python3
"""IC2: plain Media Video icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Same size, padding, outline and shadow as IC1 (ic1_plain_icons.py):
the old shared dark tile #1c1f24 is a thin outline and a soft shadow.

Screen Recorder: screen, stand, red record dot.
Video Player: play triangle and scrubber.
Video Editor: play triangle and two film-clip bars.

Symbol colours are the ones already on each glyph. The coloured
tile is not drawn.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC2.png backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512  # 4x supersample
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # old tile, used as the outline

# Glyph colours sampled from the current icons.
MONITOR = (238, 240, 243)  # #eef0f3
RECORD = (248, 113, 113)  # #f87171
PLAY = (245, 247, 250)  # #f5f7fa
SCRUB_BLUE = (96, 165, 250)  # #60a5fa
SCRUB_TRACK = (58, 62, 70)  # #3a3e46
CLIP_WHITE = (255, 255, 255)
CLIP_BLUE = (191, 219, 254)  # #bfdbfe

OUTLINE = 9  # ~1px ring at 128
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38

# Source icons are 192px. Draw the measured glyph at this multiple,
# then fit() scales the group into the same padding as IC1.
K = 3


def mask():
    return Image.new("L", (S, S), 0)


def union(*masks):
    out = masks[0]
    for m in masks[1:]:
        out = ImageChops.lighter(out, m)
    return out


def fit(masks, margin=MARGIN):
    """Scale the group, as one, so it sits centred inside the padding."""
    box = union(*masks).getbbox()
    if not box:
        return masks
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    avail = S - 2 * margin
    scale = min(avail / bw, avail / bh)
    nw = max(1, int(round(bw * scale)))
    nh = max(1, int(round(bh * scale)))
    ox = (S - nw) // 2
    oy = (S - nh) // 2
    fitted = []
    for m in masks:
        scaled = m.crop(box).resize((nw, nh), Image.Resampling.LANCZOS)
        canvas = mask()
        canvas.paste(scaled, (ox, oy))
        fitted.append(canvas)
    return fitted


def lerp(c0, c1, t):
    return tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))


def vertical_gradient(c0, c1, y0, y1):
    img = Image.new("RGBA", (S, S))
    px = img.load()
    span = max(1, y1 - y0)
    for y in range(S):
        t = min(1.0, max(0.0, (y - y0) / span))
        col = lerp(c0, c1, t) + (255,)
        for x in range(S):
            px[x, y] = col
    return img


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


def compose(parts):
    """parts: list of (mask, color). Masks are already fitted together."""
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    im.alpha_composite(shadow_of(union(*(m for m, _ in parts))))
    for shape, color in parts:
        stamp(im, shape, color)
    return finish(im)


def incl(x0, y0, x1, y1, k=K):
    """Inclusive source-pixel box, scaled, as an inclusive draw box."""
    return [x0 * k, y0 * k, (x1 + 1) * k - 1, (y1 + 1) * k - 1]


def rounded_ring(box, radius, stroke):
    outer = mask()
    ImageDraw.Draw(outer).rounded_rectangle(box, radius=radius, fill=255)
    inner = [box[0] + stroke, box[1] + stroke, box[2] - stroke, box[3] - stroke]
    hole = mask()
    ImageDraw.Draw(hole).rounded_rectangle(inner, radius=max(0, radius - stroke), fill=255)
    return ImageChops.subtract(outer, hole)


def screen_recorder():
    # Screen frame measured on the 192px tile: x 34–158, y 52–130, 8px stroke.
    frame = rounded_ring(incl(34, 52, 158, 130), radius=8 * K, stroke=8 * K)
    # Neck and base share the screen's centre. The neck overlaps the
    # bezel by one source pixel so the stand is one shape, not a gap.
    neck = mask()
    ImageDraw.Draw(neck).rounded_rectangle(incl(84, 130, 108, 145), radius=K, fill=255)
    base = mask()
    ImageDraw.Draw(base).rounded_rectangle(incl(66, 146, 126, 154), radius=K, fill=255)
    body = union(frame, neck, base)

    dot = mask()
    # Record dot, diameter 41, centred in the screen.
    ImageDraw.Draw(dot).ellipse(incl(76, 71, 116, 111), fill=255)

    body, dot = fit([body, dot])
    return compose([(body, MONITOR), (dot, RECORD)])


def video_player():
    tri = mask()
    ImageDraw.Draw(tri).polygon(
        [(78 * K, 52 * K), (128 * K, 80 * K), (78 * K, 108 * K)], fill=255
    )

    track = mask()
    ImageDraw.Draw(track).rounded_rectangle(incl(36, 148, 156, 160), radius=6 * K, fill=255)

    # Played portion ends where the knob starts (source x 83).
    blue_clip = mask()
    ImageDraw.Draw(blue_clip).rectangle([0, 0, 84 * K - 1, S - 1], fill=255)
    blue = ImageChops.multiply(track, blue_clip)

    knob = mask()
    ImageDraw.Draw(knob).ellipse(incl(84, 144, 104, 164), fill=255)

    scrub = union(track, knob)
    tri, track, blue, knob, scrub = fit([tri, track, blue, knob, scrub])

    color = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for shape, rgb in ((track, SCRUB_TRACK), (blue, SCRUB_BLUE), (knob, PLAY)):
        layer = Image.new("RGBA", (S, S), rgb + (255,))
        layer.putalpha(shape)
        color.alpha_composite(layer)
    return compose([(tri, PLAY), (scrub, color)])


def film_clip(x0, y0, x1, y1, tab):
    """Timeline clip. tab is 'left' or 'right': a taller end on that side."""
    m = mask()
    d = ImageDraw.Draw(m)
    body = incl(x0, y0, x1, y1)
    rad = 4 * K
    d.rounded_rectangle(body, radius=rad, fill=255)
    if tab == "left":
        d.rectangle([body[0], body[1], body[0] + rad, body[3]], fill=255)
        d.rounded_rectangle(incl(x0, y0 - 4, x0 + 6, y1 + 4), radius=K, fill=255)
    else:
        d.rectangle([body[2] - rad, body[1], body[2], body[3]], fill=255)
        d.rounded_rectangle(incl(x1 - 6, y0 - 4, x1, y1 + 4), radius=K, fill=255)
    return m


def video_editor():
    tri = mask()
    ImageDraw.Draw(tri).polygon(
        [(78 * K, 52 * K), (132 * K, 80 * K), (78 * K, 108 * K)], fill=255
    )
    left = film_clip(28, 148, 86, 164, "left")
    right = film_clip(106, 148, 164, 164, "right")
    tri, left, right = fit([tri, left, right])
    return compose([(tri, CLIP_WHITE), (left, CLIP_WHITE), (right, CLIP_BLUE)])


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
        "apps/media/screen-recorder/screenrec_icon.png": screen_recorder(),
        "apps/media/video-player/video-player_icon.png": video_player(),
        "apps/media/video-editor/video-editor_icon.png": video_editor(),
    }
    for path, im in icons.items():
        check(im, path)
        im.save(path, "PNG")


if __name__ == "__main__":
    main()
