# Supabase Edge Functions

- `chatbot` — Foundry thread proxy used by `src/lib/chatApi.ts` (JWT required, see `config.toml`).

## Agents

الوكلاء (azabot, maint, payments, project, bim, prod, finance) مصدرهم الوحيد `src/lib/agents`
ومحرك التنفيذ `src/lib/agents/az-model-core/engine.server.ts`. لإضافة وكيل: أنشئ
`src/lib/agents/az-agent-<slug>/index.ts` وسجّله في `registry.ts`.

> النسخة القديمة (`az-agent-*` و`az-model-core` كـ Edge Functions) اتشالت لأنها مكررة ومنحرفة عن المحرك الفعلي.
> لو كانت منشورة: `supabase functions delete az-agent-<slug>` لكل واحدة.
