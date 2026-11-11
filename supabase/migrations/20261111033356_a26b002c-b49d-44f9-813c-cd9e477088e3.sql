UPDATE public.bot_agents b SET is_active = true, public_access = true, name = v.n, description = COALESCE(b.description, v.d), sort_order = v.s
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
WHERE b.agent_name = v.a;