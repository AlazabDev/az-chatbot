DROP POLICY IF EXISTS "chatbot uploads insert" ON storage.objects;

CREATE POLICY "chatbot uploads insert"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'chatbot-uploads'
  AND (owner = auth.uid() OR (auth.uid() IS NULL AND owner IS NULL))
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
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