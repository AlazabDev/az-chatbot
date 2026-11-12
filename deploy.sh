#!/usr/bin/env bash
# AZ-Chatbot PM2 deployment, source /mnt/ai/az-chatbot, domain ${APP_DOMAIN:-chatbot.alazab.com}.
# Reverse proxy / HTTPS are managed separately. No secret files are generated.
set -Eeuo pipefail
umask 027
ROOT=${ROOT:-/mnt/ai/az-chatbot}
APP_DOMAIN=${APP_DOMAIN:-chatbot.alazab.com}
NAME=alazab-bot
LIVE_PORT=${LIVE_PORT:-3200}
TEST_PORT=${TEST_PORT:-3299}
BASE=$ROOT/.deploy
RELEASES=$BASE/releases
CURRENT=$BASE/current
PREVIOUS=$BASE/previous
MODE=deploy
if (($#)); then MODE=$1; fi
WORKTREE=""
PROBE=""
OLD=""
SWITCHED=0
log(){ printf '[AZ-BOT] %s\n' "$*"; }
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null || die "Missing command: $1"; }
link_target(){ [[ -L "$1" ]] && readlink -f "$1" || true; }
valid(){ [[ -n "$1" && -f "$1/server/index.mjs" ]]; }
point_to(){ ln -sfn "$2" "$1.next"; mv -Tf "$1.next" "$1"; }
health(){
  local port=$1 retries=20 i result
  for ((i=0;i<retries;i++)); do
    result=$(curl -fsS --max-time 4 "http://127.0.0.1:$port/api/health" 2>/dev/null || true)
    [[ "$result" == *'"status":"ok"'* ]] && return 0
    sleep 2
  done
  return 1
}
start_app(){
  local app=$1 dir=$2 port=$3
  valid "$dir" || die "Node Nitro entrypoint missing: $dir"
  HOST=127.0.0.1 NITRO_HOST=127.0.0.1 PORT="$port" NITRO_PORT="$port" NODE_ENV=production \
    pm2 start "$dir/server/index.mjs" --name "$app" --interpreter "$(command -v node)" --cwd "$dir" --time
}
restore(){
  pm2 delete "$NAME" >/dev/null 2>&1 || true
  if valid "$OLD"; then
    point_to "$CURRENT" "$OLD"
    start_app "$NAME" "$OLD" "$LIVE_PORT" || return 1
    health "$LIVE_PORT" || log 'WARNING: previous release unhealthy'
  else
    rm -f "$CURRENT"
  fi
}
cleanup(){
  local rc=$?
  trap - EXIT
  [[ -z "$PROBE" ]] || pm2 delete "$PROBE" >/dev/null 2>&1 || true
  if [[ -n "$WORKTREE" && -d "$WORKTREE" ]]; then
    git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  fi
  if ((rc!=0 && SWITCHED==1)); then restore || true; fi
  exit "$rc"
}
trap cleanup EXIT
for x in git node bun pm2 curl readlink awk; do need "$x"; done
[[ -d "$ROOT/.git" || -f "$ROOT/.git" ]] || die "Missing checkout: $ROOT"
mkdir -p "$RELEASES"
log "PM2 account: $(id -un) / $HOME/.pm2"
# Supabase Edge secrets do not automatically become PM2 environment variables.
# Refuse an unconfigured production release before spending time on a build.
check_runtime(){
  local missing=() name value
  if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -z "${SUPABASE_SECRET_KEY:-}" && -z "${SUPABASE_SECRET_KEYS:-}" ]]; then
    missing+=("SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY / SUPABASE_SECRET_KEYS")
  fi
  local signing="${CHAT_GATEWAY_HASH_SECRET:-${THREAD_SIGNING_SECRET:-}}"
  if ((${#signing}<32)) || [[ "$signing" == *"REPLACE"* || "$signing" == *"replace"* || "$signing" == *"example"* ]]; then
    missing+=("CHAT_GATEWAY_HASH_SECRET / THREAD_SIGNING_SECRET (real >=32 characters)")
  fi
  if [[ -z "${FOUNDRY_PROJECT_ENDPOINT:-}" ]]; then missing+=("FOUNDRY_PROJECT_ENDPOINT"); fi
  if [[ -z "${FOUNDRY_ACCESS_TOKEN:-}" && ( -z "${FOUNDRY_TENANT_ID:-}" || -z "${FOUNDRY_CLIENT_ID:-}" || -z "${FOUNDRY_CLIENT_SECRET:-}" ) ]]; then
    missing+=("FOUNDRY_TENANT_ID + FOUNDRY_CLIENT_ID + FOUNDRY_CLIENT_SECRET (or FOUNDRY_ACCESS_TOKEN)")
  fi
  for name in FOUNDRY_INPUT_COST_PER_1M_TOKENS FOUNDRY_OUTPUT_COST_PER_1M_TOKENS CHAT_DAILY_BUDGET_USD; do
    value="${!name:-}"
    if ! [[ "$value" =~ ^[0-9]+([.][0-9]+)?$ ]] || ! awk -v x="$value" 'BEGIN { exit !(x > 0) }'; then
      missing+=("$name (positive USD number)")
    fi
  done
  if ((${#missing[@]})); then
    printf "Missing PM2 runtime inputs (names only):\n" >&2
    printf " - %s\n" "${missing[@]}" >&2
    printf "Edge Function secret digests cannot be used as plaintext values in Node.\n" >&2
    return 1
  fi
}
port_available(){
  local port=$1
  if command -v ss >/dev/null 2>&1 && ss -H -ltn "sport = :$port" | grep -q .; then
    log "Port $port is occupied: existing service untouched"
    return 1
  fi
}
case "$MODE" in
  status)
    pm2 describe "$NAME" || true
    curl -i --max-time 7 "http://127.0.0.1:$LIVE_PORT/api/health" || true
    printf '\ncurrent=%s\nprevious=%s\n' "$(link_target "$CURRENT")" "$(link_target "$PREVIOUS")"
    exit 0 ;;
  logs) pm2 logs "$NAME" --lines 70 --nostream; exit 0 ;;
  rollback)
    fallback=$(link_target "$PREVIOUS")
    valid "$fallback" || die 'No previous release'
    check_runtime || die 'Runtime inputs missing; rollback not attempted'
    OLD=$(link_target "$CURRENT")
    SWITCHED=1
    pm2 delete "$NAME" >/dev/null 2>&1 || true
    point_to "$CURRENT" "$fallback"
    start_app "$NAME" "$fallback" "$LIVE_PORT"
    health "$LIVE_PORT" || die 'Rollback failed, restoring old release'
    SWITCHED=0
    if valid "$OLD"; then point_to "$PREVIOUS" "$OLD"; fi
    pm2 save --force >/dev/null
    log 'Rollback healthy'
    exit 0 ;;
  check) check_runtime && log "Runtime prerequisites present"; exit 0 ;;
  deploy) ;;
  *) die 'Usage: bash deploy.sh [deploy|check|status|logs|rollback]' ;;
