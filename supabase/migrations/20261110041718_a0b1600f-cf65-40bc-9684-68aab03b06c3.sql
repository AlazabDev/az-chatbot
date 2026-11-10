DROP POLICY IF EXISTS "anon_read_brands" ON public.brands;
CREATE POLICY "Admins read brands" ON public.brands FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated insert files" ON public.project_files;
CREATE POLICY "Project creators and editors insert files" ON public.project_files FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_files.project_id AND p.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = project_files.project_id AND m.user_id = auth.uid() AND m.permission IN ('edit','editor','admin','owner','write'))
);