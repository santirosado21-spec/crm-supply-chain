-- ============================================================================
-- RPCs de Proforma consolidada: folio atómico + guardado atómico + cancelación
--
-- Mismo patrón que next_operation_reference (20260516000004_operation_ref_rpc.sql)
-- para el folio, y que extensiv_log_attempt/finalize/void para el log de una
-- operación multi-paso. save_proforma_periodo hace TODO en una sola función
-- (header + líneas + marcar viajes/guías como facturados) para que sea
-- atómico: si dos personas generan proformas del mismo cliente a la vez, no
-- hay condición de carrera ni doble-facturación.
-- ============================================================================

-- 1. Contador de folio por cliente --------------------------------------------
CREATE TABLE IF NOT EXISTS proforma_periodo_ref_counters (
  cliente_codigo TEXT PRIMARY KEY,
  last_seq       INT  NOT NULL DEFAULT 0
);

-- RLS activa y sin policies: nadie accede a la tabla directamente, solo vía
-- la RPC (SECURITY DEFINER) — mismo patrón que operation_ref_counters.
ALTER TABLE proforma_periodo_ref_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION next_proforma_periodo_reference(p_cliente_codigo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq    INT;
  v_codigo TEXT := COALESCE(NULLIF(trim(p_cliente_codigo), ''), 'CLI');
BEGIN
  INSERT INTO proforma_periodo_ref_counters (cliente_codigo, last_seq)
  VALUES (v_codigo, 1)
  ON CONFLICT (cliente_codigo)
  DO UPDATE SET last_seq = proforma_periodo_ref_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'PRF' || v_codigo || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION next_proforma_periodo_reference(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION next_proforma_periodo_reference(TEXT) TO authenticated;

-- 2. Guardado atómico de la proforma -------------------------------------------
-- p_lineas: JSONB array, cada elemento con las mismas columnas que
-- proforma_periodo_lineas (fuente_id/referencia/extensiv_* nullable). Solo las
-- líneas con incluida=true cuentan en los subtotales y marcan su fuente
-- (viaje/guia_paqueteria) como facturada.
CREATE OR REPLACE FUNCTION save_proforma_periodo(
  p_cliente_id     UUID,
  p_cliente_codigo TEXT,
  p_cliente_nombre TEXT,
  p_periodo_desde  DATE,
  p_periodo_hasta  DATE,
  p_moneda         TEXT,
  p_tipo_cambio    NUMERIC,
  p_iva_pct        NUMERIC,
  p_csv_filename   TEXT,
  p_notas          TEXT,
  p_creado_por     TEXT,
  p_lineas         JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proforma_id         UUID;
  v_referencia          TEXT;
  v_subtotal_wms        NUMERIC(12,2) := 0;
  v_subtotal_flete      NUMERIC(12,2) := 0;
  v_subtotal_paqueteria NUMERIC(12,2) := 0;
  v_subtotal            NUMERIC(12,2) := 0;
  v_iva_monto           NUMERIC(12,2) := 0;
  v_total               NUMERIC(12,2) := 0;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id requerido';
  END IF;
  IF p_periodo_hasta < p_periodo_desde THEN
    RAISE EXCEPTION 'periodo_hasta debe ser >= periodo_desde';
  END IF;

  v_referencia := next_proforma_periodo_reference(p_cliente_codigo);

  SELECT COALESCE(SUM(monto) FILTER (WHERE seccion = 'wms'), 0),
         COALESCE(SUM(monto) FILTER (WHERE seccion = 'flete'), 0),
         COALESCE(SUM(monto) FILTER (WHERE seccion = 'paqueteria'), 0)
    INTO v_subtotal_wms, v_subtotal_flete, v_subtotal_paqueteria
    FROM jsonb_to_recordset(p_lineas) AS x(seccion TEXT, incluida BOOLEAN, monto NUMERIC)
   WHERE incluida IS TRUE;

  v_subtotal  := v_subtotal_wms + v_subtotal_flete + v_subtotal_paqueteria;
  v_iva_monto := round(v_subtotal * COALESCE(p_iva_pct, 16) / 100, 2);
  v_total     := v_subtotal + v_iva_monto;

  INSERT INTO proformas_periodo (
    cliente_id, cliente_codigo, cliente_nombre, referencia,
    periodo_desde, periodo_hasta, moneda, tipo_cambio,
    subtotal_wms, subtotal_flete, subtotal_paqueteria, subtotal,
    iva_pct, iva_monto, total, csv_filename, notas, creado_por
  ) VALUES (
    p_cliente_id, p_cliente_codigo, p_cliente_nombre, v_referencia,
    p_periodo_desde, p_periodo_hasta, COALESCE(p_moneda, 'MXN'), p_tipo_cambio,
    v_subtotal_wms, v_subtotal_flete, v_subtotal_paqueteria, v_subtotal,
    COALESCE(p_iva_pct, 16), v_iva_monto, v_total, p_csv_filename, p_notas, p_creado_por
  ) RETURNING id INTO v_proforma_id;

  INSERT INTO proforma_periodo_lineas (
    proforma_id, seccion, fuente, fuente_id, referencia, concepto,
    cantidad, precio_unitario, monto, moneda, incluida,
    extensiv_transaction_id, extensiv_charge_label, raw_csv_row
  )
  SELECT v_proforma_id, seccion, fuente, fuente_id, referencia, concepto,
         cantidad, precio_unitario, monto, COALESCE(moneda, 'MXN'), COALESCE(incluida, true),
         extensiv_transaction_id, extensiv_charge_label, raw_csv_row
    FROM jsonb_to_recordset(p_lineas) AS x(
      seccion TEXT, fuente TEXT, fuente_id UUID, referencia TEXT, concepto TEXT,
      cantidad NUMERIC, precio_unitario NUMERIC, monto NUMERIC, moneda TEXT,
      incluida BOOLEAN, extensiv_transaction_id TEXT, extensiv_charge_label TEXT,
      raw_csv_row JSONB
    );

  UPDATE viajes SET facturado_en_proforma_id = v_proforma_id
   WHERE id IN (
     SELECT fuente_id FROM jsonb_to_recordset(p_lineas) AS x(fuente TEXT, fuente_id UUID, incluida BOOLEAN)
      WHERE fuente = 'viaje' AND incluida IS TRUE AND fuente_id IS NOT NULL
   );

  UPDATE guias_paqueteria SET facturado_en_proforma_id = v_proforma_id
   WHERE id IN (
     SELECT fuente_id FROM jsonb_to_recordset(p_lineas) AS x(fuente TEXT, fuente_id UUID, incluida BOOLEAN)
      WHERE fuente = 'guia_paqueteria' AND incluida IS TRUE AND fuente_id IS NOT NULL
   );

  RETURN v_proforma_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_proforma_periodo(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_proforma_periodo(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

-- 3. Cancelación (libera viajes/guías para re-facturar) ------------------------
CREATE OR REPLACE FUNCTION cancel_proforma_periodo(
  p_proforma_id   UUID,
  p_motivo        TEXT,
  p_cancelado_por TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE proformas_periodo
     SET estado           = 'cancelada',
         cancelada_at     = now(),
         cancelada_por    = p_cancelado_por,
         cancelada_motivo = p_motivo
   WHERE id = p_proforma_id
     AND estado = 'generada';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proforma no encontrada o ya cancelada';
  END IF;

  UPDATE viajes           SET facturado_en_proforma_id = NULL WHERE facturado_en_proforma_id = p_proforma_id;
  UPDATE guias_paqueteria SET facturado_en_proforma_id = NULL WHERE facturado_en_proforma_id = p_proforma_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_proforma_periodo(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cancel_proforma_periodo(UUID, TEXT, TEXT) TO authenticated;