esac
# Deployment must run the same checks as rollback before fetching/building code.
check_runtime || die 'Missing runtime inputs: deployment not attempted'
port_available "$TEST_PORT" || die 'Probe port occupied'
OLD=$(link_target "$CURRENT")
if ! pm2 describe "$NAME" >/dev/null 2>&1; then
  port_available "$LIVE_PORT" || die 'Live port occupied by another process'
fi
if pm2 describe "$NAME" >/dev/null 2>&1 && ! valid "$OLD"; then
  die "Refusing to overwrite unmanaged PM2 process $NAME"
fi
git -C "$ROOT" fetch --quiet origin main
COMMIT=$(git -C "$ROOT" rev-parse --verify 'origin/main^{commit}')
SHORT=$(printf '%s' "$COMMIT" | cut -c1-12)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORKTREE=$BASE/worktree-$STAMP-$$
NEW=$RELEASES/$STAMP-$SHORT
git -C "$ROOT" worktree add --quiet --detach "$WORKTREE" "$COMMIT"
log "Building $SHORT as Nitro node_server (local checkout untouched)"
export APP_BASE_URL=${APP_BASE_URL:-https://$APP_DOMAIN}
export SUPABASE_URL=${SUPABASE_URL:-https://fjojyzvulhvqeitnaenv.supabase.co}
(
  cd "$WORKTREE"
  bun install --frozen-lockfile
  NITRO_PRESET=node_server bun run build
  [[ -s .output/server/index.mjs ]] || die 'Node server build artifact missing'
  bunx tsc --noEmit
  bun run lint
  bun run test
)
mkdir -p "$NEW"
cp -a "$WORKTREE/.output/." "$NEW/"
valid "$NEW" || die 'Invalid release'
git -C "$ROOT" worktree remove --force "$WORKTREE"
WORKTREE=""
PROBE_CANDIDATE=$NAME-probe-$SHORT
pm2 describe "$PROBE_CANDIDATE" >/dev/null 2>&1 && die 'Probe process already exists'
PROBE=$PROBE_CANDIDATE
start_app "$PROBE" "$NEW" "$TEST_PORT"
if ! health "$TEST_PORT"; then
  pm2 logs "$PROBE" --lines 50 --nostream >&2 || true
  die 'Probe /api/health FAILED. Existing service unchanged. Check runtime config.'
fi
pm2 delete "$PROBE" >/dev/null 2>&1 || true
PROBE=""
log 'Candidate healthy'
if valid "$OLD"; then point_to "$PREVIOUS" "$OLD"; fi
SWITCHED=1
pm2 delete "$NAME" >/dev/null 2>&1 || true
point_to "$CURRENT" "$NEW"
start_app "$NAME" "$NEW" "$LIVE_PORT"
if ! health "$LIVE_PORT"; then
  pm2 logs "$NAME" --lines 50 --nostream >&2 || true
  die 'Live health FAILED; restoring old release'
fi
SWITCHED=0
pm2 save --force >/dev/null
log "SUCCESS $SHORT; $APP_DOMAIN -> 127.0.0.1:$LIVE_PORT (Nginx separate)"
# END AZ-CHATBOT PM2 DEPLOY
