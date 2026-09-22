#!/usr/bin/env bash
# ============================================================================
# APEX HORIZON — procedural texture forge (ImageMagick 6)
# Builds tileable albedo + derived normal/rough maps for the world and cars.
# Run: bash tools/make_textures.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
T=assets/tex
mkdir -p "$T"
S=${TEX_SIZE:-512}          # working size
H=$((S/2))

log(){ printf '  %-26s %s\n' "$1" "$2"; }

# ---------------------------------------------------------------------------
# make_tileable <in> <out> <size>
#   mirror-quad tiling: removes edge seams for organic textures
# ---------------------------------------------------------------------------
tileable(){
  local in="$1" out="$2" sz="${3:-$S}"
  local hs=$(( sz / 2 ))
  convert "$in" -resize ${hs}x${hs}! /tmp/_q0.png
  convert /tmp/_q0.png -flop        /tmp/_q1.png
  convert /tmp/_q0.png -flip        /tmp/_q2.png
  convert /tmp/_q0.png -rotate 180  /tmp/_q3.png
  convert -size ${sz}x${sz} xc:none \
    /tmp/_q0.png -geometry +0+0 -composite \
    /tmp/_q1.png -geometry +${hs}+0 -composite \
    /tmp/_q2.png -geometry +0+${hs} -composite \
    /tmp/_q3.png -geometry +${hs}+${hs} -composite \
    +repage -depth 8 "$out"
}

# ---------------------------------------------------------------------------
# normal_from <heightmap> <out> <strength>
# ---------------------------------------------------------------------------
normal_from(){
  local h="$1" out="$2" s="${3:-3.0}"
  convert "$h" -colorspace Gray -separate +swap \
    -fx "dx = u.p{1,0}.gray - u.p{-1,0}.gray; \
         dy = v.p{0,1}.gray - v.p{0,-1}.gray; \
         nx = -$s*dx; ny = -$s*dy; nz = 1; \
         l = sqrt(nx*nx + ny*ny + nz*nz); \
         (0.5*(nx/l + 1), 0.5*(ny/l + 1), 0.5*(nz/l + 1))" "$out" 2>/dev/null
}

# roughness from a grey map: <out> = clamp( map )
rough_from(){
  convert "$1" -colorspace Gray -level "${2:-25%},${3:-85%}" "$4"
}

# ===========================================================================
# ASPHALT  (fine aggregate + mottling + subtle tar cracks)
# ===========================================================================
convert -size ${S}x${S} xc:'#2b2d31' \
  -attenuate 0.55 +noise Random -colorspace Gray -evaluate multiply 0.55 \
  -fill '#26282c' -colorize 45 \
  \( -size ${S}x${S} plasma:fractal -seed 7 -colorspace Gray -blur 0x2 \) -compose overlay -composite \
  -blur 0x0.35 -modulate 100,12,100 \
  \( -size ${S}x${S} plasma:fractal -seed 21 -colorspace Gray -blur 0x6 -level 35%,65% \) \
     -compose soft-light -composite \
  -attenuate 0.9 +noise Random -blur 0x0.3 \
  /tmp/asp_raw.png
tileable /tmp/asp_raw.png "$T/asphalt.png" $S
normal_from "$T/asphalt.png" "$T/asphalt_n.png" 2.2
rough_from "$T/asphalt.png" 45% 88% "$T/asphalt_r.png"
log asphalt.png "${S}x${S} tileable +n +r"

# ===========================================================================
# ASPHALT WET (darker, glossier variant for the night city)
# ===========================================================================
convert "$T/asphalt.png" -modulate 78,90,95 -fill '#0d1a2a' -colorize 32 "$T/asphalt_wet.png"
convert "$T/asphalt_r.png" -level 0%,42% "$T/asphalt_wet_r.png"
log asphalt_wet.png "rain-slick variant"

# ===========================================================================
# CONCRETE / PAVING SLABS
# ===========================================================================
convert -size ${S}x${S} xc:'#9aa0a6' \
  -attenuate 0.35 +noise Random -colorspace Gray -evaluate multiply 0.4 -fill '#9aa0a6' -colorize 60 \
  \( -size ${S}x${S} plasma:fractal -seed 33 -colorspace Gray -blur 0x3 \) -compose soft-light -composite \
  -stroke '#6f757c' -strokewidth 3 -fill none \
  -draw "line 0,${H} ${S},${H}  line ${H},0 ${H},${S}" \
  -stroke '#868c93' -strokewidth 1 -draw "line 0,$((H+2)) ${S},$((H+2)) line $((H+2)),0 $((H+2)),${S}" \
  -attenuate 0.5 +noise Random -blur 0x0.4 \
  /tmp/con_raw.png
