INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE u.email IN ('devops@alazab.com','mohamed@alazab.com','dev@alazab.com','info@alazab.com','admin@alazab.com')
ON CONFLICT (user_id, role) DO NOTHING;