-- Aggregate-only operational telemetry, without message text or visitor identifiers.
create table if not exists public.chat_gateway_usage (
  request_id uuid primary key,
  agent_id uuid not null references public.bot_agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  outcome text not null check (outcome in ('success','provider_error')),
  latency_ms integer not null check (latency_ms >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_usd numeric(14,6) check (estimated_cost_usd >= 0)
);
create index if not exists chat_gateway_usage_created_idx on public.chat_gateway_usage (created_at desc);
create index if not exists chat_gateway_usage_agent_created_idx on public.chat_gateway_usage (agent_id, created_at desc);
alter table public.chat_gateway_usage enable row level security;
revoke all on public.chat_gateway_usage from public, anon, authenticated;
grant select, insert on public.chat_gateway_usage to service_role;
comment on table public.chat_gateway_usage is 'Server-only Foundry request metrics without prompts, files, visitor identifiers, or IP addresses.';
