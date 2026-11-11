#!/usr/bin/env bash
# AZ-Chatbot deploy: existing /mnt/ai/az-chatbot checkout -> Nitro Node -> PM2
# Domain: bot.alazab.com (reverse proxy is managed independently)
set -Eeuo pipefail
umask 027

PROJECT_DIR="${PROJECT_DIR:-/mnt/ai/az-chatbot}"
DOMAIN="bot.alazab.com"
APP_NAME="${APP_NAME:-alazab-bot}"
APP_PORT="${APP_PORT:-3100}"
PROBE_PORT="${PROBE_PORT:-3199}"
REF="${REF:-origin/main}"
KEEP_RELEASES="${KEEP_RELEASES:-4}"
MODE="${1:-deploy}"
DEPLOY_DIR="$PROJECT_DIR/.deploy"
RELEASES="$DEPLOY_DIR/releases"
CURRENT="$DEPLOY_DIR/current"
PREVIOUS="$DEPLOY_DIR/previous"
BUILD_DIR=""
PROBE_NAME=""
NEW_RELEASE=""
OLD_RELEASE=""
SWITCHED=0

log() { printf '[AZ-BOT %s] %s\n' "$(date -u +'%F %T UTC')" "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Command not installed: $1"; }
link_target() { readlink -f "$1" 2>/dev/null || true; }
health() {
  local port="$1" count="${2:-25}" i body
  for ((i=1;i<=count;i++)); do
    body="$(curl -fsS --connect-timeout 2 --max-time 4 "http://127.0.0.1:${port}/api/health" 2>/dev/null || true)"
    if [[ "$body" == *'"status":"ok"'* ]]; then return 0; fi
    sleep 2
  done
  return 1
}

# PM2 controls processes per Unix account. Root is intentionally supported on
# azab-orchestrator, where the operator invokes this script as root.
# Do not silently switch accounts: root PM2 and user PM2 are separate process lists.
log "PM2 owner: $(id -un) (uid=$EUID), PM2_HOME=${PM2_HOME:-$HOME/.pm2}"
[[ "$PROJECT_DIR" == /mnt/ai/az-chatbot ]] || fail 'Unexpected project path; expected /mnt/ai/az-chatbot.'
[[ "$APP_NAME" =~ ^[a-zA-Z0-9._-]+$ ]] || fail 'Invalid APP_NAME.'
[[ "$APP_PORT" =~ ^[0-9]+$ && "$PROBE_PORT" =~ ^[0-9]+$ ]] || fail 'Invalid ports.'
(( APP_PORT >= 1024 && APP_PORT <= 65535 && PROBE_PORT >= 1024 && PROBE_PORT <= 65535 )) || fail 'Port out of range.'
[[ "$APP_PORT" != "$PROBE_PORT" ]] || fail 'Live and probe ports cannot be equal.'
[[ "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]] || fail 'KEEP_RELEASES must be a positive integer.'
require git; require node; require bun; require pm2; require curl; require readlink
[[ -d "$PROJECT_DIR/.git" || -f "$PROJECT_DIR/.git" ]] || fail "Git repository missing: $PROJECT_DIR"
[[ -w "$PROJECT_DIR" ]] || fail "Project directory isn't writable: $PROJECT_DIR"
mkdir -p "$RELEASES"

# Never fetch, build, or alter the live tree for read-only commands.
case "$MODE" in
  status)
    pm2 describe "$APP_NAME" || true
    printf '\nLocal /api/health: '
    curl -fsS --max-time 6 "http://127.0.0.1:${APP_PORT}/api/health" || true
    printf '\nCurrent release: %s\n' "$(link_target "$CURRENT")"
    exit 0 ;;
  logs) pm2 logs "$APP_NAME" --lines 100 --nostream; exit 0 ;;
  rollback)
    [[ -L "$PREVIOUS" ]] || fail 'No previous release available.'
    new_target="$(link_target "$PREVIOUS")"
    [[ -f "$new_target/server/index.mjs" ]] || fail 'Saved release is not executable.'
    old_target="$(link_target "$CURRENT")"
    # Do not replace PM2 until we have confirmed the old build exists.
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
    ln -sfn "$new_target" "$CURRENT.next"; mv -Tf "$CURRENT.next" "$CURRENT"
    HOST=127.0.0.1 NITRO_HOST=127.0.0.1 PORT="$APP_PORT" NITRO_PORT="$APP_PORT" NODE_ENV=production \
      pm2 start "$CURRENT/server/index.mjs" --name "$APP_NAME" --interpreter "$(command -v node)" --cwd "$CURRENT" --time
    if ! health "$APP_PORT" 25; then
      pm2 logs "$APP_NAME" --lines 40 --nostream >&2 || true
      if [[ -f "$old_target/server/index.mjs" ]]; then
        pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
        ln -sfn "$old_target" "$CURRENT.next"; mv -Tf "$CURRENT.next" "$CURRENT"
        HOST=127.0.0.1 NITRO_HOST=127.0.0.1 PORT="$APP_PORT" NITRO_PORT="$APP_PORT" NODE_ENV=production \
          pm2 start "$CURRENT/server/index.mjs" --name "$APP_NAME" --interpreter "$(command -v node)" --cwd "$CURRENT" --time || true
      fi
      fail 'Rollback health check failed. Attempted restoration of original release.'
    fi
    [[ -n "$old_target" && -d "$old_target" ]] && { ln -sfn "$old_target" "$PREVIOUS.next"; mv -Tf "$PREVIOUS.next" "$PREVIOUS"; }
    pm2 save --force >/dev/null
    log "Rollback OK -> $(link_target "$CURRENT")"
    exit 0 ;;
  deploy) ;;
  *) fail 'Usage: bash deploy-bot-pm2.sh [deploy|status|logs|rollback]' ;;
