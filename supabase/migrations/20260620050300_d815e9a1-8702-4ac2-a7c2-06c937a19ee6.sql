
CREATE TABLE public.proformas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Proforma',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proformas TO anon, authenticated;
GRANT ALL ON public.proformas TO service_role;

ALTER TABLE public.proformas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read proformas" ON public.proformas FOR SELECT USING (true);
CREATE POLICY "Public insert proformas" ON public.proformas FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update proformas" ON public.proformas FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete proformas" ON public.proformas FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER proformas_updated_at BEFORE UPDATE ON public.proformas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.proformas;
ALTER TABLE public.proformas REPLICA IDENTITY FULL;
