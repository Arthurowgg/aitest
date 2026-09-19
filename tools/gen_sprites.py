#!/usr/bin/env python3
"""SPRITES — the miner, all seven pickaxes, monsters, loot and particles."""
import random

from artgen import (A, Grid, ORE_RAMPS, glow, parse_map, save)

# ═══════════════════════════════════════════════════════════════════════════
#  THE MINER — 12x16, front-facing, chunky helmet lamp
# ═══════════════════════════════════════════════════════════════════════════
MINER_PAL = {
    "H": "#f0c85a", "h": "#d0a53a", "d": "#a07c22",   # helmet
    "L": "#fff6b0", "l": "#ffe066",                    # lamp
    "s": "#f0c098", "S": "#d09a70", "e": "#2a1f28",    # face
    "j": "#5a80c0", "J": "#44618f", "k": "#33496b",    # suit
    "q": "#6b4a2f", "Q": "#4a3220",                    # gloves
    "p": "#33496b", "P": "#26344d", "b": "#2a2f3a",    # legs & boots
}

MINER_BODY = """
....Hhhd....
...Hhhhdd...
..Hhhhhhdd..
..Llhhhhdd..
...ssSSss...
...sessess..
...sSsSsSs..
....sSSs....
..jJJJJJJj..
.jJJJJJJJJj.
.jJJqqqJJJj.
.jJJJJJJJJj.
..kJJJJJJk..
"""

MINER_LEGS = {
    "idle": """
...pp..pp...
...pp..pp...
..bb....bb..
""",
    "a": """
...pp..pp...
..pp....pp..
..bb....bb..
""",
    "b": """
....pppp....
....pppp....
...bb..bb...
""",
    "c": """
..pp....pp..
..pp....pp..
.bb......bb.
""",
}

# ═══════════════════════════════════════════════════════════════════════════
#  PICKAXES — one hand-shaped arch silhouette, seven materials
#  M/m/d = metal lit/mid/shade    H/h = haft lit/shade
# ═══════════════════════════════════════════════════════════════════════════
PICKAXES = [
    # id, display name, metal (lit,mid,shade), haft (lit,shade), glow
    ("wood",    "Splinter", ("#d8a96a", "#a87340", "#6f4a22"), ("#a06e38", "#6f4a22"), None),
    ("copper",  "Copper",   ("#f7b271", "#d07a2c", "#8a4110"), ("#a06e38", "#6f4a22"), None),
    ("iron",    "Iron",     ("#efe3cd", "#c5ab88", "#8a6f52"), ("#a06e38", "#6f4a22"), None),
    ("silver",  "Silver",   ("#f4fbff", "#c2cfdb", "#8794a3"), ("#8a5a3a", "#5c3a22"), "#cfe8ff"),
    ("gold",    "Gilded",   ("#fff0b0", "#f6c93c", "#b8841a"), ("#8a5a3a", "#5c3a22"), "#ffe9a0"),
    ("diamond", "Diamond",  ("#dcfbff", "#7fdcf2", "#2a90b8"), ("#7a4a6a", "#4a2a44"), "#8ff0ff"),
    ("mythril", "Mythril",  ("#d6ffe8", "#6feca8", "#20a060"), ("#3f6152", "#26382e"), "#7df5a8"),
]


def pickaxe_grid(metal, haft):
    """Bowed head whose tips droop, thick socket, straight haft."""
    (M, m, d), (H, h) = metal, haft
    g = Grid(16, 16)
    for x in range(16):
        t = (x - 7.5) / 7.5
        yc = int(round(1.6 + 3.2 * t * t))
        g.set(x, yc, M)
        g.set(x, yc + 1, m)
        g.set(x, yc + 2, d)
    for x in (0, 15):                     # fangs at each tip
        t = (x - 7.5) / 7.5
        g.set(x, int(round(1.6 + 3.2 * t * t)) + 3, d)
    for y in range(5, 16):                # haft
        g.set(7, y, H)
        g.set(8, y, h)
    g.rect(6, 5, 9, 6, m)                 # socket
    for x in range(6, 10):
        g.set(x, 5, M)
    g.set(6, 6, d); g.set(9, 6, d)
    return g


def build_pickaxes():
    made = []
    from artgen import run, IM
    for pid, name, metal, haft, gl in PICKAXES:
        p = save(pickaxe_grid(metal, haft), "sprites", f"pick_{pid}.png")
        if gl:
            glow(p, gl, 1, 0.6)
        made.append(p)
        # 9x9 inventory icon: point-resampled to half size, centred
        icon = A / "ui" / f"icon_pick_{pid}.png"
        run([IM, p, "-filter", "point", "-resize", "50%", "-background", "none",
             "-gravity", "center", "-extent", "9x9", icon])
        hand = A / "ui" / f"hand_pick_{pid}.png"
        run([IM, p, "-filter", "point", "-resize", "75%", "-background", "none",
             "-gravity", "center", "-extent", "12x12", hand])
        made.append(icon)
    print(f"  ✓ pickaxes: {len(made)} files")
    return made


