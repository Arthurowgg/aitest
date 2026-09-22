#!/usr/bin/env bash
# ============================================================================
# APEX HORIZON — ImageMagick 6 asset forge
# Draws every UI icon, the wordmark logo and the favicon from pure IM
# primitives (no SVG delegate required). Run:  bash tools/make_assets.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=assets/icons
mkdir -p "$OUT"

INK="#eaf3ff"          # icon base colour (white-blue)
CYAN="#22e1ff"
MAG="#ff2e93"
AMB="#ffb020"
LIM="#9dff3c"
VIO="#8b5cff"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
mk() {   # mk <name> <draw-string> [strokewidth]
  local n="$1" d="$2" sw="${3:-4.5}"
  convert -size 96x96 xc:none \
    -stroke "$INK" -strokewidth "$sw" -fill none \
    -draw "stroke-linecap round stroke-linejoin round $d" \
    -trim +repage -resize 72x72 -gravity center -background none -extent 72x72 \
    "$OUT/$n.png"
}
tint() { # tint <src-icon> <dst-name> <colour>
  convert "$OUT/$1.png" -alpha on -fill "$3" -colorize 100 "$OUT/$2.png"
}
glowicon() { # add a soft coloured halo for accent icons
  local f="$1" c="$2"
  convert "$OUT/$f" \( +clone -background "$c" -shadow 90x2.4+0+0 \) +swap \
    -background none -layers merge +repage "$OUT/$f"
}

echo "== drawing icons =="

# --- transport / race ---
mk i-play      "fill $INK stroke none polygon 26,18 76,48 26,78"
mk i-flag      "line 26,10 26,86  path 'M26,16 C46,8 60,26 80,18 L80,50 C60,58 46,40 26,48 Z'
                fill $INK stroke none polygon 38,20 50,20 50,32 38,32
                fill $INK stroke none polygon 62,24 74,24 74,36 62,36
                fill $INK stroke none polygon 50,32 62,32 62,44 50,44"
mk i-car       "path 'M8,60 L14,42 C16,34 22,30 30,29 L58,27 C66,27 72,30 76,36 L84,48 C88,50 90,54 90,58 L90,66 L8,66 Z'
                circle 28,68 28,60  circle 70,68 70,60
                line 32,42 60,40"
mk i-trophy    "path 'M28,12 L68,12 L66,38 C64,50 56,56 48,56 C40,56 32,50 30,38 Z'
                path 'M28,18 C16,18 15,34 28,38'
                path 'M68,18 C80,18 81,34 68,38'
                line 48,56 48,68
                path 'M32,68 L64,68 L70,82 L26,82 Z'"
mk i-speed     "path 'M14,72 A36,36 0 1,1 82,72'
                line 48,70 66,40
                circle 48,72 48,66
                line 20,58 26,61   line 30,38 35,42   line 48,26 48,32   line 66,38 61,42   line 76,58 70,61"
mk i-drift     "path 'M14,78 C26,50 34,40 56,34 C70,30 78,24 82,14'
                path 'M22,84 C34,58 44,50 62,45'
                fill $INK stroke none polygon 84,8 92,20 76,20"
mk i-jump      "path 'M8,78 L44,44 L70,44 L70,78 Z'
                path 'M26,38 C40,14 62,12 80,26'
                fill $INK stroke none polygon 84,18 84,34 70,26"
mk i-bolt      "fill $INK stroke none polygon 56,6 22,54 44,54 36,90 74,40 50,40"
mk i-star      "fill $INK stroke none polygon 48,8 59,36 88,38 65,57 73,86 48,69 23,86 31,57 8,38 37,36"
mk i-nitro     "path 'M20,30 L54,30 L70,48 L54,66 L20,66 Z'
                path 'M32,40 L48,40 L58,48 L48,56 L32,56 Z'
                line 78,38 88,38   line 78,48 90,48   line 78,58 88,58"
mk i-checkpoint "line 16,84 16,30   line 80,84 80,30
                path 'M16,30 C36,14 60,14 80,30'
                line 16,52 80,52"
