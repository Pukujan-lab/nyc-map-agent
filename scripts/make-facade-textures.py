"""Draws the small repeating facade patterns used by the textured 3D city.

Authored here (no third-party art), released with the repo. Each tile is
32x32 px = two floors x two bays at street-level zoom, so it repeats cleanly
along walls via MapLibre's fill-extrusion-pattern.

    python3 scripts/make-facade-textures.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path("public/textures")
OUT.mkdir(parents=True, exist_ok=True)
S = 32


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
    im.save(OUT / f"facade-{name}.png")


tile("rowhouse", "#7a4a3a", "#2b3440", frame="#d8cfc0", sill="#c9bba6", win=(6, 10))
tile("walkup", "#9a4f3c", "#27313d", frame="#e2d9cc", cols=3, win=(5, 9), band="#874233")
tile("prewar", "#cdbb9c", "#34404d", frame="#efe6d6", cols=3, win=(5, 9), band="#b9a585", sill="#e8dcc7")
tile("modern", "#9aa3ab", "#3d5366", cols=1, rows=2, win=(28, 7))
# Glass curtain wall: thin mullions over blue glass.
im = Image.new("RGBA", (S, S), "#5d86a8")
d = ImageDraw.Draw(im)
for i in range(0, S, 8):
    d.line([(i, 0), (i, S)], fill="#c4d3df")
for j in range(0, S, 11):
    d.line([(0, j), (S, j)], fill="#c4d3df")
d.polygon([(0, S), (S, 0), (S, 8), (8, S)], fill="#7aa3c4")
im.save(OUT / "facade-tower.png")
# Storefront band: dark glass with a lighter sign fascia on top.
im = Image.new("RGBA", (S, S), "#3a3f45")
d = ImageDraw.Draw(im)
d.rectangle([0, 0, S, 7], fill="#b23a2e")
d.rectangle([2, 10, 14, S - 1], fill="#9fc3d6")
d.rectangle([18, 10, 30, S - 1], fill="#9fc3d6")
im.save(OUT / "facade-storefront.png")
print(sorted(p.name for p in OUT.glob("*.png")))
