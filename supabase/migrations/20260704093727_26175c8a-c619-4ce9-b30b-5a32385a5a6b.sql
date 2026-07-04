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

  UPDATE public.proformas
  SET data = jsonb_set(
    COALESCE(data, '{}'::jsonb),
    '{rows}',
    COALESCE(data->'rows', '[]'::jsonb) || jsonb_build_array(new_row),
    true
  ),
  updated_at = now()
  WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_proforma_row(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_proforma_row(uuid, jsonb) TO service_role;