mk i-festival  "circle 48,40 48,12
                line 48,40 48,12  line 48,40 72,26  line 48,40 72,54  line 48,40 48,68
                line 48,40 24,54  line 48,40 24,26
                line 34,72 62,72   line 48,68 48,80"
mk i-steering  "circle 48,48 48,14
                circle 48,48 48,38
                line 48,58 48,82   line 40,42 16,32   line 56,42 80,32"
mk i-tire      "circle 48,48 48,14   circle 48,48 48,30
                line 48,14 48,26   line 82,48 70,48   line 48,82 48,70   line 14,48 26,48
                line 72,24 63,33   line 72,72 63,63   line 24,72 33,63   line 24,24 33,33"
mk i-engine    "path 'M20,40 L34,40 L34,28 L56,28 L56,40 L74,40 L74,64 L20,64 Z'
                line 40,28 40,18  line 40,18 62,18  line 62,18 62,28
                line 74,48 86,48  line 86,48 86,70  line 12,52 20,52"

# --- ui chrome ---
mk i-home      "path 'M12,46 L48,14 L84,46'
                path 'M22,44 L22,82 L74,82 L74,44'
                path 'M40,82 L40,60 L56,60 L56,82'"
mk i-map       "path 'M12,26 L36,14 L60,26 L84,14 L84,70 L60,82 L36,70 L12,82 Z'
                line 36,14 36,70   line 60,26 60,82
                circle 48,44 48,38"
mk i-settings  "circle 48,48 48,32
                line 48,6 48,16   line 48,80 48,90
                line 6,48 16,48   line 80,48 90,48
                line 18,18 25,25  line 71,71 78,78
                line 78,18 71,25  line 25,71 18,78"
mk i-wrench    "path 'M74,16 C64,10 50,14 45,25 C41,34 43,42 48,48 L16,80 L26,90 L58,58 C64,63 72,64 80,60 C90,55 94,42 88,32 L74,44 L64,34 Z'"
mk i-paint     "path 'M18,78 C18,66 26,58 38,58 L64,32 C70,26 80,26 86,32 C92,38 92,48 86,54 L60,80 C60,90 50,94 40,92 Z'
                line 58,38 78,58
                circle 34,80 34,75"
mk i-rotate    "path 'M78,34 A34,34 0 1,0 76,64'
                fill $INK stroke none polygon 84,22 90,44 66,42"
mk i-restart   "path 'M18,62 A34,34 0 1,1 20,32'
                fill $INK stroke none polygon 12,74 6,52 30,54"
mk i-camera    "path 'M12,34 L30,34 L36,24 L60,24 L66,34 L84,34 C88,34 90,37 90,41 L90,74 C90,78 88,80 84,80 L12,80 C8,80 6,78 6,74 L6,41 C6,37 8,34 12,34 Z'
                circle 48,57 48,44
                circle 48,57 48,51"
mk i-exit      "path 'M50,14 L20,14 C16,14 14,17 14,21 L14,75 C14,79 16,82 20,82 L50,82'
                line 42,48 84,48
                fill $INK stroke none polygon 88,48 72,38 72,58"
mk i-warn      "path 'M48,12 L88,80 L8,80 Z'
                line 48,38 48,58   circle 48,68 48,65"
mk i-lock      "path 'M28,44 L28,32 C28,20 36,12 48,12 C60,12 68,20 68,32 L68,44'
                path 'M20,44 L76,44 L76,84 L20,84 Z'
                circle 48,62 48,57   line 48,66 48,74"
mk i-bulb      "circle 48,38 48,18
                line 38,54 58,54   line 40,64 56,64   line 44,74 52,74
                line 48,4 48,10   line 14,38 8,38   line 88,38 82,38
                line 24,14 19,9   line 72,14 77,9"
mk i-gamepad   "path 'M32,28 L64,28 C76,28 84,40 88,58 C90,68 84,78 76,78 C70,78 66,74 62,70 L34,70 C30,74 26,78 20,78 C12,78 6,68 8,58 C12,40 20,28 32,28 Z'
                line 22,46 34,46   line 28,40 28,52
                circle 66,46 66,43   circle 74,56 74,53"
