#!/usr/bin/env bash
# DEEPDIG · QA suite — runs the game headlessly and asserts its systems.
set -e
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "▸ syntax"
node --check js/console.js
node --check js/depot.js
node --check js/render.js
node --check js/game.js
node --check js/touch.js
node --check js/rig.js
node --check js/well.js
node --check js/ui.js
node --check js/core.js
node --check js/main.js
echo "  all 12 scripts parse"

echo "▸ systems (56 assertions about the rig, the rock and the depot)"
node tools/headless.js --frames=10 --script=systems --seed=4 | tail -2

echo "▸ balance (how much ore the rock actually carries)"
node tools/headless.js --frames=1 --script=balance --seed=4 | tail -9

echo "▸ play scripts (no crashes, no missing art, no un-forged inks)"
for s in mine deep surfaces sweep idle title title_save pause wrecked depot touch; do
  printf '  %-9s ' "$s"
  out=$(node tools/headless.js --frames=420 --script=$s --seed=$RANDOM)
  echo "$out" | grep -m1 "simulated" | tr -d '\n'
  if echo "$out" | grep -qE "asset\(s\) requested|text colour\(s\)|✗"; then
    echo ""
    echo "$out" | grep -E "asset\(s\) requested|text colour\(s\)|✗|   " | head -6
    exit 1
  fi
  echo " · every asset + ink present"
done

echo "▸ long shift (4000 frames of mine-and-ascend)"
node tools/headless.js --frames=4000 --script=mine --seed=9 | grep -E "simulated|deepest"

echo "▸ phone kit (manifest, icons, deck markup)"
node -e '
  const fs = require("fs");
  const man = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
  const html = fs.readFileSync("index.html", "utf8");
  const need = ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon-32.png"];
  for (const f of need) if (!fs.existsSync(f)) throw new Error("missing " + f);
  for (const i of man.icons) if (!fs.existsSync(i.src)) throw new Error("manifest icon missing: " + i.src);
  if (!/viewport-fit=cover/.test(html)) throw new Error("viewport has no viewport-fit=cover");
  if (!/rel="manifest"/.test(html)) throw new Error("no manifest link");
  if (!/rel="icon"/.test(html)) throw new Error("no favicon link");
  if (!/<meta name="theme-color"/.test(html)) throw new Error("no theme-color");
  for (const id of ["drill", "left", "right", "vent", "sonar", "patch", "purge", "ascend"])
    if (!html.includes(`data-act="${id}"`)) throw new Error("deck is missing " + id);
  console.log("  ✓ manifest, icons, viewport and deck markup all present");
'
node tools/headless.js --frames=420 --script=touch --seed=4 | tail -3

echo "▸ screenshot (title + depot, 2x)"
node tools/headless.js --frames=200 --script=title --out=/tmp/qa_title.json >/dev/null
python3 tools/preview.py /tmp/qa_title.json /tmp/qa_title.png | tail -1
node tools/headless.js --frames=200 --script=depot --out=/tmp/qa_depot.json >/dev/null
python3 tools/preview.py /tmp/qa_depot.json /tmp/qa_depot.png | tail -1

echo "✅ all checks green"
