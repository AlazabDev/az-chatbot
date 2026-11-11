-- 30-day privacy retention and bounded per-instance request-quota cleanup.
-- This job does not touch authenticated users' history or financial audit ledgers.
SELECT cron.schedule(
  'az_chat_guest_retention',
  '15 3 * * *',
  $job$
    DELETE FROM public.chat_guest_state
    WHERE updated_at < now() - interval '30 days';
    DELETE FROM public.chat_gateway_quota
    WHERE window_start < now() - interval '48 hours';
  $job$
);