mk i-keys      "path 'M8,26 L88,26 L88,72 L8,72 Z'
                path 'M18,36 L30,36 L30,46 L18,46 Z   M36,36 L48,36 L48,46 L36,46 Z   M54,36 L66,36 L66,46 L54,46 Z   M72,36 L82,36 L82,46 L72,46 Z'
                path 'M22,54 L74,54 L74,64 L22,64 Z'"
mk i-mouse     "path 'M30,10 L66,10 C74,10 78,16 78,26 L78,62 C78,78 66,88 48,88 C30,88 18,78 18,62 L18,26 C18,16 22,10 30,10 Z'
                line 48,10 48,40   line 48,20 48,32"
mk i-credits   "circle 48,48 48,14   circle 48,48 48,30
                path 'M58,36 C54,32 42,32 42,42 C42,52 56,50 56,60 C56,70 42,70 38,64'
                line 48,26 48,70"
mk i-clock     "circle 48,48 48,12   line 48,48 48,26   line 48,48 66,56"
mk i-display   "path 'M10,18 L86,18 L86,64 L10,64 Z'   line 36,78 60,78   line 48,64 48,78"
mk i-speaker   "path 'M18,36 L34,36 L54,18 L54,78 L34,60 L18,60 Z'
                path 'M66,34 C74,42 74,54 66,62'   path 'M76,24 C90,38 90,58 76,72'"
mk i-medal     "circle 48,58 48,40
                path 'M30,8 L44,40   M66,8 L52,40'
                fill $INK stroke none polygon 48,48 51,56 60,56 53,61 56,70 48,65 40,70 43,61 36,56 45,56"
mk i-shield    "path 'M48,10 L82,22 L82,48 C82,68 66,82 48,88 C30,82 14,68 14,48 L14,22 Z'
                fill $INK stroke none polygon 48,32 40,50 46,50 42,66 58,46 50,46 56,32"
mk i-target    "circle 48,48 48,12   circle 48,48 48,28
                line 48,2 48,14   line 48,82 48,94   line 2,48 14,48   line 82,48 94,48"
mk i-weather   "circle 36,36 36,24
                line 36,8 36,14   line 12,36 6,36   line 60,36 66,36   line 18,18 14,14   line 54,18 58,14
                path 'M28,74 C18,74 12,66 16,58 C20,50 30,50 34,54 C38,46 52,44 58,52 C68,50 74,60 70,68 C66,76 56,74 56,74 Z'"
mk i-brake     "circle 48,48 48,14   circle 48,48 48,30
                line 66,20 78,10   line 74,34 90,30
                fill $INK stroke none polygon 40,44 56,44 48,58"
mk i-gear      "path 'M14,72 C26,52 34,40 52,34 C66,30 76,22 80,10'
                circle 22,74 22,68   circle 40,66 40,60"
mk i-info      "circle 48,48 48,12   line 48,44 48,70   circle 48,30 48,27"
mk i-grid      "path 'M10,10 L40,10 L40,40 L10,40 Z   M56,10 L86,10 L86,40 L56,40 Z   M10,56 L40,56 L40,86 L10,86 Z   M56,56 L86,56 L86,86 L56,86 Z'"
mk i-eye       "path 'M6,48 C20,26 76,26 90,48 C76,70 20,70 6,48 Z'   circle 48,48 48,38"
mk i-road      "path 'M32,6 C26,34 26,62 12,90   M64,6 C70,34 70,62 84,90'
                line 48,10 48,22   line 48,38 48,50   line 48,66 48,78"

# --- coloured variants used by the HUD / chips ---
tint i-credits  i-credits-a "$AMB"
tint i-speed    i-speed-c   "$CYAN"
tint i-drift    i-drift-m   "$MAG"
tint i-jump     i-jump-l    "$LIM"
tint i-bolt     i-bolt-c    "$CYAN"
tint i-star     i-star-a    "$AMB"
tint i-trophy   i-trophy-a  "$AMB"
tint i-flag     i-flag-m    "$MAG"
tint i-play     i-play-k    "#04121c"
tint i-flag     i-flag-k    "#04121c"
tint i-map      i-map-k     "#04121c"
tint i-home     i-home-k    "#04121c"
tint i-restart  i-restart-k "#04121c"
tint i-settings i-settings-k "#04121c"

