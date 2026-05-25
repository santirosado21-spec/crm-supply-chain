-- ============================================================================
-- RPC: generación atómica de la referencia de operación (SC<cliente><seq>)
--
-- useOperations.nextReference generaba la referencia con `count(*) + 1` leído
-- en el cliente. Dos createOperation simultáneos (o el webhook de Extensiv
-- corriendo en paralelo) obtenían el mismo número → referencias duplicadas.
--
-- Solución: un contador por cliente incrementado de forma atómica con
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING (las llamadas concurrentes
-- serializan sobre el lock de la fila).
-- ============================================================================

CREATE TABLE IF NOT EXISTS operation_ref_counters (
  cliente_codigo TEXT PRIMARY KEY,
  last_seq       INT NOT NULL DEFAULT 0
);

-- RLS activa y sin policies: nadie accede a la tabla directamente. El acceso
-- es solo vía la RPC, que es SECURITY DEFINER.
ALTER TABLE operation_ref_counters ENABLE ROW LEVEL SECURITY;

-- Semilla: arranca cada contador desde la secuencia máxima ya existente, para
-- que la próxima referencia no choque con operaciones previas.
INSERT INTO operation_ref_counters (cliente_codigo, last_seq)
SELECT cliente_codigo, COALESCE(MAX((right(referencia, 4))::int), 0)
FROM operations
WHERE cliente_codigo IS NOT NULL
  AND referencia ~ '\d{4}$'
GROUP BY cliente_codigo
ON CONFLICT (cliente_codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION next_operation_reference(p_cliente_codigo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INT;
BEGIN
  IF p_cliente_codigo IS NULL OR p_cliente_codigo = '' THEN
    RAISE EXCEPTION 'cliente_codigo requerido';
  END IF;

  INSERT INTO operation_ref_counters (cliente_codigo, last_seq)
  VALUES (p_cliente_codigo, 1)
  ON CONFLICT (cliente_codigo)
  DO UPDATE SET last_seq = operation_ref_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'SC' || p_cliente_codigo || lpad(v_seq::text, 4, '0');
END;
$$;

-- Solo usuarios autenticados pueden generar referencias.
REVOKE EXECUTE ON FUNCTION next_operation_reference(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION next_operation_reference(TEXT) TO authenticated;
