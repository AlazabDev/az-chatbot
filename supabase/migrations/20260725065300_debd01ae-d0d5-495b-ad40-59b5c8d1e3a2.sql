
DROP POLICY IF EXISTS "Project members upload project files" ON storage.objects;
DROP POLICY IF EXISTS "Project members read project files" ON storage.objects;

CREATE POLICY "Project members upload project files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.project_id::text = split_part(objects.name, '/', 1)
    )
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.created_by = auth.uid()
        AND p.id::text = split_part(objects.name, '/', 1)
    )
  )
);

CREATE POLICY "Project members read project files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.project_id::text = split_part(objects.name, '/', 1)
    )
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.created_by = auth.uid()
        AND p.id::text = split_part(objects.name, '/', 1)
    )
  )
);
