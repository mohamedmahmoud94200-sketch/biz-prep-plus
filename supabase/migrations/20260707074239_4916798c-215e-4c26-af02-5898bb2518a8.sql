ALTER TABLE public.proformas
ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS theme_color text NOT NULL DEFAULT '2BB39B';

CREATE TABLE IF NOT EXISTS public.proforma_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid NOT NULL REFERENCES public.proformas(id) ON DELETE CASCADE,
  row_order integer NOT NULL DEFAULT 0,
  item_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image text NOT NULL DEFAULT '',
  packing text NOT NULL DEFAULT '',
  ctn text NOT NULL DEFAULT '',
  doz_ctn text NOT NULL DEFAULT '',
  set_ctn text NOT NULL DEFAULT '',
  pcs_set text NOT NULL DEFAULT '',
  price_per_ctn text NOT NULL DEFAULT '',
  cbm text NOT NULL DEFAULT '',
  weight text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proforma_items TO authenticated;
GRANT ALL ON public.proforma_items TO service_role;

ALTER TABLE public.proforma_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read proforma items"
ON public.proforma_items
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth insert proforma items"
ON public.proforma_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth update proforma items"
ON public.proforma_items
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth delete proforma items"
ON public.proforma_items
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS proforma_items_proforma_order_idx
ON public.proforma_items (proforma_id, row_order);

DROP TRIGGER IF EXISTS set_proforma_items_updated_at ON public.proforma_items;
CREATE TRIGGER set_proforma_items_updated_at
BEFORE UPDATE ON public.proforma_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

UPDATE public.proformas
SET
  meta = CASE WHEN jsonb_typeof(data->'meta') = 'object' THEN data->'meta' ELSE meta END,
  theme_color = COALESCE(NULLIF(data->>'themeColor', ''), theme_color);

INSERT INTO public.proforma_items (
  id,
  proforma_id,
  row_order,
  item_name,
  description,
  image,
  packing,
  ctn,
  doz_ctn,
  set_ctn,
  pcs_set,
  price_per_ctn,
  cbm,
  weight
)
SELECT
  CASE
    WHEN row_value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (row_value->>'id')::uuid
    ELSE gen_random_uuid()
  END,
  p.id,
  (row_index - 1)::integer,
  COALESCE(row_value->>'itemName', ''),
  COALESCE(row_value->>'description', ''),
  COALESCE(row_value->>'image', ''),
  COALESCE(row_value->>'packing', ''),
  COALESCE(row_value->>'ctn', ''),
  COALESCE(row_value->>'dozCtn', ''),
  COALESCE(row_value->>'setCtn', ''),
  COALESCE(row_value->>'pcsSet', ''),
  COALESCE(row_value->>'pricePerCtn', ''),
  COALESCE(row_value->>'cbm', ''),
  COALESCE(row_value->>'weight', '')
FROM public.proformas p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.data->'rows', '[]'::jsonb)) WITH ORDINALITY AS rows(row_value, row_index)
ON CONFLICT (id) DO UPDATE SET
  proforma_id = EXCLUDED.proforma_id,
  row_order = EXCLUDED.row_order,
  item_name = EXCLUDED.item_name,
  description = EXCLUDED.description,
  image = EXCLUDED.image,
  packing = EXCLUDED.packing,
  ctn = EXCLUDED.ctn,
  doz_ctn = EXCLUDED.doz_ctn,
  set_ctn = EXCLUDED.set_ctn,
  pcs_set = EXCLUDED.pcs_set,
  price_per_ctn = EXCLUDED.price_per_ctn,
  cbm = EXCLUDED.cbm,
  weight = EXCLUDED.weight,
  updated_at = now();

UPDATE public.proformas
SET data = jsonb_build_object(
  'meta', meta,
  'themeColor', theme_color,
  'migratedRows', COALESCE(jsonb_array_length(data->'rows'), 0)
)
WHERE data ? 'rows';

CREATE OR REPLACE FUNCTION public.append_proforma_row(target_id uuid, new_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.proforma_items (
    id,
    proforma_id,
    row_order,
    item_name,
    description,
    image,
    packing,
    ctn,
    doz_ctn,
    set_ctn,
    pcs_set,
    price_per_ctn,
    cbm,
    weight
  ) VALUES (
    CASE
      WHEN new_row->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (new_row->>'id')::uuid
      ELSE gen_random_uuid()
    END,
    target_id,
    COALESCE((SELECT max(row_order) + 1 FROM public.proforma_items WHERE proforma_id = target_id), 0),
    COALESCE(new_row->>'itemName', ''),
    COALESCE(new_row->>'description', ''),
    COALESCE(new_row->>'image', ''),
    COALESCE(new_row->>'packing', ''),
    COALESCE(new_row->>'ctn', ''),
    COALESCE(new_row->>'dozCtn', ''),
    COALESCE(new_row->>'setCtn', ''),
    COALESCE(new_row->>'pcsSet', ''),
    COALESCE(new_row->>'pricePerCtn', ''),
    COALESCE(new_row->>'cbm', ''),
    COALESCE(new_row->>'weight', '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_proforma_row(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_proforma_row(uuid, jsonb) TO service_role;