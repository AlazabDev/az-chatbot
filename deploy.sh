systemctl restart "$SERVICE"
  health "$APP_PORT" 15 || die 'Rollback attempted, but readiness failed; inspect journalctl'
  log 'Rollback healthy'
}

cleanup(){ [[ -z "$TMP" || ! -d "$TMP" ]] || rm -rf -- "$TMP"; }
on_exit(){
  local status="$1"
  if ((status != 0 && SWITCHED)) && [[ -n "$OLD_CURRENT" && -f "$OLD_CURRENT/server/index.mjs" ]]; then
    log 'Deployment failed after switch; reverting to previous release'
    ln -sfn "$OLD_CURRENT" "$CURRENT.rollback"
    mv -Tf "$CURRENT.rollback" "$CURRENT"
    systemctl restart "$SERVICE" || true
  fi
  if [[ -n "$CANDIDATE_UNIT" ]]; then
    systemctl stop "$CANDIDATE_UNIT" >/dev/null 2>&1 || true
  fi
  cleanup
}
trap 'on_exit $?' EXIT

case "$MODE" in
  rollback)
    rollback
    exit 0
    ;;
  status)
    systemctl --no-pager --full status "$SERVICE" || true
    curl --silent --show-error --max-time 10 "http://127.0.0.1:$APP_PORT/api/health" || true
    exit 0
    ;;
  deploy) ;;
  *) die 'Usage: deploy-bot-alazab.sh [deploy|rollback|status]' ;;
esac

need git; need bun; need node; need systemd-run; need runuser
# Prevent first-deployment TLS validation failure after the live symlink is switched.
if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
  need certbot
  [[ -n "$EMAIL" ]] || die 'Set CERT_EMAIL before the first deployment of this domain'
fi
[[ $(node --version) =~ ^v(22|24|26)\. ]] || die 'Node 22/24/26 required'
install -d -m 0755 -o root -g root "$APP_HOME" "$RELEASES"
node_bin=$(command -v node)
runuser -u www-data -- "$node_bin" --version >/dev/null 2>&1 || die "Node binary is inaccessible to www-data: $node_bin"
TMP=$(mktemp -d -t az-bot-build.XXXXXXXX)
log "Fetching $REPOSITORY ($REF)"
git clone --quiet --depth 1 --branch "$REF" "$REPOSITORY" "$TMP/repo" || die 'Git clone failed'
COMMIT=$(git -C "$TMP/repo" rev-parse --verify HEAD)
SHORT=${COMMIT:0:12}
NEW_RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%SZ)-$SHORT"
log "Building immutable release $SHORT for Node server"
(
  cd "$TMP/repo"
  bun install --frozen-lockfile
  NITRO_PRESET=node_server bun run build
  [[ -s .output/server/index.mjs ]] || die 'Build is not a runnable Node Nitro bundle. Check Lovable Vite wrapper / Nitro preset; no live switch was performed.'
  bunx tsc --noEmit
  bun run lint
  bun run test
)
install -d -m 0750 -o www-data -g www-data "$NEW_RELEASE"
cp -a "$TMP/repo/.output/." "$NEW_RELEASE/"
chown -R www-data:www-data "$NEW_RELEASE"
chmod -R go-w "$NEW_RELEASE"

# Test candidate in a transient systemd unit with the same root-readable secrets,
# without exposing credentials in process command-line arguments.
log "Starting isolated candidate at $PROBE_PORT"
CANDIDATE_UNIT="${SERVICE}-probe-${SHORT}"
systemd-run --quiet --unit="$CANDIDATE_UNIT" \
  --property="User=www-data" --property="Group=www-data" \
  --property="EnvironmentFile=$ENV_FILE" \
  --property="WorkingDirectory=$NEW_RELEASE" \
  --setenv=NODE_ENV=production --setenv=HOST=127.0.0.1 \
  --setenv=PORT="$PROBE_PORT" --setenv=NITRO_HOST=127.0.0.1 \
  --setenv=NITRO_PORT="$PROBE_PORT" \
  "$node_bin" "$NEW_RELEASE/server/index.mjs"
if ! health "$PROBE_PORT" 20; then
  journalctl --no-pager -u "$CANDIDATE_UNIT" -n 25 >&2 || true
  systemctl stop "$CANDIDATE_UNIT" >/dev/null 2>&1 || true
  die 'Candidate did not pass /api/health. Live service untouched.'
fi
systemctl stop "$CANDIDATE_UNIT" >/dev/null 2>&1 || true
log 'Candidate readiness PASSED'

OLD_CURRENT=$(link_target "$CURRENT")
write_systemd
if [[ ! -e "$NGINX_AVAILABLE" ]]; then write_nginx_http; fi
if [[ -n "$OLD_CURRENT" && -d "$OLD_CURRENT" ]]; then
  ln -sfn "$OLD_CURRENT" "$PREVIOUS.next"; mv -Tf "$PREVIOUS.next" "$PREVIOUS"
fi
ln -sfn "$NEW_RELEASE" "$CURRENT.next"; mv -Tf "$CURRENT.next" "$CURRENT"
SWITCHED=1
systemctl restart "$SERVICE"
health "$APP_PORT" 20 || die 'Active release did not become healthy'
log "Live Node service healthy: $COMMIT"

# TLS setup is a one-time operation; service is already healthy on localhost.
if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
  init_proxy
else
  write_nginx_tls
fi
curl --silent --show-error --fail --max-time 15 "https://$DOMAIN/api/health" | grep -q '"status":"ok"' || die 'HTTPS health check failed'
log "SUCCESS: https://$DOMAIN (commit $COMMIT)"
SWITCHED=0
# Do not remove release currently in use, previous release, or any unknown symlink target.
mapfile -t OLD_RELEASES < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n +"$((KEEP_RELEASES+1))")
for name in "${OLD_RELEASES[@]}"; do
  candidate="$RELEASES/$name"
  [[ "$candidate" != "$(link_target "$CURRENT")" && "$candidate" != "$(link_target "$PREVIOUS")" ]] && rm -rf -- "$candidate"
done
