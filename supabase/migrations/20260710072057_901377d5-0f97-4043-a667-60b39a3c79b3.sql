
DROP POLICY IF EXISTS "Public ticket lookup" ON public.maintenance_requests;
DROP POLICY IF EXISTS "API gateway inserts" ON public.maintenance_requests;

DROP POLICY IF EXISTS "Authenticated users upload files" ON storage.objects;

CREATE POLICY "Project members upload project files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.project_id::text = split_part(name, '/', 1)
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.created_by = auth.uid()
        AND p.id::text = split_part(name, '/', 1)
    )
  )
);

CREATE POLICY "Project members read project files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.project_id::text = split_part(name, '/', 1)
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.created_by = auth.uid()
        AND p.id::text = split_part(name, '/', 1)
    )
  )
);

CREATE POLICY "Project members update project files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.project_id::text = split_part(name, '/', 1)
    )
  )
);

CREATE POLICY "Owners read own media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('media','audio') AND owner = auth.uid());

CREATE POLICY "Owners upload own media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('media','audio') AND owner = auth.uid());

CREATE POLICY "Owners update own media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('media','audio') AND owner = auth.uid());

CREATE POLICY "Owners delete own media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('media','audio') AND owner = auth.uid());

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
