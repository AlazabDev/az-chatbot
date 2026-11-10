-- Server-owned guest conversation state. Not accessible from browser Data API.
CREATE TABLE IF NOT EXISTS public.chat_guest_state (
  visitor_id uuid NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.bot_agents(id) ON DELETE CASCADE,
  thread_token text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(visitor_id,agent_id),
  CONSTRAINT chat_guest_state_messages_array CHECK (jsonb_typeof(messages) = 'array'),
  CONSTRAINT chat_guest_state_max_bytes CHECK (octet_length(messages::text) < 200000)
);
CREATE INDEX IF NOT EXISTS chat_guest_state_retention_idx
ON public.chat_guest_state(updated_at);
ALTER TABLE public.chat_guest_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_guest_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.chat_guest_state TO service_role;
COMMENT ON TABLE public.chat_guest_state IS 'Private, signed-visitor-scoped chat state; purge rows older than 30 days.';