# ═══════════════════════════════════════════════════════════════════════════
#  MONSTERS
# ═══════════════════════════════════════════════════════════════════════════
def build_miner():
    """Idle + two walk poses + climb pose + a hit-flash silhouette."""
    made = []
    body = parse_map(MINER_BODY, MINER_PAL)
    for name, legs_txt in MINER_LEGS.items():
        legs = parse_map(legs_txt, MINER_PAL)
        g = Grid(12, 16)
        g.blit(body, 0, 0)
        g.blit(legs, 0, 13)
        made.append(save(g, "sprites", f"miner_{name}.png"))
    climb = parse_map("""
..q.Hhhd..q.
..qHhhhddq..
..qHhhhhhdq.
..Lqhhhhdd..
...ssSSss...
...sessess..
...sSsSsSs..
....sSSs....
..jJJJJJJj..
.jJJJJJJJJj.
.qJJJJJJqj..
..kJJJJJJk..
..pp....pp..
..pp....pp..
.bb......bb.
............
""", MINER_PAL)
    made.append(save(climb, "sprites", "miner_climb.png"))
    flash = {k: "#ff6b6b" for k in "HhdsS"}
    hurt = parse_map(MINER_BODY, flash)
    hurt.blit(parse_map(MINER_LEGS["idle"], {k: "#ff6b6b" for k in "pPb"}), 0, 13)
    made.append(save(hurt, "sprites", "miner_hurt.png"))
    print(f"  ✓ miner: {len(made)} files")
    return made


def build_monsters():
    made = []
    bat_pal = {"w": "#5a4c7d", "W": "#8674ad", "D": "#332b4d",
               "e": "#ff5c5c", "k": "#1d1830", "g": "#c9b8f0"}
    bat_up = parse_map("""
...kk..kk...
..kwwkkwwk..
.kwwWWWWWWk.
kwwWWWWWWWWk
kwwWWeWWeWwk
kwwWWWWWWwwk
.kwwWWWWWwk.
..kwwWWWWk..
...kWWWWWk..
....kWWWWk..
....kkkk....
......kk....
""", bat_pal)
    bat_dn = parse_map("""
............
...kk..kk...
..kwwkkwwk..
.kwwWWWWWwk.
kwwWWWWWWWWk
kwwWWeWWeWwk
.kwwWWWWWWwk
..kwwWWWWWk.
...kWWWWWk..
....kWWWWk..
....kkkk....
......kk....
""", bat_pal)
    for i, g in enumerate((bat_up, bat_dn)):
        made.append(save(g, "sprites", f"bat_{i}.png"))

    golem_pal = {"R": "#6b7286", "r": "#4b5162", "g": "#3a3f4d",
                 "E": "#8a91a6", "x": "#ffd75c", "C": "#ff8a2b",
                 "k": "#2a2e38"}
    golem_a = parse_map("""
....RRRRRRRR....
...RRRRRRRRRR...
..RRRrrrrrrRRR..
..RRrEEEEEErRR..
..RRrERxxRErRR..
..RRrEEEEEErRR..
..RRRrrrrrrRRR..
...RRRRRRRRRR...
..RRRRrrrrRRRR..
.RRRRRrCCrRRRRR.
.RRgRRrCCrRRgRR.
.RRRRRrCCrRRRRR.
..RRRRrrrrRRRR..
...RRRR..RRRR...
..RRRRR..RRRRR..
..RRr......rRR..
..RRR......RRR..
..kkk......kkk..
""", golem_pal)
    golem_b = parse_map("""
....RRRRRRRR....
...RRRRRRRRRR...
..RRRrrrrrrRRR..
..RRrEEEEEErRR..
..RRrERxxRErRR..
..RRrEEEEEErRR..
..RRRrrrrrrRRR..
...RRRRRRRRRR...
..RRRRrrrrRRRR..
.RRRRRrCCrRRRRR.
.RgRRRrCCrRRRgR.
.RRRRRrCCrRRRRR.
..RRRRrrrrRRRR..
...RRRR..RRRR...
...RRRR..RRRR...
...RRr....rRR...
...RRR....RRR...
...kkk....kkk...
""", golem_pal)
    for i, g in enumerate((golem_a, golem_b)):
        p = save(g, "sprites", f"golem_{i}.png")
        glow(p, "#ff8a2b", 1, 0.45)
        made.append(p)

    # emberling — appears in the magma layers, spits fire
    ember_pal = {"F": "#ff8a2b", "f": "#ffd35c", "d": "#c1481a",
                 "e": "#fff3b0", "k": "#5c2208"}
    ember_a = parse_map("""
....dddd....
..ddFFFFdd..
.dFFFFffffd.
.dFffFFFFfd.
.dFeeFFeefd.
.dFFFFffffd.
.ddFFffFFdd.
..dddFFddd..
...dd..dd...
....d..d....
""", ember_pal)
    for i, g in enumerate((ember_a,)):
        p = save(g, "sprites", f"ember_{i}.png")
        glow(p, "#ff6a1a", 1, 0.6)
        made.append(p)
    print(f"  ✓ monsters: {len(made)} files")
    return made


