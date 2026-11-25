#!/usr/bin/env sh
set -eu
python3 tests/validate_source.py
node tests/games_smoke.cjs games.js
python3 -m py_compile build_standalone.py
