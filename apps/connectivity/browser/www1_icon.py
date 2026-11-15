#!/usr/bin/env python3
"""WWW1: colourful Web Browser icon in the IC9 style (no rounded tile).

Reuses the IC9c drawing helpers (apps/connectivity/ic9c_colour_icons.py):
128x128 RGBA drawn at 4x, thin #1c1f24 outline, soft shadow, 8px clear
margin, several friendly colours. The mark is a globe (blue rim, teal
meridian, gold equator, green latitudes) with an orange pointer.

Run from the repo root: python3 apps/connectivity/browser/www1_icon.py
Writes apps/connectivity/browser/browser_icon.png. Uses Pillow, which is
not a repo dependency.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from ic9c_colour_icons import (  # noqa: E402
    K, box, check, compose, disc, ellipse, intersect, poly, rrect, subtract, union,
)


def browser():
    """Globe with a pointer arrow at the lower right."""
    rim_out = disc(60, 60, 50)
    inner = disc(60, 60, 41)
    rim = subtract(rim_out, inner)
    meridian = intersect(subtract(ellipse(box(40, 14, 80, 106)), ellipse(box(49, 22, 71, 98))), inner)
    equator = intersect(rrect(box(10, 55, 110, 65), 2 * K), inner)
    lats = intersect(union(rrect(box(10, 33, 110, 40), 2 * K), rrect(box(10, 80, 110, 87), 2 * K)), inner)
    lats = subtract(lats, meridian)
    # Pointer: classic arrow cursor, tip at (78, 74).
    arrow = poly([(78 * K, 74 * K), (78 * K, 122 * K), (90 * K, 110 * K), (99 * K, 126 * K),
                  (107 * K, 122 * K), (98 * K, 106 * K), (114 * K, 106 * K)])
    return compose([
        (rim, (59, 130, 246)),
        (lats, (34, 197, 94)),
        (meridian, (20, 184, 166)),
        (equator, (250, 204, 21)),
        (arrow, (249, 115, 22)),
    ])


def main():
    path = "apps/connectivity/browser/browser_icon.png"
    im = browser()
    check(im, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "PNG")


if __name__ == "__main__":
    main()
