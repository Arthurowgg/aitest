#!/usr/bin/env python3
"""UI — panels, slots, buttons, cursor, lamp glow, logo.  All ImageMagick."""
from artgen import A, Grid, IM, glow, parse_map, run, save

INK = "#0b0a12"
PANEL = "#151422"
PANEL_HI = "#2b2940"
EDGE = "#3d3a5c"
ACCENT = "#6b5c8f"
AMBER = "#ffd35c"


def panel():
    """24x24 frame, 8px border — 9-sliced by the canvas at runtime."""
    g = Grid(24, 24)
    g.rect(0, 0, 23, 23, PANEL)
    g.rect(0, 0, 23, 0, EDGE)
    g.rect(0, 0, 0, 23, EDGE)
    g.rect(0, 23, 23, 23, "#08070f")
    g.rect(23, 0, 23, 23, "#08070f")
    g.rect(1, 1, 22, 1, PANEL_HI)
    g.rect(1, 1, 1, 22, PANEL_HI)
    for (x, y) in ((2, 2), (21, 2), (2, 21), (21, 21)):
        g.set(x, y, ACCENT)
    g.rect(2, 2, 21, 21, PANEL)
    g.rect(2, 2, 21, 2, "#1e1c2e")
    return g


def build_ui():
    made = []
    made.append(save(panel(), "ui", "panel.png"))

    # empty inventory cell + selected cell
    for name, border in (("slot", "#2b2940"), ("slot_sel", AMBER)):
        g = Grid(20, 20)
        g.rect(0, 0, 19, 19, border)
        g.rect(1, 1, 18, 18, "#100f1a")
        g.rect(1, 1, 18, 1, "#0a0912")
        g.rect(1, 18, 18, 18, "#191728")
        made.append(save(g, "ui", f"{name}.png"))

    # button + hover
    for name, fill, edge in (("button", "#232134", "#4a4668"),
                             ("button_hot", "#3a3358", AMBER)):
        g = Grid(64, 18)
        g.rect(0, 0, 63, 17, edge)
        g.rect(1, 1, 62, 16, fill)
        g.rect(1, 1, 62, 1, "#4a4668")
        g.rect(1, 16, 62, 16, "#141224")
        g.set(0, 0, None); g.set(63, 0, None)
        g.set(0, 17, None); g.set(63, 17, None)
        made.append(save(g, "ui", f"{name}.png"))

    # mining cursor — crosshair with a hot core
    cur = parse_map("""
.....ff.....
.....ff.....
..f..ff..f..
..f......f..
...f....f...
ff.f....f.ff
ff........ff
...f....f...
..f......f..
..f..ff..f..
.....ff.....
.....ff.....
""", {"f": "#fff8e0"})
    cur_dark = cur.outline("#0b0a12")
    made.append(save(cur_dark, "ui", "cursor.png"))

    # touch stick
    base = parse_map("""
....wwwwwwwwww....
..ww..........ww..
.w..............w.
w................w
w................w
w................w
w................w
w................w
w................w
w................w
w................w
w................w
w................w
.w..............w.
..ww..........ww..
....wwwwwwwwww....
""", {"w": "#6b5c8f"})
    knob = parse_map("""
..kkkk..
.knnnnk.
knnnnnnk
knnnnnnk
knnnnnnk
knnnnnnk
.knnnnk.
..kkkk..
""", {"k": "#2b2940", "n": "#c9b8f0"})
    made.append(save(base, "ui", "stick_base.png"))
    made.append(save(knob, "ui", "stick_knob.png"))
    made.append(save(knob, "ui", "stick_knob.png"))

    # headlamp halo — radial falloff, drawn additively in the dark
    run([IM, "-size", "256x256",
         "radial-gradient:rgba(255,241,180,0.95)-rgba(255,200,90,0)",
         A / "ui" / "lamp_glow.png"])
    run([IM, "-size", "256x256",
         "radial-gradient:rgba(120,190,255,0.55)-rgba(60,120,220,0)",
         A / "ui" / "cool_glow.png"])
    made.append(A / "ui" / "lamp_glow.png")

    # logo: crisp small type, point-scaled ×3 into chunky pixels, then
    # colour-mapped through a vertical amber → ember ramp.
    run([IM, "-background", "none", "-fill", "white", "-font", "DejaVu-Sans-Bold",
         "-pointsize", "13", "+antialias", "-size", "240x22", "xc:none",
         "-gravity", "center", "-annotate", "+0+0", "DEEPDIG",
         "-trim", "+repage", "-scale", "300%", "/tmp/_logo_px.png"])
    h = int(run(["identify", "-format", "%h", "/tmp/_logo_px.png"]).stdout)
    w = int(run(["identify", "-format", "%w", "/tmp/_logo_px.png"]).stdout)
    run([IM, "/tmp/_logo_px.png", "-alpha", "off", "-colorspace", "Gray",
         "/tmp/_logo_gray.png"])
    run([IM, "-size", f"1x{h}", "gradient:#fff6c0-#e2761f",
         "-filter", "point", "-resize", f"{w}x{h}!", "/tmp/_ramp.png"])
    run([IM, "/tmp/_logo_gray.png", "/tmp/_ramp.png", "-clut", "/tmp/_logo_col.png"])
    run([IM, "/tmp/_logo_px.png", "-alpha", "extract", "/tmp/_alpha.png"])
    run([IM, "/tmp/_logo_col.png", "/tmp/_alpha.png", "-alpha", "off",
         "-compose", "CopyOpacity", "-composite", "/tmp/_logo_a.png"])
    run([IM, "/tmp/_logo_a.png", "(", "+clone", "-background", INK,
         "-alpha", "remove", "-channel", "A", "-morphology", "Dilate", "Disk:1",
         "-blur", "0x2", "+channel", ")",
         "+swap", "-compose", "DstOver", "-composite", A / "ui" / "logo.png"])
    made.append(A / "ui" / "logo.png")

    print(f"  ✓ ui: {len(made)} files")
    return made


if __name__ == "__main__":
    build_ui()