tileable /tmp/con_raw.png "$T/concrete.png" $S
normal_from "$T/concrete.png" "$T/concrete_n.png" 1.6
rough_from "$T/concrete.png" 55% 92% "$T/concrete_r.png"
log concrete.png "paving slabs"

# ===========================================================================
# CARBON FIBRE (twill weave)
# ===========================================================================
C=$((S/16))
convert -size ${S}x${S} xc:'#0c0d10' /tmp/cf.png
for ((y=0;y<16;y++)); do for ((x=0;x<16;x++)); do
  if (( (x+y) % 2 == 0 )); then
    convert /tmp/cf.png -stroke none -fill '#2a2d33' \
      -draw "roundRectangle $((x*C+1)),$((y*C+1)) $((x*C+C-1)),$((y*C+C-1)) 3,3" /tmp/cf.png
    convert /tmp/cf.png -stroke none -fill '#191b1f' \
      -draw "roundRectangle $((x*C+3)),$((y*C+3)) $((x*C+C-3)),$((y*C+C-3)) 2,2" /tmp/cf.png
  else
    convert /tmp/cf.png -stroke none -fill '#20232a' \
      -draw "roundRectangle $((x*C+1)),$((y*C+1)) $((x*C+C-1)),$((y*C+C-1)) 3,3" /tmp/cf.png
  fi
done; done
convert /tmp/cf.png -attenuate 0.25 +noise Random -blur 0x0.4 \
  \( -size ${S}x${S} gradient:'#ffffff'-'#4a4a4a' -rotate 90 \) -compose overlay -composite \
  "$T/carbon.png"
normal_from "$T/carbon.png" "$T/carbon_n.png" 1.1
log carbon.png "twill weave"

# ===========================================================================
# TYRE TREAD (directional V grooves)
# ===========================================================================
convert -size ${S}x${S} xc:'#15161a' \
  -attenuate 0.5 +noise Random -colorspace Gray -evaluate multiply 0.25 -fill '#17181c' -colorize 70 \
  /tmp/tt.png
for ((i=-8;i<24;i++)); do
  y=$((i*32))
  convert /tmp/tt.png -stroke '#0a0b0d' -strokewidth 13 -fill none -draw 'stroke-linecap round' \
    -draw "line -20,$((y+40)) $((S/2)),$((y+120))   line $((S+20)),$((y+40)) $((S/2)),$((y+120))" /tmp/tt.png
  convert /tmp/tt.png -stroke '#2a2c31' -strokewidth 3 -fill none \
    -draw "line -20,$((y+34)) $((S/2)),$((y+114))   line $((S+20)),$((y+34)) $((S/2)),$((y+114))" /tmp/tt.png
done
convert /tmp/tt.png -crop ${S}x${S}+0+0 +repage "$T/tire.png"
tileable "$T/tire.png" "$T/tire.png" $S
normal_from "$T/tire.png" "$T/tire_n.png" 2.6
log tire.png "directional tread"

# ===========================================================================
# BRUSHED METAL
# ===========================================================================
convert -size ${S}x${S} xc:'#8d929a' \
  -attenuate 1.1 +noise Random -colorspace Gray -evaluate multiply 0.5 \
  -motion-blur 0x16+0 -fill '#9aa0a8' -colorize 55 /tmp/met.png
convert -size ${S}x16 gradient:'#ffffff'-'#3a3a3a' /tmp/stripe.png
convert /tmp/met.png \( -size ${S}x${S} tile /tmp/stripe.png \) -compose overlay -composite \
  -attenuate 0.4 +noise Random -blur 0x0.3 /tmp/met2.png
tileable /tmp/met2.png "$T/metal.png" $S
normal_from "$T/metal.png" "$T/metal_n.png" 0.5
rough_from "$T/metal.png" 18% 48% "$T/metal_r.png"
log metal.png "brushed alloy"

