#!/usr/bin/env python3
"""INTERFACE — the metal, glass and LEDs the whole game is operated through."""
from artgen import A, Grid, IM, glow, parse_map, run, save

INK = "#07080e"        # deepest shadow
STEEL = "#2b3040"      # panel face
STEEL_HI = "#414a60"   # lit edge
STEEL_LO = "#151925"   # shaded edge
LINE = "#5a6684"       # separators / rivets
AMBER = "#ffb03a"
GLASS = "#0d1220"


def plate(fill=STEEL, hi=STEEL_HI, lo=STEEL_LO, rivets=True):
    """24x24 panel plate, 9-sliced at runtime (8px border)."""
    g = Grid(24, 24, fill)
    g.rect(0, 0, 23, 0, hi)
    g.rect(0, 0, 0, 23, hi)
    g.rect(0, 23, 23, 23, lo)
    g.rect(23, 0, 23, 23, lo)
    g.rect(1, 1, 22, 1, "#363d4f")
    g.rect(2, 2, 21, 21, fill)
    if rivets:
        for (x, y) in ((2, 2), (21, 2), (2, 21), (21, 21)):
            g.set(x, y, LO_DOT := "#6b7794")
            g.set(x, y + 1 if y == 2 else y - 1, "#1b2029")
    return g


def bezel():
    """24x24 frame with a *transparent* middle — the window the mine shows through."""
    g = Grid(24, 24)
    steel = "#323949"
    for i in range(24):
        for j in range(24):
            edge = min(i, j, 23 - i, 23 - j)
            if edge == 0:
                g.set(i, j, "#0a0c14")
            elif edge == 1:
                g.set(i, j, "#4d5772" if (i <= 1 or j <= 1) else "#20263a")
            elif edge == 2:
                g.set(i, j, steel)
            elif edge == 3:
                g.set(i, j, "#191d29")
            # edge >= 4 stays clear: the viewport
    for (x, y) in ((1, 1), (22, 1), (1, 22), (22, 22)):
        g.set(x, y, "#7f8cab")
        g.set(x, y + (1 if y == 1 else -1), "#0a0c14")
    return g


def gauge_frame():
    g = Grid(16, 12)
    g.rect(0, 0, 15, 11, "#0a0c14")
    g.rect(1, 1, 14, 10, GLASS)
    g.rect(1, 1, 14, 1, "#1b2233")
    return g


def button(state):
    """12x12 9-slice button."""
    face, hi, lo = {
        "up":   ("#2f3547", "#4b556e", "#171b26"),
        "hot":  ("#3a3f57", "#ffc861", "#221a12"),
        "down": ("#232839", "#171b26", "#4b556e"),
    }[state]
    g = Grid(12, 12, face)
    g.rect(0, 0, 11, 0, hi)
    g.rect(0, 0, 0, 11, hi)
    g.rect(0, 11, 11, 11, lo)
    g.rect(11, 0, 11, 11, lo)
    if state == "up":
        g.rect(1, 1, 10, 1, "#3d4459")
        g.rect(1, 10, 10, 10, "#1d2130")
    if state == "hot":
        g.rect(1, 1, 10, 1, "#ffd98a")
    if state == "down":
        g.rect(1, 1, 10, 1, "#1b2030")
    return g


def led():
    """5x5 indicator lamp; recoloured at runtime."""
    g = Grid(5, 5)
    g.rect(0, 0, 4, 4, "#11151f")
    g.set(0, 0, "#243044"); g.set(4, 4, "#243044")
    g.set(1, 1, "#9fb0d0"); g.set(2, 1, "#e8f0ff")
    g.set(1, 2, "#e8f0ff"); g.set(2, 2, "#ffffff"); g.set(3, 2, "#dfe8ff")
    g.set(2, 3, "#b9c6e0")
    return g


def arrow(dirn):
    base = parse_map("""
..xx..
..xx..
xxxxxx
xxxxxx
..xx..
..xx..
""", {"x": "#dfe8ff"})
    if dirn == "up":
        return base
    if dirn == "down":
        return base.shift(0, 0).mirror_x().mirror_x() if False else flip_v(base)
    if dirn == "left":
        return rot_l(base, dirn)
    return rot_l(base, dirn)


