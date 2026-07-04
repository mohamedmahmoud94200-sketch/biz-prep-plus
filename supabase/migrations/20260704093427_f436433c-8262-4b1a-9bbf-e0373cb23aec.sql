ALTER TABLE public.proformas
ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS proformas_sort_created_idx
ON public.proformas (sort_order, created_at);

CREATE INDEX IF NOT EXISTS proformas_is_primary_idx
ON public.proformas (is_primary)
WHERE is_primary = true;