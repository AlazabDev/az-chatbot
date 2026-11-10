DROP VIEW IF EXISTS public.bot_settings_public;
CREATE VIEW public.bot_settings_public
WITH (security_invoker = on) AS
SELECT id, bot_name, primary_color, welcome_message, quick_replies, "position",
       voice_enabled, voice_name, auto_speak, business_hours_enabled, business_hours,
       offline_message, header_subtitle, bubble_style, show_branding, sound_enabled,
       avatar_url
FROM public.bot_settings
WHERE id = 1;

GRANT SELECT ON public.bot_settings_public TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can read UI-safe bot settings" ON public.bot_settings;
CREATE POLICY "Public can read UI-safe bot settings"
  ON public.bot_settings FOR SELECT TO anon, authenticated
  USING (id = 1);

REVOKE ALL ON public.bot_settings FROM anon, authenticated;
GRANT ALL ON public.bot_settings TO service_role;
GRANT SELECT (id, bot_name, primary_color, welcome_message, quick_replies, "position",
              voice_enabled, voice_name, auto_speak, business_hours_enabled, business_hours,
              offline_message, header_subtitle, bubble_style, show_branding, sound_enabled,
              avatar_url)
  ON public.bot_settings TO anon, authenticated;