esac

cleanup() {
  local exit_status="$?"
  trap - EXIT
  if [[ -n "$PROBE_NAME" ]]; then pm2 delete "$PROBE_NAME" >/dev/null 2>&1 || true; fi
  if [[ -n "$BUILD_DIR" && -d "$BUILD_DIR/src" ]]; then
    git -C "$PROJECT_DIR" worktree remove --force "$BUILD_DIR/src" >/dev/null 2>&1 || true
  fi
  if [[ -n "$BUILD_DIR" && -d "$BUILD_DIR" ]]; then rm -rf -- "$BUILD_DIR"; fi
  if (( exit_status != 0 && SWITCHED == 1 )) && [[ -n "$OLD_RELEASE" && -f "$OLD_RELEASE/server/index.mjs" ]]; then
    log 'Promotion failed: restoring previous release'
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
    ln -sfn "$OLD_RELEASE" "$CURRENT.next" && mv -Tf "$CURRENT.next" "$CURRENT"
    HOST=127.0.0.1 NITRO_HOST=127.0.0.1 PORT="$APP_PORT" NITRO_PORT="$APP_PORT" NODE_ENV=production \
      pm2 start "$CURRENT/server/index.mjs" --name "$APP_NAME" --interpreter "$(command -v node)" --cwd "$CURRENT" --time || true
  fi
  exit "$exit_status"
}
trap cleanup EXIT

log "Project: $PROJECT_DIR | domain: $DOMAIN | PM2: $APP_NAME"
log "Fetching reference $REF without resetting local changes"
git -C "$PROJECT_DIR" fetch --prune origin main
COMMIT="$(git -C "$PROJECT_DIR" rev-parse --verify "${REF}^{commit}")"
BUILD_DIR="$(mktemp -d -t alazab-bot.XXXXXXXX)"
git -C "$PROJECT_DIR" worktree add --detach "$BUILD_DIR/src" "$COMMIT" >/dev/null
log "Building commit ${COMMIT:0:12} in an isolated worktree"
(
  cd "$BUILD_DIR/src"
  bun install --frozen-lockfile
  NITRO_PRESET=node_server bun run build
  [[ -s .output/server/index.mjs ]] || fail 'Node Nitro entry missing (.output/server/index.mjs); check preset, no live change was made.'
  bunx tsc --noEmit
  bun run lint
  bun run test
)
NEW_RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%SZ)-${COMMIT:0:12}"
mkdir -p "$NEW_RELEASE"
cp -a "$BUILD_DIR/src/.output/." "$NEW_RELEASE/"
[[ -s "$NEW_RELEASE/server/index.mjs" ]] || fail 'Release entrypoint is missing.'

# Fresh PM2 candidate inherits the invoking shell's EXISTING environment. No new
# local secret file is created and Supabase Edge secrets are never exported.
# The Node server still needs its own server-side environment; readiness verifies it.
PROBE_NAME="${APP_NAME}-probe-${COMMIT:0:8}"
log "Starting candidate: 127.0.0.1:$PROBE_PORT"
HOST=127.0.0.1 NITRO_HOST=127.0.0.1 PORT="$PROBE_PORT" NITRO_PORT="$PROBE_PORT" NODE_ENV=production \
  pm2 start "$NEW_RELEASE/server/index.mjs" --name "$PROBE_NAME" --interpreter "$(command -v node)" --cwd "$NEW_RELEASE" --no-autorestart --time >/dev/null
if ! health "$PROBE_PORT" 25; then
  pm2 logs "$PROBE_NAME" --lines 40 --nostream >&2 || true
  fail 'Candidate /api/health FAILED. Verify Node runtime configuration; Supabase Edge secrets are not automatically inherited by Node/PM2.'
fi
pm2 delete "$PROBE_NAME" >/dev/null
PROBE_NAME=""
log 'Candidate health passed'

OLD_RELEASE="$(link_target "$CURRENT")"
# NOTE: PM2 is restarted so it always executes the new absolute release via current symlink.
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
ln -sfn "$NEW_RELEASE" "$CURRENT.next"; mv -Tf "$CURRENT.next" "$CURRENT"
SWITCHED=1
HOST=127.0.0.1 NITRO_HOST=127.0.0.1 PORT="$APP_PORT" NITRO_PORT="$APP_PORT" NODE_ENV=production \
  pm2 start "$CURRENT/server/index.mjs" --name "$APP_NAME" --interpreter "$(command -v node)" --cwd "$CURRENT" --time >/dev/null
health "$APP_PORT" 25 || fail 'Production app did not become healthy after switch.'
if [[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
  ln -sfn "$OLD_RELEASE" "$PREVIOUS.next"; mv -Tf "$PREVIOUS.next" "$PREVIOUS"
fi
pm2 save --force >/dev/null
SWITCHED=0
log "SUCCESS: $DOMAIN -> 127.0.0.1:$APP_PORT (commit $COMMIT). Reverse-proxy/DNS remain independently managed."
# Safely keep recent builds without removing the current or previous release.
mapfile -t OLD_RELEASES < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n +"$((KEEP_RELEASES+1))")
for name in "${OLD_RELEASES[@]}"; do
  candidate="$RELEASES/$name"
  [[ "$candidate" != "$(link_target "$CURRENT")" && "$candidate" != "$(link_target "$PREVIOUS")" ]] && rm -rf -- "$candidate"
done

# END OF AZ-BOT PM2 DEPLOY SCRIPT
