# AZ-Chatbot production closure: release and rollback

## State of the candidate
The production-closure changes live in a review branch until the hosting provider, staging
origin and runtime credentials are verified. **A passing Build/Vitest does not authorize deployment.**
Use the same commit SHA for staging, production, and rollback.

## Required server configuration before a release
- `CHAT_GATEWAY_HASH_SECRET`: server-only signing key (at least 32 chars). Do not rotate without a session migration.
- `THREAD_SIGNING_SECRET`: stable key for signed Foundry conversation IDs.
- `FOUNDRY_INPUT_COST_PER_1M_TOKENS`, `FOUNDRY_OUTPUT_COST_PER_1M_TOKENS`: positive USD amounts, based on the actual deployed Foundry model's billable rates. Do not guess these.
- `CHAT_DAILY_BUDGET_USD`: daily guest-chat reserve ceiling (positive, at most 500 USD). If unset, the code defaults to a conservative 5 USD daily ceiling.
- Supabase URL and server-side service-role key. The service-role key must never be included in browser assets.
- Foundry Entra tenant, client and client secret, or a valid short-lived access token.
- Optional `CHAT_TRUSTED_IP_HEADER`, only if a trusted ingress strips client-supplied IP headers and re-adds one verified header.

**Fail-closed check:** `GET /api/health` returns 503 until guest signing, positive model pricing and budget RPC are configured. This is intentional.

## Migrations and security preflight
Check `chat_gateway_quota`, `chat_gateway_budget`, `chat_gateway_reservations`,
`chat_gateway_alerts`, `chat_guest_state` and `chat_gateway_usage`.
The new cost and history migrations were applied to the linked Supabase project, and generated types refreshed.
Check function EXECUTE privileges: only `service_role` may invoke reserve/finalize/history RPCs.
The `az_chat_guest_retention` pg_cron job purges guest chat state after 30 days
and request counter rows after 48 hours. Cost and billing audit tables are not purged by that job.

## CI and browser testing
1. The **Chatbot Quality Gate** builds, typechecks, lints the changed critical paths and runs Vitest.
2. Full-repository legacy ESLint remains a **non-blocking audit** with outstanding formatting/typing debt. Do not report it as clean.
3. **Chatbot Browser E2E** runs Chromium against an isolated local Nitro preview. It checks the guest help UI,
   malformed API input, and cross-origin denial; direct private-agent denial is tested against
   a configured staging Supabase origin, not a credential-less local preview.
4. In GitHub **staging** environment, configure `CHATBOT_STAGING_URL` to a real **non-production HTTPS** origin.
   Run **Chatbot Staging Smoke Test** manually; this runs browser checks and probes `/api/health`, `/help`, and `/embed.js`.
5. For release approval, independently exercise one genuine Foundry text answer, one guest image,
   one guest PDF, guest speech fallback, account-protected document upload and cross-visitor thread isolation.
   Check the provider's billed token usage and RLS/authorization failures. These tests must use staging credentials.

## Production promotion and rollback
1. Record the current live deployment SHA and environment configuration. Confirm that staging is green for the candidate SHA.
2. The GitHub CI workflow stores `chatbot-build-<sha>` with Nitro `.output/` for 14 days. This is a rollback artifact,
   **not** a completed deployment.
3. Promote that SHA using the hosting provider's verified deployment path; do not infer whether this app is hosted on Vercel,
   Cloudflare or another runtime solely from its build config.
4. Run production readiness and a single controlled guest request, then verify quota, usage and alerts without exposing prompts.
5. On regression, rollback the hosting deployment to its recorded last-known-good SHA or restore the archived build,
   then verify the active deployment and access controls. Never blindly reverse additive database migrations.
6. Recheck cookies from cross-site embedded widgets. A strict SameSite HttpOnly session can be blocked in third-party iframe contexts;
   explicitly validate embed behavior and consider a secure first-party session bootstrap before promoting such embeds.

## Current media/voice scope
- Anonymous: text; up to two JPEG/PNG/WEBP images at 1 MB each; one PDF up to 256 KB with PDF magic-byte validation.
- Authenticated: other documents and larger uploads through the existing guarded storage pipeline.
- Guest voice: browser speech-recognition / synthesis fallback. Authenticated Foundry Realtime is a separate integration;
  **unauthenticated full-duplex realtime is not yet available**.

## Budget semantics and alerts
- The RPC reserves USD **before** the provider call using configurable model prices and a conservative expected context/output estimate.
- Reservations are never refunded during that UTC day, even on provider error; this prioritizes limiting spend over throughput.
- After a response, token usage and estimated charge are recorded where the provider supplies usage.
- At 80% of the daily reserved limit, the private dashboard displays a warning; exhaustion creates a critical alert.
- These are database/dashboard alerts, not outbound email or push notifications. The reservation is **not a substitute**
  for Azure-side spending limits: unusual provider billing details may differ from locally estimated costs.

## Operational blockers
- The connected hosting scope is awaiting user authorization; no staging deployment, cloud smoke or rollback has been proven.
- The `bun run lint` repository-wide baseline is still not clean.
- Production Foundry pricing and runtime secret values must be confirmed, not inferred.
