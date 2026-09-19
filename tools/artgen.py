#!/usr/bin/env python3
"""
DEEPDIG · art forge — shared core
=================================
Every pixel in DEEPDIG is authored in this repo and rasterised by ImageMagick
(`convert`).  Nothing is loaded from disk, the web, or any asset library.

    tools/artgen.py      ← this file: canvas, pixel-map parser, IM passes
    tools/gen_tiles.py   ← terrain, ores, lava
    tools/gen_sprites.py ← miner, pickaxes, drops, enemies
    tools/gen_ui.py      ← HUD furniture, cursor, buttons
    tools/gen_bg.py      ← parallax caves, vignette, logo

Run `tools/build_assets.sh` to rebuild the whole art set.
"""
import math
import os
import random
import subprocess
from pathlib import Path

IM = os.environ.get("IM", "convert")
ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
for _d in ("tiles", "sprites", "ui", "bg", "fx"):
    (A / _d).mkdir(parents=True, exist_ok=True)

T = None  # transparent marker


def run(args):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True)


# ───────────────────────────────────────────────────────────────────────────
#  canvas
# ───────────────────────────────────────────────────────────────────────────
class Grid:
    """Indexed-colour pixel canvas with run-length PNG export."""

    def __init__(self, w, h, fill=T):
        self.w, self.h = w, h
        self.px = [[fill] * w for _ in range(h)]

    # --- drawing ----------------------------------------------------------
    def set(self, x, y, c):
        if c is not T and 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return T

    def rect(self, x0, y0, x1, y1, c):
        if c is T:
            return
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def blit(self, other, ox=0, oy=0):
        for y in range(other.h):
            for x in range(other.w):
                c = other.px[y][x]
                if c is not T:
                    self.set(ox + x, oy + y, c)

    # --- transforms -------------------------------------------------------
    def mirror_x(self):
        g = Grid(self.w, self.h)
        for y in range(self.h):
            for x in range(self.w):
                g.px[y][x] = self.px[y][self.w - 1 - x]
        return g

    def shift(self, dx, dy):
        g = Grid(self.w, self.h)
        for y in range(self.h):
            for x in range(self.w):
                g.set(x + dx, y + dy, self.px[y][x])
        return g

    def sub(self, x0, y0, w, h):
        g = Grid(w, h)
        for y in range(h):
            for x in range(w):
                g.set(x, y, self.get(x0 + x, y0 + y))
        return g

    def outline(self, colour):
        """1px outline around opaque pixels (used for drop shadows/silhouettes)."""
        g = Grid(self.w, self.h)
        g.px = [row[:] for row in self.px]
        for y in range(self.h):
            for x in range(self.w):
                if self.get(x, y) is not T:
                    continue
                if any(self.get(x + dx, y + dy) is not T
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    g.set(x, y, colour)
        return g

    def replace(self, old, new):
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] == old:
                    self.px[y][x] = new
        return self

    def copy(self):
        g = Grid(self.w, self.h)
        g.px = [r[:] for r in self.px]
        return g

    # --- export -----------------------------------------------------------
    def to_png(self, path):
        ops = []
        for y in range(self.h):
            x = 0
            while x < self.w:
                c = self.px[y][x]
                if c is T:
                    x += 1
                    continue
                x2 = x
                while x2 + 1 < self.w and self.px[y][x2 + 1] == c:
                    x2 += 1
                ops += ["-draw", f"fill {c} rectangle {x},{y} {x2},{y}"]
                x = x2 + 1
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if ops:
            run([IM, "-size", f"{self.w}x{self.h}", "xc:none", *ops, str(path)])
        else:
            run([IM, "-size", f"{self.w}x{self.h}", "xc:none", str(path)])
        return path


def parse_map(text, palette):
    """ASCII map → Grid.  '.' (or any unmapped char) is transparent."""
    rows = text.strip("\n").split("\n")
    while rows and not rows[-1].strip():
        rows.pop()
    while rows and not rows[0].strip():
        rows.pop(0)
    if not rows:
        return Grid(1, 1)
    w = max(len(r) for r in rows)
    g = Grid(w, len(rows))
    for y, row in enumerate(rows):
        assert len(row) == w, f"ragged map row {y}: {len(row)} != {w}"
        for x, ch in enumerate(row):
            c = palette.get(ch)
            if c is not None:
                g.set(x, y, c)
    return g