# ═══════════════════════════════════════════════════════════════════════════
#  LOOT
# ═══════════════════════════════════════════════════════════════════════════
def build_items():
    made = []
    nugget = """
..xxx...
.x111x..
x11111x.
x12221x.
.x122x..
..xxx...
........
........
"""
    gem = """
...xx...
..x11x..
.x1111x.
x111111x
.x1221x.
..x22x..
...xx...
........
"""
    shard = """
...x....
..x1x...
.x111x..
x11111x.
.x112x..
..x2x...
...x....
........
"""
    shapes = {"nugget": nugget, "gem": gem, "shard": shard}
    use = {"coal": "nugget", "copper": "nugget", "iron": "nugget",
           "silver": "gem", "gold": "gem", "ruby": "gem",
           "diamond": "shard", "mythril": "shard", "coreium": "shard"}
    for ore, ramp in ORE_RAMPS.items():
        pal = {"1": ramp[2], "2": ramp[1], "x": ramp[3]}
        g = parse_map(shapes[use[ore]], pal)
        p = save(g, "sprites", f"item_{ore}.png")
        made.append(p)

    # hearts, bomb, warp crystal, coin
    heart = parse_map("""
.rr...rr.
rRrrrrRrr
rRRRRRRRr
rRRRRRRRr
.rRRRRRr.
..rRRRr..
...rRr...
....r....
""", {"r": "#8a0f24", "R": "#ff4d63"})
    heart_half = heart.copy()
    for y in range(8):
        for x in range(5, 9):
            heart_half.set(x, y, "#4a2230")
    heart_emp = heart.copy().replace("#ff4d63", "#3a2c38").replace("#8a0f24", "#241a24")
    made += [save(heart, "ui", "heart_full.png"),
             save(heart_half, "ui", "heart_half.png"),
             save(heart_emp, "ui", "heart_empty.png")]

    bomb = parse_map("""
....ff..
...fFf..
..BBBB..
.BBBBBB.
BBBBBBBB
BBBBBBBB
.BBBBBB.
..BBBB..
""", {"B": "#2f3542", "f": "#ffd35c", "F": "#ff8a2b"})
    made.append(save(bomb, "sprites", "item_bomb.png"))

    warp = parse_map("""
...ww...
..wWWw..
.wWWWWw.
wWWccWWw
.wWccWw.
..wWWw..
...ww...
........
""", {"w": "#2a5f8f", "W": "#6fd8f0", "c": "#e8ffff"})
    pw = save(warp, "sprites", "item_warp.png")
    glow(pw, "#2fb6d8", 1, 0.8)
    made.append(pw)

    coin = parse_map("""
..gg..
.gGGg.
gGggGg
gGggGg
.gGGg.
..gg..
""", {"g": "#b8841a", "G": "#ffe89a"})
    made.append(save(coin, "sprites", "item_coin.png"))
    print(f"  ✓ loot: {len(made)} files")
    return made


