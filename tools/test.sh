#!/usr/bin/env bash
# DEEPDIG · QA suite — runs the game headlessly and asserts its systems.
set -e
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "▸ systems (assertions)"
node tools/headless.js --frames=10 --script=systems | tail -2

echo "▸ sweep (every tile, mob, particle, menu must resolve its art)"
node tools/headless.js --frames=360 --script=sweep --seed=4 | grep -E "asset|no errors"

echo "▸ simulated play"
for s in mine surface deep idle; do
  printf '  %-8s ' "$s"
  node tools/headless.js --frames=600 --script=$s --seed=$RANDOM | grep -m1 "simulated"
done
echo "✅ all checks green"
