#!/usr/bin/env python3
"""TERRAIN — rock, ore, crystal, lava.  Built from procedural noise +
hand-placed detail, all rasterised by ImageMagick."""
import random

from artgen import (A, Grid, OBSID_SHEEN, ORE_RAMPS, CRYSTAL_CORE, MAGMA_LAVA,
                    R_BEDROCK, R_CRYSTAL, R_DIRT, R_GRAVEL, R_MAGMA, R_OBSID,
                    R_GRANITE, R_SLATE, R_STONE, backwall, glow, parse_map,
                    rock_grid, roll, save)


def build():
    made = []

    def set_of(name, ramp, count, seed0, strata_bands=0, tone_span=0.10, **kw):
        """`count` variants of a rock, each nudged a little lighter or darker so
        a wall of them never repeats or bands."""
        for i in range(1, count + 1):
            # tone walks the ramp: -span/2 … +span/2
            tone = (-0.5 + (i - 0.5) / count) * tone_span
            g = rock_grid(ramp, seed0 + i * 977, tone=tone, bands=strata_bands, **kw)
            p = save(g, "tiles", f"{name}_{i}.png")
            backwall(p, A / "tiles" / f"bg_{name}_{i}.png")
            made.append(p)

    set_of("dirt", R_DIRT, 8, 100, cells=4, octaves=3, pits=(4, 7), glints=(2, 4), tone_span=0.16)
    set_of("gravel", R_GRAVEL, 8, 700, cells=6, octaves=3, pits=(4, 7), glints=(2, 4), tone_span=0.16)
    set_of("stone", R_STONE, 12, 1500, cells=4, octaves=3, pits=(3, 6), glints=(2, 4), tone_span=0.13)
    set_of("granite", R_GRANITE, 8, 2300, cells=6, octaves=3, pits=(4, 7), glints=(2, 4), tone_span=0.14)
    set_of("deepslate", R_SLATE, 8, 3100, cells=4, octaves=3, strata_bands=3, pits=(3, 6), glints=(2, 4), tone_span=0.13)
    set_of("bedrock", R_BEDROCK, 4, 3900, cells=7, octaves=3, pits=(4, 6), glints=(1, 3), tone_span=0.1)

    # ── crystal: cold stone veined with glowing shards ────────────────────
    for i in range(1, 6):
        seed = 4300 + i * 631
        g = rock_grid(R_CRYSTAL, seed, cells=4, pits=(3, 5), glints=(1, 2))
        rng = random.Random(seed + 55)
        for _ in range(rng.randint(3, 4)):
            cx, cy = rng.randint(3, 12), rng.randint(2, 9)
            dx = rng.choice([-1, 1])
            for k in range(rng.randint(3, 5)):
                x = max(1, min(14, cx + dx * (k // 2)))
                y = max(1, min(14, cy + k))
                g.set(x, y, CRYSTAL_CORE[2])
                if rng.random() < 0.85:
                    g.set(x + dx, y, CRYSTAL_CORE[1])
                if rng.random() < 0.4:
                    g.set(x, y + 1, CRYSTAL_CORE[3])
        for _ in range(5):
            g.set(rng.randint(2, 13), rng.randint(2, 13), CRYSTAL_CORE[1])
        p = save(g, "tiles", f"crystal_{i}.png")
        glow(p, "#2e6ea8", 1, 0.7)
        backwall(p, A / "tiles" / f"bg_crystal_{i}.png", "30,42", 50)
        made.append(p)

    # ── obsidian: glassy, violet sheen, almost grainless ─────────────────
    for i in range(1, 4):
        seed = 5100 + i * 811
        g = rock_grid(R_OBSID, seed, cells=8, octaves=1, pits=(1, 2), glints=(1, 2))
        rng = random.Random(seed + 17)
        for _ in range(rng.randint(2, 3)):          # diagonal sheen
            x, y = rng.randint(1, 10), rng.randint(3, 12)
            for k in range(rng.randint(3, 5)):
                g.set(x + k, y - k // 2, OBSID_SHEEN[1])
            g.set(x, y, OBSID_SHEEN[2])
        p = save(g, "tiles", f"obsidian_{i}.png")
        glow(p, "#4a2f7a", 1, 0.65)
        backwall(p, A / "tiles" / f"bg_obsidian_{i}.png", "28,38", 52)
        made.append(p)

    # ── magma: cracked stone oozing molten light ─────────────────────────
    for i in range(1, 6):
        seed = 6100 + i * 733
        g = rock_grid(R_MAGMA, seed, cells=5, pits=(2, 4), glints=(1, 2))
        rng = random.Random(seed + 29)
        for _ in range(rng.randint(3, 4)):          # molten fissures
            x, y = rng.randint(2, 12), rng.randint(1, 3)
            for _ in range(rng.randint(6, 9)):
                g.set(x, y, MAGMA_LAVA[rng.randint(0, 2)])
                if rng.random() < 0.45:
                    g.set(x, y + 1, MAGMA_LAVA[0])
                x = max(1, min(14, x + rng.choice([-1, 1, 1])))
                y = max(1, min(14, y + rng.choice([0, 1, 1])))
        for _ in range(3):
            g.set(rng.randint(1, 14), rng.randint(1, 14), MAGMA_LAVA[3])
        p = save(g, "tiles", f"magma_{i}.png")
        glow(p, "#ff6a1a", 1, 0.55)
        backwall(p, A / "tiles" / f"bg_magma_{i}.png", "30,44", 46)
        made.append(p)

    # ── grass: the surface of the world (hand-drawn cap on dirt) ─────────
    cap_pal = {"1": "#79b74d", "2": "#5d9a3a", "3": "#417a2b",
               "4": "#a3d86b", "5": "#8f6238", "6": "#7a5230"}
    cap = parse_map("""
4444114444114441
4333334333333333
4322133221332213
1222121222212221
6666566665666665
""", cap_pal)
    cap2 = parse_map("""
4144444414444414
3333334333333334
1322133221332213
1222121222212221
5666665666665666
""", cap_pal)
    for i, (seed, c) in enumerate(((250, cap), (1250, cap2)), 1):
        g = rock_grid(R_DIRT, seed, cells=4, pits=(3, 5), glints=(2, 4))
        g.blit(g.sub(0, 5, 16, 11), 0, 5)
        g.blit(c, 0, 0)
        p = save(g, "tiles", f"grass_{i}.png")
        backwall(p, A / "tiles" / f"bg_grass_{i}.png")
        made.append(p)

    # ── lava: 4 frames rolled from one authored sheet ────────────────────
    lava = Grid(16, 16)
    for y in range(16):
        for x in range(16):
            if y < 2:            # crust
                lava.set(x, y, "#ffd35c" if (x // 3 + y) % 2 else "#ff9a2e")
            elif y < 8:          # bright flow
                c = "#e2541a"
                if (x * 3 + y * 5) % 7 < 2:
                    c = "#ff9a2e"
                if (x * 5 + y * 3) % 11 == 0:
                    c = "#ffd75c"
                lava.set(x, y, c)
            else:                # deeper, darker
                c = "#a8340f"
                if (x + y * 2) % 9 == 0:
                    c = "#c1481a"
                if (x * 7 + y) % 23 == 0:
                    c = "#e2541a"
                lava.set(x, y, c)
    f0 = save(lava, "fx", "lava_0.png")
    made.append(f0)
    for i in range(1, 4):
        p = A / "fx" / f"lava_{i}.png"
        roll(f0, p, i * 5, i * 3)
        made.append(p)

    # ── ores: three hand-placed cluster shapes ★ nine minerals ───────────
    shapes = {
        "1": """
................
....x11.........
....12211.......
....1221........
.....11.....11..
...........1221.
..........12211.
..........1221..
...........11...
................
.......11.......
......12211.....
......1221......
.......11.......
................
................
""",
        "2": """
................
....111.........
...1x221....11..
...12221...1221.
....111....1221.
............11..
.........111....
........12221...
.....11.12221...
....1221.111....
....1221........
.....11.........
...........11...
..........1221..
..........1221..
...........11...
""",
        "3": """
..x11...........
..1221......11..
..1221.....1221.
...11......1221.
............11..
.....111........
....12221.......
....12221...11..
.....111...1221.
............1221
.....11.....11..
....1221........
....1221........
.....11.....11..
...........1221.
............11..
""",
    }
    for ore, ramp in ORE_RAMPS.items():
        pal = {"1": ramp[2], "2": ramp[1], "x": ramp[3]}
        for sk, txt in shapes.items():
            p = save(parse_map(txt, pal), "tiles", f"ore_{ore}_{sk}.png")
            glow(p, ramp[4], 1, 0.8)
            made.append(p)

    print(f"  ✓ terrain: {len(made)} files")
    return made


if __name__ == "__main__":
    build()