# medal set
convert "$OUT/i-medal.png" -fill "#ffd76a" -colorize 100 "$OUT/i-medal-1.png"
convert "$OUT/i-medal.png" -fill "#dfe8f5" -colorize 100 "$OUT/i-medal-2.png"
convert "$OUT/i-medal.png" -fill "#d99a63" -colorize 100 "$OUT/i-medal-3.png"
convert "$OUT/i-medal.png" -fill "#7b8ba6" -colorize 100 "$OUT/i-medal-0.png"

# ---------------------------------------------------------------------------
# favicon + emblem
# ---------------------------------------------------------------------------
echo "== emblem / favicon =="
convert -size 256x256 xc:none -fill white -stroke none \
  -draw "path 'M128,18 L226,72 L226,184 L128,238 L30,184 L30,72 Z'" /tmp/hex_mask.png
convert -size 256x256 gradient:'#22e1ff'-'#ff2e93' /tmp/hex_grad.png
convert /tmp/hex_grad.png /tmp/hex_mask.png -alpha off -compose CopyOpacity -composite /tmp/hex.png
convert -size 256x256 xc:none \
  -stroke '#04121c' -strokewidth 26 -fill none -draw 'stroke-linecap round stroke-linejoin round' \
  -draw "path 'M78,182 L128,70 L178,182' line 98,146 158,146" /tmp/chev_dark.png
convert -size 256x256 xc:none \
  -stroke '#ffffff' -strokewidth 12 -fill none -draw 'stroke-linecap round stroke-linejoin round' \
  -draw "path 'M78,182 L128,70 L178,182' line 98,146 158,146" /tmp/chev.png
convert -size 256x256 xc:none -fill '#04121c' -stroke none \
  -draw "polygon 62,198 194,198 178,220 78,220" /tmp/bar.png
convert /tmp/hex.png /tmp/chev_dark.png /tmp/chev.png /tmp/bar.png \
  -background none -layers merge +repage -resize 64x64 "$OUT/favicon.png"
convert "$OUT/favicon.png" -filter Lanczos -resize 180x180 "$OUT/apple-touch-icon.png"
convert "$OUT/favicon.png" -filter Lanczos -resize 256x256 "$OUT/emblem.png"

# ---------------------------------------------------------------------------
# wordmark logo
# ---------------------------------------------------------------------------
echo "== wordmark =="
LOGO_W=1680; LOGO_H=430

# gradient plates
convert -size ${LOGO_W}x${LOGO_H} gradient:'#ffffff'-'#9fe8ff'  /tmp/g_cool.png
convert -size ${LOGO_W}x${LOGO_H} gradient:'#ff9ad4'-'#ff2e93'  /tmp/g_hot.png
convert -size ${LOGO_W}x${LOGO_H} gradient:'#22e1ff'-'#ff2e93'  /tmp/g_neon.png

# "APEX" — heavy italic, neon gradient, dark outline
convert -size 900x280 xc:none -background none -font DejaVu-Sans-Bold -pointsize 210 -kerning -4 \
  -fill white -gravity West -annotate +24+0 "APEX" /tmp/m_apex.png
convert /tmp/g_cool.png /tmp/m_apex.png -gravity West -geometry 900x280+0+60 -compose CopyOpacity -composite /tmp/apex_fill.png
convert -size 900x280 xc:none -background none -font DejaVu-Sans-Bold -pointsize 210 -kerning -4 \
  -stroke '#03121d' -strokewidth 16 -fill none -gravity West -annotate +24+0 "APEX" /tmp/apex_out.png
convert -size 900x280 xc:none -background none -font DejaVu-Sans-Bold -pointsize 210 -kerning -4 \
  -stroke "$CYAN" -strokewidth 3 -fill none -gravity West -annotate +24+0 "APEX" /tmp/apex_edge.png

