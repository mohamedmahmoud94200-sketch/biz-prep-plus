CREATE POLICY "Public read proforma images" ON storage.objects FOR SELECT USING (bucket_id = 'proforma-images');
CREATE POLICY "Auth upload proforma images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'proforma-images');
CREATE POLICY "Auth update proforma images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'proforma-images') WITH CHECK (bucket_id = 'proforma-images');
CREATE POLICY "Auth delete proforma images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'proforma-images');
CREATE INDEX IF NOT EXISTS proforma_items_proforma_id_idx ON public.proforma_items (proforma_id);