-- Agent-specific reviewed training examples; no changes to live Foundry agents.
create table if not exists public.bot_agent_training_examples (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.bot_agents(id) on delete cascade,
  question text not null check (length(btrim(question)) between 1 and 4000),
  answer text not null check (length(btrim(answer)) between 1 and 8000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bot_agent_training_examples_agent_idx
  on public.bot_agent_training_examples(agent_id, created_at desc);
alter table public.bot_agent_training_examples enable row level security;
revoke all on public.bot_agent_training_examples from anon, authenticated;
grant all on public.bot_agent_training_examples to service_role;
-- The application uses server-side service_role ONLY after verifying administrator privileges.
