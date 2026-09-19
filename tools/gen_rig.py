#!/usr/bin/env python3
"""THE RIG — the machine you actually operate, plus burrowers and console glass."""
from artgen import A, Grid, IM, glow, parse_map, run, save, backwall

RIG_PAL = {
    "h": "#7f8cab",   # hull light
    "H": "#4a5468",   # hull mid
    "d": "#232a38",   # hull shade
    "k": "#0d1017",   # outline
    "l": "#c9b8f0",   # track
    "g": "#2b3040",   # track shade
    "a": "#ffb03a",   # hazard amber
    "y": "#ffe066",   # lamp
    "c": "#6fe0ff",   # coolant line
}

RIG = """
..kkkkkkkkkkkk..
.khhhhhhhhhhhhk.
khHHHHHHHHHHHHhk
khHaaaaaaaaaaHhk
khHaayyllyyyaHhk
khHaayyllyyyaHhk
khHHHHHHHHHHHHhk
khHccHHHHHHccHhk
khHHHHHHHHHHHHhk
khddddddddddddhk
.kllllllllllllk.
.kggggggggggggk.
..kkkkkkkkkkkk..
.....kddddk.....
.....kd..dk.....
....kkk..kkk....
"""

RIG_DRILL = """
..kkkkkkkkkkkk..
.khhhhhhhhhhhhk.
khHHHHHHHHHHHHhk
khHaaaaaaaaaaHhk
khHaayyllyyyaHhk
khHaayyllyyyaHhk
khHHHHHHHHHHHHhk
khHccHHHHHHccHhk
khHHHHHHHHHHHHhk
khddddddddddddhk
.kllllllllllllk.
.kggggggggggggk.
..kkkkkkkkkkkk..
....kddddddk....
.....kddddk.....
......kkkk......
"""


def build_rig():
    made = []
    p0 = save(parse_map(RIG, RIG_PAL), "sprites", "rig_0.png")
    p1 = save(parse_map(RIG_DRILL, RIG_PAL), "sprites", "rig_1.png")
    made += [p0, p1]

    grub_pal = {"d": "#3a2f22", "b": "#6b5334", "l": "#4d3c28",
                "e": "#ffd35c", "k": "#171208", "m": "#241c12"}
    grub0 = parse_map("""
..kkkk....
.kbbbbk...
kbmbmbmk..
kbbbbbbbk.
kbekkebk..
kbbbbbbk..
.kmmmmmk..
..k.k.k...
""", grub_pal)
    grub1 = parse_map("""
..kkkk....
.kbbbbk...
kbmbmbmk..
kbbbbbbbk.
kbekkebk..
kbbbbbbk..
.kmmmmmk..
.k.k.k.k..
""", grub_pal)
    made += [save(grub0, "sprites", "grub_0.png"), save(grub1, "sprites", "grub_1.png")]

    # gas pocket tile + its dimmed behind-wall twin
    gas = parse_map("""
................
....kkkkkkk.....
..kkgggggggkk...
.kgGGGGGGGGGgk..
kgGGgGGGGGgGGgk.
kgGGGGgGGGGGGgk.
kgGgGGGGGGgGGgk.
kgGGGGGgGGGGGgk.
kgGGgGGGGGGgGgk.
kgGGGGGGgGGGGgk.
.kgGGGGGGGGGgk..
..kkgggggggkk...
....kkkkkkk.....
................
................
................
""", {"k": "#16241a", "g": "#2f5a35", "G": "#4d8a4f"})
    made.append(save(gas, "tiles", "gas_1.png"))
    backwall(A / "tiles" / "gas_1.png", A / "tiles" / "bg_gas_1.png", "26,38", 58)
    made.append(A / "tiles" / "bg_gas_1.png")

    # warning stripes for hazard edges
    stripes = Grid(16, 6)
    for x in range(16):
        for y in range(6):
            stripes.set(x, y, "#ffb03a" if ((x + y) // 3) % 2 else "#1a1206")
    made.append(save(stripes, "ui", "stripes.png"))
    print(f"  ✓ rig: {len(made)} files")
    return made


def build_glass():
    """Console glass: scanlines, a soft glare and a faint tube vignette."""
    made = []
    # four scanline rows: one dark, one faint, two clear
    run([IM, "-size", "4x4", "xc:none",
         "-draw", "fill rgba(0,0,0,0.34) rectangle 0,0 3,0",
         "-draw", "fill rgba(0,0,0,0.12) rectangle 0,2 3,2",
         A / "ui" / "scanlines.png"])
    made.append(A / "ui" / "scanlines.png")
    # corner glare: a soft diagonal light spill from the top-left
    run([IM, "-size", "160x120", "gradient:rgba(255,255,255,0.10)-rgba(255,255,255,0)",
         "-rotate", "180", A / "ui" / "glare.png"])
    made.append(A / "ui" / "glare.png")
    print(f"  ✓ glass: {len(made)} files")
    return made


if __name__ == "__main__":
    build_rig()
    build_glass()
