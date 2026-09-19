/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG - console - the interface you actually look at
   Layout (480x288):
     ┌ top bar ───────────────────────────────────────────────┐  0..18
     │ badge  DEEPDIG - RIG CONSOLE      depth   credits      │
     ├────────┬───────────────────────────────┬───────────────┤
     │ left   │  borehole viewport (bezel)    │  gauges       │ 18..268
     │ 88 px  │  176 x 240                    │  buttons      │
     ├────────┴───────────────────────────────┴───────────────┤
     │ ticker: log lines + current contract                   │ 268..288
     └────────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

DG.Console = (function () {
  const A = (p) => DG.Assets.A(p);
  const U = DG.UI;
  const T = DG.T;
  const TILE = 16;

  const L = {
    left:  { x: 0, y: 18, w: 88, h: 246 },
    view:  { x: 88, y: 18, w: 192, h: 246 },
    right: { x: 280, y: 18, w: 200, h: 246 },
    top:   { x: 0, y: 0, w: 480, h: 18 },
    tick:  { x: 0, y: 264, w: 480, h: 24 },
  };
  const INNER = { x: 96, y: 22, w: 176, h: 238 };   // inside the bezel
  const COLS = 11, ROWS = 14;

  let viewY = 0, scanFx = 0;
  const popups = [];

  /* which PNG represents a cell: solid rock, the drilled-out wall behind it */
  const SPRITE = {
    [T.AIR]:      "stone_1", [T.REGOLITH]: "dirt_1", [T.DIRT]: "dirt_1",
    [T.GRAVEL]:   "gravel_1", [T.STONE]: "stone_1", [T.GRANITE]: "granite_1",
    [T.DEEPSLATE]: "deepslate_1", [T.CRYSTAL]: "crystal_1", [T.OBSIDIAN]: "obsidian_1",
    [T.MAGMA]:    "magma_1", [T.BEDROCK]: "bedrock_1",
  };
  let animT = 0;                       /* seconds, for the animated rock */
  function spriteOf(tile) {
    if (tile === T.GAS) return "tiles/gas_1.png";
    if (tile === T.LAVA) return `fx/lava_${Math.floor(animT * 4) % 4}.png`;
    return "tiles/" + (SPRITE[tile] || "stone_1") + ".png";
  }
  function wallOf(tile) {
    if (tile === T.LAVA) return "tiles/bg_magma_2.png";
    if (tile === T.GAS) return "tiles/bg_gas_1.png";
    return "tiles/bg_" + (SPRITE[tile] || "stone_1") + ".png";
  }

  /* ── the borehole cross-section ──────────────────────────────────────── */
  function drawViewport(g, game) {
    const rig = game.rig, well = rig.well;
    animT = game.time;
    const bz = A("ui/bezel.png");
    if (bz) U.slice(g, bz, L.view.x, L.view.y, L.view.w, L.view.h, 4);

    /* smooth follow: the rig sits about a third down the glass */
    const target = rig.y - ROWS * 0.34;
    viewY += (target - viewY) * 0.12;
    if (Math.abs(target - viewY) < 0.02) viewY = target;

    g.save();
    g.beginPath();
    g.rect(INNER.x, INNER.y, INNER.w, INNER.h);
    g.clip();
    g.fillStyle = "#07080e";
    g.fillRect(INNER.x, INNER.y, INNER.w, INNER.h);

    const y0 = Math.floor(viewY);
    const frac = viewY - y0;

    /* daylight: everything above the shaft head reads as the depot pad */
    const surfaceY = Math.round(INNER.y + (0 - viewY) * TILE);
    if (surfaceY > INNER.y) {
      g.fillStyle = "#0c1018";
      g.fillRect(INNER.x, INNER.y, INNER.w, Math.min(surfaceY, INNER.y + INNER.h) - INNER.y);
      const tape = A("ui/stripes.png");
      if (tape && surfaceY < INNER.y + INNER.h) {
        for (let x = 0; x < INNER.w; x += 16) g.drawImage(tape, INNER.x + x, surfaceY - 6);
      }
      if (surfaceY + 12 < INNER.y + INNER.h) {
        U.text(g, "SURFACE PAD", INNER.x + 3, surfaceY + 2, "#39415a");
        U.text(g, "the rig starts here", INNER.x + 3, surfaceY + 14, "#2b3247");
      }
      g.fillStyle = "#5a6684";
      g.fillRect(INNER.x, surfaceY, INNER.w, 1);
    }

    for (let ry = -1; ry <= ROWS + 1; ry++) {
      const cy = y0 + ry;
      if (cy < 0) continue;
      const py = Math.round(INNER.y + (ry - frac) * TILE);
      for (let cx = 0; cx < COLS; cx++) {
        const px = INNER.x + cx * TILE;
        const cell = well.at(cx, cy);
        if (well.isDrilled(cx, cy)) {
          const wall = A(wallOf(cell.tile));
          if (wall) g.drawImage(wall, px, py);
          else { g.fillStyle = "#101420"; g.fillRect(px, py, TILE, TILE); }
          continue;
        }
        const spr = A(spriteOf(cell.tile));
        if (spr) {
          if ((cx * 7 + cy * 13) % 3 === 0) {   /* mirror some tiles for variety */
            g.save(); g.translate(px + TILE, py); g.scale(-1, 1); g.drawImage(spr, 0, 0); g.restore();
          } else g.drawImage(spr, px, py);
        } else { g.fillStyle = DG.TILES[cell.tile].color; g.fillRect(px, py, TILE, TILE); }
        if (cell.ore) {
          const o = A(`tiles/ore_${cell.ore}_${((cx + cy) % 3) + 1}.png`);
          if (o) g.drawImage(o, px, py);
        }
        if (cell.tile === T.MAGMA && ((cx * 3 + cy * 5) % 7 === 0))
          { g.fillStyle = "rgba(255,150,60,0.10)"; g.fillRect(px, py, TILE, TILE); }
      }
    }

    /* strata boundary lines + names while they scroll past */
    for (const s of DG.STRATA) {
      const cy = s.from / DG.CELL_M;
      const py = INNER.y + (cy - viewY) * TILE;
      if (py < INNER.y - 2 || py > INNER.y + INNER.h) continue;
      g.globalAlpha = 0.55;
      g.fillStyle = "#6fe0ff";
      for (let x = 0; x < INNER.w; x += 6) g.fillRect(INNER.x + x, Math.round(py), 3, 1);
      g.globalAlpha = 0.8;
      U.text(g, s.name + " - " + s.temp + "C", INNER.x + 3, Math.round(py) + 2, "#6fe0ff");
      g.globalAlpha = 1;
    }

    /* drill progress on the cell under the bit */
    if (rig.status === "drilling" || rig.progress > 0.02) {
      const bx = INNER.x + rig.x * TILE;
      const by = Math.round(INNER.y + (Math.floor(rig.y) + 1 - viewY) * TILE);
      g.strokeStyle = "rgba(255,211,92,0.85)";
      g.lineWidth = 1;
      g.strokeRect(bx + 0.5, by + 0.5, TILE - 1, TILE - 1);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(bx + 2, by + TILE - 5, TILE - 4, 3);
      g.fillStyle = "#ffd35c";
      g.fillRect(bx + 2, by + TILE - 5, Math.round((TILE - 4) * Math.min(1, rig.progress)), 3);
    }

    /* sonar overlay */
    if (scanFx > 0.01) {
      for (const [key, mark] of well.marked) {
        const i = key.indexOf(",");
        const mx = +key.slice(0, i), my = +key.slice(i + 1);
        const py = Math.round(INNER.y + (my - viewY) * TILE);
        if (py < INNER.y - TILE || py > INNER.y + INNER.h) continue;
        const px = INNER.x + mx * TILE;
        g.globalAlpha = (0.09 + 0.10 * scanFx) * (1 - Math.min(0.6, (my - rig.y) / ROWS));
        g.fillStyle = mark.kind === "ore" ? "#6fe0ff" : mark.kind === "hazard" ? "#ff6b7a" : "#46528a";
        g.fillRect(px, py, TILE, TILE);
        g.globalAlpha = scanFx;
        if (mark.kind === "ore" && Math.sin(game.time * 6 + mx * 1.7) > -0.3) {
          g.strokeStyle = "#6fe0ff";
          g.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5);
        } else if (mark.kind === "hazard" && Math.floor(game.time * 5 + mx) % 2 === 0) {
          const w = A("ui/warn.png");
          g.globalAlpha = 0.8 * scanFx;
          if (w) g.drawImage(w, px + 2, py + 3, 12, 11);
        }
        g.globalAlpha = 1;
      }
      /* the sweep line crawling down the glass */
      const sy = INNER.y + ((rig.y + 1 + (1 - scanFx) * rig.scanRows) - viewY) * TILE;
      if (sy > INNER.y - 2 && sy < INNER.y + INNER.h + 2) {
        g.globalAlpha = 0.7 * scanFx;
        g.fillStyle = "#6fe0ff";
        g.fillRect(INNER.x, Math.round(sy), INNER.w, 1);
        g.globalAlpha = 0.18 * scanFx;
        g.fillRect(INNER.x, Math.round(sy), INNER.w, 6);
        g.globalAlpha = 1;
      }
    }

    /* the rig */
    const rx = INNER.x + rig.x * TILE;
    const ry = Math.round(INNER.y + (rig.y - viewY) * TILE);
    if (rig.status === "ascend") {
      g.strokeStyle = "#5a6684";
      g.beginPath(); g.moveTo(rx + 8, INNER.y); g.lineTo(rx + 8, ry + 2); g.stroke();
    }
    if (rig.heat > 55) {
      const w = A("ui/lamp_warm.png");
      if (w) {
        g.globalAlpha = Math.min(0.55, (rig.heat - 55) / 90);
        g.drawImage(w, rx - 16, ry - 16, 48, 48);
        g.globalAlpha = 1;
      }
    }
    const rigSpr = A(`sprites/rig_${rig.status === "drilling" && Math.floor(game.time * 20) % 2 ? 1 : 0}.png`);
    if (rigSpr) {
      const wob = rig.status === "drilling" ? Math.round((Math.random() - 0.5) * 2) : 0;
      g.drawImage(rigSpr, rx + wob, ry);
    }
    for (const grub of rig.grubs) {
      const spr = A(`sprites/grub_${Math.floor(grub.t * 6) % 2}.png`);
      if (spr) g.drawImage(spr, Math.round(INNER.x + grub.x * TILE + 3), Math.round(INNER.y + (grub.y - viewY) * TILE + 4));
    }
    for (const s of rig.sparks) {
      g.globalAlpha = Math.max(0, Math.min(1, s.life * 2.5));
      g.fillStyle = s.col || "#ffd35c";
      g.fillRect(Math.round(INNER.x + s.x * TILE + 6), Math.round(INNER.y + (s.y - viewY) * TILE + 8), 2, 2);
    }
    const puff = A("fx/puff_0.png");
    for (const s of rig.steam) {
      g.globalAlpha = Math.max(0, s.life) * 0.34;
      if (puff) g.drawImage(puff, Math.round(INNER.x + s.x * TILE + 2), Math.round(INNER.y + (s.y - viewY) * TILE + 2));
      g.globalAlpha = 1;
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.t += 1 / 60;
      if (p.t > 1.4) { popups.splice(i, 1); continue; }
      const ix = INNER.x + p.px * TILE + 4, iy = Math.round(INNER.y + (p.py - viewY) * TILE - p.t * 24 + 4);
      g.globalAlpha = Math.min(1, (1.4 - p.t) * 2.2);
      const ic = A(`sprites/item_${p.ore}.png`);
      if (ic) g.drawImage(ic, ix + 8, iy);
      U.text(g, p.text, ix, iy, "#7df5a8");
      g.globalAlpha = 1;
    }

    /* glass: scanlines, glare, heat tint, flash */
    const scan = A("ui/scanlines.png");
    if (scan) {
      g.globalAlpha = 0.32;
      for (let y = INNER.y; y < INNER.y + INNER.h; y += 4) g.drawImage(scan, INNER.x, y, INNER.w, 4);
      g.globalAlpha = 1;
    }
    const glare = A("ui/glare.png");
    if (glare) {
      g.globalAlpha = 0.45;
      g.drawImage(glare, INNER.x, INNER.y, INNER.w, Math.round(INNER.h * 0.6));
      g.globalAlpha = 1;
    }
    if (rig.heat > 60) {
      g.globalAlpha = Math.min(0.26, (rig.heat - 60) / 170);
      g.fillStyle = "#ff6a1a";
      g.fillRect(INNER.x, INNER.y, INNER.w, INNER.h);
      g.globalAlpha = 1;
    }
    if (game.flashT > 0) {
      g.globalAlpha = Math.min(0.7, game.flashT * 1.4);
      g.fillStyle = game.flashCol;
      g.fillRect(INNER.x, INNER.y, INNER.w, INNER.h);
      g.globalAlpha = 1;
    }
    g.restore();

    /* depth ticks in the right gutter of the glass */
    g.fillStyle = "#2b3247";
    for (let i = 0; i <= ROWS; i++) {
      const m = Math.round((y0 + i) * DG.CELL_M);
      if (m % 20 !== 0 || m < 0) continue;
      const py = Math.round(INNER.y + ((y0 + i) - viewY) * TILE);
      g.fillRect(INNER.x + INNER.w, py, 6, 1);
      g.fillRect(INNER.x - 4, py, 4, 1);
    }
  }

  /* ── left column: drill bit, cargo hold, instruments ────────────────── */
  function drawLeft(g, game) {
    const rig = game.rig;
    const x = 4, w = 80;

    /* drill bit */
    U.plate(g, x, 22, w, 64);
    U.text(g, "DRILL BIT", x + 5, 26, "#6b7794");
    const icon = A(`ui/icon_pick_${rig.drill.id}.png`);
    if (icon) g.drawImage(icon, x + w / 2 - 5, 38, 10, 10);
    U.textCenter(g, rig.drill.name, x + w / 2, 50, "#ffd35c");
    U.textCenter(g, `POWER ${rig.drill.power.toFixed(1)}`, x + w / 2, 62, "#8fa0c0");
    const on = rig.status === "drilling";
    U.led(g, x + 5, 74, on ? "#7df5a8" : null, on);
    U.text(g, rig.status === "idle" ? "IDLE" : rig.status.toUpperCase(), x + 14, 73,
           on ? "#7df5a8" : rig.status === "idle" ? "#4a5470" : "#ffd35c");

    /* cargo hold */
    U.plate(g, x, 90, w, 108);
    U.text(g, "CARGO HOLD", x + 5, 94, "#6b7794");
    U.textRight(g, `${rig.cargoUsed}/${rig.cargoCap}`, x + w - 5, 106,
                rig.cargoFree <= 0 ? "#ff6b7a" : "#8fa0c0");
    U.bar(g, { x: x + 5, y: 108, w: w - 10, h: 8 }, rig.cargoUsed / rig.cargoCap,
          { color: "#6fe0ff", warnAt: 0.8, critAt: 1 });
    const order = DG.ORES.filter((o) => rig.cargo[o]);
    let i = 0;
    for (const ore of order) {
      const col = i % 2, row = Math.floor(i / 2);
      const ex = x + 6 + col * 38, ey = 122 + row * 13;
      if (ey > 184) break;
      const ic = A(`sprites/item_${ore}.png`);
      if (ic) g.drawImage(ic, ex, ey, 8, 8);
      U.text(g, `x${rig.cargo[ore]}`, ex + 11, ey - 2, "#c9d8f0");
      i++;
    }
    if (!order.length) {
      U.text(g, "EMPTY", x + 6, 124, "#39415a");
      U.text(g, "ore rides up with", x + 6, 138, "#2b3247");
      U.text(g, "the rig, sold at", x + 6, 150, "#2b3247");
      U.text(g, "the depot.", x + 6, 162, "#2b3247");
    }

    /* instruments */
    U.plate(g, x, 202, w, 60);
    const rows = [
      ["CRED", String(rig.credits), "#ffe9a0"],
      ["DEPTH", `${Math.round(rig.metres)}m`, "#6fe0ff"],
      ["BAND", DG.strataAt(rig.metres).short || DG.strataAt(rig.metres).name, "#8fa0c0"],
      ["RUNS", `${rig.runs} / ${rig.kills}`, "#8fa0c0"],
    ];
    rows.forEach((r, k) => {
      const ry = 206 + k * 14;
      U.text(g, r[0], x + 5, ry, "#6b7794");
      U.textRight(g, r[1], x + w - 5, ry, r[2]);
    });
  }

  /* ── right column: gauges and controls ──────────────────────────────── */
  function drawRight(g, game) {
    const rig = game.rig;
    const x = 284, w = 192;

    /* hull + heat */
    U.plate(g, x, 22, w, 58);
    U.text(g, "HULL", x + 5, 25, "#6b7794");
    U.textRight(g, `${Math.max(0, rig.hull).toFixed(0)} / ${rig.hullMax}`, x + w - 5, 25, "#c9d8f0");
    U.bar(g, { x: x + 5, y: 38, w: w - 10, h: 13 }, rig.hull / rig.hullMax,
          { color: "#7df5a8", warnAt: 0.45, critAt: 0.25, invert: true });
    U.text(g, "HEAT", x + 5, 53, "#6b7794");
    U.textRight(g, `${rig.heat.toFixed(0)}%`, x + w - 5, 53,
                rig.heat > rig.heatMax * 0.8 ? "#ff8a8a" : "#c9d8f0");
    U.bar(g, { x: x + 5, y: 66, w: w - 10, h: 9 }, rig.heat / rig.heatMax,
          { color: "#ffb03a", warnAt: 0.7, critAt: 0.97 });
    const hot = rig.heat > rig.heatMax * 0.7;
    U.led(g, x + w - 11, 55, "#ff5c5c", hot && Math.floor(game.time * 6) % 2 === 0);

    /* strata scope */
    const strata = DG.strataAt(rig.metres);
    const sd = DG.STRATA[DG.STRATA.indexOf(strata) + 1];
    U.plate(g, x, 84, w, 44);
    U.text(g, "AMBIENT", x + 5, 88, "#6b7794");
    U.textRight(g, `${rig.temp.toFixed(0)}C`, x + w - 5, 88, rig.temp > 100 ? "#ff8a8a" : "#6fe0ff");
    U.text(g, strata.name, x + 5, 101, "#dfe8ff");
    U.textRight(g, sd ? `next ${sd.from}m` : "chart ends", x + w - 5, 101, "#4a5470");
    U.text(g, sd ? `NEXT ${sd.name} - ${sd.temp}C` : "BEDROCK AND HEAT BELOW", x + 5, 114, "#4a5470");

    /* drill */
    const drill = { x: x + 5, y: 132, w: w - 10, h: 24 };
    const label = rig.status === "drilling" ? "DRILLING..."
                : rig.cargoFree <= 0 ? "CARGO FULL - ASCEND"
                : "HOLD TO DRILL";
    U.button(g, drill, label, { id: "drillBtn", hotkey: null });
    if (rig.drillOn && !rig.wrecked && rig.status !== "drilling") {
      U.textRight(g, "HELD", drill.x + drill.w - 6, drill.y + 7, "#ffd35c");
    }

    /* movement */
    const half = (w - 15) / 2;
    if (U.button(g, { x: x + 5, y: 160, w: half, h: 20 }, "<< LEFT",
                 { id: "mvL", hotkey: "KeyA" })) {
      DG.Audio.click(); rig.cmdMove(-1, game);
    }
    if (U.button(g, { x: x + 10 + half, y: 160, w: half, h: 20 }, "RIGHT >>",
                 { id: "mvR", hotkey: "KeyD" })) {
      DG.Audio.click(); rig.cmdMove(1, game);
    }
    /* cooling / survey */
    if (U.button(g, { x: x + 5, y: 184, w: half, h: 20 },
                 rig.status === "venting" ? "VENTING" : "VENT X",
                 { id: "vent", hotkey: "KeyX", accent: hot })) {
      DG.Audio.click(); rig.cmdVent(game);
    }
    if (U.button(g, { x: x + 10 + half, y: 184, w: half, h: 20 }, "SONAR C",
                 { id: "scan", hotkey: "KeyC" })) {
      DG.Audio.click(); rig.cmdScan(game);
    }
    /* field repairs */
    for (const item of DG.CONSUMABLES) {
      const bx = item.id === "patch" ? x + 5 : x + 10 + half;
      const need = item.id === "patch" && rig.hull >= rig.hullMax;
      if (U.button(g, { x: bx, y: 208, w: half, h: 18 }, `${item.name} ${item.cost}`,
                   { id: item.id, hotkey: item.hotkey,
                     disabled: need || rig.credits < item.cost })) {
        rig.useConsumable(item.id, game);
      }
    }
    /* ascend */
    if (U.button(g, { x: x + 5, y: 232, w: w - 10, h: 24 },
                 rig.status === "ascend" ? "WINCHING UP" : "ASCEND  E",
                 { id: "ascend", hotkey: "KeyE", accent: rig.status === "ascend" })) {
      DG.Audio.click(); rig.cmdAscend(game);
    }
  }

  /* ── top bar ─────────────────────────────────────────────────────────── */
  function drawTop(g, game) {
    const rig = game.rig;
    U.plate(g, 0, 0, 480, 18, "plate_lo");
    const badge = A("ui/badge.png");
    if (badge) g.drawImage(badge, 3, 3);
    U.text(g, "DEEPDIG", 22, 2, "#ffd35c");
    U.text(g, "RIG CONSOLE", 22 + U.textWidth("DEEPDIG") + 6, 2, "#4a5470");

    U.textCenter(g, `DEPTH ${String(Math.round(rig.metres)).padStart(4, "0")} m`, 240, 2, "#dfe8ff");
    U.textRight(g, `${rig.credits} CR`, 476, 2, "#ffe9a0");

    const warn = rig.hull < rig.hullMax * 0.3 ? "#ff5c5c"
               : rig.heat > rig.heatMax * 0.85 ? "#ffb03a"
               : rig.cargoFree <= 0 ? "#6fe0ff" : null;
    U.led(g, 152, 6, null, true);
    U.led(g, 160, 6, warn, !!warn && Math.floor(game.time * 4) % 2 === 0);
    if (warn) {
      const msg = rig.hull < rig.hullMax * 0.3 ? "HULL!"
                : rig.heat > rig.heatMax * 0.85 ? "HEAT!"
                : "FULL!";
      U.text(g, msg, 170, 2, warn);
    }
  }

  /* ── ticker ─────────────────────────────────────────────────────────── */
  function drawTicker(g, game) {
    const rig = game.rig;
    U.plate(g, 0, L.tick.y, 480, L.tick.h, "plate_lo");
    const lines = game.logLines.slice(-2);
    let y = L.tick.y + 2;
    for (const l of lines) {
      const col = l.tone === "bad" ? "#ff8a8a" : l.tone === "good" ? "#7df5a8"
                : l.tone === "warn" ? "#ffd35c" : "#8fa0c0";
      let msg = l.msg;
      while (U.textWidth(msg) > 300 && msg.length > 8) msg = msg.slice(0, -2);
      U.text(g, "> " + msg, 6, y, col);
      y += 11;
    }
    const c = game.rig.currentContract();
    if (c) {
      let t = "OPS: " + c.text;
      while (U.textWidth(t) > 170 && t.length > 12) t = t.slice(0, -2);
      U.textRight(g, t, 474, L.tick.y + 2, "#c9d8f0");
      U.textRight(g, `+${c.pay} CR  -  ${rig.kills} burrowers`, 474, L.tick.y + 13, "#ffd35c");
      U.led(g, 474 - U.textWidth(t) - 8, L.tick.y + 2, "#ffb03a");
    }
  }

  /* ── alert banners over the glass ───────────────────────────────────── */
  function drawAlerts(g, game) {
    let y = L.view.y + 8;
    for (const a of game.rig.alerts.slice(-3)) {
      const col = a.tone === "bad" ? "#ff6b7a" : a.tone === "good" ? "#7df5a8" : "#ffd35c";
      const w = U.textWidth(a.msg) + 14;
      const x = Math.round(L.view.x + L.view.w / 2 - w / 2);
      g.globalAlpha = a.t < 4.4 ? 1 : Math.max(0, 1 - (a.t - 4.4) / 1.6);
      U.plate(g, x, y, w, 15, "plate_lo");
      g.fillStyle = col;
      g.fillRect(x + 2, y + 2, 2, 11);
      U.text(g, a.msg, x + 7, y + 1, col);
      g.globalAlpha = 1;
      y += 17;
    }
  }

  function frame(g, game) {
    g.imageSmoothingEnabled = false;
    U.begin(g.canvas.width, g.canvas.height);
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    drawViewport(g, game);
    drawLeft(g, game);
    drawRight(g, game);
    drawTop(g, game);
    drawAlerts(g, game);
    drawTicker(g, game);
    U.end();
  }

  return {
    frame, L, INNER, COLS, ROWS,
    popup(text, ore) {
      const r = DG.game && DG.game.rig;
      popups.push({ text, ore, t: 0, px: (r ? r.x : 5) + 0.15, py: r ? r.y : 0 });
    },
    reset(rig) {
      popups.length = 0;
      scanFx = 0;
      const r = rig || (DG.game && DG.game.rig);
      viewY = r ? r.y - ROWS * 0.34 : 0;
    },
    setScanFx(v) { scanFx = v; },
  };
})();
