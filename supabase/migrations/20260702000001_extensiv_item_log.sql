-- ============================================================================
-- Alta de SKUs faltantes en Extensiv desde el Paso 1 del wizard de Entradas.
-- Log idempotente de creación de items (POST /customers/{id}/items).
--
-- Modelo (espejo de extensiv_billing_log):
--   - Antes del POST a Extensiv se inserta/reutiliza una fila con status='pending'
--     vía extensiv_item_log_attempt. Cuando vuelve la respuesta,
--     extensiv_item_log_finalize la deja en 'created' (con extensiv_item_id) o
--     'failed' (con error_message).
--   - El UNIQUE (customer_id, sku) garantiza idempotencia: reintentar un alta ya
--     'created' se rechaza; un 'pending'/'failed' se reintenta sobre la misma fila.
-- ============================================================================

-- 1. Tabla de log ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS extensiv_item_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       INT  NOT NULL,
  sku               TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL CHECK (status IN ('pending','created','failed')),
  extensiv_item_id  TEXT,                     -- llena al éxito
  payload           JSONB,                    -- snapshot del body enviado
  http_status       INT,
  error_message     TEXT,
  attempted_by      TEXT,                     -- email del usuario que dio de alta
  attempted_at      TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT extensiv_item_log_unique UNIQUE (customer_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_eil_customer ON extensiv_item_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_eil_status   ON extensiv_item_log(status, attempted_at DESC);

-- 2. RLS abierta (consistente con warehouse_entries y el resto del schema) ----
ALTER TABLE extensiv_item_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY eil_all ON extensiv_item_log FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. RPC: registrar el intento (antes del POST a Extensiv) --------------------
-- Crea o reutiliza la fila. Si ya está 'created' rechaza para evitar duplicar el
-- alta; si está 'pending'/'failed' la resetea a 'pending' para reintentar.
CREATE OR REPLACE FUNCTION extensiv_item_log_attempt(
  p_customer_id INT,
  p_sku         TEXT,
  p_description TEXT  DEFAULT NULL,
  p_payload     JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller   TEXT := current_user_email();
  v_existing extensiv_item_log;
  v_log_id   UUID;
BEGIN
  SELECT * INTO v_existing
    FROM extensiv_item_log
   WHERE customer_id = p_customer_id AND sku = p_sku
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'created' THEN
      RAISE EXCEPTION 'El SKU % ya fue dado de alta en Extensiv (item=%)', p_sku, v_existing.extensiv_item_id;
    END IF;
    UPDATE extensiv_item_log
       SET status        = 'pending',
           description   = p_description,
           payload       = p_payload,
           attempted_by  = v_caller,
           attempted_at  = now(),
           error_message = NULL,
           http_status   = NULL
     WHERE id = v_existing.id
     RETURNING id INTO v_log_id;
  ELSE
    INSERT INTO extensiv_item_log (
      customer_id, sku, description, payload, status, attempted_by
    ) VALUES (
      p_customer_id, p_sku, p_description, p_payload, 'pending', v_caller
    )
    RETURNING id INTO v_log_id;
  END IF;

  RETURN v_log_id;
END;
$$;

-- 4. RPC: finalizar el log (tras la respuesta de Extensiv) -------------------
CREATE OR REPLACE FUNCTION extensiv_item_log_finalize(
  p_log_id           UUID,
  p_extensiv_item_id TEXT,
  p_http_status      INT,
  p_error_message    TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE extensiv_item_log
     SET extensiv_item_id = p_extensiv_item_id,
         http_status      = p_http_status,
         status           = CASE
           WHEN p_http_status BETWEEN 200 AND 299 AND p_extensiv_item_id IS NOT NULL THEN 'created'
           ELSE 'failed'
         END,
         error_message    = p_error_message
   WHERE id = p_log_id;
END;
$$;
