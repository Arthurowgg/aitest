#!/usr/bin/env python3
"""
DEEPDIG · reproducible art — strip timestamps out of the forged PNGs.

ImageMagick stamps a `tIME` chunk plus `date:create` / `date:modify` text
chunks into everything it writes, so two pixel-identical builds still differ
and every rebuild shows ~290 modified files in `git status`.  Dropping those
chunks (without touching the pixel data, the palette or the compression)
makes the forge reproducible: run it twice, get the same bytes.

    python3 tools/png_clean.py [dir-or-file ...]
"""
import struct
import sys
from pathlib import Path

SIG = b"\x89PNG\r\n\x1a\n"


def clean(path):
    """Return True when a tIME chunk was dropped from `path`."""
    data = path.read_bytes()
    if data[:8] != SIG:
        return False
    out = [data[:8]]
    i, dropped = 8, False
    while i + 8 <= len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        name = data[i + 4:i + 8]
        end = i + 12 + length
        if end > len(data):
            break
        body = data[i + 8:end - 4]
        stamp = name == b"tIME" or (name == b"tEXt" and body.startswith(b"date:"))
        if stamp:
            dropped = True
        else:
            out.append(data[i:end])
        i = end
    if dropped:
        path.write_bytes(b"".join(out))
    return dropped


ROOT = Path(__file__).resolve().parent.parent


def main():
    args = [Path(a) for a in sys.argv[1:]] or [ROOT / "assets"]
    files = 0
    for target in args:
        if target.is_dir():
            for png in sorted(target.rglob("*.png")):
                files += clean(png)
        elif target.suffix == ".png":
            files += clean(target)
    print(f"  ✓ stripped {files} PNG timestamps (art is reproducible)")


if __name__ == "__main__":
    main()
