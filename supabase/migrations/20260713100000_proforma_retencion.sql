-- ============================================================================
-- Proforma · Retención de IVA 4% sobre autotransporte de carga
--
-- El export profesional de la Proforma (formato de la plantilla real del
-- negocio) desglosa la retención mexicana de IVA del 4% sobre servicios de
-- autotransporte terrestre de carga: aplica SOLO al subtotal de flete propio,
-- nunca a cargos WMS ni paquetería. Total = subtotal + IVA − retención.
--
-- Para que lo guardado en el historial coincida con el documento exportado,
-- las columnas se persisten y save_proforma_periodo calcula igual que el
-- frontend (computeProformaTotals en src/lib/proformaBuilder.ts).
-- ============================================================================

ALTER TABLE proformas_periodo ADD COLUMN IF NOT EXISTS retencion_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0;
ALTER TABLE proformas_periodo ADD COLUMN IF NOT EXISTS retencion_monto NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN proformas_periodo.retencion_pct IS
  '4 cuando la proforma incluye flete propio (retención IVA autotransporte de carga), 0 si no.';
COMMENT ON COLUMN proformas_periodo.retencion_monto IS
  'retencion_pct % del subtotal_flete. Total = subtotal + iva_monto − retencion_monto.';

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
  v_retencion_pct       NUMERIC(5,2)  := 0;
  v_retencion_monto     NUMERIC(12,2) := 0;
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

  v_subtotal        := v_subtotal_wms + v_subtotal_flete + v_subtotal_paqueteria;
  v_iva_monto       := round(v_subtotal * COALESCE(p_iva_pct, 16) / 100, 2);
  -- Retención IVA 4% autotransporte de carga: solo sobre flete propio.
  v_retencion_monto := round(v_subtotal_flete * 4 / 100, 2);
  v_retencion_pct   := CASE WHEN v_subtotal_flete > 0 THEN 4 ELSE 0 END;
  v_total           := v_subtotal + v_iva_monto - v_retencion_monto;

  INSERT INTO proformas_periodo (
    cliente_id, cliente_codigo, cliente_nombre, referencia,
    periodo_desde, periodo_hasta, moneda, tipo_cambio,
    subtotal_wms, subtotal_flete, subtotal_paqueteria, subtotal,
    iva_pct, iva_monto, retencion_pct, retencion_monto, total,
    csv_filename, notas, creado_por
  ) VALUES (
    p_cliente_id, p_cliente_codigo, p_cliente_nombre, v_referencia,
    p_periodo_desde, p_periodo_hasta, COALESCE(p_moneda, 'MXN'), p_tipo_cambio,
    v_subtotal_wms, v_subtotal_flete, v_subtotal_paqueteria, v_subtotal,
    COALESCE(p_iva_pct, 16), v_iva_monto, v_retencion_pct, v_retencion_monto, v_total,
    p_csv_filename, p_notas, p_creado_por
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

NOTIFY pgrst, 'reload schema';
