#!/usr/bin/env python3
"""Source for unblock_icon.png — run from repo root or apps/games/unblock/:
   python3 assets/icon-source.py
"""
from PIL import Image, ImageDraw
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "unblock_icon.png"
SIZE = 128

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle([4, 4, SIZE - 5, SIZE - 5], radius=22, fill=(18, 22, 36, 255))
pad = 18
board = [pad, pad, SIZE - pad - 1, SIZE - pad - 1]
draw.rounded_rectangle(board, radius=10, fill=(13, 15, 20, 255), outline=(42, 50, 74, 255), width=3)
cell = (board[2] - board[0]) / 6

def cell_rect(cx, cy, w, h, inset=2):
    x0 = board[0] + cx * cell + inset
    y0 = board[1] + cy * cell + inset
    x1 = board[0] + (cx + w) * cell - inset
    y1 = board[1] + (cy + h) * cell - inset
    return [x0, y0, x1, y1]

draw.rounded_rectangle(cell_rect(0, 0, 2, 1), radius=5, fill=(59, 130, 246, 255))
draw.rounded_rectangle(cell_rect(4, 0, 1, 2), radius=5, fill=(139, 92, 246, 255))
draw.rounded_rectangle(cell_rect(0, 3, 1, 3), radius=5, fill=(236, 72, 153, 255))
draw.rounded_rectangle(cell_rect(2, 4, 3, 1), radius=5, fill=(16, 185, 129, 255))
draw.rounded_rectangle(cell_rect(3, 1, 1, 2), radius=5, fill=(6, 182, 212, 255))
draw.rounded_rectangle(cell_rect(1, 2, 2, 1), radius=5, fill=(239, 68, 68, 255), outline=(252, 165, 165, 255), width=2)
ex_y0 = board[1] + 2 * cell
ex_y1 = board[1] + 3 * cell
draw.rounded_rectangle([board[2] - 2, ex_y0 + 2, SIZE - 8, ex_y1 - 2], radius=3, fill=(245, 158, 11, 255))
ay = (ex_y0 + ex_y1) / 2
draw.polygon([(board[2] - 8, ay - 5), (board[2] - 8, ay + 5), (board[2] - 1, ay)], fill=(245, 158, 11, 255))
img.save(OUT, "PNG")
print("wrote", OUT, img.size)