def save(g, *parts):
    return g.to_png(A.joinpath(*parts))


# ───────────────────────────────────────────────────────────────────────────
#  ImageMagick post-passes
# ───────────────────────────────────────────────────────────────────────────
def glow(path, colour, thickness=1, strength=0.85):
    """Soft coloured halo hugging the sprite silhouette.

    Three ImageMagick passes: extract+dilate the alpha, pour the colour into
    that mask, then drop it *behind* the original.
    """
    size = subprocess.run(["identify", "-format", "%wx%h", str(path)],
                          check=True, capture_output=True).stdout.decode()
    mask, layer = "/tmp/_dg_mask.png", "/tmp/_dg_glow.png"
    run([IM, path, "-alpha", "extract",
         "-morphology", f"Dilate", f"Disk:{thickness}",
         "-blur", "0x0.45", "-evaluate", "multiply", str(strength), mask])
    run([IM, "-size", size, f"xc:{colour}", mask,
         "-alpha", "off", "-compose", "CopyOpacity", "-composite", layer])
    run([IM, path, layer, "-compose", "DstOver", "-composite", path])


def backwall(src, dst, modulate="30,44", colorize=46):
    """The dim, receding version of a tile that sits behind the hollow."""
    run([IM, src, "-modulate", modulate, "-fill", "#0b0a16",
         "-colorize", str(colorize), dst])


def roll(src, dst, dx, dy):
    run([IM, src, "-roll", f"+{dx}+{dy}", dst])


def fliph(path):
    run([IM, path, "-flop", path])


def canvas(w, h, colour="none"):
    return Grid(w, h)  # placeholder for symmetry; IM canvases made inline


def upscale(src, dst, factor):
    run([IM, src, "-filter", "point", "-resize", f"{factor * 100}%", dst])


