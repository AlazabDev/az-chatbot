-- 1) Remove broad public read of the full settings row
DROP POLICY IF EXISTS "Public can read bot settings via view" ON public.bot_settings;

-- 2) Base table is service-role only for the Data API
REVOKE ALL ON public.bot_settings FROM anon, authenticated;
GRANT ALL ON public.bot_settings TO service_role;

-- 3) Recreate the public view as a definer view exposing only UI-safe columns
DROP VIEW IF EXISTS public.bot_settings_public;
CREATE VIEW public.bot_settings_public
WITH (security_invoker = off) AS
SELECT id, bot_name, primary_color, welcome_message, quick_replies, "position",
       voice_enabled, voice_name, auto_speak, business_hours_enabled, business_hours,
       offline_message, header_subtitle, bubble_style, show_branding, sound_enabled,
       avatar_url
FROM public.bot_settings
WHERE id = 1;

GRANT SELECT ON public.bot_settings_public TO anon, authenticated;
GRANT SELECT ON public.bot_settings_public TO service_role;