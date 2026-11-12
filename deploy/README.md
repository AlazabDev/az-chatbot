# AZ-Chatbot — production deployment on azab-orchestrator

Project: `/mnt/ai/az-chatbot`. Domain: `https://bot.alazab.com`.
Process manager: PM2, under the account executing `deploy.sh`. HTTP upstream: `127.0.0.1:3200`.
Probe port: `127.0.0.1:3299`. Existing Docker service at port 3100 is never stopped.

## Secret ownership and boundaries

Supabase Dashboard → Edge Function Secrets stores **encrypted secrets for Supabase Edge Functions**.
Names and SHA-256 digests in that dashboard are not plaintext secret values. They are not automatically
present in a separate Node/Nitro process run by PM2 on Ubuntu.

The current Node server contains privileged `supabaseAdmin` database queries, guest cookie signing
and Microsoft Foundry calls. Consequently, Node requires server-side runtime values until these
operations are explicitly migrated into authenticated and rate-limited Supabase Edge Functions.
Do not copy Edge secret digests into PM2, put service_role keys in `VITE_*` variables, or commit credentials.

Runtime prerequisites (values must be injected into the **same process environment** that runs PM2):

- `SUPABASE_SERVICE_ROLE_KEY` **or** `SUPABASE_SECRET_KEY` **or** `SUPABASE_SECRET_KEYS` (JSON with a `default` secret).
- `CHAT_GATEWAY_HASH_SECRET` or `THREAD_SIGNING_SECRET` (a stable real key, minimum 32 characters).
- `FOUNDRY_PROJECT_ENDPOINT`.
- `FOUNDRY_TENANT_ID`, `FOUNDRY_CLIENT_ID`, `FOUNDRY_CLIENT_SECRET` **or** `FOUNDRY_ACCESS_TOKEN`.
- Real positive billing values: `FOUNDRY_INPUT_COST_PER_1M_TOKENS`, `FOUNDRY_OUTPUT_COST_PER_1M_TOKENS`, `CHAT_DAILY_BUDGET_USD`.

`SUPABASE_URL` defaults to the verified chatbot project endpoint `https://fjojyzvulhvqeitnaenv.supabase.co`.
These requirements are verified by `bash deploy.sh check` **before** a release is built.
The published `.env` is for Vite/public config and contains example-only server values;
do not use its signing placeholders as production secrets.

## Release

```bash
cd /mnt/ai/az-chatbot
git status --short
git pull --ff-only origin main
bash -n deploy.sh
bash deploy.sh check
bash deploy.sh deploy
pm2 status
curl -i http://127.0.0.1:3200/api/health
```

To preserve locally edited `deploy.sh` before `git pull`, use:
`git stash push -m 'backup local deploy' -- deploy.sh` and review that stash later.

## Reverse proxy

The repository contains `deploy/nginx.bot.alazab.com.conf`: an HTTP bootstrap template.
Before installing, inspect existing `server_name bot.alazab.com` in `nginx -T`.
Do not overwrite an existing site. Validate with `nginx -t`, enable HTTPS with
Certbot after DNS points to the host, and test `https://bot.alazab.com/api/health`.

## Recovery

- `bash deploy.sh status`: PM2 process and local health.
- `bash deploy.sh logs`: recent PM2 logs.
- `bash deploy.sh rollback`: restore a previous successfully deployed release.
- A failed candidate probe leaves the active process untouched.

## Important: schema migrations

`supabase start` launches a **local** Supabase stack, not synchronization with the linked project.
The earliest tracked migration references tables that do not yet exist on a new local DB.
Do not run `supabase db reset` or `db push` against production to fix the deploy probe.
