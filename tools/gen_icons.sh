#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# DEEPDIG — app icons for the phone home screen, forged with ImageMagick like
# every other pixel in this repo.  Run from the repo root:
#     bash tools/gen_icons.sh
# The art stays inside the middle 80% so Android's maskable crop is safe.
# ═══════════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."
IM=${IM:-convert}

RIG=assets/sprites/rig_1.png          # 16x16 — the machine itself

# 1. a deep radial plate with a warm lamp behind the rig
$IM -size 512x512 radial-gradient:'#1d2740'-'#05060a' /tmp/dd_icon_base.png
$IM /tmp/dd_icon_base.png \
    \( -size 400x400 radial-gradient:'#ff9a2e55'-'#00000000' \) \
    -gravity center -geometry +0-30 -compose over -composite /tmp/dd_icon_glow.png

# 2. the rig, 12x, a touch above centre
$IM /tmp/dd_icon_glow.png \
    \( "$RIG" -filter point -resize 1400% \) -gravity center -geometry +0-28 \
    -compose over -composite /tmp/dd_icon_rig.png

# 3. a hazard-tape strip near the floor, inset so a circular mask cannot eat it
#    (this ImageMagick cannot tile from the command line, so draw the diagonals)
draw=""
for x in $(seq -20 40 420); do
  draw="$draw polygon $x,30 $((x + 16)),30 $((x + 34)),0 $((x + 18)),0"
done
$IM -size 400x30 xc:'#141008' -fill '#ffb03a' -draw "$draw" /tmp/dd_tape_big.png
$IM /tmp/dd_icon_rig.png \
    \( /tmp/dd_tape_big.png \) -gravity south -geometry +0+92 \
    -compose over -composite icon-512.png

# 4. the sizes phones actually ask for
$IM icon-512.png -filter point -resize 192x192 icon-192.png
$IM icon-512.png -filter point -resize 180x180 apple-touch-icon.png
$IM icon-512.png -filter point -resize 32x32 favicon-32.png

# 5. flat art does not need 16-bit colour — the icons shrink ~10x, which matters
#    because these four files ship inside every Pages deploy
for f in icon-512.png icon-192.png apple-touch-icon.png favicon-32.png; do
  $IM "$f" -strip -colors 220 -depth 8 "png8:/tmp/dd_icon_$f" && mv "/tmp/dd_icon_$f" "$f"
done

echo "✅ icons: $(identify -format '%wx%h ' icon-512.png icon-192.png apple-touch-icon.png favicon-32.png)"
