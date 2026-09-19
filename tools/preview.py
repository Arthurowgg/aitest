#!/usr/bin/env python3
"""
DEEPDIG · screenshot renderer
=============================
Browser automation is unavailable in this sandbox, so QA screenshots are made
here: tools/headless.js runs the *real* game code and dumps a scene (camera,
tiles, entities), and this script composites that scene with ImageMagick using
the same drawing rules the canvas renderer uses.  It is a faithful preview of
the in-game frame: strata, parallax, ore, entities, lamp light and vignette.

    node tools/headless.js --frames=900 --script=mine --seed=7 --out=/tmp/scene.json
    python3 tools/preview.py /tmp/scene.json /tmp/shot.png
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
IM = "convert"

# tile ids from js/world.js
AIR, DIRT, GRAVEL, STONE, GRANITE, DEEPSLATE = 0, 1, 2, 3, 4, 5
CRYSTAL, OBSIDIAN, MAGMA, BEDROCK, LAVA, PLANK, GRASS = 6, 7, 8, 9, 10, 11, 12
ORES = {20: "coal", 21: "copper", 22: "iron", 23: "silver", 24: "gold",
        25: "ruby", 26: "diamond", 27: "mythril", 28: "coreium"}
ROCK = {DIRT: ("dirt", 3), GRAVEL: ("gravel", 3), STONE: ("stone", 4),
        GRANITE: ("granite", 3), DEEPSLATE: ("deepslate", 3),
        CRYSTAL: ("crystal", 3), OBSIDIAN: ("obsidian", 2), MAGMA: ("magma", 3),
        BEDROCK: ("bedrock", 2), GRASS: ("grass", 2)}
TILE = 16


def run(args, **kw):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True, **kw)


def sprite_for(t):
    tid, v = t["id"], t.get("v", 0)
    if tid in ORES:
        return A / "tiles" / f"ore_{ORES[tid]}_{(v % 3) + 1}.png"
    if tid in ROCK:
        name, n = ROCK[tid]
        return A / "tiles" / f"{name}_{(v % n) + 1}.png"
    return None


def wall_for(w):
    tid, v = w["id"], w.get("v", 0)
    if tid in ROCK:
        name, n = ROCK[tid]
        return A / "tiles" / f"bg_{name}_{(v % n) + 1}.png"
    return None


def composite_layers(base, layers, out):
    """Overlay [(path, x, y)] onto base, in order, with one IM invocation."""
    if not layers:
        run([IM, base, out])
        return out
    args = [IM, base]
    for p, x, y in layers:
        args += ["(", p, "-geometry", f"+{int(round(x))}+{int(round(y))}", ")", "-composite"]
    args += [out]
    run(args)
    return out


def main(scene_path, out_path):
    scene = json.loads(Path(scene_path).read_text())
    cam = scene["camera"]
    W, H = scene["view"]["w"], scene["view"]["h"]
    tmp = Path(tempfile.mkdtemp(prefix="deepdig_preview_"))

    # ── 1. deep background + sky above the surface line ───────────────────
    bg = tmp / "00_bg.png"
    run([IM, "-size", f"{W}x{H}", "xc:#0d0b18", bg])
    horizon = scene.get("surfaceY", 10) * TILE - cam["y"]
    sky_done = False if horizon > 0 else True

    # ── 2. parallax cave layers (same factors as js/render.js) ────────────
    layers = []
    for name, px, py, alpha in (("cave_far", 0.22, 0.16, 1.0), ("cave_mid", 0.42, 0.30, 1.0)):
        tiled = tmp / f"px_{name}.png"
        run([IM, "-size", f"{W}x{H}", f"tile:{A / 'bg' / (name + '.png')}", tiled])
        ox = -int(cam["x"] * px) % 64
        oy = -int(cam["y"] * py) % 64
        run([IM, tiled, "-roll", f"+{ox}+{oy}", tiled])
        # wrap the roll so nothing is clipped
        run([IM, "-size", f"{W}x{H}", f"tile:{tiled}", tiled])
        layers.append((tiled, 0, 0))
    composite_layers(bg, layers, tmp / "01_parallax.png")
    if not sky_done:
        base2 = tmp / "01_parallax.png"
        hgt = max(1, int(horizon))
        sky = tmp / "01_sky.png"
        run([IM, "-size", f"{W}x{hgt}", "gradient:#3a2a3d-#120e22", sky])
        run([IM, base2, sky, "-geometry", "+0+0", "-composite", base2])
        star_cmds = ["-size", f"{W}x{hgt}", "xc:none"]
        for i in range(64):
            sx = int(((i * 97) - cam["x"] * 0.06) % W)
            sy = int((i * 53 - cam["y"] * 0.05) % hgt)
            if 0 <= sy < max(1, hgt - 30):
                star_cmds += ["-fill", "rgba(220,214,255,0.7)", "-draw", f"point {sx},{sy}"]
        stars = tmp / "01_stars.png"
        run([IM, *star_cmds, stars])
        run([IM, base2, stars, "-geometry", "+0+0", "-composite", base2])
        hills = A / "bg" / "cave_far.png"
        hx = int(-cam["x"] * 0.12) % 64
        run([IM, base2, hills, "-geometry", f"+{hx - 64}+{int(horizon) - 64 + 22}",
             "-composite", hills, "-geometry" if False else "-composite", base2])

    # ── 3. wall tiles behind the hollow ───────────────────────────────────
    walls = []
    for w in scene.get("walls", []):
        s = wall_for(w)
        if s and s.exists():
            walls.append((s, w["x"] * TILE - cam["x"], w["y"] * TILE - cam["y"]))
    base = tmp / "01_parallax.png"
    for i in range(0, len(walls), 40):
        base = composite_layers(base, walls[i:i + 40], tmp / f"02_walls_{i}.png")

    # ── 4. solid tiles ────────────────────────────────────────────────────
    tiles = []
    cracks = []
    for t in scene["tiles"]:
        tid = t["id"]
        if tid == LAVA:
            tiles.append((A / "fx" / "lava_0.png", t["x"] * TILE - cam["x"], t["y"] * TILE - cam["y"]))
            continue
        if tid == PLANK:
            tiles.append((A / "sprites" / "prop_plank.png", t["x"] * TILE - cam["x"], t["y"] * TILE - cam["y"]))
            continue
        s = sprite_for(t)
        if s and s.exists():
            tiles.append((s, t["x"] * TILE - cam["x"], t["y"] * TILE - cam["y"]))
        if t.get("dmg", 0) > 0.33:
            stage = 2 if t["dmg"] > 0.66 else 1
            cracks.append((A / "fx" / f"crack_{stage}.png", t["x"] * TILE - cam["x"], t["y"] * TILE - cam["y"]))
    for i in range(0, len(tiles), 40):
        base = composite_layers(base, tiles[i:i + 40], tmp / f"03_tiles_{i}.png")
    for i in range(0, len(cracks), 40):
        base = composite_layers(base, cracks[i:i + 40], tmp / f"03_cracks_{i}.png")

    # ── 5. entities ───────────────────────────────────────────────────────
    ents = []
    for d in scene.get("drops", []):
        s = A / "sprites" / f"item_{d.get('ore') or 'coin'}.png"
        if s.exists():
            ents.append((s, d["x"] - 4 - cam["x"], d["y"] - 4 - cam["y"]))
    for m in scene.get("mobs", []):
        name = {"bat": "bat", "golem": "golem", "ember": "ember"}.get(m["kind"])
        if not name:
            continue
        s = A / "sprites" / f"{name}_{m.get('frame', 0)}.png"
        if s.exists():
            ents.append((s, m["x"] - cam["x"], m["y"] - cam["y"]))
    p = scene["player"]
    psprite = A / "sprites" / f"miner_{p['anim']}.png"
    ents.append((psprite, p["x"] + p["w"] / 2 - cam["x"] - psprite.width / 2 if False else p["x"] + p["w"] / 2 - 6 - cam["x"],
                 p["y"] + p["h"] - cam["y"] - 16))
    pick = A / "sprites" / f"pick_{['wood','copper','iron','silver','gold','diamond','mythril'][p['tier']]}.png"
    if pick.exists():
        ents.append((pick, p["x"] + p["w"] / 2 + 2 - cam["x"], p["y"] + p["h"] / 2 + 2 - cam["y"] - 11))
    base = composite_layers(base, ents, tmp / "04_entities.png")

    # ── 6. darkness with a lamp punched through it ────────────────────────
    depth = scene.get("depth", 0)
    # mirrors js/render.js: dark = clamp(0.30 + depth/250*0.72, 0.30, 0.985)
    darkA = max(0.24, min(0.90, 0.24 + depth / 260 * 0.62))
    lampR = 150 if scene.get("lantern") else 118
    dark = tmp / "05_dark.png"
    run([IM, "-size", f"{W}x{H}", "xc:none", "-alpha", "set",
         "-channel", "A", "-evaluate", "set", str(round(darkA, 3)), "+channel",
         "-fill", "#040309", "-colorize", "100", dark])
    # hole: lamp gradient scaled to the lamp radius
    hole = tmp / "05_hole.png"
    run([IM, "-size", f"{lampR * 2}x{lampR * 2}", f"radial-gradient:white-black", hole])
    px = p["x"] + p["w"] / 2 - cam["x"]
    py = p["y"] + p["h"] / 2 - cam["y"] - 2
    run([IM, "-size", f"{W}x{H}", "xc:black", "(",
         hole, "-repage", f"+{int(px - lampR)}+{int(py - lampR)}", ")",
         "-compose", "Screen", "-composite", tmp / "05_lightmask.png"])
    cut = tmp / "05_cut.png"
    run([IM, dark, tmp / "05_lightmask.png", "-compose", "DstOut", "-composite", cut])
    lit = tmp / "05_lit.png"
    run([IM, base, cut, "-compose", "Over", "-composite", lit])

    # ── 7. vignette ───────────────────────────────────────────────────────
    vig = tmp / "06_vig.png"
    run([IM, A / "bg" / "vignette.png", "-resize", f"{W}x{H}!", vig])
    out = tmp / "07_vig.png"
    run([IM, lit, vig, "-compose", "Over", "-composite", out])

    # ── 8. HUD: hearts, coin, depth plate, weapon slot (as js/render.js) ──
    hud = []
    full, half, empty = scene["player"]["hp"], None, None
    hp = scene["player"]["hp"]
    maxhp = scene["player"]["maxHp"]
    for i in range(maxhp // 2):
        left = hp - i * 2
        img = "heart_full" if left >= 2 else "heart_half" if left == 1 else "heart_empty"
        hud.append((A / "ui" / f"{img}.png", 6 + i * 11, 6))
    hud.append((A / "sprites" / "item_coin.png", 6, 18))
    label = f'{scene["depth"]}m'
    tw = len(label) * 7
    plate = tmp / "08_plate.png"
    run([IM, "-size", f"{tw + 10}x14", "xc:none", A / "ui" / "panel.png",
         "-resize", f"{tw + 10}x14!", "-composite", plate])
    # text through the real bitmap font atlas
    def stamp_text(txt, col, tag="t"):
        """Slice glyphs out of the font atlas, colour them, return a strip PNG."""
        glyphs = []
        for i, ch in enumerate(txt):
            code = ord(ch) - 32
            g = tmp / f"g_{tag}_{i}.png"
            run([IM, "-size", "7x14", f"xc:{col}",
                 "(", A / "ui" / "font.png", "-crop", f"7x14+{code * 7}+0", "+repage",
                 "-alpha", "extract", ")",
                 "-alpha", "off", "-compose", "CopyOpacity", "-composite", g])
            glyphs.append(g)
        if not glyphs:
            return None
        strip = tmp / f"strip_{tag}.png"
        run([IM, *glyphs, "+append", "+repage", strip])
        return strip

    layers2 = list(hud)
    plate_layer = []
    txt = stamp_text(label, "#c9b8f0", "depth")
    if txt:
        layers2.append((plate, W / 2 - (tw + 10) / 2, 3))
        layers2.append((txt, W / 2 - tw / 2, 5))
    # weapon slot
    slot = tmp / "08_slot.png"
    run([IM, A / "ui" / "panel.png", "-resize", "27x27!", slot])
    layers2.append((slot, W - 30, 3))
    tiers = ["wood", "copper", "iron", "silver", "gold", "diamond", "mythril"]
    icon = A / "ui" / f'icon_pick_{tiers[min(6, scene["player"]["tier"])]}.png'
    if icon.exists():
        layers2.append((icon, W - 30 + 9, 3 + 9))
    # coin count
    coin_txt = stamp_text(str(scene["player"]["coins"]), "#ffe9a0", "coins")
    if coin_txt:
        layers2.append((coin_txt, 16, 16))
    if scene.get("state") == "title":
        # title screen mock: logo + the two start lines
        run([IM, out, "-fill", "rgba(5,4,12,0.55)", "-colorize", "55", out])
        logo = A / "ui" / "logo.png"
        rows = [(logo, (W - 189) / 2, 40)]
        sub = stamp_text("a mining game", "#6b5c8f", "sub")
        if sub:
            rows.append((sub, (W - len("a mining game") * 7) / 2, 92))
        pick = A / "sprites" / "pick_mythril.png"
        if pick.exists():
            rows.append((pick, W / 2 - 8, 118))
        for i, line in enumerate(["SPACE - start digging", "WASD move - SPACE jump - hold CLICK to mine",
                                  "E forge & shop - B bomb - T camp - M sound"]):
            col = "#fff3b0" if i == 0 else "#4a4370"
            t = stamp_text(line, col, f"t{i}")
            if t:
                rows.append((t, (W - len(line) * 7) / 2, 152 + i * 15))
        composite_layers(out, rows, out_path)
        print(f"→ {out_path} (title mock)")
        return

    if scene.get("state") == "shop":
        shop = tmp / "09_shop.png"
        run([IM, "-size", f"{W}x{H}", "xc:rgba(5,4,12,0.82)", shop])
        panel = tmp / "09_panel.png"
        run([IM, A / "ui" / "panel.png", "-resize", f"{W - 52}x{H - 48}!", panel])
        run([IM, shop, panel, "-geometry", "+26+24", "-composite", shop])
        rows = []
        tiers = ["wood", "copper", "iron", "silver", "gold", "diamond", "mythril"]
        for i, t in enumerate(tiers):
            y = 74 + i * 22
            box = tmp / f"09_row{i}.png"
            run([IM, "-size", f"{W - 80}x20", "xc:rgba(58,51,88,0.8)" if i <= 1 else "xc:rgba(22,20,36,0.7)", box])
            rows.append((box, 40, y))
            icon = A / "ui" / f"icon_pick_{t}.png"
            if icon.exists():
                rows.append((icon, 45, y + 5))
            label = ["Splinter pickaxe", "Copper pickaxe", "Iron pickaxe", "Silver pickaxe",
                     "Gilded pickaxe", "Diamond pickaxe", "Mythril pickaxe"][i]
            txt = stamp_text(label, "#e8e2ff" if i > 1 else "#6b5c8f", f"row{i}")
            if txt:
                rows.append((txt, 58, y + 3))
            tag = "OWNED" if i == 0 else ("locked" if i > 1 else "")
            if tag:
                tt = stamp_text(tag, "#3ec27a" if i == 0 else "#3a3560", f"tag{i}")
                if tt:
                    rows.append((tt, W - 40 - len(tag) * 7 - 8, y + 7))
            if i == 1:
                cost = stamp_text("0/12", "#ffd35c", "cost1")
                if cost:
                    rows.append((cost, W - 48 - len("0/12") * 7, y + 7))
        tabs = [("FORGE", 40, True), ("SHOP", 122, False)]
        for name, x, hot in tabs:
            btn = tmp / f"09_tab_{name}.png"
            run([IM, A / "ui" / ("button_hot.png" if hot else "button.png"),
                 "-resize", f"76x18!", btn])
            rows.append((btn, x, 44))
            tt = stamp_text(name, "#1a1526" if hot else "#c9b8f0", f"tab{name}")
            if tt:
                rows.append((tt, x + (76 - len(name) * 7) / 2, 47))
        close = tmp / "09_close.png"
        run([IM, A / "ui" / "button.png", "-resize", "92x18!", close])
        rows.append((close, W - 128, 44))
        ct = stamp_text("CLOSE (TAB)", "#c9b8f0", "close")
        if ct:
            rows.append((ct, W - 128 + (92 - len("CLOSE (TAB)") * 7) / 2, 47))
        title = stamp_text("THE FORGE", "#ffd35c", "title")
        if title:
            rows.append((title, 40, 28))
        composite_layers(shop, rows, out_path)
        print(f"→ {out_path} (shop mock)")
        return

    composite_layers(out, layers2, out_path)
    print(f"→ {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "/tmp/shot.png")
