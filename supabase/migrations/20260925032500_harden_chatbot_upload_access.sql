-- Harden chatbot upload access:
-- 1) authenticated users only
-- 2) object owner must match auth.uid()
-- 3) first folder segment must be the caller UUID
-- Reads continue through short-lived signed URLs minted server-side.

DROP POLICY IF EXISTS "chatbot uploads insert" ON storage.objects;
DROP POLICY IF EXISTS "chatbot uploads delete own" ON storage.objects;

CREATE POLICY "chatbot uploads insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chatbot-uploads'
  AND owner_id = (SELECT auth.uid()::text)
  AND array_length(storage.foldername(name), 1) >= 2
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  AND octet_length(coalesce(name, '')) <= 512
  AND coalesce(metadata->>'mimetype', '') = ANY (ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'audio/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg',
    'application/pdf','text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ])
);

CREATE POLICY "chatbot uploads delete own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chatbot-uploads'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
