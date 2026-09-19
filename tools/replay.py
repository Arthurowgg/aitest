#!/usr/bin/env python3
"""
DEEPDIG · replay — rasterise a recorded canvas frame without a browser
=====================================================================
tools/headless.js runs the real game code against a stubbed 2D context and
records every call it makes (transforms, clips, fills, image blits).  This
module plays that list back into a PNG using nothing but zlib and the standard
library, so QA screenshots show exactly what the canvas would have shown.

The decoder handles the PNG flavours ImageMagick writes for our assets: grey,
grey+alpha, RGB, RGBA and palette (with tRNS).
"""
import json
import struct
import sys
import time
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── PNG decoding ────────────────────────────────────────────────────────────
_PNG_CACHE = {}


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def decode_png(path):
    """→ (width, height, bytearray of RGBA, opaque?), cached by path."""
    key = str(path)
    if key in _PNG_CACHE:
        return _PNG_CACHE[key]
    raw = Path(path).read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    pos = 8
    idat = []
    palette = None
    trns = None
    w = h = depth = ctype = 0
    while pos < len(raw):
        (length,) = struct.unpack(">I", raw[pos:pos + 4])
        ctag = raw[pos + 4:pos + 8]
        data = raw[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctag == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", data)
            if interlace:
                raise ValueError(f"{path}: interlaced PNGs are not supported")
        elif ctag == b"PLTE":
            palette = data
        elif ctag == b"tRNS":
            trns = data
        elif ctag == b"IDAT":
            idat.append(data)
        elif ctag == b"IEND":
            break
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bpp = max(1, (channels * depth + 7) // 8)
    stride = (w * channels * depth + 7) // 8
    buf = zlib.decompress(b"".join(idat))
    out = bytearray(w * h * 4)
    prev = bytearray(stride)
    p = 0
    maxv = (1 << depth) - 1

    def samples(line):
        """unpack a scanline into colour samples (one per channel of a pixel)"""
        if depth == 8:
            return line
        vals = []
        per = 8 // depth
        mask = (1 << depth) - 1
        for i in range(w * channels):
            byte = line[i // per]
            shift = 8 - depth * ((i % per) + 1)
            vals.append((byte >> shift) & mask)
        return vals

    for y in range(h):
        f = buf[p]
        p += 1
        line = bytearray(buf[p:p + stride])
        p += stride
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                c = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(a, prev[i], c)) & 0xFF
        prev = line
        o = y * w * 4
        if ctype == 6 and depth == 8:
            out[o:o + w * 4] = line
        elif ctype == 2 and depth == 8:
            for x in range(w):
                out[o + x * 4:o + x * 4 + 3] = line[x * 3:x * 3 + 3]
                out[o + x * 4 + 3] = 255
        elif ctype == 0:
            smp = samples(line)
            for x in range(w):
                v = smp[x] * (255 // maxv)
                out[o + x * 4] = out[o + x * 4 + 1] = out[o + x * 4 + 2] = v
                out[o + x * 4 + 3] = 255
        elif ctype == 4:
            smp = samples(line)
            for x in range(w):
                v = smp[x * 2] * (255 // maxv)
                out[o + x * 4] = out[o + x * 4 + 1] = out[o + x * 4 + 2] = v
                out[o + x * 4 + 3] = smp[x * 2 + 1] * (255 // maxv)
        elif ctype == 3:
            smp = samples(line)
            n = len(palette) // 3 if palette else 0
            for x in range(w):
                idx = smp[x] if smp[x] < n else n - 1
                i = idx * 3
                out[o + x * 4:o + x * 4 + 3] = palette[i:i + 3]
                # tRNS for a palette PNG is indexed by palette entry, not column
                out[o + x * 4 + 3] = trns[idx] if trns and idx < len(trns) else 255
        else:
            raise ValueError(f"{path}: unhandled colour type {ctype}/{depth}")
    opaque = all(out[i] == 255 for i in range(3, len(out), 4))
    _PNG_CACHE[key] = (w, h, out, opaque)
    return _PNG_CACHE[key]


# ── PNG encoding ────────────────────────────────────────────────────────────
def encode_png(w, h, rgb):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgb[y * w * 3:(y + 1) * w * 3]
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


# ── colour parsing ──────────────────────────────────────────────────────────
def parse_col(col):
    if col.startswith("rgba("):
        parts = col[5:-1].split(",")
        r, g, b = (int(float(p)) for p in parts[:3])
        a = float(parts[3]) if len(parts) > 3 else 1.0
        return (r & 255, g & 255, b & 255, a)
    if col.startswith("rgb("):
        r, g, b = (int(float(p)) for p in col[4:-1].split(",")[:3])
        return (r & 255, g & 255, b & 255, 1.0)
    if col.startswith("#"):
        h = col[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
        if len(h) == 8:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16) / 255)
    return (0, 0, 0, 1.0)


# ── the replayer ────────────────────────────────────────────────────────────
class Canvas:
    def __init__(self, w, h, bg=(5, 6, 10)):
        self.w, self.h = w, h
        self.px = bytearray(w * h * 3)
        for i in range(0, len(self.px), 3):
            self.px[i], self.px[i + 1], self.px[i + 2] = bg

    def _clip(self, rect):
        if not rect:
            return 0, 0, self.w, self.h
        x0 = max(0, int(round(rect["x"])))
        y0 = max(0, int(round(rect["y"])))
        x1 = min(self.w, int(round(rect["x"] + rect["w"])))
        y1 = min(self.h, int(round(rect["y"] + rect["h"])))
        return (x0, y0, max(x0, x1), max(y0, y1))

    def fill(self, x, y, w, h, col, alpha, clip=None):
        if w < 0:
            x += w
            w = -w
        if h < 0:
            y += h
            h = -h
        r, g, b, ca = parse_col(col)
        a = ca * alpha
        if a <= 0:
            return
        cx0, cy0, cx1, cy1 = self._clip(clip)
        x0 = max(cx0, int(round(x)))
        x1 = min(cx1, int(round(x + w)))
        y0 = max(cy0, int(round(y)))
        y1 = min(cy1, int(round(y + h)))
        if x1 <= x0 or y1 <= y0:
            return
        blend = a < 1.0
        px = self.px
        for yy in range(y0, y1):
            row = yy * self.w * 3
            if not blend:
                seg = bytes((r, g, b)) * (x1 - x0)
                px[row + x0 * 3:row + x1 * 3] = seg
            else:
                ia = 1.0 - a
                for xx in range(x0, x1):
                    i = row + xx * 3
                    px[i] = int(px[i] * ia + r * a) & 255
                    px[i + 1] = int(px[i + 1] * ia + g * a) & 255
                    px[i + 2] = int(px[i + 2] * ia + b * a) & 255

    def stroke_rect(self, x, y, w, h, col, alpha, lw=1, clip=None):
        t = max(1, int(lw))
        self.fill(x, y, w, t, col, alpha, clip)
        self.fill(x, y + h - t, w, t, col, alpha, clip)
        self.fill(x, y, t, h, col, alpha, clip)
        self.fill(x + w - t, y, t, h, col, alpha, clip)

    def blit(self, op, clip=None):
        iw, ih, src, opaque = decode_png(str(ROOT / op["path"]))
        m = op.get("m", [1, 0, 0, 1, 0, 0])
        a_m, b_m, c_m, d_m, e_m, f_m = m
        x, y, w, h = op["x"], op["y"], op["w"], op["h"]
        sx, sy, sw, sh = op["sx"], op["sy"], op["sw"], op["sh"]
        if sx < 0 or sy < 0 or sw <= 0 or sh <= 0:
            return
        # axis-aligned destination box (the game only translates and mirrors)
        xs = [a_m * x + c_m * y + e_m, a_m * (x + w) + c_m * y + e_m,
              a_m * x + c_m * (y + h) + e_m, a_m * (x + w) + c_m * (y + h) + e_m]
        ys = [b_m * x + d_m * y + f_m, b_m * (x + w) + d_m * y + f_m,
              b_m * x + d_m * (y + h) + f_m, b_m * (x + w) + d_m * (y + h) + f_m]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        dw, dh = x1 - x0, y1 - y0
        if dw <= 0 or dh <= 0:
            return
        flipx = (a_m * d_m < 0) or w < 0
        flipy = (b_m * c_m > 0) or h < 0
        clip = clip if clip is not None else op.get("clip")
        cx0, cy0, cx1, cy1 = self._clip(clip)

        alpha = op.get("a", 1)
        if src is None or iw == 0 or ih == 0 or alpha <= 0 or sw <= 0 or sh <= 0:
            return

        dx0 = max(cx0, int(round(x0)))
        dx1 = min(cx1, int(round(x0 + dw)))
        dy0 = max(cy0, int(round(y0)))
        dy1 = min(cy1, int(round(y0 + dh)))
        if dx1 <= dx0 or dy1 <= dy0:
            return

        # source lookup tables (nearest neighbour, exactly like the canvas)
        cols = []
        for dxi in range(dx0, dx1):
            u = (dxi + 0.5 - x0) / dw
            u = 1.0 - u if flipx else u
            u = min(0.999999, max(0.0, u))
            cols.append(sx + int(u * sw))
        rows = []
        for dyi in range(dy0, dy1):
            v = (dyi + 0.5 - y0) / dh
            v = 1.0 - v if flipy else v
            v = min(0.999999, max(0.0, v))
            rows.append(sy + int(v * sh))

        px = self.px
        blend = (not opaque) or alpha < 1.0
        for dyi, srow in zip(range(dy0, dy1), rows):
            srow = min(ih - 1, max(0, srow)) * iw * 4
            drow = dyi * self.w * 3
            for dxi, scol in zip(range(dx0, dx1), cols):
                si = srow + min(iw - 1, max(0, scol)) * 4
                sa = src[si + 3]
                if sa == 0:
                    continue
                di = drow + dxi * 3
                if not blend or (sa == 255 and alpha >= 1):
                    px[di] = src[si]
                    px[di + 1] = src[si + 1]
                    px[di + 2] = src[si + 2]
                    continue
                f = (sa / 255.0) * alpha
                inv = 1.0 - f
                px[di] = int(px[di] * inv + src[si] * f) & 255
                px[di + 1] = int(px[di + 1] * inv + src[si + 1] * f) & 255
                px[di + 2] = int(px[di + 2] * inv + src[si + 2] * f) & 255


def replay(scene, verbose=False):
    t0 = time.time()
    c = Canvas(scene["w"], scene["h"])
    counts = {}
    for op in scene["ops"]:
        counts[op["t"]] = counts.get(op["t"], 0) + 1
        if op["t"] == "rect":
            c.fill(op["x"], op["y"], op["w"], op["h"], op["col"], op.get("a", 1), op.get("clip"))
        elif op["t"] == "line":
            c.stroke_rect(op["x"], op["y"], op["w"], op["h"], op["col"], op.get("a", 1),
                          op.get("lw", 1), op.get("clip"))
        elif op["t"] == "img":
            c.blit(op)
    if verbose:
        print(f"  replayed {len(scene['ops'])} ops {counts} in {time.time() - t0:.2f}s")
    return c


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 1
    scene_path, out_path = args[0], args[1]
    scale = 1
    for a in args[2:]:
        if a.startswith("--scale="):
            scale = int(a.split("=")[1])
    scene = json.loads(Path(scene_path).read_text())
    canvas = replay(scene, verbose=True)
    w, h, px = canvas.w, canvas.h, canvas.px
    if scale != 1:
        sw, sh = w * scale, h * scale
        big = bytearray(sw * sh * 3)
        for y in range(sh):
            sy = y // scale
            srow = sy * w * 3
            drow = y * sw * 3
            for x in range(sw):
                si = srow + (x // scale) * 3
                di = drow + x * 3
                big[di:di + 3] = px[si:si + 3]
        w, h, px = sw, sh, big
    Path(out_path).write_bytes(encode_png(w, h, px))
    print(f"✓ {out_path} {w}x{h}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
