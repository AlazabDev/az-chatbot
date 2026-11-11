#!/usr/bin/env bash
# AZ-Chatbot | GitHub -> Nitro Node -> PM2 -> Nginx -> HTTPS
# Domain: bot.alazab.com | commands: deploy, rollback, status, logs, startup
set -Eeuo pipefail
umask 027

DOMAIN="${DOMAIN:-bot.alazab.com}"
REPOSITORY="${REPOSITORY:-https://github.com/AlazabDev/az-chatbot.git}"
REF="${REF:-main}"
APP_HOME="${APP_HOME:-/opt/alazab/bot}"
ENV_FILE="${ENV_FILE:-/etc/alazab/bot.env}"
APP_USER="${APP_USER:-azbot}"
APP_NAME="${APP_NAME:-alazab-bot}"
APP_PORT="${APP_PORT:-3100}"
PROBE_PORT="${PROBE_PORT:-3199}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
CERT_EMAIL="${CERT_EMAIL:-}"
MODE="${1:-deploy}"
RELEASES="$APP_HOME/releases"
CURRENT="$APP_HOME/current"
PREVIOUS="$APP_HOME/previous"
RUNNER="$APP_HOME/run-live.sh"
NGINX_CONFIG="/etc/nginx/sites-available/$APP_NAME.conf"
NGINX_LINK="/etc/nginx/sites-enabled/$APP_NAME.conf"
WEBROOT="/var/www/letsencrypt"
TMP=""; NEW_RELEASE=""; OLD_CURRENT=""; SWITCHED=0; PROBE_NAME=""

log() { printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"; }
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && ((10#$1 >= 1024 && 10#$1 <= 65535)); }
link_target() { readlink -f -- "$1" 2>/dev/null || true; }
health() {
  local port="$1" tries="${2:-20}" response
  for ((n=1;n<=tries;n++)); do
    response="$(curl --silent --show-error --fail --max-time 4 "http://127.0.0.1:${port}/api/health" 2>/dev/null || true)"
    [[ "$response" == *'"status":"ok"'* ]] && return 0
    sleep 2
  done
  return 1
}

[[ "$EUID" -eq 0 ]] || die 'Run as root with sudo on the Ubuntu hosting server.'
if grep -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease 2>/dev/null && [[ "${ALLOW_WSL_DEPLOY:-0}" != '1' ]]; then
  die 'WSL workstation detected. Execute on actual Ubuntu host, or set ALLOW_WSL_DEPLOY=1 only if WSL intentionally hosts the website.'
fi
[[ "$DOMAIN" == 'bot.alazab.com' ]] || die 'This release script supports bot.alazab.com only.'
[[ "$APP_NAME" =~ ^[a-zA-Z0-9_-]+$ && "$APP_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || die 'Invalid app name or user.'
[[ "$REF" =~ ^[a-zA-Z0-9._/-]+$ && "$REF" != -* ]] || die 'Invalid git ref.'
[[ "$APP_HOME" == /* && "$APP_HOME" != / && "$APP_HOME" != *'..'* ]] || die 'Unsafe APP_HOME.'
[[ "$ENV_FILE" == /* && "$ENV_FILE" != *'..'* ]] || die 'Unsafe ENV_FILE.'
valid_port "$APP_PORT" && valid_port "$PROBE_PORT" && [[ "$APP_PORT" != "$PROBE_PORT" ]] || die 'Invalid or duplicate app ports.'
[[ "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]] || die 'KEEP_RELEASES must be a positive integer.'
need node; need pm2; need runuser; need curl; need readlink
NODE_BIN="$(command -v node)"; PM2_BIN="$(command -v pm2)"
NODE_PATH="$(dirname "$NODE_BIN")"
# Never run the PM2 daemon as root. Its persistent HOME is managed by azbot.
if ! id "$APP_USER" >/dev/null 2>&1; then
  [[ "$MODE" == deploy || "$MODE" == startup ]] || die 'App user has not been created yet.'
  need useradd
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
APP_USER_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
[[ -n "$APP_USER_HOME" ]] || die 'Cannot resolve app user home.'
PM2_HOME="$APP_USER_HOME/.pm2"
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$PM2_HOME"
app_pm2() {
  runuser -u "$APP_USER" -- env \
    HOME="$APP_USER_HOME" PM2_HOME="$PM2_HOME" \
    PATH="$NODE_PATH:/usr/local/bin:/usr/bin:/bin" \
    "$PM2_BIN" "$@"
}
runuser -u "$APP_USER" -- "$NODE_BIN" --version >/dev/null 2>&1 || die "Node is inaccessible to $APP_USER: $NODE_BIN. Install system-wide Node rather than root-only nvm."
app_pm2 --version >/dev/null 2>&1 || die "PM2 is inaccessible to $APP_USER. Install PM2 system-wide: sudo npm install -g pm2"

check_env() {
  [[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE. Copy bot-alazab.env.example and supply actual credentials."
  [[ "$(stat -c '%u' "$ENV_FILE")" == 0 ]] || die 'Environment file must be owned by root.'
  # A dedicated runtime group is allowed to read the secrets; world access is denied.
  chgrp "$APP_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  local key
  for key in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY THREAD_SIGNING_SECRET CHAT_GATEWAY_HASH_SECRET FOUNDRY_PROJECT_ENDPOINT FOUNDRY_INPUT_COST_PER_1M_TOKENS FOUNDRY_OUTPUT_COST_PER_1M_TOKENS CHAT_DAILY_BUDGET_USD; do
    [[ -n "${!key:-}" ]] || die "Missing $key in $ENV_FILE"
    [[ "${!key}" != REPLACE_* ]] || die "Placeholder remains for $key in $ENV_FILE"
  done
  [[ "${#THREAD_SIGNING_SECRET}" -ge 32 && "${#CHAT_GATEWAY_HASH_SECRET}" -ge 32 ]] || die 'Signing keys must be >= 32 chars.'
  [[ -n "${FOUNDRY_ACCESS_TOKEN:-}" || ( -n "${FOUNDRY_TENANT_ID:-}" && -n "${FOUNDRY_CLIENT_ID:-}" && -n "${FOUNDRY_CLIENT_SECRET:-}" ) ]] || die 'Missing Foundry Entra credentials.'
  for key in FOUNDRY_INPUT_COST_PER_1M_TOKENS FOUNDRY_OUTPUT_COST_PER_1M_TOKENS CHAT_DAILY_BUDGET_USD; do
    [[ "${!key}" =~ ^[0-9]+([.][0-9]+)?$ && "${!key}" != 0 && "${!key}" != 0.0 ]] || die "Invalid positive USD rate: $key"
  done
}
