#!/usr/bin/env python3
"""Generate hub_office_icon.png (128x128 RGBA) matching Hub OS plain icon styling."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 512
OUT = 128
MARGIN = 44
OUTLINE = 9
SHADOW_BLUR = 6
SHADOW_SHIFT = (0, 5)
SHADOW_ALPHA = 0.38
TILE = (28, 31, 36)

def mask():
    return Image.new("L", (S, S), 0)

def poly(pts):
    m = mask()
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m

def rrect(b, radius):
    m = mask()
    ImageDraw.Draw(m).rounded_rectangle(b, radius=radius, fill=255)
    return m

def finish(im):
    out = im.resize((OUT, OUT), Image.Resampling.LANCZOS)
    px = out.load()
    for y in range(OUT):
        for x in range(OUT):
            r, g, b, a = px[x, y]
            if a < 8:
                px[x, y] = (0, 0, 0, 0)
    return out

def make_hub_office_icon():
    # Base page with folded corner (512x512 space)
    # Page rectangle from (80, 50) to (432, 460) with folded top-right corner
    x0, y0, x1, y1 = 80, 50, 432, 462
    fold = 110
    
    # Page polygon points:
    page_pts = [
        (x0 + 24, y0),
        (x1 - fold, y0),
        (x1, y0 + fold),
        (x1, y1 - 24),
        (x1 - 24, y1),
        (x0 + 24, y1),
        (x0, y1 - 24),
        (x0, y0 + 24),
    ]
    page_mask = poly(page_pts)
    
    # Corner fold triangle
    fold_pts = [
        (x1 - fold, y0),
        (x1 - fold, y0 + fold),
        (x1, y0 + fold)
    ]
    fold_mask = poly(fold_pts)
    
    # Inside 4 app tiles / segments in 2x2 grid:
    # Colors:
    # Writer Blue: (70, 130, 240)
    # Spreadsheet Green: (40, 167, 69)
    # Slides Orange: (250, 140, 30)
    # Base / Tables Purple: (140, 75, 210)
    grid_x0 = 130
    grid_y0 = 150
    tile_w = 110
    tile_h = 110
    gap = 24
    
    w_tile = rrect([grid_x0, grid_y0, grid_x0 + tile_w, grid_y0 + tile_h], radius=16)
    s_tile = rrect([grid_x0 + tile_w + gap, grid_y0, grid_x0 + 2*tile_w + gap, grid_y0 + tile_h], radius=16)
    sl_tile = rrect([grid_x0, grid_y0 + tile_h + gap, grid_x0 + tile_w, grid_y0 + 2*tile_h + gap], radius=16)
    b_tile = rrect([grid_x0 + tile_w + gap, grid_y0 + tile_h + gap, grid_x0 + 2*tile_w + gap, grid_y0 + 2*tile_h + gap], radius=16)
    
    # Center emblem / badge
    center_badge = rrect([grid_x0 + tile_w - 18, grid_y0 + tile_h - 18, grid_x0 + tile_w + gap + 18, grid_y0 + tile_h + gap + 18], radius=14)

    # Composite
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    
    # Shadow
    blurred = page_mask.filter(ImageFilter.GaussianBlur(SHADOW_BLUR * 4))
    shifted = Image.new("L", (S, S), 0)
    shifted.paste(blurred, (0, 20))
    shadow_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow_layer.putalpha(shifted.point(lambda a: int(a * 0.35)))
    base.alpha_composite(shadow_layer)
    
    # Outline & Page surface
    rim = page_mask.filter(ImageFilter.MaxFilter(OUTLINE))
    edge = Image.new("RGBA", (S, S), TILE + (240,))
    edge.putalpha(rim)
    base.alpha_composite(edge)
    
    page_fill = Image.new("RGBA", (S, S), (245, 247, 250, 255))
    page_fill.putalpha(page_mask)
    base.alpha_composite(page_fill)
    
    # Fold shadow & color
    fold_rim = fold_mask.filter(ImageFilter.MaxFilter(5))
    fold_edge = Image.new("RGBA", (S, S), TILE + (180,))
    fold_edge.putalpha(fold_rim)
    base.alpha_composite(fold_edge)
    
    fold_fill = Image.new("RGBA", (S, S), (200, 210, 225, 255))
    fold_fill.putalpha(fold_mask)
    base.alpha_composite(fold_fill)
    
    # App colored tiles
    def stamp_tile(m, color):
        t_rim = m.filter(ImageFilter.MaxFilter(5))
        t_edge = Image.new("RGBA", (S, S), TILE + (160,))
        t_edge.putalpha(t_rim)
        base.alpha_composite(t_edge)
        t_fill = Image.new("RGBA", (S, S), color + (255,))
        t_fill.putalpha(m)
        base.alpha_composite(t_fill)

    stamp_tile(w_tile, (65, 125, 235))      # Writer Blue
    stamp_tile(s_tile, (40, 165, 75))       # Calc/Spreadsheet Green
    stamp_tile(sl_tile, (245, 135, 30))     # Slides Amber/Orange
    stamp_tile(b_tile, (145, 70, 215))      # Base/Tables Violet

    # Center white hub ring / emblem
    c_rim = center_badge.filter(ImageFilter.MaxFilter(5))
    c_edge = Image.new("RGBA", (S, S), TILE + (200,))
    c_edge.putalpha(c_rim)
    base.alpha_composite(c_edge)
    c_fill = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    c_fill.putalpha(center_badge)
    base.alpha_composite(c_fill)

    # Downsample and save
    out = finish(base)
    out_path = os.path.join(os.path.dirname(__file__), "hub_office_icon.png")
    out.save(out_path, "PNG")
    print("Saved", out_path)

if __name__ == "__main__":
    make_hub_office_icon()
