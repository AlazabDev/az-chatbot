CREATE TABLE public.bot_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  provider text NOT NULL DEFAULT 'foundry',
  agent_name text,
  agent_version text NOT NULL DEFAULT '1',
  deployment text,
  system_prompt text NOT NULL DEFAULT '',
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 800,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_agents TO authenticated;
GRANT ALL ON public.bot_agents TO service_role;

ALTER TABLE public.bot_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read bot agents" ON public.bot_agents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert bot agents" ON public.bot_agents
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update bot agents" ON public.bot_agents
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete bot agents" ON public.bot_agents
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_bot_agents_updated_at BEFORE UPDATE ON public.bot_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX bot_agents_single_default ON public.bot_agents (is_default) WHERE is_default;

INSERT INTO public.bot_agents (name, description, provider, agent_name, agent_version, system_prompt, is_default, sort_order)
VALUES ('الوكيل الرئيسي', 'وكيل عزبوت الأساسي على Azure AI Foundry', 'foundry', 'az-agent-azabot', '5', 'أنت عزبوت، مساعد ذكي يجيب بالعربية بوضوح واحتراف.', true, 1);