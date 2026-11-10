
-- profiles: restrict SELECT to owner only
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- bot_settings: remove redundant broad anon policy and restrict sensitive columns via GRANT
DROP POLICY IF EXISTS "anon_read_settings" ON public.bot_settings;

-- Revoke broad column access from anon/authenticated then re-grant only non-sensitive columns
REVOKE SELECT ON public.bot_settings FROM anon;
REVOKE SELECT ON public.bot_settings FROM authenticated;

GRANT SELECT (
  id, bot_name, primary_color, welcome_message, quick_replies,
  voice_enabled, voice_name, auto_speak,
  business_hours_enabled, business_hours, offline_message, position,
  header_subtitle, bubble_style, show_branding, sound_enabled,
  allow_human_takeover, avatar_url, engine,
  created_at, updated_at
) ON public.bot_settings TO anon, authenticated;