# ───────────────────────────────────────────────────────────────────────────
#  procedural rock — smoothed value noise quantised onto a 5-tone ramp
# ───────────────────────────────────────────────────────────────────────────
def _vnoise_layer(size, cells, rng):
    grid = [[rng.random() for _ in range(cells + 1)] for _ in range(cells + 1)]
    out = [[0.0] * size for _ in range(size)]
    for y in range(size):
        fy = y / size * cells
        y0 = min(int(fy), cells - 1)
        ty = fy - y0
        ty = ty * ty * (3 - 2 * ty)
        for x in range(size):
            fx = x / size * cells
            x0 = min(int(fx), cells - 1)
            tx = fx - x0
            tx = tx * tx * (3 - 2 * tx)
            a = grid[y0][x0]
            b = grid[y0][x0 + 1]
            c = grid[y0 + 1][x0]
            d = grid[y0 + 1][x0 + 1]
            out[y][x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    return out


def value_noise(size, cells, seed, octaves=2):
    rng = random.Random(seed)
    acc = [[0.0] * size for _ in range(size)]
    amp, total, c = 1.0, 0.0, cells
    for _ in range(octaves):
        layer = _vnoise_layer(size, int(c), rng)
        for y in range(size):
            for x in range(size):
                acc[y][x] += layer[y][x] * amp
        total += amp
        amp *= 0.5
        c *= 2
    return [[acc[y][x] / total for x in range(size)] for y in range(size)]


def rock_grid(ramp, seed, size=16, cells=5, octaves=2, bevel=True,
              pits=(2, 4), glints=(2, 4), bands=0, bias=0.06, tone=0.0):
    """`ramp` = [darkest .. lightest]; returns a Grid of chunky rock.

    Instead of a hard bevel (which turns a wall of tiles into a picture-frame
    grid) the noise is biased by a gentle vertical gradient: tops catch light,
    bottoms fall into shadow, and only a few pixels of the top/bottom rows are
    tinted — enough to read as a lit block, not as a border.
    """
    rng = random.Random(seed)
    n = value_noise(size, cells, seed, octaves)
    g = Grid(size, size, ramp[2])
    for y in range(size):
        for x in range(size):
            v = n[y][x] + bias * (1 - 2 * y / (size - 1)) + tone
            if v < 0.34:
                c = ramp[0]
            elif v < 0.46:
                c = ramp[1]
            elif v < 0.60:
                c = ramp[2]
            elif v < 0.78:
                c = ramp[3]
            else:
                c = ramp[4]
            g.set(x, y, c)
    if bands:                                   # sediment strata
        y = rng.randint(2, 4)
        for _ in range(bands):
            if y > size - 3:
                break
            for x in range(1, size - 1):
                if rng.random() < 0.8:
                    g.set(x, y, ramp[1])
            if rng.random() < 0.6:
                for x in range(1, size - 2):
                    g.set(x, y + 1, ramp[0])
            y += rng.randint(4, 5)
    for _ in range(rng.randint(*pits)):         # pits
        px, py = rng.randint(1, size - 2), rng.randint(1, size - 2)
        g.set(px, py, ramp[0])
        if rng.random() < 0.5:
            g.set(px + 1, py, ramp[0])          # chips, not single dots
        if rng.random() < 0.3:
            g.set(px, py + 1, ramp[1])
    for _ in range(rng.randint(*glints)):       # glints
        gx, gy = rng.randint(1, size - 3), rng.randint(1, size - 2)
        g.set(gx, gy, ramp[4])
        if rng.random() < 0.4:
            g.set(gx + 1, gy, ramp[3])
        if rng.random() < 0.25:
            g.set(gx, gy + 1, ramp[3])
    if bevel:
        for x in range(size):                   # broken highlights, not a frame
            if rng.random() < 0.42:
                g.set(x, 0, ramp[3])
                if rng.random() < 0.30:
                    g.set(x, 1, ramp[3])
            if rng.random() < 0.55:
                g.set(x, size - 1, ramp[1])
                if rng.random() < 0.35:
                    g.set(x, size - 2, ramp[1])
        for y in range(size):
            if rng.random() < 0.30:
                g.set(0, y, ramp[3])
            if rng.random() < 0.40:
                g.set(size - 1, y, ramp[1])
    return g


# ───────────────────────────────────────────────────────────────────────────
#  palettes
# ───────────────────────────────────────────────────────────────────────────
R_DIRT = ["#3a2618", "#4e3421", "#6b4a2f", "#7f5836", "#9c7048"]
R_GRAVEL = ["#302c35", "#423d48", "#5d5762", "#726b78", "#8b8492"]
R_STONE = ["#343943", "#474d59", "#656c7a", "#7c8394", "#939bad"]
R_GRANITE = ["#382e30", "#4d4042", "#6d5b5d", "#836e70", "#9c8285"]
R_SLATE = ["#1d2029", "#2a2d3b", "#3d4152", "#4b5063", "#5f6478"]
R_BEDROCK = ["#08080c", "#111117", "#1c1c24", "#2c2d38", "#3a3b45"]
R_CRYSTAL = ["#121826", "#1b2436", "#26324a", "#33456a", "#3b5278"]
R_OBSID = ["#08060f", "#100c1c", "#1d1832", "#2f2846", "#4a3f6e"]
R_MAGMA = ["#1c0e0b", "#2c1712", "#43261f", "#5c3527", "#6b3d2c"]

CRYSTAL_CORE = ["#2c5f8f", "#3d7fbf", "#5aa0e0", "#8fd0ff", "#e8f8ff"]
MAGMA_LAVA = ["#c1481a", "#ff8a2b", "#ffd35c", "#fff3b0"]
OBSID_SHEEN = ["#4a3f6e", "#6b4a9a", "#8f6ad0"]

ORE_RAMPS = {
    "coal":    ["#5a5a66", "#2b2b33", "#3f3f4a", "#8a8a99", "#101016"],
    "copper":  ["#c96a24", "#8a4110", "#f0a05a", "#ffd8a8", "#5c2a08"],
    "iron":    ["#a8896a", "#7a5c3f", "#d9c9b4", "#f4ead9", "#4d3a26"],
    "silver":  ["#a8b6c2", "#76848f", "#e8f0f6", "#ffffff", "#46545f"],
    "gold":    ["#e0a11c", "#a8730a", "#ffd75c", "#fff6c0", "#6b4606"],
    "ruby":    ["#c01f38", "#8a0f24", "#ff6b7a", "#ffd0d6", "#5c0818"],
    "diamond": ["#2fb6d8", "#1a7f9c", "#8ff0ff", "#e8ffff", "#0b4a66"],
    "mythril": ["#25b063", "#137a41", "#7df5a8", "#d8ffe6", "#08421f"],
    "coreium": ["#b81fa8", "#7d0f72", "#ff8af0", "#ffd8fb", "#5c0554"],
}
