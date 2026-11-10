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

CREATE OR REPLACE FUNCTION public.append_guest_chat_turn(
 p_visitor_id uuid,p_agent_id uuid,p_thread_token text,p_message text,p_reply text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
 pair jsonb;
BEGIN
 IF p_visitor_id IS NULL OR p_agent_id IS NULL OR length(p_thread_token)>512
    OR length(p_message)>8000 OR length(p_reply)>32000 THEN
   RAISE EXCEPTION 'Invalid guest chat state';
 END IF;
 pair := jsonb_build_array(
  jsonb_build_object('id',gen_random_uuid(),'role','user',
   'content',left(p_message,3000),'timestamp',now_ms),
  jsonb_build_object('id',gen_random_uuid(),'role','assistant',
   'content',left(p_reply,3000),'timestamp',now_ms+1)
 );
 INSERT INTO public.chat_guest_state AS s(visitor_id,agent_id,thread_token,messages,updated_at)
 VALUES(p_visitor_id,p_agent_id,p_thread_token,pair,now())
 ON CONFLICT(visitor_id,agent_id) DO UPDATE
 SET thread_token=excluded.thread_token,
     messages=(
       SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb)
       FROM (
         SELECT value,ord FROM jsonb_array_elements(s.messages || excluded.messages)
           WITH ORDINALITY AS t(value,ord)
         ORDER BY ord DESC LIMIT 30
       ) AS recent
     ),
     updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.append_guest_chat_turn(uuid,uuid,text,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_guest_chat_turn(uuid,uuid,text,text,text) TO service_role;
