/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · assets — loads every PNG forged by tools/build_assets.sh
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

DG.Assets = (function () {
  const img = Object.create(null);
  let total = 0, done = 0;

  /* the list is generated at build time (js/assetlist.js) */
  const list = (DG.ASSET_LIST || []).slice();

  function load(path) {
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => { img[path] = i; done++; res(i); };
      i.onerror = () => { console.warn("missing asset", path); done++; res(null); };
      i.src = path;
    });
  }

  return {
    get progress() { return total ? done / total : 0; },
    get count() { return total; },
    /* A("tiles/dirt_1.png") — path without the assets/ prefix */
    A(p) { return img["assets/" + p] || null; },
    listOf(prefix, n, pad) {
      const out = [];
      for (let i = 1; i <= n; i++) out.push(this.A(`${prefix}${pad && i < 10 ? "0" : ""}${i}.png`));
      return out.filter(Boolean);
    },
    async loadAll(onProgress) {
      total = list.length;
      // small batches keep the loading bar moving and stay friendly to IO
      const batch = 16;
      for (let i = 0; i < list.length; i += batch) {
        await Promise.all(list.slice(i, i + batch).map(load));
        onProgress && onProgress(this.progress);
      }
      return img;
    },
  };
})();
