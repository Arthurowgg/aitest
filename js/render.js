/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG - render - the screens around the console: title, pause, wreck
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

DG.Render = (function () {
  const A = (p) => DG.Assets.A(p);
  const U = DG.UI;

  function shade(g, w, h, a, col) {
    g.globalAlpha = a;
    g.fillStyle = col || "#000000";
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  }

  function scanlines(g, w, h, alpha) {
    const s = A("ui/scanlines.png");
    if (!s) return;
    g.globalAlpha = alpha || 0.25;
    for (let y = 0; y < h; y += 4) g.drawImage(s, 0, y, w, 4);
    g.globalAlpha = 1;
  }

  function tape(g, y, w) {
    const s = A("ui/stripes.png");
    if (!s) return;
    for (let x = 0; x < w; x += 16) g.drawImage(s, x, y);
  }

  /* ── title ──────────────────────────────────────────────────────────── */
  /* the whole shaft in one picture: a four-row core sample of every band  */
  function title(g, game) {
    const w = g.canvas.width, h = g.canvas.height;
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, w, h);

    /* logo and pitch */
    const logo = A("ui/logo.png");
    if (logo) g.drawImage(logo, Math.round((w - logo.width) / 2), 20);
    U.textCenter(g, "RIG CONSOLE", w / 2, 52, "#8fa0c0");
    U.textCenter(g, "drill the strata - vent the heat - forge seven bits", w / 2, 64, "#4a5470");

    /* the seven bits, with their power */
    const n = DG.DRILLS.length, pitch = 34, bw = n * pitch;
    DG.DRILLS.forEach((d, i) => {
      const cx = Math.round(w / 2 - bw / 2 + i * pitch + pitch / 2);
      const ic = A(`ui/icon_pick_${d.id}.png`);
      if (ic) g.drawImage(ic, cx - 6, 80, 12, 12);
      U.textCenter(g, d.power.toFixed(1), cx, 94, i === 0 ? "#ffd35c" : "#39415a");
    });

    /* save summary and the call to action */
    let saved = null;
    try { saved = DG.store.load(); } catch (e) { saved = null; }
    const blink = Math.floor(game.time * 2) % 2 === 0;
    if (saved && saved.rig) {
      const r = saved.rig;
      U.textCenter(g, `SAVE FILE - ${Math.round(r.depthRecord)} m DEEP - ${r.credits} CREDITS`,
                   w / 2, 116, "#6fe0ff");
      U.textCenter(g, `drill ${DG.DRILLS[r.drillIndex || 0].name.toLowerCase()} - ${(r.drilled || []).length} cells opened`,
                   w / 2, 128, "#6b7794");
      U.textCenter(g, "PRESS SPACE - BACK TO THE DEPOT", w / 2, 144,
                   blink ? "#ffd35c" : "#a8842a");
    } else {
      U.textCenter(g, "no save file - a fresh shaft waits below", w / 2, 122, "#4a5470");
      U.textCenter(g, "PRESS SPACE - FIRST DESCENT", w / 2, 144,
                   blink ? "#ffd35c" : "#a8842a");
    }
    U.textCenter(g, "N - new shaft (erases the old one)", w / 2, 157, "#39415a");

    /* the core sample: every band, four rows of rock, with its own label */
    const S = DG.STRATA, cols = S.length, cw = Math.floor(w / cols);
    const top = 172, rows = 4, cell = 16;
    const SPICE = { TOPSOIL: "grass", "SOIL BAND": "gravel", STONE: "granite",
                    DEEPSLATE: "obsidian", CRYSTAL: "obsidian", MAGMA: "obsidian" };
    const ORE_PICK = { TOPSOIL: "coal", "SOIL BAND": "copper", STONE: "iron",
                       DEEPSLATE: "silver", CRYSTAL: "diamond", MAGMA: "mythril" };
    /* variant families come out of the manifest, so nothing is probed blind */
    const families = {};
    for (const path of DG.ASSET_LIST || []) {
      const m = /^assets\/tiles\/([a-z]+)_\d+\.png$/.exec(path);
      if (m) (families[m[1]] = families[m[1]] || []).push(path.slice("assets/tiles/".length, -4));
    }
    const variants = (prefix) => families[prefix] || [];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    S.forEach((band, i) => {
      const x0 = i * cw;
      const main = (DG.TILES[band.rock].sprite || "stone_1").replace(/_\d+$/, "");
      const mix = variants(main).concat(variants(SPICE[band.name] || main));
      const grass = band.name === "TOPSOIL" ? variants("grass") : [];
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cw; k += cell) {
          const pool = r === 0 && grass.length ? grass : mix;
          const img = A("tiles/" + pool[Math.floor(rnd() * pool.length)] + ".png");
          if (img) g.drawImage(img, x0 + k, top + r * cell);
        }
      }
      /* a little ore, so the picture teaches what lives in each band */
      const ores = [ORE_PICK[band.name], band.ores && band.ores[band.ores.length - 1]];
      ores.forEach((ore, o) => {
        const ic = ore ? A("sprites/item_" + ore + ".png") : null;
        if (ic) g.drawImage(ic, x0 + 6 + o * 15 + Math.floor(rnd() * (cw - 34)),
                            top + 5 + o * 21 + Math.floor(rnd() * 8), 10, 10);
      });
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(x0, top, 1, rows * cell);
      U.textCenter(g, `${band.short || band.name} ${band.from}`,
                   x0 + cw / 2, top + rows * cell + 6, i % 2 ? "#8fa0c0" : "#6b7794");
    });
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(w - 1, top, 1, rows * cell);

    /* the rig rides its cable down into the first column */
    const rigY = top + 12;
    g.strokeStyle = "#2b3247";
    g.beginPath();
    g.moveTo(44 + 16, top - 4);
    g.lineTo(44 + 16, rigY + 4);
    g.stroke();
    const grub = A("sprites/grub_1.png");
    if (grub) g.drawImage(grub, 110, top + 30, 20, 16);
    const grub2 = A("sprites/grub_0.png");
    if (grub2) g.drawImage(grub2, w - 96, top + 6, 20, 16);
    const rig = A("sprites/rig_1.png");
    if (rig) g.drawImage(rig, 44, rigY, 32, 32);

    /* hazard tape along the shaft head, then the film grain */
    const tape = A("ui/stripes.png");
    if (tape) for (let x = 0; x < w; x += 16) g.drawImage(tape, x, top - 6);
    scanlines(g, w, h, 0.14);
    g.globalAlpha = 0.5;
    const vg = A("bg/vignette.png");
    if (vg) g.drawImage(vg, 0, 0, w, h);
    g.globalAlpha = 1;
    U.textCenter(g, "hold SPACE to drill - X vent - C sonar - E ascend - ESC pause",
                 w / 2, h - 32, "#6b7794");
    U.textCenter(g, `every sprite forged with imagemagick - ${DG.Assets.count} files`,
                 w / 2, h - 18, "#4a5470");
  }

  /* ── pause ──────────────────────────────────────────────────────────── */
  function pause(g, game) {
    const w = g.canvas.width, h = g.canvas.height;
    shade(g, w, h, 0.72);
    const pw = 300, ph = 130, px = Math.round(w / 2 - pw / 2), py = Math.round(h / 2 - ph / 2);
    U.plate(g, px, py, pw, ph);
    tape(g, py, w);
    U.textCenter(g, "PAUSED", w / 2, py + 8, "#ffd35c", 2);
    const rig = game.rig, y0 = py + 40;
    U.textCenter(g, `${Math.round(rig.metres)} m deep - ${rig.credits} credits - hold ${rig.cargoUsed}/${rig.cargoCap}`, w / 2, y0, "#dfe8ff");
    U.textCenter(g, `drill ${rig.drill.name} (power ${rig.drill.power.toFixed(1)})`, w / 2, y0 + 14, "#8fa0c0");
    U.textCenter(g, `deepest ${Math.round(rig.depthRecord)} m - ${rig.kills} burrowers - ${rig.runs} descents`, w / 2, y0 + 28, "#8fa0c0");
    const yk = y0 + 48;
    U.text(g, "ESC / SPACE", px + 20, yk, "#6fe0ff");
    U.text(g, "resume", px + 120, yk, "#8fa0c0");
    U.text(g, "M", px + 20, yk + 12, "#6fe0ff");
    U.text(g, "toggle audio", px + 120, yk + 12, "#8fa0c0");
    U.text(g, "Q", px + 20, yk + 24, "#6fe0ff");
    U.text(g, "save & reload", px + 120, yk + 24, "#8fa0c0");
    U.text(g, "N", px + 20, yk + 36, "#6fe0ff");
    U.text(g, "new shaft", px + 120, yk + 36, "#8fa0c0");
  }

  /* ── wreck ──────────────────────────────────────────────────────────── */
  function wreck(g, game) {
    const w = g.canvas.width, h = g.canvas.height;
    const rig = game.rig;
    shade(g, w, h, Math.min(0.6, 0.25 + game.wreckT * 0.4), "#2a0505");
    const pw = 340, ph = 140, px = Math.round(w / 2 - pw / 2), py = Math.round(h / 2 - ph / 2) - 8;
    U.plate(g, px, py, pw, ph);
    tape(g, py, w);
    const blink = Math.floor(game.time * 3) % 2 === 0;
    U.textCenter(g, "RIG DESTROYED", w / 2, py + 8, blink ? "#ff6b7a" : "#ff5c5c", 2);
    U.textCenter(g, `${Math.round(rig.metres)} m down - hull breached`, w / 2, py + 40, "#dfe8ff");
    U.textCenter(g, `deepest ${Math.round(rig.depthRecord)} m - ${rig.credits} credits banked`, w / 2, py + 56, "#8fa0c0");
    U.textCenter(g, `hold lost: ${rig.lastLost || 0} units of ore`, w / 2, py + 72, "#ffd35c");
    U.textCenter(g, `ore already banked is safe - drill ${rig.drill.name.toLowerCase()} survives`, w / 2, py + 92, "#6b7794");
    if (game.wreckT > 1) {
      U.textCenter(g, "SPACE - BUILD A NEW RIG AT THE DEPOT", w / 2, py + 112,
                   blink ? "#7df5a8" : "#3f6b52");
    }
  }

  /* ── frame dispatch: what the boot loop and the QA harness both call ── */
  function frame(g, game) {
    if (!game || !game.rig) { g.fillStyle = "#05060a"; g.fillRect(0, 0, g.canvas.width, g.canvas.height); return; }
    const st = game.state;
    if (st === "console" || st === "wrecked") DG.Console.frame(g, game);
    else if (st === "depot") DG.Depot.frame(g, game);

    if (st === "title") title(g, game);
    else if (st === "pause") {
      if (game.pauseFrom === "depot") DG.Depot.frame(g, game);
      else DG.Console.frame(g, game);
      pause(g, game);
    } else if (st === "wrecked") wreck(g, game);
  }

  return { frame, title, pause, wreck, shade, scanlines, tape };
})();
