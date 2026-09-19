#!/usr/bin/env python3
"""BITMAP FONT — ImageMagick renders each glyph, we crop it to a fixed cell and
pack the 95 printable ASCII characters into one 1-row atlas used by the canvas.
Using a real font here (rather than hand-drawing 95 glyphs) keeps the in-game
HUD text readable at 7px while still being pure ImageMagick output."""
import subprocess

from artgen import A, IM, run

GLYPH_W, GLYPH_H, BASE = 7, 14, 1
FIRST, LAST = 32, 126
OUT = A / "ui" / "font.png"


def build():
    cells = []
    for code in range(FIRST, LAST + 1):
        ch = chr(code)
        cell = f"/tmp/_glyph_{code}.png"
        if ch == " ":
            run([IM, "-size", f"{GLYPH_W}x{GLYPH_H}", "xc:none", cell])
        else:
            # '@' and ':' need escaping in IM's annotate syntax
            esc = ch.replace("\\", "\\\\").replace(":", "\\:").replace("@", "\\@")
            run([IM, "-size", f"{GLYPH_W}x{GLYPH_H}", "xc:none",
                 "-fill", "white", "-font", "DejaVu-Sans-Mono-Bold",
                 "-pointsize", "10", "+antialias", "-gravity", "NorthWest",
                 "-annotate", "+0+3", esc, cell])
        cells.append(cell)
    run([IM, *cells, "+append", "+repage", OUT])
    print(f"  ✓ font atlas: {LAST - FIRST + 1} glyphs → {OUT.relative_to(A.parent)}")


if __name__ == "__main__":
    build()
