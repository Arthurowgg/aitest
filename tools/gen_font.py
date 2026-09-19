#!/usr/bin/env python3
"""BITMAP FONT — ImageMagick renders each glyph, we crop it to a fixed cell and
pack the 95 printable ASCII characters into one 1-row atlas used by the canvas.
Using a real font here (rather than hand-drawing 95 glyphs) keeps the in-game
HUD text readable at 7px while still being pure ImageMagick output."""
import subprocess

from artgen import A, IM, run

GLYPH_W, GLYPH_H, BASE = 6, 11, 1
FIRST, LAST = 32, 126
OUT = A / "ui" / "font.png"

# the console's text palette: every colour the interface may print.  One
# tinted atlas per entry is rasterised here, so the canvas renderer never has
# to tint anything at runtime (and the QA replayer can see exactly what is
# drawn).
PALETTE = {
    "paper": "#dfe8ff",   # body text
    "steel": "#c9d8f0",   # button labels
    "slate": "#8fa0c0",   # secondary
    "dim":   "#4a5470",   # tertiary
    "faint": "#2b3247",   # barely there
    "amber": "#ffd35c",   # headings, attention
    "brass": "#a8842a",   # dimmed amber
    "gold":  "#ffe9a0",   # credits, values
    "teal":  "#6fe0ff",   # instrumentation
    "mint":  "#7df5a8",   # good news
    "rose":  "#ff8a8a",   # warnings
    "hot":   "#ff5c5c",   # critical
    "ink":   "#12203a",   # dark text on lit buttons
    "warn":  "#ffb03a",   # heat and attention
    "danger": "#ff6b7a",  # alarms
    "deep":  "#3f6b52",   # dimmed good news
    "label": "#6b7794",   # panel labels
    "ghost": "#39415a",   # list rules and empty-state text
}


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
                 "-pointsize", "8", "+antialias", "-gravity", "NorthWest",
                 "-annotate", "+0+1", esc, cell])
        cells.append(cell)
    run([IM, *cells, "+append", "+repage", OUT])
    print(f"  ✓ font atlas: {LAST - FIRST + 1} glyphs → {OUT.relative_to(A.parent)}")
    # one tinted copy per palette entry, keeping the glyph alpha intact
    for name, col in PALETTE.items():
        run([IM, OUT, "-fill", col, "-colorize", "100", A / "ui" / f"font_{name}.png"])
    print(f"  ✓ font inks: {len(PALETTE)} tinted atlases")


if __name__ == "__main__":
    build()
