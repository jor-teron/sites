#!/usr/bin/env python3
"""IC1: plain Media Audio icons (no rounded tile).

Draws 128x128 RGBA PNGs at 4x and downscales for smooth edges.
Sound Recorder: waveform, orange playhead, red record dot.
Music Player: eighth note in the orange-to-pink gradient.

The old tiles were both the dark card colour #1c1f24. That colour
is the outline, so the mark reads on light and dark. The fills keep
the colours that were already on each glyph.

Run from the repo root. Overwrites the live icon PNGs only
(the *_icon_before_IC1.png backups are left alone).
Uses Pillow, which is not a repo dependency.
"""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512  # 4x supersample
OUT = 128
# Symbol fill stays about 8px in from the edge after the 4x downscale.
MARGIN = 44

TILE = (28, 31, 36)  # old tile, used as the outline
BAR_TOP = (236, 241, 246)
BAR_BOT = (176, 190, 206)
PLAYHEAD = (255, 152, 61)
RECORD = (239, 68, 68)
NOTE_TOP = (249, 115, 22)  # #f97316
NOTE_BOT = (236, 72, 153)  # #ec4899

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


def ribbon(p0, p1, p2, p3, w0, w1, n=56):
    """Filled stroke along a cubic. Width is perpendicular to the curve."""
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        dx = 3 * u**2 * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t**2 * (p3[0] - p2[0])
        dy = 3 * u**2 * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t**2 * (p3[1] - p2[1])
        mag = (dx * dx + dy * dy) ** 0.5 or 1.0
        nx, ny = -dy / mag, dx / mag
        w = (w0 * (1 - t) + w1 * t) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return left + right[::-1]


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


def sound_recorder():
    bars = mask()
    d = ImageDraw.Draw(bars)
    bw, gap = 16, 8
    # Eight bars each side of the playhead. Heights are a short recording,
    # taller in the middle, shorter at the right so the record dot can sit above.
    left_h = [88, 140, 104, 196, 128, 236, 160, 268]
    right_h = [252, 148, 212, 120, 184, 96, 150, 70]
    side = 8 * bw + 7 * gap
    centre_gap = 22
    total = side * 2 + centre_gap
    x0 = (S - total) // 2
    cy = 300
    x = x0
    for h in left_h:
        d.rounded_rectangle([x, cy - h / 2, x + bw, cy + h / 2], radius=bw / 2, fill=255)
        x += bw + gap
    line_x = x + (centre_gap - 10) / 2
    x = x0 + side + centre_gap
    right_start = x
    for h in right_h:
        d.rounded_rectangle([x, cy - h / 2, x + bw, cy + h / 2], radius=bw / 2, fill=255)
        x += bw + gap

    line = mask()
    ld = ImageDraw.Draw(line)
    lh = 300
    ld.rounded_rectangle([line_x, cy - lh / 2, line_x + 10, cy + lh / 2], radius=5, fill=255)

    dot = mask()
    dd = ImageDraw.Draw(dot)
    r = 30
    # Above the short bars on the right, close to the waveform.
    cx = right_start + 6 * (bw + gap) + bw / 2
    top = cy - max(right_h[-3:]) / 2
    cy_dot = top - 18 - r
    dd.ellipse([cx - r, cy_dot - r, cx + r, cy_dot + r], fill=255)

    bars, line, dot = fit([bars, line, dot])
    y0, y1 = union(bars, line).getbbox()[1], union(bars, line).getbbox()[3]
    grad = vertical_gradient(BAR_TOP, BAR_BOT, y0, y1)
    return compose([(bars, grad), (line, PLAYHEAD), (dot, RECORD)])


def music_player():
    head_src = Image.new("L", (210, 146), 0)
    ImageDraw.Draw(head_src).ellipse((2, 2, 207, 143), fill=255)
    head_src = head_src.rotate(-22, expand=True, resample=Image.Resampling.BICUBIC)
    head = mask()
    head.paste(head_src, (36, 250))
    hb = head.getbbox()

    stem = mask()
    sd = ImageDraw.Draw(stem)
    stem_w = 36
    sx1 = hb[2] - 10
    sx0 = sx1 - stem_w
    # Stem ends inside the right side of the head.
    sy1 = hb[1] + (hb[3] - hb[1]) * 0.45
    sy0 = sy1 - 268
    sd.rectangle([sx0, sy0, sx1, sy1], fill=255)

    flag = mask()
    fd = ImageDraw.Draw(flag)
    # Eighth-note flag: thick at the stem, curling right and tapering.
    # The curve starts on the left edge of the stem so the top has no step.
    fd.polygon(ribbon(
        (sx0, sy0 + 8),
        (sx1 + 150, sy0 - 36),
        (sx1 + 210, sy0 + 90),
        (sx1 + 24, sy0 + 188),
        stem_w + 28,
        16,
    ), fill=255)
    # Round only the stem cap. Keep it inside the stem width so the
    # flag's inner corner stays a curve, not a square step.
    cap = stem_w / 2 + 2
    fd.ellipse([sx0 - 1, sy0 - cap * 0.2, sx1 + 1, sy0 + cap], fill=255)

    head, stem, flag = fit([head, stem, flag])
    note = union(head, stem, flag)
    y0, y1 = note.getbbox()[1], note.getbbox()[3]
    grad = vertical_gradient(NOTE_TOP, NOTE_BOT, y0, y1)
    return compose([(note, grad)])


def main():
    sound = sound_recorder()
    music = music_player()
    sound.save("apps/media/sound-recorder/sound-recorder_icon.png", "PNG")
    music.save("apps/media/music-player/music-player_icon.png", "PNG")
    print("wrote", sound.size, music.size)


if __name__ == "__main__":
    main()
