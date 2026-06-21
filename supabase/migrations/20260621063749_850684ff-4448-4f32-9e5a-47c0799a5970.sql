DROP POLICY IF EXISTS "Public read proformas" ON public.proformas;
DROP POLICY IF EXISTS "Public insert proformas" ON public.proformas;
DROP POLICY IF EXISTS "Public update proformas" ON public.proformas;
DROP POLICY IF EXISTS "Public delete proformas" ON public.proformas;

REVOKE ALL ON public.proformas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proformas TO authenticated;
GRANT ALL ON public.proformas TO service_role;

CREATE POLICY "Auth read proformas" ON public.proformas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert proformas" ON public.proformas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update proformas" ON public.proformas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete proformas" ON public.proformas FOR DELETE TO authenticated USING (true);