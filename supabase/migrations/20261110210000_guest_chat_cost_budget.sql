-- Atomic, server-only daily USD reservation; no public Data API access.
CREATE TABLE IF NOT EXISTS public.chat_gateway_budget (
  day date PRIMARY KEY,
  reserved_usd numeric(14,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  daily_limit_usd numeric(14,6) NOT NULL DEFAULT 5 CHECK (daily_limit_usd > 0),
  observed_usd numeric(14,6) NOT NULL DEFAULT 0 CHECK (observed_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_gateway_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_gateway_budget FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_gateway_budget TO service_role;

CREATE TABLE IF NOT EXISTS public.chat_gateway_reservations (
  request_id uuid PRIMARY KEY,
  day date NOT NULL REFERENCES public.chat_gateway_budget(day),
  reserved_usd numeric(14,6) NOT NULL CHECK (reserved_usd > 0),
  actual_usd numeric(14,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
ALTER TABLE public.chat_gateway_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_gateway_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_gateway_reservations TO service_role;

CREATE TABLE IF NOT EXISTS public.chat_gateway_alerts (
  day date NOT NULL,
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(day,code)
);
ALTER TABLE public.chat_gateway_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_gateway_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.chat_gateway_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_guest_chat_budget(
  p_request_id uuid, p_reserve_usd numeric, p_daily_limit_usd numeric
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE d date := (now() at time zone 'UTC')::date; accepted boolean; total_reserved numeric;
BEGIN
 IF p_request_id IS NULL OR p_reserve_usd IS NULL OR p_daily_limit_usd IS NULL
    OR p_reserve_usd <= 0 OR p_daily_limit_usd <= 0
    OR p_reserve_usd > 25 OR p_daily_limit_usd > 500 THEN RETURN false; END IF;
 INSERT INTO public.chat_gateway_budget AS b (day,reserved_usd,daily_limit_usd,updated_at)
 SELECT d,p_reserve_usd,p_daily_limit_usd,now() WHERE p_reserve_usd <= p_daily_limit_usd
 ON CONFLICT (day) DO UPDATE
 SET reserved_usd=b.reserved_usd+EXCLUDED.reserved_usd,
     daily_limit_usd=least(b.daily_limit_usd,EXCLUDED.daily_limit_usd),updated_at=now()
 WHERE b.reserved_usd + EXCLUDED.reserved_usd <= least(b.daily_limit_usd,EXCLUDED.daily_limit_usd)
 RETURNING true,reserved_usd INTO accepted,total_reserved;
 IF accepted IS DISTINCT FROM true THEN
   INSERT INTO public.chat_gateway_alerts(day,code,severity) VALUES(d,'daily_budget_exhausted','critical')
   ON CONFLICT DO NOTHING;
   RETURN false;
 END IF;
 IF total_reserved >= p_daily_limit_usd*0.8 THEN
   INSERT INTO public.chat_gateway_alerts(day,code,severity) VALUES(d,'daily_budget_80_percent','warning')
   ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.chat_gateway_reservations(request_id,day,reserved_usd)
 VALUES(p_request_id,d,p_reserve_usd);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_guest_chat_budget(uuid,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_guest_chat_budget(uuid,numeric,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_guest_chat_budget(
 p_request_id uuid,p_actual_usd numeric
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE entry public.chat_gateway_reservations%ROWTYPE;
BEGIN
 IF p_actual_usd IS NULL OR p_actual_usd < 0 OR p_actual_usd > 100 THEN RETURN false; END IF;
 SELECT * INTO entry FROM public.chat_gateway_reservations WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR entry.finalized_at IS NOT NULL THEN RETURN false; END IF;
 UPDATE public.chat_gateway_reservations
 SET actual_usd=p_actual_usd,finalized_at=now() WHERE request_id=p_request_id;
 -- Reserve remains charged until day's end: it is never refunded on failure.
 -- observed_usd reports provider-usage estimate separately from reservations.
 UPDATE public.chat_gateway_budget SET observed_usd=observed_usd+p_actual_usd,updated_at=now()
 WHERE day=entry.day;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_guest_chat_budget(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_guest_chat_budget(uuid,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.get_chat_gateway_budget_status()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object(
   'day', b.day,
   'reservedUsd', b.reserved_usd,
   'dailyLimitUsd', b.daily_limit_usd,
   'observedUsd', b.observed_usd,
   'alerts', coalesce((
     SELECT jsonb_agg(jsonb_build_object('code',a.code,'severity',a.severity))
     FROM public.chat_gateway_alerts a WHERE a.day=b.day
   ), '[]'::jsonb)
 ) FROM public.chat_gateway_budget b
 WHERE b.day=(now() at time zone 'UTC')::date
$$;
REVOKE ALL ON FUNCTION public.get_chat_gateway_budget_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_gateway_budget_status() TO service_role;
