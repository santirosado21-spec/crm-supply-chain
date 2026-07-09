import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ProformaPreview, Moneda } from '../lib/proformaBuilder'

export interface ProformaPeriodoHeader {
  id:                    string
  cliente_id:            string
  cliente_codigo:        string | null
  cliente_nombre:        string
  referencia:            string
  periodo_desde:         string
  periodo_hasta:         string
  moneda:                Moneda
  tipo_cambio:           number | null
  subtotal_wms:          number
  subtotal_flete:        number
  subtotal_paqueteria:   number
  subtotal:              number
  iva_pct:               number
  iva_monto:             number
  total:                 number
  estado:                'generada' | 'cancelada'
  csv_filename:          string | null
  notas:                 string
  creado_por:            string | null
  cancelada_at:          string | null
  cancelada_por:         string | null
  cancelada_motivo:      string | null
  created_at:            string
  updated_at:            string
}

export interface ProformaPeriodoLineaRow {
  id:                       string
  proforma_id:              string
  seccion:                  'wms' | 'flete' | 'paqueteria'
  fuente:                   'csv_extensiv' | 'viaje' | 'guia_paqueteria'
  fuente_id:                string | null
  referencia:               string | null
  concepto:                 string
  cantidad:                 number | null
  precio_unitario:          number | null
  monto:                    number
  moneda:                   Moneda
  incluida:                 boolean
  extensiv_transaction_id:  string | null
  extensiv_charge_label:    string | null
  raw_csv_row:              unknown
  created_at:               string
}

export interface ProformaPeriodoFilters {
  clienteId?:     string
  estado?:        'generada' | 'cancelada' | ''
  periodoDesde?:  string
  periodoHasta?:  string
}

export interface SaveProformaPeriodoParams {
  clienteId:      string
  clienteCodigo:  string | null
  clienteNombre:  string
  periodoDesde:   string
  periodoHasta:   string
  tipoCambio:     number | null
  csvFilename:    string | null
  notas:          string
  creadoPor:      string | null
  preview:        ProformaPreview
}

export function useProformasPeriodo(filters?: ProformaPeriodoFilters) {
  const [proformas, setProformas] = useState<ProformaPeriodoHeader[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const fetchProformas = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let q = supabase.from('proformas_periodo').select('*').order('created_at', { ascending: false })
      if (filters?.clienteId)    q = q.eq('cliente_id', filters.clienteId)
      if (filters?.estado)       q = q.eq('estado', filters.estado)
      if (filters?.periodoDesde) q = q.gte('periodo_desde', filters.periodoDesde)
      if (filters?.periodoHasta) q = q.lte('periodo_hasta', filters.periodoHasta)

      const { data, error: err } = await q
      if (err) throw err
      setProformas((data ?? []) as ProformaPeriodoHeader[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar proformas')
    } finally {
      setLoading(false)
    }
  }, [filters?.clienteId, filters?.estado, filters?.periodoDesde, filters?.periodoHasta])

  useEffect(() => { fetchProformas() }, [fetchProformas])

  const getLineas = useCallback(async (proformaId: string): Promise<ProformaPeriodoLineaRow[]> => {
    const { data, error: err } = await supabase
      .from('proforma_periodo_lineas')
      .select('*')
      .eq('proforma_id', proformaId)
      .order('seccion', { ascending: true })
    if (err) throw new Error(err.message)
    return (data ?? []) as ProformaPeriodoLineaRow[]
  }, [])

  const save = useCallback(async (params: SaveProformaPeriodoParams): Promise<string> => {
    const { data, error: err } = await supabase.rpc('save_proforma_periodo', {
      p_cliente_id:      params.clienteId,
      p_cliente_codigo:  params.clienteCodigo,
      p_cliente_nombre:  params.clienteNombre,
      p_periodo_desde:   params.periodoDesde,
      p_periodo_hasta:   params.periodoHasta,
      p_moneda:          params.preview.moneda,
      p_tipo_cambio:     params.tipoCambio,
      p_iva_pct:         params.preview.ivaPct,
      p_csv_filename:    params.csvFilename,
      p_notas:           params.notas,
      p_creado_por:      params.creadoPor,
      p_lineas: params.preview.lineas.map(l => ({
        seccion:                   l.seccion,
        fuente:                    l.fuente,
        fuente_id:                 l.fuenteId,
        referencia:                l.referencia,
        concepto:                  l.concepto,
        cantidad:                  l.cantidad,
        precio_unitario:           l.precioUnitario,
        monto:                     l.monto,
        moneda:                    l.moneda,
        incluida:                  l.incluida,
        extensiv_transaction_id:   l.extensivTransactionId,
        extensiv_charge_label:     l.extensivChargeLabel,
        raw_csv_row:               l.rawCsvRow,
      })),
    })
    if (err) throw new Error(err.message)
    await fetchProformas()
    return data as string
  }, [fetchProformas])

  const cancel = useCallback(async (proformaId: string, motivo: string, canceladoPor: string | null) => {
    const { error: err } = await supabase.rpc('cancel_proforma_periodo', {
      p_proforma_id:   proformaId,
      p_motivo:        motivo,
      p_cancelado_por: canceladoPor,
    })
    if (err) throw new Error(err.message)
    await fetchProformas()
  }, [fetchProformas])

  return { proformas, loading, error, refetch: fetchProformas, getLineas, save, cancel }
}
