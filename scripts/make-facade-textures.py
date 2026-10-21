"""Draws the small repeating facade patterns used by the textured 3D city.

Authored here (no third-party art), released with the repo. Each tile is
drawn as 32x32 px = two floors x two bays, then scaled up (nearest) to
OUT_PX. MapLibre sizes a wall pattern in pixels of the tile's *overscaled*
zoom, and the 1.7 m street-level eye sits at z21-22 (0.057 m/px at z21 in
NYC), so 112 px = two floors of ~3.2 m each where people actually look at
walls. Overhead (z16-18) the windows read larger, which is fine from above.

    python3 scripts/make-facade-textures.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path("public/textures")
OUT.mkdir(parents=True, exist_ok=True)
S = 32
# 2 floors x 3.2 m / 0.0566 m per px at z21 (lat 40.7) = 113 px.
OUT_PX = 112


def tile(name, wall, window, frame=None, cols=2, rows=2, win=(6, 9), sill=None, band=None):
    im = Image.new("RGBA", (S, S), wall)
    d = ImageDraw.Draw(im)
    if band:  # horizontal stone band per floor (prewar cornices, brick courses)
        for r in range(rows):
            y = r * S // rows
            d.rectangle([0, y, S, y + 1], fill=band)
    cw, ch = S // cols, S // rows
    for r in range(rows):
        for c in range(cols):
            x0 = c * cw + (cw - win[0]) // 2
            y0 = r * ch + (ch - win[1]) // 2 + 1
            if frame:
                d.rectangle([x0 - 1, y0 - 1, x0 + win[0], y0 + win[1]], fill=frame)
            d.rectangle([x0, y0, x0 + win[0] - 1, y0 + win[1] - 1], fill=window)
            if sill:
                d.rectangle([x0 - 1, y0 + win[1], x0 + win[0], y0 + win[1] + 1], fill=sill)
    im.resize((OUT_PX, OUT_PX), Image.NEAREST).save(OUT / f"facade-{name}.png")


tile("rowhouse", "#7a4a3a", "#2b3440", frame="#d8cfc0", sill="#c9bba6", win=(6, 10))
tile("walkup", "#9a4f3c", "#27313d", frame="#e2d9cc", cols=3, win=(5, 9), band="#874233")
tile("prewar", "#cdbb9c", "#34404d", frame="#efe6d6", cols=3, win=(5, 9), band="#b9a585", sill="#e8dcc7")
tile("brownstone", "#6b4636", "#252c35", frame="#4f3226", sill="#8a6450", win=(6, 11), band="#5a3a2c")
tile("limestone", "#d9cfbd", "#3a4652", frame="#c4b79f", cols=3, win=(5, 10), band="#c8bba3", sill="#ece4d4")
# Cast iron (SoHo/Tribeca): tall arched bays between painted columns.
im = Image.new("RGBA", (S, S), "#c9c2b3")
d = ImageDraw.Draw(im)
for r in range(2):
    y = r * 16
    d.rectangle([0, y, S, y + 1], fill="#9d9483")
    for c in range(3):
        x0 = 2 + c * 10
        d.rectangle([x0, y + 4, x0 + 6, y + 15], fill="#2f3943")
        d.pieslice([x0, y + 1, x0 + 6, y + 7], 180, 360, fill="#2f3943")
    for c in range(4):
        d.rectangle([c * 10, y, c * 10 + 1, y + 16], fill="#e6e0d3")
im.resize((OUT_PX, OUT_PX), Image.NEAREST).save(OUT / "facade-castiron.png")
# Dark reflective glass for post-1960 supertalls (one floor bands, dense mullions).
im = Image.new("RGBA", (S, S), "#3f5f78")
d = ImageDraw.Draw(im)
for i in range(0, S, 4):
    d.line([(i, 0), (i, S)], fill="#6f8ea6")
for j in range(0, S, 16):
    d.rectangle([0, j, S, j + 1], fill="#26394a")
d.polygon([(0, 20), (20, 0), (28, 0), (0, 28)], fill="#5a7d99")
im.resize((OUT_PX, OUT_PX), Image.NEAREST).save(OUT / "facade-glass.png")
tile("modern", "#9aa3ab", "#3d5366", cols=1, rows=2, win=(28, 7))
# Glass curtain wall: thin mullions over blue glass.
im = Image.new("RGBA", (S, S), "#5d86a8")
d = ImageDraw.Draw(im)
for i in range(0, S, 8):
    d.line([(i, 0), (i, S)], fill="#c4d3df")
for j in range(0, S, 16):  # two floors per tile, like the others
    d.line([(0, j), (S, j)], fill="#c4d3df")
d.polygon([(0, S), (S, 0), (S, 8), (8, S)], fill="#7aa3c4")
im.resize((OUT_PX, OUT_PX), Image.NEAREST).save(OUT / "facade-tower.png")
# Storefront band: dark glass with a lighter sign fascia on top.
im = Image.new("RGBA", (S, S), "#3a3f45")
d = ImageDraw.Draw(im)
d.rectangle([0, 0, S, 7], fill="#b23a2e")
d.rectangle([2, 10, 14, S - 1], fill="#9fc3d6")
d.rectangle([18, 10, 30, S - 1], fill="#9fc3d6")
im.resize((OUT_PX, OUT_PX), Image.NEAREST).save(OUT / "facade-storefront.png")
# Sidewalk concrete: speckled light grey flags with dark joints (seeded, so stable).
import random
rng = random.Random(7)
C = 64
im = Image.new("RGBA", (C, C), "#c9c4ba")
px = im.load()
for x in range(C):
    for y in range(C):
        v = rng.randint(-10, 10)
        px[x, y] = (201 + v, 196 + v, 186 + v, 255)
d = ImageDraw.Draw(im)
d.line([(0, 0), (C, 0)], fill="#9d978c", width=2)
d.line([(0, 0), (0, C)], fill="#9d978c", width=2)
im.save(OUT / "concrete.png")
print(sorted(p.name for p in OUT.glob("*.png")))