def flip_v(g):
    out = Grid(g.w, g.h)
    for y in range(g.h):
        for x in range(g.w):
            out.set(x, g.h - 1 - y, g.get(x, y))
    return out


def rot_l(g, dirn):
    """clockwise rotations of a 6x6 arrow"""
    out = Grid(g.h, g.w)
    for y in range(g.h):
        for x in range(g.w):
            c = g.get(x, y)
            if dirn == "left":
                out.set(y, g.w - 1 - x, c)
            else:
                out.set(g.h - 1 - y, x, c)
    return out


def warn():
    return parse_map("""
.....xx.....
....xOOx....
....xOOx....
...xOOOOx...
...xOOOOx...
..xOOOOOOx..
..xOOxxOOx..
.xOOOxxOOOx.
.xOOOOOOOOx.
xOOOOOOOOOOx
xxxxxxxxxxxx
""", {"x": "#1a1206", "O": "#ffd35c"})


def vent(w=16, h=6):
    g = Grid(w, h, "#1b2030")
    for i in range(1, w - 1, 3):
        g.rect(i, 1, i + 1, h - 2, "#0d1119")
        g.set(i, 1, "#2a3244")
    return g


def build():
    made = []
    made.append(save(bezel(), "ui", "bezel.png"))
    made.append(save(plate(), "ui", "plate.png"))
    made.append(save(plate("#39405a", "#5b6684", "#1a1f2c"), "ui", "plate_hi.png"))
    made.append(save(plate("#22283a", "#39415a", "#12151f", rivets=False), "ui", "plate_lo.png"))
    made.append(save(gauge_frame(), "ui", "gauge.png"))
    for st in ("up", "hot", "down"):
        made.append(save(button(st), "ui", f"btn_{st}.png"))
    made.append(save(led(), "ui", "led.png"))
    for d in ("up", "down", "left", "right"):
        made.append(save(arrow(d), "ui", f"arrow_{d}.png"))
    made.append(save(warn(), "ui", "warn.png"))
    made.append(save(vent(), "ui", "vent.png"))

    # scanning ring for the sonar sweep
    run([IM, "-size", "160x160", "radial-gradient:rgba(120,240,255,0.85)-rgba(60,180,220,0)",
         A / "ui" / "scan_ring.png"])
    made.append(A / "ui" / "scan_ring.png")
    run([IM, "-size", "160x160", "radial-gradient:rgba(255,214,120,0.75)-rgba(255,150,40,0)",
         A / "ui" / "lamp_warm.png"])
    made.append(A / "ui" / "lamp_warm.png")

    # a compact logo badge for the top bar
    badge = parse_map("""
..hhhhhhhhhhhh..
.hssssssssssssh.
hsddddddddddddsh
hsdppddddddpdds.
hsdppddddddpdds.
hsddpppppppddds.
hsddppddddppdds.
hsddppddddppdds.
hsddddddddddddds
hsddddddddddddds
.hssssssssssssh.
..hhhhhhhhhhhh..
""", {"h": "#7f8cab", "s": "#2b3040", "d": "#12151f", "p": "#ffb03a"})
    made.append(save(badge, "ui", "badge.png"))

    # LEDs in the four colours the console ever lights, so nothing has to be
    # tinted at runtime
    for name, col, glow_col in (("mint", "#7df5a8", "#2f6b48"), ("amber", "#ffb03a", "#6b4a12"),
                                ("rose", "#ff5c5c", "#6b1f22"), ("teal", "#6fe0ff", "#1f4a6b"),
                                ("gold", "#ffe9a0", "#6b5a2a")):
        d = Grid(5, 5, col)
        d.rect(0, 0, 4, 0, "#ffffff")
        d.rect(0, 0, 0, 4, "#ffffff")
        d.rect(0, 4, 4, 4, glow_col)
        d.rect(4, 0, 4, 4, glow_col)
        made.append(save(d, "ui", f"led_{name}.png"))

    print(f"  ✓ interface: {len(made)} files")
    return made


if __name__ == "__main__":
    build()
