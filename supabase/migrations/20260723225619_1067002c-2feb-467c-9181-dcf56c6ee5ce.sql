
CREATE POLICY "chatbot uploads insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'chatbot-uploads');

CREATE POLICY "chatbot uploads select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'chatbot-uploads');

CREATE POLICY "chatbot uploads delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chatbot-uploads' AND owner = auth.uid());