# "HORIZON" — outlined, letterspaced
convert -size 1000x170 xc:none -background none -font DejaVu-Sans-Bold -pointsize 118 -kerning 6 \
  -stroke '#dff4ff' -strokewidth 5 -fill '#0a1626' -gravity West -annotate +8+0 "HORIZON" /tmp/hor.png
convert /tmp/g_neon.png /tmp/hor.png -gravity West -geometry 1000x170+0+0 -compose CopyOpacity -composite /tmp/hor_fill.png
convert -size 1000x170 xc:none -background none -font DejaVu-Sans-Bold -pointsize 118 -kerning 6 \
  -stroke '#03121d' -strokewidth 14 -fill none -gravity West -annotate +8+0 "HORIZON" /tmp/hor_out.png

# shear everything for the motorsport italic
for f in apex_fill apex_out apex_edge hor_fill hor_out; do
  convert /tmp/$f.png -background none -affine 1,0,0.22,1,0,0 -transform +repage -trim +repage /tmp/${f}_s.png
done

# horizon swoosh under the wordmark
convert -size ${LOGO_W}x150 xc:none -stroke '#22e1ff' -strokewidth 11 -fill none -draw 'stroke-linecap round' \
  -draw "path 'M40,110 C420,26 1120,20 1620,92'" /tmp/swoosh_c.png
convert -size ${LOGO_W}x150 xc:none -stroke '#ff2e93' -strokewidth 11 -fill none -draw 'stroke-linecap round' \
  -draw "path 'M40,124 C440,44 1120,36 1620,106'" /tmp/swoosh_m.png
convert /tmp/swoosh_c.png /tmp/swoosh_m.png -background none -compose lighten -composite /tmp/swoosh.png

# subtitle bar
convert -size ${LOGO_W}x80 xc:none -background none -font DejaVu-Sans-Bold -pointsize 46 -kerning 34 \
  -fill "$AMB" -gravity Center -annotate +18+0 "JAPAN FESTIVAL" /tmp/sub.png

# assemble
W1=$(identify -format "%w" /tmp/apex_out_s.png); H1=$(identify -format "%h" /tmp/apex_out_s.png)
W2=$(identify -format "%w" /tmp/hor_out_s.png);  H2=$(identify -format "%h" /tmp/hor_out_s.png)

convert -size ${LOGO_W}x${LOGO_H} xc:none \
  /tmp/apex_out_s.png -geometry +110+54 -composite \
  /tmp/apex_fill_s.png -geometry +110+54 -composite \
  /tmp/apex_edge_s.png -geometry +110+54 -composite \
  /tmp/hor_out_s.png  -geometry +$((110+W1-40))+$((54+H1-34)) -composite \
  /tmp/hor_fill_s.png -geometry +$((110+W1-40))+$((54+H1-34)) -composite \
  /tmp/swoosh.png     -geometry +60+$((LOGO_H-190)) -composite \
  /tmp/sub.png        -geometry +40+$((LOGO_H-96)) -composite \
  /tmp/logo_flat.png

# neon bloom behind the wordmark
convert /tmp/logo_flat.png \( +clone -background "$CYAN" -shadow 100x14+0+0 \) \
        \( /tmp/logo_flat.png -clone 0 -background "$MAG" -shadow 80x26+0+0 \) \
        -background none -layers merge +repage -trim +repage "$OUT/logo.png"

# small logo for the top bar (wordmark only)
convert -size 1200x260 xc:none \
  /tmp/apex_out_s.png -geometry +20+10 -composite \
  /tmp/apex_fill_s.png -geometry +20+10 -composite \
  /tmp/hor_out_s.png -geometry +$((W1+2))+$((10+H1-40)) -composite \
  /tmp/hor_fill_s.png -geometry +$((W1+2))+$((10+H1-40)) -composite \
  -trim +repage -resize x76 "$OUT/logo-small.png"

# monochrome stencil version for watermarks
convert "$OUT/logo.png" -fill "#8fd8ff" -colorize 100 "$OUT/logo-mono.png"

echo "== procedural texture set =="
bash tools/make_textures.sh

echo "OK — $(ls -1 $OUT | wc -l) icons, logo $(identify -format '%wx%h' $OUT/logo.png)"