# ═══════════════════════════════════════════════════════════════════════════
#  PARTICLES & EFFECTS
# ═══════════════════════════════════════════════════════════════════════════
def build_fx():
    made = []
    # rock chips, 4 shades / sizes
    for i, (col, dark) in enumerate([("#868da0", "#4f5563"), ("#6b4a2f", "#4e3421"),
                                     ("#9ba3b4", "#5f6478"), ("#3d4152", "#232735")]):
        g = Grid(3, 3)
        g.rect(0, 0, 1, 1, col)
        g.set(2, 1, dark); g.set(1, 2, dark)
        made.append(save(g, "fx", f"chip_{i}.png"))
    # impact star, 4 frames
    for i in range(4):
        r = 3 + i
        g = Grid(11, 11)
        c = "#fff3b0" if i < 2 else "#ffd35c"
        cx = cy = 5
        for x in range(11):
            if abs(x - cx) <= r:
                g.set(x, cy, c)
                g.set(x, cy - (1 if i % 2 else 0), c if i < 3 else "#ff9a2e")
        for y in range(11):
            if abs(y - cy) <= r:
                g.set(cx, y, c)
        for d in range(r + 1):
            g.set(cx + d, cy + d, "#fff3b0" if i == 0 else "#ff9a2e")
            g.set(cx - d, cy - d, "#fff3b0" if i == 0 else "#ff9a2e")
        made.append(save(g, "fx", f"star_{i}.png"))
    # smoke puff, 4 frames
    pal = {"1": "#3a3f4d", "2": "#4f5563", "3": "#5f6478"}
    puff_frames = [
        """
..111..
.11221.
1122221
1222221
1122221
.11221.
..111..
""",
        """
.11111.
1122211
1222221
1222221
1222221
1122211
.11111.
""",
        """
1.....1
.12221.
1222221
1222221
1222221
.12221.
1.....1
""",
        """
.......
..111..
.12221.
.12221.
.12221.
..111..
.......
""",
    ]
    for i, t in enumerate(puff_frames):
        made.append(save(parse_map(t, pal), "fx", f"puff_{i}.png"))
    # sparkle pickup, 4 frames
    for i in range(4):
        g = Grid(9, 9)
        c = ["#fff6b0", "#ffe066", "#ffd35c", "#a3873a"][i]
        g.set(4, 0, c); g.set(4, 8, c); g.set(0, 4, c); g.set(8, 4, c)
        g.set(2, 2, c); g.set(6, 2, c); g.set(2, 6, c); g.set(6, 6, c)
        if i < 2:
            g.set(4, 4, "#ffffff")
            g.set(3, 4, c); g.set(5, 4, c); g.set(4, 3, c); g.set(4, 5, c)
        made.append(save(g, "fx", f"sparkle_{i}.png"))
    # mining crack overlays, 3 stages
    crack_pal = {"c": "#0b0a12"}
    crack1 = """
..........
..........
....c.....
...cc.....
............
"""  # (kept simple; drawn as tiny cracks)
    for i, spec in enumerate([
        [(4, 3), (5, 4), (3, 5)],
        [(4, 3), (5, 4), (3, 5), (6, 3), (2, 6), (6, 7), (4, 7)],
        [(4, 3), (5, 4), (3, 5), (6, 3), (2, 6), (6, 7), (4, 7),
         (7, 5), (1, 3), (8, 8), (3, 9), (9, 4), (5, 9), (10, 6), (1, 10)],
    ]):
        g = Grid(16, 16)
        rng = random.Random(i * 31 + 7)
        for (x, y) in spec:
            g.set(x, y, "#0b0a12")
            if rng.random() < 0.6:
                g.set(x + 1, y, "#1c1a28")
        made.append(save(g, "fx", f"crack_{i}.png"))
    print(f"  ✓ fx: {len(made)} files")
    return made


def build_props():
    """Camp furniture that lives in the tile grid."""
    made = []
    plank = parse_map("""
qqqqqqqqqqqqqqqq
qQQQQQQQQQQQQQQq
qQQQQQQQQQQQQQQq
qqqqqqqqqqqqqqqq
QQQQQQQQQQQQQQQQ
QQQQQQQQQQQQQQQQ
qqqqqqqqqqqqqqqq
qqqQQQQQQQQQQQqq
qqqQQQQQQQQQQQqq
qqqqqqqqqqqqqqqq
QQQQQQQQQQQQQQQQ
QQQQQQQQQQQQQQQQ
qqqqqqqqqqqqqqqq
qQQQQQQQQQQQQQQq
qQQQQQQQQQQQQQQq
qqqqqqqqqqqqqqqq
""", {"q": "#7a5230", "Q": "#5c3a22"})
    made.append(save(plank, "sprites", "prop_plank.png"))
    torch = parse_map("""
....ff....
...fFFf...
..fFFFFf..
..fFFFFf..
...fFFf...
....HH....
....HH....
....HH....
....HH....
....HH....
....HH....
....HH....
...qhHq...
""", {"f": "#ffd35c", "F": "#fff3b0", "H": "#7a5230", "h": "#a87340", "q": "#5c3a22"})
    p = save(torch, "sprites", "prop_torch.png")
    glow(p, "#ff9a2e", 1, 0.5)
    made.append(p)
    print(f"  ✓ props: {len(made)} files")
    return made


if __name__ == "__main__":
    build_miner()
    build_pickaxes()
    build_monsters()
    build_items()
    build_fx()
    build_props()

