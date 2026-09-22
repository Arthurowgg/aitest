// ============================================================================
// APEX HORIZON — entry point
// ============================================================================
import { Game } from './game.js';
import { Screens } from './ui/screens.js';
import Save from './core/save.js';

const canvas = document.getElementById('gl');

function fatal(err) {
  console.error(err);
  const f = document.getElementById('fatal');
  f.classList.remove('hidden');
  document.getElementById('fatal-msg').textContent = `${err && err.message ? err.message : err}\n\n${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : ''}`;
}

const TIPS = [
  'Tap the handbrake mid-corner to break traction and hold a drift.',
  'Nitro refills slowly — save it for the exit of a long corner.',
  'Hold brake from a standstill to select reverse.',
  'Press C to cycle chase, hood, cockpit and cinematic cameras.',
  'Drift zones bank their score about a second after you stop sliding.',
  'Speed traps record your best pass — brake late, commit early.',
  'Upgrading tyres gives the biggest lap-time gain in Class B.',
  'Wet asphalt in Shibuya cuts grip by around 10% — smooth your inputs.',
  'Photo mode (F1) lets you orbit, roll and grade your shot.',
  'Slipstream nothing here — but a clean racing line is everything.',
];

(async () => {
  window.__bootMark && window.__bootMark('modules ok');
  try {
    let game;
    try {
      game = new Game(canvas);
    } catch (e) {
      fatal(new Error('WebGL2 could not be initialised. Try a desktop browser with hardware acceleration enabled. ' + (e && e.message ? e.message : '')));
      return;
    }
    const screens = new Screens(game);
    game.renderer.onFallback = () => screens.notify('Post-processing disabled for stability — still playable', 'pink');
    screens.bind();
    window.__GAME = game;        // debug handle
    window.__SCREENS = screens;
    document.getElementById('hud').classList.toggle('no-hints', !!Save.s.hideHints);
    document.getElementById('boot-tip-text').textContent = TIPS[(Math.random() * TIPS.length) | 0];
    document.getElementById('title-version').textContent = 'v1.0.0 · fan project';

    window.__bootMark && window.__bootMark('booting assets');
    await screens.withLoading(async (prog) => {
      await game.boot((f, label) => prog(0.08 + f * 0.88, label || 'Loading textures…'));
    });
    window.__bootMark && window.__bootMark('ready');
    game.setShowroomCar(Save.data.active);
    document.getElementById('title-art').style.backgroundImage = 'url(assets/art/keyart.jpg)';
    screens.screen('screen-title');
    game.state = 'title';

    // ------------------------------------------------------------ main loop
    const loop = () => {
      requestAnimationFrame(loop);
      try { game.frame(); } catch (e) {
        if (!window.__fatalShown) { window.__fatalShown = true; fatal(e); }
        console.error(e);
      }
    };
    requestAnimationFrame(loop);

    // fps footer
    game.renderer.onFps = (fps) => {
      const f = document.getElementById('foot-fps');
      if (f) f.textContent = `${Math.round(fps)} FPS · ${game.renderer.qualityName.toUpperCase()}`;
    };
  } catch (e) { fatal(e); }
})();
