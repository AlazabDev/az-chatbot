-- Public visitor chat gateway: explicit agent exposure and transactional quotas.
ALTER TABLE public.bot_agents
  ADD COLUMN IF NOT EXISTS public_access boolean NOT NULL DEFAULT false;

-- Only the explicitly designated customer-facing agent is public on rollout.
UPDATE public.bot_agents
SET public_access = (agent_name = 'az-agent-azabot' AND is_default = true)
WHERE provider = 'foundry';

CREATE TABLE IF NOT EXISTS public.chat_gateway_quota (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (bucket_key, window_start)
);
ALTER TABLE public.chat_gateway_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_gateway_quota FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_gateway_quota TO service_role;

-- SECURITY INVOKER: only the service role may call this function.
-- Atomic UPSERT prevents concurrent requests from racing past the quota.
CREATE OR REPLACE FUNCTION public.consume_guest_chat_quota(
  p_visitor_id uuid,
  p_ip_hash text,
  p_agent_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  minute_window timestamptz := date_trunc('minute', now());
  day_window timestamptz := date_trunc('day', now());
  accepted boolean;
  key_text text;
  bucket_time timestamptz;
  maximum integer;
BEGIN
  IF p_visitor_id IS NULL OR p_agent_id IS NULL
     OR p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  FOR key_text, bucket_time, maximum IN
    SELECT *
    FROM (VALUES
      ('visitor:' || p_visitor_id::text, minute_window, 12),
      ('ip:' || p_ip_hash, minute_window, 30),
      ('global:all-visitors', day_window, 1500),
      ('agent:' || p_agent_id::text, day_window, 750)
    ) AS limits(bucket_key, window_start, max_count)
  LOOP
    INSERT INTO public.chat_gateway_quota AS q
      (bucket_key, window_start, request_count)
    VALUES (key_text, bucket_time, 1)
    ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET request_count = q.request_count + 1
      WHERE q.request_count < maximum
    RETURNING true INTO accepted;

    IF accepted IS DISTINCT FROM true THEN
      RETURN false;
    END IF;
    accepted := null;
  END LOOP;
  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION public.consume_guest_chat_quota(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_chat_quota(uuid,text,uuid)
  TO service_role;

COMMENT ON TABLE public.chat_gateway_quota IS
  'Server-only atomic request quotas; rows can be pruned after 48h.';
