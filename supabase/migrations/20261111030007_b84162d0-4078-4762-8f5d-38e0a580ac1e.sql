INSERT INTO public.bot_agents (agent_name, deployment, name, description, provider, is_active, is_default, public_access, sort_order, max_tokens, temperature, system_prompt)
SELECT v.a, v.a, v.n, v.d, 'foundry', true, false, true, v.s, 2500, 0.7, ''
FROM (VALUES
 ('az-agent-auth','وكيل الحسابات والدخول','المساعدة في الحسابات وتسجيل الدخول',2),
 ('az-agent-vision','وكيل الصور','تحليل الصور والمرفقات',3),
 ('az-agent-payments','وكيل المدفوعات','الاستفسارات عن المدفوعات',4),
 ('az-agent-finance','وكيل المالية','الفواتير والشؤون المالية',5),
 ('az-agent-maint','وكيل الصيانة','طلبات الصيانة',6),
 ('az-agent-project','وكيل المشروعات','متابعة المشروعات',7),
 ('az-agent-sol','وكيل الحلول','الحلول والاستشارات',8),
 ('az-agent-codex','وكيل البرمجة','المساعدة التقنية والبرمجية',9)
) AS v(a,n,d,s)
WHERE NOT EXISTS (SELECT 1 FROM public.bot_agents b WHERE b.agent_name = v.a);
UPDATE public.bot_agents SET public_access = true, sort_order = 10, name = 'وكيل المنتجات' WHERE agent_name = 'az-agent-prod';