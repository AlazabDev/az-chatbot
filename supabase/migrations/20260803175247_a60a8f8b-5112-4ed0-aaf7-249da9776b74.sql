-- file_comments: bind author to caller
DROP POLICY IF EXISTS "Authenticated users add comments" ON public.file_comments;
CREATE POLICY "Users add own comments"
ON public.file_comments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- maintenance_requests: bind creator to caller
DROP POLICY IF EXISTS "Authenticated users create maintenance requests" ON public.maintenance_requests;
CREATE POLICY "Users create own maintenance requests"
ON public.maintenance_requests FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

-- notifications: only self-addressed (admins still covered by their own policies)
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- projects: bind creator to caller
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON public.projects;
CREATE POLICY "Users create own projects"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

-- storage: chatbot uploads must be owned by the uploader when signed in
DROP POLICY IF EXISTS "chatbot uploads insert" ON storage.objects;
CREATE POLICY "chatbot uploads insert"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'chatbot-uploads'
  AND (auth.uid() IS NULL OR owner = auth.uid())
);