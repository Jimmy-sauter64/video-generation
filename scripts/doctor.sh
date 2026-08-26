#!/usr/bin/env bash

set -u

checks_run=0
failed=0

pass() {
  checks_run=$((checks_run + 1))
  printf 'PASS: %s\n' "$1"
}

fail() {
  checks_run=$((checks_run + 1))
  failed=$((failed + 1))
  printf 'FAIL: %s\n' "$1"
}

if command -v node >/dev/null 2>&1; then
  node_version="$(node --version 2>/dev/null || true)"
  if [[ "$node_version" =~ ^v?([0-9]+) ]] && (( BASH_REMATCH[1] >= 20 )); then
    pass "node >=20 ($node_version)"
  else
    fail "node >=20 (found ${node_version:-unreadable})"
  fi
else
  fail 'node >=20 (node not found)'
fi

if command -v pnpm >/dev/null 2>&1; then
  pass 'pnpm on PATH'
else
  fail 'pnpm on PATH'
fi

has_media_tool() {
  command -v "$1" >/dev/null 2>&1 || [[ -x "$HOME/.local/bin/$1" ]]
}

if has_media_tool ffmpeg; then
  pass 'ffmpeg on PATH or ~/.local/bin'
else
  fail 'ffmpeg on PATH or ~/.local/bin'
fi

if has_media_tool ffprobe; then
  pass 'ffprobe on PATH or ~/.local/bin'
else
  fail 'ffprobe on PATH or ~/.local/bin'
fi

if node -e "require.resolve('@revideo/core')" >/dev/null 2>&1; then
  pass '@revideo/core resolvable'
else
  fail '@revideo/core resolvable'
fi

required_dirs=(
  src/brand src/scenes src/components src/schemas
  assets/brand assets/music assets/library
  briefs videos out scripts
)
missing_dirs=()
for dir in "${required_dirs[@]}"; do
  [[ -d "$dir" ]] || missing_dirs+=("$dir")
done

if (( ${#missing_dirs[@]} == 0 )); then
  pass 'required directories exist'
else
  fail "required directories exist (missing: ${missing_dirs[*]})"
fi

required_scripts=(
  scripts/new-video.ts scripts/approve.ts scripts/render-plan.ts scripts/mix.sh
)
missing_scripts=()
for script in "${required_scripts[@]}"; do
  [[ -f "$script" ]] || missing_scripts+=("$script")
done
if (( ${#missing_scripts[@]} == 0 )); then
  pass 'pipeline scripts exist'
else
  fail "pipeline scripts exist (missing: ${missing_scripts[*]})"
fi
if [[ -z "$(find assets/music -mindepth 1 ! -name '.gitkeep' -print -quit 2>/dev/null)" ]]; then
  printf 'WARN: assets/music is empty; final renders will stay silent\n'
else
  pass 'assets/music contains media'
fi

printf '%d checks run, %d failed\n' "$checks_run" "$failed"

if (( failed > 0 )); then
  exit 1
fi
