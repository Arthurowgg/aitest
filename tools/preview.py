#!/usr/bin/env python3
"""
DEEPDIG · preview — QA screenshots without a browser
====================================================
Browser automation is unavailable in this sandbox, so screenshots come from the
real game code instead: tools/headless.js runs the game against a stubbed canvas
and records every 2D call, and tools/replay.py rasterises that recording with a
tiny pure-python PNG engine.  What you see here is what the canvas draws.

    node tools/headless.js --frames=900 --script=mine --seed=7 --out=/tmp/scene.json
    python3 tools/preview.py /tmp/scene.json screenshots/mine.png --scale=2
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import replay  # noqa: E402


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    opts = [a for a in argv if a.startswith("--")]
    if len(args) < 2:
        print(__doc__)
        return 1
    scene_path, out_path = args[0], args[1]
    scale = 1
    for o in opts:
        if o.startswith("--scale="):
            scale = int(o.split("=")[1])
    scene = json.loads(Path(scene_path).read_text())
    canvas = replay.replay(scene, verbose=True)
    w, h, px = canvas.w, canvas.h, canvas.px
    if scale != 1:
        sw, sh = w * scale, h * scale
        big = bytearray(sw * sh * 3)
        for y in range(sh):
            srow = (y // scale) * w * 3
            drow = y * sw * 3
            for x in range(sw):
                si = srow + (x // scale) * 3
                big[drow + x * 3:drow + x * 3 + 3] = px[si:si + 3]
        w, h, px = sw, sh, big
    Path(out_path).write_bytes(replay.encode_png(w, h, px))
    print(f"✓ {out_path} {w}x{h}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
