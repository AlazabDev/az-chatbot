# AZ-Chatbot release, monitoring and rollback

## Pre-release
1. GitHub Actions **Chatbot Quality Gate** must pass on the candidate commit (TypeScript, ESLint, Vitest, build).
2. Apply Supabase migrations and regenerate types before deploying the app. Verify `bot_agents.public_access` and `consume_guest_chat_quota`.
3. In ingress, strip incoming `x-real-ip`/`x-forwarded-for` or `cf-connecting-ip` values before re-adding trusted ones. Only then configure `CHAT_TRUSTED_IP_HEADER`. Without it, per-visitor, global and per-agent quotas still apply.
4. Configure server-only `CHAT_GATEWAY_HASH_SECRET` (or `THREAD_SIGNING_SECRET`), Foundry Entra credentials, and Supabase service-role key.
5. Deploy a candidate to staging; set **CHATBOT_STAGING_URL** as the GitHub `staging` environment secret.
6. Run **Chatbot Staging Smoke Test** manually against staging. This does not spend AI tokens or write customer data.
7. Validate anonymous text, bounded guest images, authenticated documents, voice speech fallback, agent denial and thread isolation in a real browser before promoting.

## Production release
Promote the **same immutable commit** that passed staging, using the connected deployment system. This repository does not provide a verified deployment target, so CI intentionally does **not** push to production or use guessed credentials.

## Rollback
- Retain the last known-good deployment reference before promotion.
- If rollout fails, restore that artifact or redeploy the last known-good commit through the hosting provider.
- Do **not** blindly roll back database migrations: `public_access` defaults to denied and quota tables may be needed by traffic still running the new app.
- Run `/api/health` and `/help` checks, then test one anonymous conversation after rollback.

## Observability
- `public_chat_completed`: requestId, agentId, latencyMs, messageChars, replyChars.
- `public_chat_failed`: requestId and a coarse error category; no prompts, provider credentials or client IPs in logs.
- Review Foundry consumption in Azure cost monitoring separately; character metrics are **not** actual billable tokens.
- Alert on rising 429s, 5xx, p95 latency, Foundry throttling and approaching Supabase quota limits.

## Operational limitations
- `visitorId` currently comes from local browser storage and is not server-signed; shared daily agent/global budgets limit abuse but are not a complete cost-control system.
- Realtime Foundry voice uses an authenticated endpoint. Guest voice uses browser speech recognition/synthesis with text chat.
- Guest inline images are limited to **two images up to 1 MB each**, stored only in request memory; larger images and documents require authenticated uploads.
- Cross-device history sync and direct public document uploads are not enabled.
