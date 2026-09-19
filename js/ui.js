/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG - ui - immediate-mode widgets for the console
   Every control is drawn and hit-tested in the same pass; the widget that the
   pointer is over becomes `hot`, the one being dragged is `active`.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

DG.UI = (function () {
  const A = (p) => DG.Assets.A(p);
  const I = () => DG.Input;

  const hot = { id: null, active: null, hover: null };
  const W = { w: 0, h: 0 };

  function begin(w, h) {
    W.w = w; W.h = h;
    hot.hover = null;
  }

  function inside(r) {
    const p = DG.Input;
    return p.mx >= r.x && p.mx <= r.x + r.w && p.my >= r.y && p.my <= r.y + r.h;
  }

  /* ── text (bitmap font atlas) ─────────────────────────────────────────── */
  /* glyph metrics come from the forged atlas (95 printable cells in a row) */
  const metrics = () => {
    const at = A("ui/font.png");
    return at ? { w: Math.round(at.width / 95), h: at.height } : { w: 6, h: 11 };
  };
  let GW = 6, GH = 11;
  /* the palette mirrors tools/gen_font.py: one ImageMagick-tinted atlas each */
  const INK = {
    "#dfe8ff": "paper", "#c9d8f0": "steel", "#8fa0c0": "slate", "#4a5470": "dim",
    "#2b3247": "faint", "#ffd35c": "amber", "#a8842a": "brass", "#ffe9a0": "gold",
    "#6fe0ff": "teal", "#7df5a8": "mint", "#ff8a8a": "rose", "#ff5c5c": "hot",
    "#12203a": "ink", "#6b7794": "label", "#39415a": "ghost",
    "#ffb03a": "warn", "#ff6b7a": "danger", "#3f6b52": "deep",
  };
  const LEDS = { "#7df5a8": "mint", "#ffb03a": "amber", "#ff5c5c": "rose",
                 "#6fe0ff": "teal", "#ffe9a0": "gold" };
  const unknown = new Set();
  function ink(col) {
    const name = INK[col];
    if (!name) { unknown.add(col); return A("ui/font_paper.png"); }
    const at = A("ui/font_" + name + ".png");
    if (!at) unknown.add(col);
    return at;
  }
  function text(g, str, x, y, col = "#dfe8ff", scale = 1) {
    const m = metrics();
    GW = m.w; GH = m.h;
    const at = ink(col) || A("ui/font_paper.png");
    if (!at) return 0;
    let w = 0;
    for (const ch of String(str)) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) { w += GW * scale; continue; }
      g.drawImage(at, (c - 32) * GW, 0, GW, GH,
                  Math.round(x + w), Math.round(y), GW * scale, GH * scale);
      w += GW * scale;
    }
    return w;
  }
  function textWidth(str, scale = 1) {
    const m = metrics();
    return String(str).length * m.w * scale;
  }
  function textRight(g, str, rx, y, col, scale = 1) {
    return text(g, str, rx - textWidth(str, scale), y, col, scale);
  }
  function textCenter(g, str, cx, y, col, scale = 1) {
    return text(g, str, cx - textWidth(str, scale) / 2, y, col, scale);
  }

  /* ── plates & bezels (9-slice) ────────────────────────────────────────── */
  function slice(g, src, x, y, w, h, border) {
    const c = border;
    g.drawImage(src, 0, 0, c, c, x, y, c, c);
    g.drawImage(src, src.width - c, 0, c, c, x + w - c, y, c, c);
    g.drawImage(src, 0, src.height - c, c, c, x, y + h - c, c, c);
    g.drawImage(src, src.width - c, src.height - c, c, c, x + w - c, y + h - c, c, c);
    g.drawImage(src, c, 0, src.width - c * 2, c, x + c, y, w - c * 2, c);
    g.drawImage(src, c, src.height - c, src.width - c * 2, c, x + c, y + h - c, w - c * 2, c);
    g.drawImage(src, 0, c, c, src.height - c * 2, x, y + c, c, h - c * 2);
    g.drawImage(src, src.width - c, c, c, src.height - c * 2, x + w - c, y + c, c, h - c * 2);
    g.drawImage(src, c, c, src.width - c * 2, src.height - c * 2, x + c, y + c, w - c * 2, h - c * 2);
  }
  function plate(g, x, y, w, h, variant = "plate") {
    const src = A(`ui/${variant}.png`);
    if (!src) { g.fillStyle = "#2b3040"; g.fillRect(x, y, w, h); return; }
    slice(g, src, x, y, w, h, 8);
  }

  /* ── button: returns true on click ───────────────────────────────────── */
  function button(g, r, label, opts = {}) {
    const id = opts.id || label + "|" + r.x + "," + r.y;
    const over = inside(r) && !opts.disabled;
    if (over) hot.hover = id;
    const held = hot.active === id;
    const pressed = over && I().down;
    if (pressed && hot.active == null) hot.active = id;
    if (hot.active === id && (I().released || (!I().down && held))) hot.active = null;
    let clicked = false;
    if (pressed && I().clicked) clicked = true;
    if (opts.hotkey && DG.Input.hit(opts.hotkey)) clicked = true;

    const state = opts.disabled ? "down" : pressed || held ? "down" : over ? "hot" : "up";
    const face = opts.accent ? variantOf(opts) : null;
    const src = A(`ui/btn_${state}.png`);
    if (src) slice(g, src, r.x, r.y, r.w, r.h, 4);
    else { g.fillStyle = state === "hot" ? "#3a3f57" : "#2f3547"; g.fillRect(r.x, r.y, r.w, r.h); }

    if (opts.icon) {
      const ic = A(opts.icon);
      if (ic) g.drawImage(ic, r.x + 4, r.y + (r.h - ic.height) / 2);
    }
    const labelCol = opts.disabled ? "#4a5470"
                   : state === "hot" ? "#12203a" : "#c9d8f0";
    const scale = opts.scale || 1;
    const tw = textWidth(label, scale);
    const lx = opts.align === "left" ? r.x + (opts.icon ? 16 : 6) : r.x + (r.w - tw) / 2;
    text(g, label, lx, r.y + (r.h - GH * scale) / 2 + 1, labelCol, scale);
    return clicked;
  }

  function variantOf(o) { return o.accent; }

  /* ── gauge: horizontal bar with a liquid fill and tick marks ─────────── */
  function bar(g, r, value, opts = {}) {
    const v = Math.max(0, Math.min(1, value));
    const bg = A("ui/gauge.png");
    if (bg) slice(g, bg, r.x, r.y, r.w, r.h, 3);
    else { g.fillStyle = "#0d1220"; g.fillRect(r.x, r.y, r.w, r.h); }
    const ix = r.x + 2, iy = r.y + 2, iw = r.w - 4, ih = r.h - 4;
    if (iw <= 0 || ih <= 0) return;
    const col = opts.color || "#6fe0ff";
    const warn = opts.warnAt != null && (opts.invert ? v <= opts.warnAt : v >= opts.warnAt);
    const crit = opts.critAt != null && (opts.invert ? v <= opts.critAt : v >= opts.critAt);
    const fillW = Math.max(0, Math.round(iw * v));
    const flash = crit && Math.floor(game_time * 8) % 2 === 0;
    const c1 = crit ? (flash ? "#ff5c5c" : "#ff8a8a") : warn ? (flash ? "#ffd35c" : "#ffb03a") : col;
    g.fillStyle = c1;
    g.fillRect(ix, iy, fillW, ih);
    /* top highlight + bottom shade make the fill read as a liquid column */
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(ix, iy, fillW, 1);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(ix, iy + ih - 1, fillW, 1);
    /* segment ticks */
    for (let x = 6; x < iw; x += 6) {
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(ix + x, iy, 1, ih);
    }
    if (opts.label) {
      const scale = r.h >= 12 ? 1 : 1;
      text(g, opts.label, ix + 2, Math.round(r.y + (r.h - GH * scale) / 2) + 1,
           opts.labelCol || "#04070d", scale);
      if (opts.valueText) {
        const t = opts.valueText;
        textRight(g, t, ix + iw - 2, Math.round(r.y + (r.h - GH * scale) / 2) + 1,
                  opts.valueCol || "#e8f0ff", scale);
      }
    }
  }

  /* ── a slot: 16x16 framed cell holding an 8x8 item icon ──────────────── */
  function slot(g, x, y, icon, opts = {}) {
    const s = 18;
    const src = A(opts.selected ? "ui/slot_sel.png" : "ui/slot.png");
    if (src) g.drawImage(src, x, y, s, s);
    else { g.fillStyle = "#100f1a"; g.fillRect(x, y, s, s); }
    if (icon) {
      const ic = typeof icon === "string" ? A(icon) : icon;
      if (ic) g.drawImage(ic, x + 5, y + 5, 8, 8);
    }
    if (opts.count) {
      const t = opts.count > 99 ? "99" : String(opts.count);
      textRight(g, t, x + s - 1, y + s - 11, opts.countCol || "#ffe9a0");
    }
  }

  /* ── LED lamp, tinted from the cached atlas ─────────────────────────── */
  function led(g, x, y, col, on = true) {
    if (!on) { g.globalAlpha = 0.3; }
    let l = A("ui/led.png");
    if (on && col) {
      const name = LEDS[col];
      if (!name) unknown.add("led:" + col);
      l = (name && A("ui/led_" + name + ".png")) || l;
    }
    if (l) g.drawImage(l, x, y);
    g.globalAlpha = 1;
  }

  function stripes(g, x, y, w, h) {
    const s = A("ui/stripes.png");
    if (!s) return;
    const ox = Math.floor(game_time * 12) % 6;
    for (let i = -1; i * 6 < w + 6; i++) g.drawImage(s, x + i * 6 - ox, y);
  }

  function end() { /* reserved for future focus handling */ }

  return { begin, end, text, textWidth, textRight, textCenter, plate, slice,
           button, bar, slot, led, stripes, inside, INK, LEDS,
           get unknownColors() { return unknown; },
           get hot() { return hot; } };
})();
