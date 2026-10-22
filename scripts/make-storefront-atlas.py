"""Draws the storefront facade atlas for street level (public/textures/storefront-atlas.png).

Authored here (no photos, no third-party art), released with the repo under
public/textures/LICENSE.md. One 256 x 256 cell per category, 5 x 2 cells:
the ground-floor shop front that sits behind each storefront sign band —
awning, display windows and a door. The sign band itself (name + logo) is
drawn separately above it. Order must match FACADE_CATEGORIES in
src/lib/map/storefrontCategory.ts.

    python3 scripts/make-storefront-atlas.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

CELL = 256
CATS = ["restaurant", "cafe", "deli", "pharmacy", "bank", "clothing", "supermarket", "mall", "bar", "generic"]
OUT = Path("public/textures/storefront-atlas.png")


def stripes(d, box, a, b, w=22):
    x0, y0, x1, y1 = box
    for i, x in enumerate(range(x0, x1, w)):
        d.rectangle([x, y0, min(x + w - 1, x1), y1], fill=a if i % 2 == 0 else b)


def scallop(d, y, x0, x1, col, r=10):
    for x in range(x0, x1, 2 * r):
        d.pieslice([x, y - r, x + 2 * r, y + r], 0, 180, fill=col)


def window(d, box, glass, frame, mull=2, goods=None):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=frame)
    d.rectangle([x0 + 5, y0 + 5, x1 - 5, y1 - 5], fill=glass)
    step = (x1 - x0) // mull
    for i in range(1, mull):
        d.rectangle([x0 + i * step - 2, y0 + 5, x0 + i * step + 2, y1 - 5], fill=frame)
    d.line([x0 + 12, y0 + 12, x0 + 40, y0 + 40], fill=(255, 255, 255, 90), width=4)  # glare
    if goods:
        goods(d, (x0 + 5, y0 + 5, x1 - 5, y1 - 5))


def door(d, box, frame, glass, handle=(200, 200, 200)):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=frame)
    d.rectangle([x0 + 6, y0 + 6, x1 - 6, y1 - 4], fill=glass)
    d.rectangle([x1 - 16, (y0 + y1) // 2 - 10, x1 - 12, (y0 + y1) // 2 + 10], fill=handle)


def tables(d, b):
    x0, y0, x1, y1 = b
    for x in range(x0 + 12, x1 - 20, 34):
        d.rectangle([x, y1 - 30, x + 22, y1 - 26], fill=(90, 50, 30))
        d.rectangle([x + 9, y1 - 26, x + 13, y1], fill=(90, 50, 30))
        d.ellipse([x + 4, y1 - 46, x + 18, y1 - 32], fill=(255, 214, 140))  # lamp glow


def cups(d, b):
    x0, y0, x1, y1 = b
    d.rectangle([x0, y1 - 22, x1, y1 - 18], fill=(110, 70, 40))
    for x in range(x0 + 8, x1 - 14, 18):
        d.rectangle([x, y1 - 36, x + 10, y1 - 22], fill=(245, 240, 230))


def produce(d, b):
    x0, y0, x1, y1 = b
    cols = [(220, 60, 40), (250, 180, 40), (90, 160, 60), (240, 120, 30)]
    for i, x in enumerate(range(x0 + 4, x1 - 20, 22)):
        d.rectangle([x, y1 - 24, x + 18, y1], fill=(140, 100, 60))
        d.ellipse([x + 2, y1 - 34, x + 16, y1 - 20], fill=cols[i % 4])


def shelves(d, b):
    x0, y0, x1, y1 = b
    for y in range(y0 + 20, y1, 24):
        d.rectangle([x0 + 4, y, x1 - 4, y + 3], fill=(200, 200, 205))
        for x in range(x0 + 8, x1 - 10, 12):
            d.rectangle([x, y - 12, x + 7, y], fill=[(220, 80, 80), (80, 140, 220), (240, 200, 70)][(x // 12) % 3])


def mannequins(d, b):
    x0, y0, x1, y1 = b
    for x in range(x0 + 14, x1 - 20, 40):
        d.ellipse([x + 5, y0 + 22, x + 17, y0 + 34], fill=(60, 60, 60))
        d.polygon([(x, y1 - 4), (x + 22, y1 - 4), (x + 16, y0 + 36), (x + 6, y0 + 36)], fill=[(170, 60, 80), (40, 70, 120), (200, 170, 120)][(x // 40) % 3])


def bottles(d, b):
    x0, y0, x1, y1 = b
    d.rectangle([x0, y0, x1, y1], fill=(120, 70, 30))
    d.rectangle([x0 + 4, y0 + 30, x1 - 4, y0 + 33], fill=(70, 40, 20))
    for x in range(x0 + 8, x1 - 8, 10):
        d.rectangle([x, y0 + 14, x + 5, y0 + 30], fill=(250, 190, 90))


def draw(cat):
    im = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    wall = {"bank": (196, 188, 172), "bar": (52, 36, 28), "mall": (70, 76, 84), "clothing": (34, 34, 36)}.get(cat, (150, 138, 124))
    d.rectangle([0, 0, CELL, CELL], fill=wall)
    d.rectangle([0, CELL - 14, CELL, CELL], fill=(110, 108, 104))  # plinth
    glass = (58, 74, 88)
    warm = (120, 96, 70)
    if cat == "restaurant":
        stripes(d, (0, 0, CELL, 54), (180, 30, 36), (245, 240, 230)); scallop(d, 54, 0, CELL, (180, 30, 36))
        window(d, (8, 76, 150, 242), (96, 62, 40), (60, 30, 20), 2, tables); door(d, (170, 70, 246, 242), (60, 30, 20), (110, 74, 48))
    elif cat == "cafe":
        stripes(d, (0, 0, CELL, 50), (96, 62, 38), (230, 214, 186)); scallop(d, 50, 0, CELL, (96, 62, 38))
        window(d, (8, 74, 160, 242), warm, (40, 70, 60), 3, cups); door(d, (178, 70, 246, 242), (40, 70, 60), warm)
    elif cat == "deli":
        d.polygon([(0, 0), (CELL, 0), (CELL, 46), (0, 60)], fill=(30, 110, 60)); d.rectangle([0, 56, CELL, 62], fill=(250, 220, 60))
        window(d, (8, 76, 166, 242), (70, 80, 70), (200, 200, 205), 2, produce); door(d, (182, 72, 246, 242), (200, 200, 205), glass)
    elif cat == "pharmacy":
        d.rectangle([0, 0, CELL, 48], fill=(240, 244, 244)); d.rectangle([0, 44, CELL, 50], fill=(0, 140, 130))
        d.rectangle([110, 8, 146, 40], fill=(0, 150, 80)); d.rectangle([118, 0 + 8, 138, 40], fill=(0, 150, 80)); d.rectangle([110, 18, 146, 30], fill=(255, 255, 255)); d.rectangle([122, 8, 134, 40], fill=(255, 255, 255))
        window(d, (8, 66, 164, 242), (200, 214, 214), (230, 232, 232), 2, shelves); door(d, (180, 66, 246, 242), (230, 232, 232), (150, 175, 180))
    elif cat == "bank":
        for x in (0, 84, 168):
            d.rectangle([x + 8, 20, x + 22, 242], fill=(222, 216, 202))
        d.rectangle([0, 0, CELL, 16], fill=(214, 206, 190))
        window(d, (30, 40, 84, 200), glass, (60, 60, 64), 1); window(d, (196, 40, 250, 200), glass, (60, 60, 64), 1)
        door(d, (100, 70, 160, 242), (60, 60, 64), glass, (210, 180, 90))
    elif cat == "clothing":
        d.rectangle([0, 0, CELL, 40], fill=(20, 20, 20)); d.rectangle([0, 40, CELL, 44], fill=(200, 200, 200))
        window(d, (8, 58, 172, 242), (230, 226, 218), (15, 15, 15), 1, mannequins); door(d, (186, 58, 246, 242), (15, 15, 15), (200, 196, 190))
    elif cat == "supermarket":
        d.rectangle([0, 0, CELL, 44], fill=(232, 110, 30)); d.rectangle([0, 44, CELL, 50], fill=(250, 250, 250))
        window(d, (6, 62, 250, 170), (180, 196, 200), (190, 192, 196), 4, shelves); door(d, (80, 172, 176, 246), (190, 192, 196), (150, 170, 176))
    elif cat == "mall":
        d.rectangle([0, 0, CELL, 30], fill=(40, 44, 50)); d.rectangle([0, 30, CELL, 36], fill=(210, 214, 220))
        window(d, (4, 44, 252, 246), (110, 140, 160), (90, 96, 104), 4)
        for x in (64, 128):
            door(d, (x - 30, 120, x + 30, 246), (90, 96, 104), (140, 170, 186))
    elif cat == "bar":
        d.rectangle([0, 0, CELL, 30], fill=(25, 16, 12))
        window(d, (10, 50, 160, 232), (160, 100, 40), (25, 16, 12), 3, bottles); door(d, (178, 50, 246, 242), (25, 16, 12), (90, 50, 20), (210, 170, 80))
    else:
        stripes(d, (0, 0, CELL, 46), (70, 80, 92), (150, 158, 166), 26)
        window(d, (8, 66, 166, 242), glass, (90, 90, 96), 2); door(d, (182, 66, 246, 242), (90, 90, 96), glass)
    return im


atlas = Image.new("RGBA", (CELL * 5, CELL * 2))
for i, c in enumerate(CATS):
    atlas.paste(draw(c), ((i % 5) * CELL, (i // 5) * CELL))
atlas = atlas.convert("RGB").quantize(colors=128).convert("RGB")
atlas.save(OUT, optimize=True)
print(OUT, OUT.stat().st_size, "bytes")