# ===========================================================================
# LEATHER / ALCANTARA (interior)
# ===========================================================================
convert -size ${S}x${S} xc:'#1b1418' \
  -attenuate 0.7 +noise Random -colorspace Gray -evaluate multiply 0.35 -fill '#241a1e' -colorize 70 \
  \( -size ${S}x${S} plasma:fractal -seed 55 -colorspace Gray -blur 0x1.2 -level 25%,75% \) -compose overlay -composite \
  /tmp/lth.png
tileable /tmp/lth.png "$T/leather.png" $S
normal_from "$T/leather.png" "$T/leather_n.png" 2.0
log leather.png "interior hide"

# ===========================================================================
# WATER (height -> normal, animated in shader via two scrolling layers)
# ===========================================================================
convert -size ${S}x${S} plasma:fractal -seed 91 -colorspace Gray -blur 0x1.2 /tmp/w1.png
convert -size ${S}x${S} plasma:fractal -seed 44 -colorspace Gray -blur 0x2.4 /tmp/w2.png
convert /tmp/w1.png /tmp/w2.png -compose screen -composite -level 15%,85% /tmp/water_h.png
tileable /tmp/water_h.png "$T/water_h.png" $S
normal_from "$T/water_h.png" "$T/water_n.png" 3.4
log water_n.png "ocean normals"

# ===========================================================================
# ROAD MARKINGS ATLAS  (1024x1024, 4 quadrants: dash / solid / arrow / cross)
# ===========================================================================
R=1024; RH=512
convert -size ${R}x${R} xc:none -fill '#f2f6ff' -stroke none \
  -draw "roundRectangle 120,60 400,452 8,8" \
  -draw "rectangle 540,60 600,452" \
  -draw "polygon 800,70 940,256 800,442 740,442 880,256 740,70" \
  -draw "rectangle 700,80 760,432" \
  /tmp/lines.png
# crosswalk quadrant
convert -size ${R}x${R} xc:none -fill '#eef3ff' -stroke none /tmp/cross.png
for ((i=0;i<8;i++)); do
  convert /tmp/cross.png -fill '#eef3ff' -draw "rectangle $((60+i*120)),560 $((140+i*120)),968" /tmp/cross.png
done
convert /tmp/lines.png /tmp/cross.png -background none -compose over -composite "$T/road_lines.png"
log road_lines.png "markings atlas"

# ===========================================================================
# SKID MARK STRIP (alpha gradient ribbon)
# ===========================================================================
convert -size 256x64 xc:none \
  \( -size 256x64 gradient:'#ffffff'-'#000000' -rotate 90 \) \
  -compose CopyOpacity -composite \
  \( -size 256x64 plasma:fractal -seed 12 -colorspace Gray -blur 0x1 -level 30%,100% \) \
  -compose multiply -composite \
  -fill '#0a0a0c' -colorize 100 \
  "$T/skid.png"
log skid.png "rubber decal"

# ===========================================================================
# NEON SIGN BACKUP PANELS (in case generated art is missing)
# ===========================================================================
for pair in "a:#ff2e93:#22e1ff" "b:#22e1ff:#ffb020" "c:#9dff3c:#ff2e93"; do
  n="${pair%%:*}"; rest="${pair#*:}"; c1="${rest%%:*}"; c2="${rest#*:}"
  convert -size 384x768 xc:'#07090f' \
    -stroke "$c1" -strokewidth 9 -fill none -draw 'stroke-linecap round' \
    -draw "path 'M70,90 C160,40 250,140 320,90'   path 'M60,210 L330,210'
           path 'M90,320 C180,270 240,380 320,320'  circle 195,450 195,405
           path 'M70,560 C150,510 260,620 320,560'  path 'M60,680 L330,680'" \
    -stroke "$c2" -strokewidth 5 \
    -draw "path 'M80,150 L310,150'  path 'M110,500 L290,500'" \
    -blur 0x0.6 \
    \( +clone -background "$c1" -shadow 100x10+0+0 \) -background none -layers merge +repage \
    "$T/neon_${n}.png"
done
log neon_a/b/c.png "fallback signage"

# ===========================================================================
# CHERRY BLOSSOM CANOPY ALPHA (procedural fallback)
# ===========================================================================
convert -size ${S}x${S} xc:'#f7c8dd' \
  -attenuate 1.2 +noise Random -colorspace Gray -evaluate multiply 0.6 -fill '#f2b6d2' -colorize 65 \
  \( -size ${S}x${S} plasma:fractal -seed 77 -colorspace Gray -blur 0x2 \) -compose soft-light -composite \
  /tmp/bl.png
