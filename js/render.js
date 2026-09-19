/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · render — camera, parallax caves, tiles, lamp light, HUD
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

const TILE = 16;
let CAM = null;                     // the active camera, for module-level draw fns

DG.Render = (function () {
  const A = (p) => DG.Assets.A(p);
  const fg = "#0b0a12", dim = "#4a4370", amber = "#ffd35c", mint = "#7df5a8";

  /* ── bitmap text ─────────────────────────────────────────────────────── */
  const GLYPH_W = 7, GLYPH_H = 14;
  /* offscreen buffer the lamp punches holes into (allocated on first use) */
  const light = { canvas: null, g: null };
  let fontReady = false;
  function drawText(g, str, x, y, col = "#fff8e0", scale = 1, opts = {}) {
    const atlas = A("ui/font.png");
    if (!atlas) return 0;
    const chars = String(str);
    let w = 0;
    if (opts.shadow) drawText(g, chars, x + 1, y + 1, opts.shadow, scale);
    for (let i = 0; i < chars.length; i++) {
      const c = chars.charCodeAt(i);
      if (c < 32 || c > 126) { w += GLYPH_W * scale; continue; }
      const sx = (c - 32) * GLYPH_W;
      g.drawImage(atlas, sx, 0, GLYPH_W, GLYPH_H,
                  Math.round(x + w), Math.round(y), GLYPH_W * scale, GLYPH_H * scale);
      w += GLYPH_W * scale;
    }
    return w;
  }
  function textWidth(str, scale = 1) { return String(str).length * GLYPH_W * scale; }
  /* colourise the atlas once per requested colour, cached */
  const inkCache = new Map();
  function ink(col) {
    if (inkCache.has(col)) return inkCache.get(col);
    const atlas = A("ui/font.png");
    if (!atlas) return null;
    const c = document.createElement("canvas");
    c.width = atlas.width; c.height = atlas.height;
    const g = c.getContext("2d");
    g.drawImage(atlas, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = col;
    g.fillRect(0, 0, c.width, c.height);
    inkCache.set(col, c);
    return c;
  }
  function drawTextCol(g, str, x, y, col, scale = 1) {
    const at = ink(col) || A("ui/font.png");
    if (!at) return 0;
    let w = 0;
    for (const ch of String(str)) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) { w += GLYPH_W * scale; continue; }
      g.drawImage(at, (c - 32) * GLYPH_W, 0, GLYPH_W, GLYPH_H,
                  Math.round(x + w), Math.round(y), GLYPH_W * scale, GLYPH_H * scale);
      w += GLYPH_W * scale;
    }
    return w;
  }

  /* ── 9-slice panel ───────────────────────────────────────────────────── */
  function panel(g, x, y, w, h, src = "ui/panel.png") {
    const p = A(src);
    if (!p) { g.fillStyle = "#151422"; g.fillRect(x, y, w, h); return; }
    const c = 8;
    g.drawImage(p, 0, 0, c, c, x, y, c, c);
    g.drawImage(p, p.width - c, 0, c, c, x + w - c, y, c, c);
    g.drawImage(p, 0, p.height - c, c, c, x, y + h - c, c, c);
    g.drawImage(p, p.width - c, p.height - c, c, c, x + w - c, y + h - c, c, c);
    g.drawImage(p, c, 0, p.width - c * 2, c, x + c, y, w - c * 2, c);
    g.drawImage(p, c, p.height - c, p.width - c * 2, c, x + c, y + h - c, w - c * 2, c);
    g.drawImage(p, 0, c, c, p.height - c * 2, x, y + c, c, h - c * 2);
    g.drawImage(p, p.width - c, c, c, p.height - c * 2, x + w - c, y + c, c, h - c * 2);
    g.drawImage(p, c, c, p.width - c * 2, p.height - c * 2, x + c, y + c, w - c * 2, h - c * 2);
  }

  function button(g, x, y, w, h, label, hot, scale = 1) {
    const img = A(hot ? "ui/button_hot.png" : "ui/button.png");
    if (img) {
      const c = 5;
      g.drawImage(img, 0, 0, c, img.height, x, y, c, h);
      g.drawImage(img, img.width - c, 0, c, img.height, x + w - c, y, c, h);
      g.drawImage(img, c, 0, img.width - c * 2, img.height, x + c, y, w - c * 2, h);
    }
    const tw = textWidth(label, scale);
    drawTextCol(g, label, x + (w - tw) / 2, y + (h - GLYPH_H * scale) / 2 + 1,
                hot ? "#1a1526" : "#c9b8f0", scale);
  }

  return {
    drawText, drawTextCol, textWidth, panel, button, ink,
    GLYPH_W, GLYPH_H,

    frame(g, game) { return frameImpl.call(this, g, game); },
    drawOverlay,

    /* ── camera ──────────────────────────────────────────────────────── */
    camera: null,
    initCamera(world) {
      this.camera = { x: world.campX * TILE - 240, y: 0, sx: 0, sy: 0, shake: 0, shakeT: 0 };
      CAM = this.camera;
    },
    updateCamera(dt, player, aim, view) {
      const c = this.camera;
      const lookX = aim ? clamp(aim.wx - player.cx, -70, 70) * 0.45 : 0;
      const lookY = aim ? clamp(aim.wy - player.cy, -50, 50) * 0.3 : 0;
      const tx = player.cx - view.w / 2 + lookX;
      const ty = player.cy - view.h / 2 + lookY;
      c.x = lerp(c.x, tx, 1 - Math.pow(0.0016, dt));
      c.y = lerp(c.y, ty, 1 - Math.pow(0.0016, dt));
      if (c.shakeT > 0) {
        c.shakeT -= dt;
        c.sx = (Math.random() - 0.5) * c.shake * 2;
        c.sy = (Math.random() - 0.5) * c.shake * 2;
      } else { c.sx *= 0.8; c.sy *= 0.8; }
    },

    /* ── parallax cave layers ────────────────────────────────────────── */
    drawParallax(g, game, view) {
      const c = this.camera;
      const deep = clamp(game.world.depthMeters(game.player.cy / TILE) / 240, 0, 1);
      g.fillStyle = deep > 0.5 ? "#0a0812" : "#0d0b18";
      g.fillRect(0, 0, view.w, view.h);
      const layers = [
        { img: A("bg/cave_far.png"), px: 0.22, py: 0.16, alpha: 1 - deep * 0.5 },
        { img: A("bg/cave_mid.png"), px: 0.42, py: 0.3, alpha: 1 - deep * 0.35 },
      ];
      for (const L of layers) {
        if (!L.img) continue;
        g.globalAlpha = L.alpha;
        const ox = -(c.x * L.px) % L.img.width;
        const oy = -(c.y * L.py) % L.img.height;
        for (let x = ox - L.img.width; x < view.w; x += L.img.width)
          for (let y = oy - L.img.height; y < view.h; y += L.img.height)
            g.drawImage(L.img, Math.round(x), Math.round(y));
        g.globalAlpha = 1;
      }
    },

    /* ── terrain ─────────────────────────────────────────────────────── */
    drawWorld(g, world, view) {
      const c = this.camera;
      const x0 = Math.floor(c.x / TILE) - 1, x1 = Math.ceil((c.x + view.w) / TILE) + 1;
      const y0 = Math.floor(c.y / TILE) - 1, y1 = Math.ceil((c.y + view.h) / TILE) + 1;
      const hitFlash = [];

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (x < 0 || y < 0 || x >= world.W || y >= world.H) continue;
          const i = y * world.W + x;
          const id = world.tiles[i];
          const sx = Math.round(x * TILE - c.x), sy = Math.round(y * TILE - c.y);
          const d = TILES[id];

          if (id === T.AIR || id === T.LAVA) {
            const bgId = world.bg[i];
            const bd = TILES[bgId];
            if (bgId && bd && bd.sprites) {
              const v = (world.variants[i] % bd.variants) + 1;
              const s = A(`tiles/bg_${bd.sprites}_${v}.png`);
              if (s) g.drawImage(s, sx, sy);
            } else {
              g.fillStyle = "#0a0912";
              g.fillRect(sx, sy, TILE, TILE);
            }
            if (id === T.LAVA) {
              const frame = Math.floor(game_time * 6 + (x + y) * 0.7) % 4;
              const s = A(`fx/lava_${frame}.png`);
              if (s) g.drawImage(s, sx, sy);
              else { g.fillStyle = "#e2541a"; g.fillRect(sx, sy, TILE, TILE); }
            }
            continue;
          }
          if (id === T.PLANK) {
            const pl = A("sprites/prop_plank.png");
            if (pl) g.drawImage(pl, sx, sy); else { g.fillStyle = "#6b4a2f"; g.fillRect(sx, sy, TILE, TILE); }
            continue;
          }

          let sprite = null;
          if (d.oreMark) {
            const v = (world.variants[i] % 3) + 1;
            sprite = A(`tiles/${d.sprites}_${v}.png`);
          } else if (d.sprites) {
            const v = (world.variants[i] % d.variants) + 1;
            sprite = A(`tiles/${d.sprites}_${v}.png`);
          }
          if (sprite) {
            /* mirror about a third of the tiles — kills the wallpaper feel */
            if ((x * 7 + y * 13) % 3 === 0) {
              g.save();
              g.translate(sx + TILE, sy);
              g.scale(-1, 1);
              g.drawImage(sprite, 0, 0);
              g.restore();
            } else {
              g.drawImage(sprite, sx, sy);
            }
          } else { g.fillStyle = "#707786"; g.fillRect(sx, sy, TILE, TILE); }

          const dmg = world.damage[i];
          if (dmg > 0.02) hitFlash.push([sx, sy, dmg]);
        }
      }

      /* crack overlays for tiles being chewed on */
      for (const [sx, sy, dmg] of hitFlash) {
        const stage = dmg > 0.66 ? 2 : dmg > 0.33 ? 1 : 0;
        const cr = A(`fx/crack_${stage}.png`);
        if (cr) { g.globalAlpha = 0.85; g.drawImage(cr, sx, sy); g.globalAlpha = 1; }
      }
      return { x0, x1, y0, y1 };
    },

    /* ── entities ────────────────────────────────────────────────────── */
    drawEntities(g, game) {
      const c = this.camera;
      const { world, player, mobs, drops, particles, floaters } = game;

      /* drops */
      for (const d of drops.list) {
        const s = A(`sprites/item_${d.ore || "coin"}.png`);
        const bob = Math.sin(d.t * 8) * 1.5;
        if (s) g.drawImage(s, Math.round(d.x - 4 - c.x), Math.round(d.y - 4 - c.y + bob));
      }

      /* monsters */
      for (const m of mobs) {
        if (m.dead) continue;
        const sprite = A(`sprites/${m.k.sprite}_${m.k.frames > 1 ? m.frame : 0}.png`);
        if (!sprite) continue;
        const sx = Math.round(m.x - c.x + (m.k.w - sprite.width) / 2);
        const sy = Math.round(m.y - c.y + (m.k.h - sprite.height));
        if (m.hurtT > 0) {
          g.save();
          g.globalCompositeOperation = "source-over";
          g.globalAlpha = 0.9;
          const flash = A("sprites/miner_hurt.png");
          g.drawImage(sprite, sx, sy);
          g.globalAlpha = 0.5;
          if (flash) g.drawImage(flash, sx, sy, sprite.width, sprite.height);
          g.globalAlpha = 1;
          g.restore();
        } else {
          g.drawImage(sprite, sx, sy);
        }
        /* health pips when wounded */
        if (m.hp < m.maxHp) {
          const w = m.k.w + 2;
          g.fillStyle = "#0b0a12";
          g.fillRect(sx - 1, sy - 5, w, 3);
          g.fillStyle = m.kind === "golem" ? "#ff8a2b" : "#ff6b7a";
          g.fillRect(sx - 1, sy - 5, Math.max(1, Math.round(w * (m.hp / m.maxHp))), 1);
          g.fillStyle = "#7df5a8";
          g.fillRect(sx - 1, sy - 4, Math.max(1, Math.round(w * (m.hp / m.maxHp))), 1);
        }
      }

      /* particles behind the player */
      for (const p of particles.list) {
        if (p.kind === "smoke") continue;
        this.drawParticle(g, p);
      }

      /* the miner */
      this.drawPlayer(g, player, game.aim);

      for (const p of particles.list) if (p.kind === "smoke") this.drawParticle(g, p);

      /* floating text */
      for (const f of floaters.list) {
        const a = 1 - f.t / f.life;
        g.globalAlpha = clamp(a * 1.6, 0, 1);
        const w = this.textWidth(f.text, f.big ? 2 : 1);
        this.drawTextCol(g, f.text, f.x - c.x - w / 2, f.y - c.y - 10 - f.t * 12,
                         f.col, f.big ? 2 : 1);
        g.globalAlpha = 1;
      }
      return true;
    },

    drawParticle(g, p) {
      const c = this.camera;
      const a = clamp(p.life / p.max, 0, 1);
      g.globalAlpha = p.fade === false ? 1 : a;
      const x = Math.round(p.x - c.x), y = Math.round(p.y - c.y);
      if (p.kind === "chip") {
        const s = A(`fx/chip_${p.size % 4}.png`);
        if (s) g.drawImage(s, x, y);
      } else if (p.kind === "spark") {
        const s = A("fx/sparkle_0.png");
        if (s) g.drawImage(s, x - 4, y - 4);
      } else if (p.kind === "smoke") {
        const s = A("fx/puff_0.png");
        if (s) { g.globalAlpha = a * 0.55; g.drawImage(s, x - 3, y - 3); }
      } else if (p.kind === "glint") {
        g.fillStyle = p.col || "#ffe9a0";
        g.fillRect(x, y, 2, 2);
      } else if (p.col) {
        g.fillStyle = p.col;
        g.fillRect(x, y, p.size, p.size);
      }
      g.globalAlpha = 1;
    },

    drawPlayer(g, p, aim) {
      const c = this.camera;
      const sprite = A(`sprites/miner_${p.anim}.png`);
      if (!sprite) return;
      const sx = Math.round(p.cx - c.x - sprite.width / 2);
      const sy = Math.round(p.y + p.h - c.y - sprite.height);
      /* invulnerability flicker */
      const blink = p.invuln > 0 && Math.floor(game_time * 22) % 2 === 0;
      g.globalAlpha = blink ? 0.35 : 1;
      g.drawImage(sprite, sx, sy);
      if (p.hurtFlash > 0) {
        const hurt = A("sprites/miner_hurt.png");
        if (hurt) {
          g.globalAlpha = clamp(p.hurtFlash * 2.6, 0, 0.85);
          g.drawImage(hurt, sx, sy);
        }
      }
      g.globalAlpha = 1;
      /* held pickaxe, swung toward the aim */
      if (aim) this.drawPickaxe(g, p, aim);
      /* the lamp on the helmet */
      g.fillStyle = "#fff6b0";
      g.fillRect(sx + 5, sy + 2, 2, 2);
      g.fillStyle = "#ffd35c";
      g.fillRect(sx + 5, sy + 4, 2, 1);
    },
    /* pickaxe held in hand, spun while swinging */
    drawPickaxe(g, p, aim) {
      const c = this.camera;
      const pk = A(`ui/hand_pick_${p.pick.id}.png`) || A(`sprites/pick_${p.pick.id}.png`);
      if (!pk) return;
      const dir = aim.dx >= 0 ? 1 : -1;
      let ang;
      if (p.swing > 0) {
        const t = 1 - p.swing / 0.26;
        ang = lerp(-1.5, 0.85, t * t * (3 - 2 * t));   // wind up, then bite
      } else {
        ang = -0.75 + Math.sin(p.bobT * 3) * 0.06;
      }
      const hx = p.cx + dir * (p.swing > 0 ? 3 : 1) - c.x;
      const hy = p.cy + 1 - c.y;
      g.save();
      g.translate(Math.round(hx), Math.round(hy));
      g.scale(dir, 1);
      g.rotate(ang);
      g.drawImage(pk, -1, -10);
      g.restore();
    },
  };


  /* ── lighting ──────────────────────────────────────────────────────── */
  function ensureLight(w, h) {
    if (!light.canvas) {
      light.canvas = document.createElement("canvas");
      light.canvas.width = w; light.canvas.height = h;
      light.g = light.canvas.getContext("2d");
    }
    return light;
  }
  function drawDarkness(g, game, view) {
    const { world, player } = game;
    const L = ensureLight(view.w, view.h);
    const lg = L.g;
    const depth = world.depthMeters(player.cy / TILE);
    const dark = clamp(depth <= 0 ? 0.10 : 0.16 + depth / 260 * 0.66, 0.10, 0.90);
    lg.globalCompositeOperation = "source-over";
    lg.clearRect(0, 0, view.w, view.h);
    lg.fillStyle = `rgba(4,3,9,${dark})`;
    lg.fillRect(0, 0, view.w, view.h);

    lg.globalCompositeOperation = "destination-out";
    const c = CAM;
    const lamp = A("ui/lamp_glow.png");
    const R = (player.up.lantern ? 150 : 118) + Math.sin(game_time * 2.2) * 3;
    const lx = player.cx - c.x, ly = player.cy - c.y - 2;
    if (lamp) {
      lg.globalAlpha = clamp(dark + 0.1, 0, 1);
      lg.drawImage(lamp, lx - R, ly - R, R * 2, R * 2);
      lg.globalAlpha = 1;
    }
    /* glinting ore & lava read through the dark */
    const x0 = Math.floor(c.x / TILE), x1 = x0 + Math.ceil(view.w / TILE);
    const y0 = Math.floor(c.y / TILE), y1 = y0 + Math.ceil(view.h / TILE);
    const small = A("ui/cool_glow.png");
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= world.W || y >= world.H) continue;
        const id = world.tiles[y * world.W + x];
        const d = TILES[id];
        if (id === T.LAVA) {
          const r = 30;
          if (small) lg.drawImage(small, x * TILE - c.x + TILE / 2 - r, y * TILE - c.y + TILE / 2 - r, r * 2, r * 2);
        } else if (d && d.glow && !d.oreMark) {
          const r = 20;
          if (small) lg.drawImage(small, x * TILE - c.x + TILE / 2 - r, y * TILE - c.y + TILE / 2 - r, r * 2, r * 2);
        } else if (d && d.oreMark && d.glow) {
          /* ores only twinkle once you are near — keeps exploration rewarding */
          const r = 13;
          if (small) { lg.globalAlpha = 0.6; lg.drawImage(small, x * TILE - c.x + TILE / 2 - r, y * TILE - c.y + TILE / 2 - r, r * 2, r * 2); lg.globalAlpha = 1; }
        }
      }
    }
    /* monsters glow faintly */
    for (const m of game.mobs) {
      if (!m.k.glows || m.dead) continue;
      const r = 16 * m.k.mag;
      if (small) lg.drawImage(small, m.cx - c.x - r, m.cy - c.y - r, r * 2, r * 2);
    }
    lg.globalCompositeOperation = "source-over";
    g.drawImage(L.canvas, 0, 0);
  }

  /* ── HUD ───────────────────────────────────────────────────────────── */
  function drawHUD(g, game, view) {
    const { player, world } = game;
    const pad = 6;
    /* hearts */
    for (let i = 0; i < player.maxHp / 2; i++) {
      const half = player.hp - i * 2;
      const img = half >= 2 ? "ui/heart_full.png" : half === 1 ? "ui/heart_half.png" : "ui/heart_empty.png";
      const s = A(img);
      if (s) g.drawImage(s, pad + i * 11, pad);
    }
    /* coins */
    const coin = A("sprites/item_coin.png");
    if (coin) g.drawImage(coin, pad, pad + 12);
    drawTextCol(g, String(player.coins), pad + 8, pad + 8, "#ffe9a0");

    /* depth meter */
    const depth = world.depthMeters(player.cy / TILE);
    const layerName = DG.LAYER_AT(Math.floor(player.cy / TILE)).name;
    const label = `${depth}m · ${layerName}`;
    const lw = textWidth(label, 1);
    panel(g, view.w / 2 - lw / 2 - 5, 3, lw + 10, 14);
    drawTextCol(g, label, view.w / 2 - lw / 2, 5, "#c9b8f0");

    /* weapon slot */
    panel(g, view.w - 30, 3, 27, 27);
    const pi = A(`ui/icon_pick_${player.pick.id}.png`);
    if (pi) g.drawImage(pi, view.w - 30 + 9, 3 + 9);

    /* next upgrade tracker — the carrot on the stick */
    const next = DG.PICKS[player.tier + 1];
    if (next) {
      const parts = Object.entries(next.cost);
      let ox = view.w - 4;
      const rows = parts.length;
      for (let i = rows - 1; i >= 0; i--) {
        const [ore, need] = parts[i];
        const have = player.ore[ore] || 0;
        const col = have >= need ? mint : "#ffd35c";
        const txt = `${have}/${need}`;
        const tw = textWidth(txt, 1);
        drawTextCol(g, txt, ox - tw, 32, col);
        const it = A(`sprites/item_${ore}.png`);
        if (it) g.drawImage(it, ox - tw - 9, 31, 8, 8);
        ox -= tw + 12;
      }
      const nmW = textWidth(next.name, 1);
      drawTextCol(g, next.name, view.w - nmW - 6, 44, "#6b5c8f");
    }

    /* bombs */
    if (player.bombs > 0) {
      const b = A("sprites/item_bomb.png");
      if (b) { g.drawImage(b, pad, view.h - 16); drawTextCol(g, "x" + player.bombs, pad + 10, view.h - 14, "#ffd35c"); }
    }

    /* low health warning */
    if (player.hp <= 2 && !player.dead && Math.sin(game_time * 8) > 0)
      drawTextCol(g, "HP LOW", view.w / 2 - textWidth("HP LOW") / 2, view.h - 20, "#ff6b7a");

    /* aim reticle when the pointer is over the play area */
    if (game.aim && DG.Input.lastDevice !== "touch") drawReticle(g, game, view);

    /* touch controls */
    if (DG.Input.lastDevice === "touch") drawTouch(g, game, view);

    /* hint line */
    if (game.hintT > 0 && game.hint) {
      const w = textWidth(game.hint, 1);
      g.globalAlpha = clamp(game.hintT, 0, 1);
      panel(g, view.w / 2 - w / 2 - 6, view.h - 40, w + 12, 15);
      drawTextCol(g, game.hint, view.w / 2 - w / 2, view.h - 38, "#ffd35c");
      g.globalAlpha = 1;
    }
  }

  function drawReticle(g, game, view) {
    const c = CAM;
    const x = Math.round(game.aim.wx - c.x), y = Math.round(game.aim.wy - c.y);
    const cur = A("ui/cursor.png");
    if (cur) g.drawImage(cur, x - 6, y - 6);
    const t = game.aim.tx, ty = game.aim.ty;
    if (t != null && game.world.inside(t, ty)) {
      const d = TILES[game.world.get(t, ty)];
      const inReach = game.aim.inReach;
      g.strokeStyle = inReach ? (d.solid ? "rgba(255,211,92,0.75)" : "rgba(120,110,170,0.5)")
                              : "rgba(90,80,130,0.35)";
      g.lineWidth = 1;
      g.strokeRect(Math.round(t * TILE - c.x) + 0.5, Math.round(ty * TILE - c.y) + 0.5, TILE - 1, TILE - 1);
    }
  }

  function drawTouch(g, game, view) {
    const I = DG.Input;
    const base = A("ui/stick_base.png"), knob = A("ui/stick_knob.png");
    if (I.touch.moveId >= 0 && base) {
      g.globalAlpha = 0.5;
      g.drawImage(base, I.touch.mx - 8, I.touch.my - 8);
      g.globalAlpha = 0.8;
      if (knob) g.drawImage(knob, I.touch.mx - 4, I.touch.my - 4);
      g.globalAlpha = 1;
    }
    for (const b of I.touch.buttons) {
      g.globalAlpha = b.down ? 0.9 : 0.55;
      panel(g, b.x, b.y, b.w, b.h);
      const tw = textWidth(b.label, 1);
      drawTextCol(g, b.label, b.x + (b.w - tw) / 2, b.y + (b.h - GLYPH_H) / 2, "#c9b8f0");
      g.globalAlpha = 1;
    }
  }

  /* ── sky: the world above the grass line ───────────────────────────── */
  function drawSky(g, game, view) {
    const c = CAM;
    const horizon = game.world.surfaceY * TILE - c.y;
    if (horizon <= 0) return;                       // fully underground
    const top = -Math.max(0, c.y);
    const grd = g.createLinearGradient(0, top, 0, horizon);
    grd.addColorStop(0, "rgba(18,14,34,1)");
    grd.addColorStop(0.55, "rgba(34,26,51,1)");
    grd.addColorStop(1, "rgba(58,42,61,0.25)");      // haze bleeds into the rock
    g.fillStyle = grd;
    g.fillRect(0, top, view.w, horizon - top);
    /* stars */
    for (let i = 0; i < 64; i++) {
      const sx = (((i * 97) % 480) - c.x * 0.06) % 480;
      const sy = ((i * 53) % 110) - c.y * 0.05;
      const x = ((sx % 480) + 480) % 480;
      if (sy > horizon - 30 || sy < -4 || sy > 150) continue;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(game_time * 1.3 + i * 1.7));
      g.fillStyle = `rgba(220,214,255,${(0.2 + tw * 0.55).toFixed(3)})`;
      g.fillRect(Math.round(x), Math.round(sy), 1, 1);
    }
    /* distant ridge line */
    const hills = A("bg/cave_far.png");
    if (hills) {
      g.globalAlpha = 0.75;
      const ox = -(c.x * 0.12) % hills.width;
      for (let x = ox - hills.width; x < view.w; x += hills.width)
        g.drawImage(hills, Math.round(x), Math.round(horizon - hills.height + 22));
      g.globalAlpha = 1;
    }
    /* the lamp also warms the sky just above the player */
  }

  function shade(g, view, a = 0.72) {
    g.fillStyle = `rgba(5,4,12,${a})`;
    g.fillRect(0, 0, view.w, view.h);
  }

  function oreRow(g, x, y, cost, ore, right = false) {
    /* "have/need" with the ore icon, returns width used */
    let w = 0;
    const entries = Object.entries(cost);
    for (const [name, need] of entries) {
      const have = (ore && ore[name]) || 0;
      const txt = `${have}/${need}`;
      const tw = textWidth(txt, 1);
      const ix = right ? x - w - tw - 9 : x + w;
      const it = A(`sprites/item_${name}.png`);
      if (it) g.drawImage(it, ix, y, 8, 8);
      drawTextCol(g, txt, ix + 9, y, have >= need ? "#7df5a8" : "#ffd35c");
      w += tw + 12;
    }
    return w;
  }

  function drawTitle(g, game, view) {
    shade(g, view, 0.55);
    const logo = A("ui/logo.png");
    const t = game.titleT;
    if (logo) {
      const s = 1 + Math.sin(t * 1.4) * 0.012;
      const w = logo.width * s, h = logo.height * s;
      g.drawImage(logo, (view.w - w) / 2, 40 - (h - logo.height) / 2, w, h);
    }
    const sub = "a mining game";
    drawTextCol(g, sub, (view.w - textWidth(sub)) / 2, 92, "#6b5c8f");

    const pick = A("sprites/pick_mythril.png");
    if (pick) {
      const bob = Math.sin(t * 2) * 3;
      g.drawImage(pick, view.w / 2 - 8, 116 + bob);
    }

    const has = !!DG.store.load();
    const lines = [
      has ? "SPACE — continue the dig" : "SPACE — start digging",
      has ? "N — new world" : "",
      "WASD move · SPACE jump · hold CLICK to mine",
      "E forge & shop · B bomb · T camp · M sound",
    ].filter(Boolean);
    lines.forEach((l, i) => {
      const blink = i === 0 && Math.sin(t * 4) < 0;
      drawTextCol(g, l, (view.w - textWidth(l)) / 2, 150 + i * 15,
                  i === 0 ? (blink ? "#ffd35c" : "#fff3b0") : "#4a4370");
    });
    const tip = "the deeper you go, the better the ore — and the worse the company";
    drawTextCol(g, tip, (view.w - textWidth(tip)) / 2, view.h - 22, "#3a3560");
  }

  function drawShop(g, game, view) {
    shade(g, view, 0.82);
    const L = game.shopLayout();
    const p = game.player;
    panel(g, 26, 24, view.w - 52, view.h - 48);
    const title = game.shopTab === 0 ? "THE FORGE" : "SUPPLIES";
    drawTextCol(g, title, 40, 28, "#ffd35c");
    const purse = `${p.coins} coins`;
    drawTextCol(g, purse, view.w - 40 - textWidth(purse), 28, "#ffe9a0");

    for (const t of L.tabs) button(g, t.x, t.y, t.w, t.h, t.name, game.shopTab === t.tab);
    button(g, L.close.x, L.close.y, L.close.w, L.close.h, L.close.name, false);

    if (game.shopTab === 0) {
      L.rows.forEach((r) => {
        const pick = r.pick;
        const owned = r.index <= p.tier;
        const next = r.index === p.tier + 1;
        const can = next && game.canForge(r.index);
        const bg = owned ? "rgba(40,36,64,.75)" : next ? "rgba(58,51,88,.8)" : "rgba(22,20,36,.7)";
        g.fillStyle = bg;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = owned ? "#3d3a5c" : next ? (can ? "#ffd35c" : "#4a4668") : "#2a2740";
        g.lineWidth = 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        const icon = A(`ui/icon_pick_${pick.id}.png`);
        if (icon) g.drawImage(icon, r.x + 5, r.y + 5);
        const label = `${pick.name} pickaxe`;
        drawTextCol(g, label, r.x + 18, r.y + 3, owned ? "#6b5c8f" : "#e8e2ff");
        const stats = `pow ${pick.power} · spd ${pick.speed.toFixed(1)} · reach ${pick.reach.toFixed(1)}`;
        drawTextCol(g, stats, r.x + 18, r.y + 11, owned ? "#4a4370" : "#8f86c0");
        if (owned) {
          const tag = "OWNED";
          drawTextCol(g, tag, r.x + r.w - textWidth(tag) - 8, r.y + 7, "#3ec27a");
        } else if (next) {
          oreRow(g, r.x + r.w - 8, r.y + 7, pick.cost, p.ore, true);
          const tag = can ? "F to forge" : "";
          if (tag) drawTextCol(g, tag, r.x + r.w - 100, r.y + 7, "#ffd35c");
        } else {
          const tag = "locked";
          drawTextCol(g, tag, r.x + r.w - textWidth(tag) - 8, r.y + 7, "#3a3560");
        }
      });
      const note = "mining ore feeds the next pickaxe — every tier digs deeper strata";
      drawTextCol(g, note, 40, view.h - 34, "#4a4370");
    } else {
      for (const r of L.rows) {
        const item = r.item;
        const owned = game.owns(item);
        const afford = p.coins >= item.cost;
        g.fillStyle = owned ? "rgba(40,36,64,.75)" : afford ? "rgba(58,51,88,.8)" : "rgba(22,20,36,.7)";
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = owned ? "#3d3a5c" : afford ? "#6b5c8f" : "#2a2740";
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        const iconName = item.id === "heart" ? "ui/heart_full.png"
                       : item.id === "bomb" ? "sprites/item_bomb.png"
                       : item.id === "lantern" ? "ui/lamp_glow.png"
                       : item.id === "boots" ? "sprites/pick_iron.png"
                       : item.id === "cushion" ? "fx/puff_0.png" : "sprites/item_warp.png";
        const ic = A(iconName);
        if (ic) g.drawImage(ic, r.x + 5, r.y + 6, 8, 8);
        drawTextCol(g, item.name, r.x + 18, r.y + 3, owned ? "#6b5c8f" : "#e8e2ff");
        drawTextCol(g, item.desc, r.x + 18, r.y + 11, owned ? "#4a4370" : "#8f86c0");
        const price = owned ? "OWNED" : `${item.cost}c`;
        drawTextCol(g, price, r.x + r.w - textWidth(price) - 8, r.y + 7,
                    owned ? "#3ec27a" : afford ? "#ffe9a0" : "#6b5c8f");
        if (item.id === "bomb" && p.bombs > 0) {
          const t2 = `have ${p.bombs}`;
          drawTextCol(g, t2, r.x + r.w - 90, r.y + 7, "#4a4370");
        }
      }
      const note = "bombs clear rooms fast · lantern, boots and soles make the deep kinder";
      drawTextCol(g, note, 40, view.h - 34, "#4a4370");
    }
  }

  function drawPause(g, game, view) {
    shade(g, view, 0.7);
    const t = game.titleT;
    panel(g, view.w / 2 - 92, view.h / 2 - 52, 184, 104);
    const title = "PAUSED";
    drawTextCol(g, title, (view.w - textWidth(title, 2)) / 2, view.h / 2 - 42, "#ffd35c", 2);
    const p = game.player;
    const stat = `${p.pick.name} pick · ${p.coins} coins · ${game.world.depthMeters(p.cy / TILE)}m`;
    drawTextCol(g, stat, (view.w - textWidth(stat)) / 2, view.h / 2 - 12, "#c9b8f0");
    const stat2 = `deepest ${Math.round(game.stats.deepest)}m · ${game.stats.mined} blocks · ${game.stats.kills} slain`;
    drawTextCol(g, stat2, (view.w - textWidth(stat2)) / 2, view.h / 2 + 2, "#6b5c8f");
    const lines = ["ESC resume · Q save & quit", "R new world (erases the old one)"];
    lines.forEach((l, i) => drawTextCol(g, l, (view.w - textWidth(l)) / 2, view.h / 2 + 22 + i * 13, "#4a4370"));
  }

  function drawDeath(g, game, view) {
    shade(g, view, 0.8);
    panel(g, view.w / 2 - 110, view.h / 2 - 58, 220, 116);
    const title = "YOU PERISHED";
    drawTextCol(g, title, (view.w - textWidth(title, 2)) / 2, view.h / 2 - 48, "#ff6b7a", 2);
    const depth = Math.round(game.stats.deepest);
    const cause = depth > 150 ? "the magma is not a bath" : "the dark bites back";
    drawTextCol(g, cause, (view.w - textWidth(cause)) / 2, view.h / 2 - 18, "#6b5c8f");
    const lines = [
      `deepest ${depth}m · ${game.world.depthMeters(game.player.cy / TILE)}m down · ${game.player.coins} coins`,
      `${game.stats.mined} blocks mined · ${game.stats.kills} monsters slain`,
    ];
    lines.forEach((l, i) => drawTextCol(g, l, (view.w - textWidth(l)) / 2, view.h / 2 + 2 + i * 14, "#c9b8f0"));
    if (game.deathT > 1) {
      const blink = Math.sin(game_time * 5) < 0 ? "#ffd35c" : "#fff3b0";
      const a = "C — wake up at camp (keep everything)";
      const b = "R — abandon this world";
      drawTextCol(g, a, (view.w - textWidth(a)) / 2, view.h / 2 + 34, blink);
      drawTextCol(g, b, (view.w - textWidth(b)) / 2, view.h / 2 + 48, "#4a4370");
    }
  }

  function drawOverlay(g, game, view) {
    if (game.state === "title") drawTitle(g, game, view);
    else if (game.state === "shop") drawShop(g, game, view);
    else if (game.state === "pause") drawPause(g, game, view);
    else if (game.state === "dead") drawDeath(g, game, view);
  }

  function frameImpl(g, game) {
    const view = { w: g.canvas.width, h: g.canvas.height };
    g.imageSmoothingEnabled = false;
    g.save();
    CAM = this.camera;
    g.translate(Math.round(this.camera.sx), Math.round(this.camera.sy));
    this.drawParallax(g, game, view);
    drawSky(g, game, view);
    this.drawWorld(g, game.world, view);
    this.drawEntities(g, game);
    g.restore();
    drawDarkness(g, game, view);
    /* vignette on top */
    const vg = A("bg/vignette.png");
    if (vg) { g.globalAlpha = 0.55; g.drawImage(vg, 0, 0, view.w, view.h); g.globalAlpha = 1; }
    drawHUD(g, game, view);
    drawOverlay(g, game, view);
  }

})();
