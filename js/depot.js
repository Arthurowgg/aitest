/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG - depot - the surface screen: sell ore, forge bits, buy hardware
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

DG.Depot = (function () {
  const A = (p) => DG.Assets.A(p);
  const U = DG.UI;

  const Y = 30, H = 232;
  const COL = [
    { x: 4,   y: Y, w: 132, h: H },   // ore bank
    { x: 140, y: Y, w: 176, h: H },   // bit forge
    { x: 320, y: Y, w: 156, h: H },   // hardware + winch
  ];

  function bankValue(rig) {
    let v = 0;
    for (const [ore, n] of Object.entries(rig.bank))
      v += (DG.ORE_DEFS[ore] ? DG.ORE_DEFS[ore].price : 0) * n;
    return v;
  }

  function frame(g, game) {
    const rig = game.rig;
    g.imageSmoothingEnabled = false;
    U.begin(g.canvas.width, g.canvas.height);
    g.fillStyle = "#070910";
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);

    /* header */
    U.plate(g, 0, 0, 480, 24, "plate_lo");
    const badge = A("ui/badge.png");
    if (badge) g.drawImage(badge, 5, 7);
    U.text(g, "SURFACE DEPOT", 25, 7, "#ffd35c");
    U.textCenter(g, `RECORD ${Math.round(rig.depthRecord)} m  -  RUNS ${rig.runs}`, 240, 7, "#6fe0ff");
    U.textRight(g, `${rig.credits} CR`, 474, 7, "#ffe9a0");

    drawBank(g, game);
    drawForge(g, game);
    drawHardware(g, game);

    /* footer */
    U.text(g, `HULL ${Math.max(0, rig.hull).toFixed(0)}/${rig.hullMax}`, 6, 270, "#8fa0c0");
    U.text(g, `DRILL ${rig.drill.name} ${rig.drill.power.toFixed(1)}`, 130, 270, "#ffd35c");
    U.text(g, `RUNS ${rig.runs}`, 300, 270, "#8fa0c0");
    U.text(g, `BURROWERS ${rig.kills}`, 380, 270, "#8fa0c0");
    U.end();
  }

  /* ── column 1: sell the haul ────────────────────────────────────────── */
  function drawBank(g, game) {
    const rig = game.rig, c = COL[0];
    U.plate(g, c.x, c.y, c.w, c.h);
    U.text(g, "ORE BANK", c.x + 6, c.y + 5, "#6b7794");
    U.textRight(g, `${rig.totalOre} units`, c.x + c.w - 6, c.y + 5, "#8fa0c0");
    U.text(g, "ORE", c.x + 6, c.y + 20, "#39415a");
    U.textRight(g, "QTY", c.x + c.w - 44, c.y + 20, "#39415a");
    U.textRight(g, "VALUE", c.x + c.w - 6, c.y + 20, "#39415a");

    let ry = c.y + 34, total = 0, shown = 0;
    for (const ore of DG.ORES) {
      const n = rig.bank[ore] || 0;
      if (!n) continue;
      const price = DG.ORE_DEFS[ore].price;
      const ic = A(`sprites/item_${ore}.png`);
      if (ic) g.drawImage(ic, c.x + 7, ry + 1, 8, 8);
      U.text(g, ore.toUpperCase(), c.x + 19, ry, "#c9d8f0");
      U.textRight(g, String(n), c.x + c.w - 44, ry, "#8fa0c0");
      U.textRight(g, String(n * price), c.x + c.w - 6, ry, "#ffe9a0");
      total += n * price;
      ry += 14;
      shown++;
      if (ry > c.y + c.h - 76) break;
    }
    if (!Object.keys(rig.bank).length) {
      U.text(g, "nothing banked yet.", c.x + 6, c.y + 40, "#4a5470");
      U.text(g, "the hold empties", c.x + 6, c.y + 54, "#39415a");
      U.text(g, "when the rig", c.x + 6, c.y + 68, "#39415a");
      U.text(g, "surfaces.", c.x + 6, c.y + 82, "#39415a");
    } else if (shown > 9) {
      U.text(g, "...", c.x + 6, ry, "#39415a");
    }
    const by = c.y + c.h - 62;
    const stripe = A("ui/stripes.png");
    if (stripe) for (let x = 0; x < c.w - 12; x += 16) g.drawImage(stripe, c.x + 6 + x, by - 8);
    U.text(g, "MARKET VALUE", c.x + 6, by, "#6b7794");
    U.textRight(g, `${total} CR`, c.x + c.w - 6, by, "#ffe9a0");
    if (U.button(g, { x: c.x + 6, y: c.y + c.h - 46, w: c.w - 12, h: 26 },
                 total ? `SELL ALL  ${total}` : "SELL ALL",
                 { id: "sell", disabled: !total, accent: !!total })) {
      rig.sellAll(game);
      game.save();
    }
    U.textCenter(g, "credits for bits", c.x + c.w / 2, c.y + c.h - 15, "#39415a");
  }

  /* ── column 2: the forge, seven grades ──────────────────────────────── */
  function drawForge(g, game) {
    const rig = game.rig, c = COL[1];
    const inner = c.w - 10;
    U.plate(g, c.x, c.y, c.w, c.h);
    U.text(g, "BIT FORGE", c.x + 6, c.y + 5, "#6b7794");
    U.textRight(g, "7 GRADES", c.x + c.w - 6, c.y + 5, "#39415a");

    let fy = c.y + 20;
    DG.DRILLS.forEach((d, i) => {
      const fitted = i <= rig.drillIndex;
      const next = i === rig.drillIndex + 1;
      const can = rig.canForge(i);
      const h = 24;
      const row = { x: c.x + 5, y: fy, w: inner, h };
      const over = U.inside(row) && next;
      if (U.inside(row)) U.hot.hover = "forge" + i;

      g.fillStyle = fitted ? "rgba(36,52,42,0.62)"
                 : next ? (can ? "rgba(58,54,26,0.75)" : "rgba(34,38,56,0.75)")
                 : "rgba(16,18,26,0.7)";
      g.fillRect(row.x, row.y, row.w, row.h);
      g.strokeStyle = fitted ? "#3f6b52" : next ? (can ? "#ffd35c" : "#4a5470") : "#20242e";
      g.lineWidth = 1;
      g.strokeRect(row.x + 0.5, row.y + 0.5, row.w - 1, row.h - 1);
      if (over) { g.strokeStyle = "#ffe9a0"; g.strokeRect(row.x - 0.5, row.y - 0.5, row.w + 1, row.h + 1); }

      const icon = A(`ui/icon_pick_${d.id}.png`);
      if (icon) g.drawImage(icon, c.x + 10, fy + 7, 10, 10);
      U.text(g, d.name, c.x + 24, fy + 2, fitted || next ? "#dfe8ff" : "#39415a");
      U.text(g, `P${d.power.toFixed(1)}`, c.x + 24 + U.textWidth(d.name) + 5, fy + 2,
             fitted || next ? "#4a5470" : "#2b3247");

      if (fitted) {
        U.textRight(g, "FITTED", c.x + c.w - 8, fy + 2, "#7df5a8");
      } else if (next) {
        /* the price, then the ore it eats */
        let ox = c.x + c.w - 8;
        if (d.money) {
          const t = `${d.money} CR`;
          U.textRight(g, t, ox, fy + 2, rig.credits >= d.money ? "#ffe9a0" : "#4a5470");
          ox -= U.textWidth(t) + 18;
        }
        const cash = Object.entries(d.cost);
        for (let k = cash.length - 1; k >= 0; k--) {
          const [ore, need] = cash[k];
          const have = rig.bank[ore] || 0;
          const t = `${have}/${need}`;
          const tw = U.textWidth(t);
          U.textRight(g, t, ox, fy + 2, have >= need ? "#7df5a8" : "#6b7794");
          const ic = A(`sprites/item_${ore}.png`);
          if (ic) g.drawImage(ic, ox - tw - 10, fy + 2, 8, 8);
          ox -= tw + 20;
        }
        U.textRight(g, can ? "CLICK TO FIT" : "NOT ENOUGH ORE", c.x + c.w - 8, fy + 13,
                    can ? "#ffd35c" : "#4a5470");
      } else {
        U.textRight(g, "LOCKED", c.x + c.w - 8, fy + 2, "#39415a");
        U.textRight(g, "an earlier bit first", c.x + c.w - 8, fy + 13, "#2b3247");
      }

      if (next && U.inside(row) && DG.Input.clicked) {
        if (rig.forge(game, i)) game.save();
      }
      fy += h + 2;
    });

    const tip = rig.drillIndex < DG.DRILLS.length - 1
      ? `next: ${DG.DRILLS[rig.drillIndex + 1].name} - click to fit`
      : "mythril fitted - the deepest bit ever forged";
    U.text(g, tip, c.x + 6, c.y + c.h - 15, "#6b7794");
  }

  /* ── column 3: hardware and the winch ───────────────────────────────── */
  function drawHardware(g, game) {
    const rig = game.rig, c = COL[2];
    U.plate(g, c.x, c.y, c.w, c.h);
    U.text(g, "HARDWARE BAY", c.x + 6, c.y + 5, "#6b7794");

    let hy = c.y + 26;
    for (const item of DG.HARDWARE) {
      const have = rig.owned[item.id] || 0;
      const maxed = have >= item.times;
      const price = item.cost + have * Math.round(item.cost * 0.55);
      const afford = rig.credits >= price;
      const row = { x: c.x + 5, y: hy, w: c.w - 10, h: 22 };
      const over = U.inside(row) && !maxed;
      if (U.inside(row)) U.hot.hover = "hw" + item.id;
      g.fillStyle = maxed ? "rgba(36,52,42,0.55)" : over && afford ? "rgba(52,58,84,0.85)"
                 : afford ? "rgba(40,44,66,0.8)" : "rgba(16,18,26,0.7)";
      g.fillRect(row.x, row.y, row.w, row.h);
      g.strokeStyle = maxed ? "#3f6b52" : afford ? "#4a5470" : "#20242e";
      g.strokeRect(row.x + 0.5, row.y + 0.5, row.w - 1, row.h - 1);
      U.text(g, item.name, c.x + 10, hy + 2, maxed ? "#7df5a8" : "#dfe8ff");
      U.text(g, item.desc, c.x + 10, hy + 13, "#6b7794");
      U.textRight(g, maxed ? "MAX" : `${price} CR`, c.x + c.w - 10, hy + 2,
                  maxed ? "#7df5a8" : afford ? "#ffe9a0" : "#4a5470");
      U.textRight(g, `${have}/${item.times}`, c.x + c.w - 10, hy + 13, "#39415a");
      if (over && DG.Input.clicked) { if (rig.buyHardware(game, item)) game.save(); }
      hy += 24;
    }

    /* repair + winch */
    const need = Math.ceil(rig.hullMax - rig.hull);
    const cost = rig.repairCost();
    if (U.button(g, { x: c.x + 5, y: c.y + 176, w: c.w - 10, h: 18 },
                 need ? `REPAIR HULL +${need} - ${cost} CR` : "HULL NOMINAL",
                 { id: "repair", disabled: need <= 0 || rig.credits < cost })) {
      if (rig.repair(game)) game.save();
    }
    const label = rig.depthRecord > 0
      ? `DESCEND TO ${Math.round(rig.depthRecord)} m`
      : "BEGIN THE FIRST DESCENT";
    if (U.button(g, { x: c.x + 5, y: c.y + 200, w: c.w - 10, h: 26 }, label,
                 { id: "deploy", hotkey: "KeyE", accent: true })) {
      game.deploy();
    }
  }

  return { frame };
})();
