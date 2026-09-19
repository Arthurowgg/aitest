#!/usr/bin/env python3
"""BACKGROUNDS — seamless parallax cave layers + vignette, all ImageMagick."""
import random
from artgen import A, Grid, IM, run, save

def cave_layer(seed, rock, lit, depth_lo, depth_hi, spikes, bottom=True):
    """64x64 seamless rock silhouette: stalactites from the top, stalagmites up
    from the bottom, transparent void between them."""
    S = 64
    rng = random.Random(seed)
    g = Grid(S, S, None)
    # hanging spikes
    for _ in range(spikes):
        x = rng.randrange(S)
        d = rng.randint(depth_lo, depth_hi)
        w = rng.choice([2, 3, 3, 4, 5])
        for y in range(d):
            taper = w - int(y * w / max(d, 1))
            for dx in range(-(taper // 2), taper // 2 + 1):
                g.set((x + dx) % S, y, rock)
        for dx in range(-(w // 2), w // 2 + 1):
            g.set((x + dx) % S, 0, lit)
        g.set(x % S, min(d, S - 1), lit)
        if rng.random() < 0.4:
            g.set((x + 1) % S, min(d + 1, S - 1), lit)
    # solid ceiling band so the top never shows the void
    for y in range(3):
        for x in range(S):
            g.set(x, y, rock if y else lit)
    if bottom:
        for _ in range(int(spikes * 0.8)):
            x = rng.randrange(S)
            d = rng.randint(depth_lo, depth_hi)
            w = rng.choice([2, 3, 3, 4])
            for y in range(d):
                taper = w - int(y * w / max(d, 1))
                for dx in range(-(taper // 2), taper // 2 + 1):
                    g.set((x + dx) % S, S - 1 - y, rock)
            for dx in range(-(w // 2), w // 2 + 1):
                g.set((x + dx) % S, S - 1, lit)
            g.set(x % S, S - 1 - d, lit)
        for y in range(S - 3, S):
            for x in range(S):
                g.set(x, y, rock if y != S - 1 else lit)
    # grain speckle so the mass is not flat
    for _ in range(220):
        x, y = rng.randrange(S), rng.randrange(S)
        if g.get(x, y) == rock and rng.random() < 0.5:
            g.set(x, y, lit)
    return g


def build():
    made = []
    made.append(save(cave_layer(11, "#1a1830", "#242240", 8, 26, 14), "bg", "cave_far.png"))
    made.append(save(cave_layer(22, "#100e1c", "#191728", 10, 34, 18), "bg", "cave_mid.png"))
    # vignette: soft dark corners, drawn over the frame
    run([IM, "-size", "320x240", "radial-gradient:none-black", A / "bg" / "vignette.png"])
    made.append(A / "bg" / "vignette.png")

    print(f"  ✓ backgrounds: {len(made)} files")
    return made

if __name__ == "__main__":
    build()