convert /tmp/bl.png -colorspace Gray -blur 0x1 -level 26%,62% /tmp/bl_a.png
convert /tmp/bl.png /tmp/bl_a.png -alpha off -compose CopyOpacity -composite "$T/blossom.png"
tileable /tmp/bl.png /tmp/bl2.png $S
convert /tmp/bl2.png /tmp/bl_a.png -alpha off -compose CopyOpacity -composite -resize ${S}x${S}! "$T/blossom.png"
log blossom.png "canopy alpha"

# ===========================================================================
# PETAL SPRITE (soft pink petal with alpha)
# ===========================================================================
convert -size 64x64 xc:none -fill '#ffd7ea' -stroke none \
  -draw "path 'M32,4 C50,16 58,34 32,60 C6,34 14,16 32,4 Z'" /tmp/petal.png
convert /tmp/petal.png \( +clone -background '#ff8fc0' -shadow 80x3+0+0 \) -background none -layers merge +repage \
  -resize 64x64 "$T/petal.png"
log petal.png "particle sprite"

# ===========================================================================
# SMOKE / DUST SPRITE (radial puff)
# ===========================================================================
convert -size 128x128 xc:black -fill white -stroke none -draw "circle 64,64 64,4" \
  -blur 0x18 -level 8%,88% "$T/smoke.png"
convert -size 128x128 xc:none \
  \( -size 128x128 plasma:fractal -seed 5 -colorspace Gray -blur 0x2 \) \
  \( -size 128x128 xc:black -fill white -draw "circle 64,64 64,6" -blur 0x16 \) \
  -alpha off -compose CopyOpacity -composite \
  -fill '#ffffff' -tint 100 "$T/puff.png"
log smoke.png/puff.png "particle sprites"

# ===========================================================================
# GLOW / LENS SPRITES (headlight flare, taillight, streetlamp)
# ===========================================================================
convert -size 256x256 xc:black -fill white -draw "circle 128,128 128,10" -blur 0x26 "$T/glow.png"
convert -size 256x256 xc:none \
  \( -size 256x256 gradient:white-black -rotate 90 -blur 0x6 \) \
  -compose CopyOpacity -composite "$T/streak.png"
convert -size 256x256 xc:none -fill white -stroke none \
  -draw "polygon 128,0 140,116 256,128 140,140 128,256 116,140 0,128 116,116" \
  -blur 0x3 "$T/flare_star.png"
log glow/streak/flare.png "light sprites"

# ===========================================================================
# CONTACT SHADOW (soft radial, used under cars & props)
# ===========================================================================
convert -size 256x128 xc:none -fill '#000000' -draw "ellipse 128,64 116,52 0,360" -blur 0x22 "$T/contact_shadow.png"
log contact_shadow.png "grounding decal"

# ===========================================================================
# GRADIENT / UTILITY
# ===========================================================================
convert -size 256x256 gradient:'#ffffff'-'#000000' "$T/grad_v.png"
convert -size 512x4 plasma:' #ffffff-#ffffff' -blur 0x1 "$T/line_white.png" 2>/dev/null || \
  convert -size 512x4 xc:white "$T/line_white.png"
# 1x1 white pixel (tint source)
convert -size 4x4 xc:white "$T/white.png"
# checkerboard (for debug + pit lane)
convert -size 128x128 xc:white -fill black -draw "rectangle 0,0 64,64 rectangle 64,64 128,128" "$T/checker.png"


# ===========================================================================
# OPTIMISE GENERATED PHOTO TEXTURES (grass / rock / facade / blossom)
# ===========================================================================
for f in grass rock; do
  if [ -f "$T/$f.png" ] && [ $(identify -format "%w" "$T/$f.png") -gt 512 ]; then
    tileable "$T/$f.png" /tmp/_o.png 512
    convert /tmp/_o.png -strip -define png:compression-level=9 -quality 88 "$T/$f.jpg"
    normal_from /tmp/_o.png "$T/${f}_n.png" 2.4
    rm -f "$T/$f.png"
    log "$f.jpg" "tileable photo texture + normal"
  fi
done
if [ -f "$T/facade.png" ]; then
  convert "$T/facade.png" -resize 512x1024! -strip -quality 86 "$T/facade.jpg"
  rm -f "$T/facade.png"
  log facade.jpg "night window facade"
fi

echo "  textures: $(ls -1 $T | wc -l) files, $(du -sh $T | cut -f1)"
