DROP POLICY IF EXISTS "Public read proforma images" ON storage.objects;
CREATE POLICY "Auth read proforma images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'proforma-images');