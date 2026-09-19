/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · main — boot the console, then run it
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

(function () {
  const canvas = document.getElementById("screen");
  const bootEl = document.getElementById("boot");
  const fill = document.getElementById("boot-fill");
  const note = document.getElementById("boot-note");
  const hint = document.getElementById("hint");

  DG.initInput(canvas);
  if (DG.Touch) DG.Touch.boot();

  /* ── sizing ──────────────────────────────────────────────────────────────
     The glass takes every pixel the touch deck does not.  On a desktop that
     is a whole number of pixel-perfect multiples; on a phone, where the screen
     is smaller than 480x288, it scales fractional and fills the width. */
  DG.fit = function () {
    const stage = document.getElementById("stage");
    const availW = Math.max(200, Math.round((stage && stage.clientWidth) || innerWidth));
    const availH = Math.max(140, Math.round((stage && stage.clientHeight) || innerHeight));
    const dpr = Math.min(3, (window.devicePixelRatio || 1));
    const s = DG.Touch ? DG.Touch.fitScale(availW, availH, dpr)
                       : Math.max(1, Math.floor(Math.min(availW / canvas.width, availH / canvas.height)));
    canvas.style.width = Math.round(canvas.width * s) + "px";
    canvas.style.height = Math.round(canvas.height * s) + "px";
  };
  DG.fit();
  addEventListener("resize", DG.fit);
  addEventListener("orientationchange", () => setTimeout(DG.fit, 120));
  if (window.visualViewport) visualViewport.addEventListener("resize", DG.fit);

  const notes = [
    "forging drill bits…",
    "greasing the winch…",
    "pressurising the coolant loop…",
    "sweeping the borehole…",
    "waking the burrowers…",
  ];
  let ni = 0;
  const noteTimer = setInterval(() => {
    if (!note) return;
    ni = (ni + 1) % notes.length;
    note.textContent = notes[ni];
  }, 420);

  DG.Assets.loadAll((p) => {
    if (fill) fill.style.width = Math.round(p * 100) + "%";
    if (note && p > 0.99) note.textContent = "console online";
  }).then(() => {
    clearInterval(noteTimer);
    const game = (DG.game = new DG.Game(canvas));
    if (bootEl) bootEl.classList.add("gone");
    document.body.classList.add("ready");
    if (hint) hint.classList.remove("gone");

    if (DG.Touch) DG.Touch.sync(game);

    /* ── the loop: fixed 60 Hz steps, no spiral of death ─────────────── */
    const STEP = 1 / 60;
    let last = performance.now(), acc = 0, frameNo = 0;
    function tick(now) {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 6) {
        game.handleInput();
        game.update(STEP);
        DG.Input.clear();
        acc -= STEP;
        steps++;
      }
      if (steps === 0) { /* input still needs clearing on very fast frames */
        DG.Input.clear();
      }
      /* the deck only needs 15 Hz to look alive — it animates in CSS */
      if (DG.Touch && (frameNo++ % 4 === 0)) DG.Touch.sync(game);

      const g = game.g;
      g.save();
      if (game.shakeAmt > 0) {
        const a = game.shakeAmt * (game.shakeT > 0 ? 1 : 0);
        g.translate(Math.round((Math.random() - 0.5) * a * 2), Math.round((Math.random() - 0.5) * a));
      }
      DG.Render.frame(g, game);
      g.restore();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    /* save when the tab goes away — the shift is long */
    window.addEventListener("beforeunload", () => game.save());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) game.save();
      DG.Input.releaseAll();          /* put the drill down when the phone sleeps */
      last = performance.now();
      acc = 0;
    });
  });
})();
