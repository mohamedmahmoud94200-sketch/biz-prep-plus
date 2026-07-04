ALTER POLICY "Auth read proformas"
ON public.proformas
USING (auth.uid() IS NOT NULL);

ALTER POLICY "Auth insert proformas"
ON public.proformas
WITH CHECK (auth.uid() IS NOT NULL);

ALTER POLICY "Auth update proformas"
ON public.proformas
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

ALTER POLICY "Auth delete proformas"
ON public.proformas
USING (auth.uid() IS NOT NULL);