import { describe, it, expect } from 'vitest'
import { calcularFlete, type CotizadorInput } from './cotizadorCalc'
import { UNIDADES, FIJOS_DIA, MARGENES_CLIENTE } from './cotizadorConstants'

// ─────────────────────────────────────────────────────────────────────────────
// Tests for calcularFlete — motor de pricing crítico del TMS.
// Cada test cubre un escenario real de cotización + asserts sobre cálculo.
// Cuando estos tests fallen, el cotizador está mintiendo a clientes.
// ─────────────────────────────────────────────────────────────────────────────

// Default input factory — override only what cada test necesita
function makeInput(overrides: Partial<CotizadorInput> = {}): CotizadorInput {
  return {
    origen: 'CDMX',
    destino: 'Querétaro',
    kmIda: 200,
    casetasIda: 350,
    casetasRegreso: 350,
    horasIda: 3,
    minutosIda: 0,
    viajeRedondo: false,
    modoMultiparadas: false,
    paradas: [],
    kmRegreso: 0,
    casetasRegresoMulti: 0,
    horasRegreso: 0,
    minutosRegreso: 0,
    unidad: UNIDADES[0], // RAB_54AK8K, Diésel, rendimiento 3.2, depreciacion 346.78
    tipoCliente: 'FINAL',
    operador: 'Test Operador',
    cliente: 'Test Cliente',
    contenedores: [],
    descripcionCarga: '',
    maniobrasHoras: 0,
    maniobrasMinutos: 0,
    maniobraCosto: 0,
    incluyeBonos: false,
    bonoSueldo: 0,
    bonoKmCarga: 0,
    bonoKmVacio: 0,
    bonoComida: 0,
    dMatutino: 0,
    dNocturno: 0,
    dSabado: 0,
    dDomingo: 0,
    dFestivo: 0,
    ...overrides,
  }
}

describe('calcularFlete — escenarios básicos', () => {
  it('viaje sencillo ida sin bonos retorna kmTotal = kmIda', () => {
    const result = calcularFlete(makeInput({ kmIda: 200, viajeRedondo: false }))

    expect(result.kmTotal).toBe(200)
    expect(result.viajeRedondo).toBe(false)
    expect(result.esMultiparadas).toBe(false)
    expect(result.dias).toBe(1) // 3h < 8h
  })

  it('viaje redondo dobla kmTotal y casetas', () => {
    const result = calcularFlete(makeInput({
      kmIda: 200,
      viajeRedondo: true,
      casetasIda: 100,
      casetasRegreso: 100,
    }))

    expect(result.kmTotal).toBe(400)
    expect(result.casetas).toBe(200)
  })

  it('viaje sin paradas con descripcionCarga la propaga al result', () => {
    const result = calcularFlete(makeInput({ descripcionCarga: 'Equipo médico' }))
    expect(result.descripcionCarga).toBe('Equipo médico')
  })

  it('precioFinal = costoTotal + ganancia', () => {
    const result = calcularFlete(makeInput())
    expect(result.precioFinal).toBe(result.costoTotal + result.ganancia)
  })

  it('precioPorKm es 0 cuando kmTotal es 0', () => {
    const result = calcularFlete(makeInput({ kmIda: 0 }))
    expect(result.precioPorKm).toBe(0)
  })
})

describe('calcularFlete — márgenes por tipo cliente', () => {
  it.each([
    ['HERMANA', 15],
    ['INTERMEDIARIO', 20],
    ['FINAL', 35],
    ['ESPECIAL', 50],
  ])('cliente %s aplica margen %s%%', (tipoCliente, margenEsperado) => {
    const result = calcularFlete(makeInput({ tipoCliente }))
    expect(result.margenPct).toBe(margenEsperado)
  })

  it('tipoCliente desconocido cae al default de 35%', () => {
    const result = calcularFlete(makeInput({ tipoCliente: 'INEXISTENTE' }))
    expect(result.margenPct).toBe(35)
  })

  it('cliente ESPECIAL tiene precioFinal mayor que HERMANA con mismo costo', () => {
    const base = makeInput({ kmIda: 500, casetasIda: 500 })
    const hermana = calcularFlete({ ...base, tipoCliente: 'HERMANA' })
    const especial = calcularFlete({ ...base, tipoCliente: 'ESPECIAL' })

    expect(hermana.costoTotal).toBe(especial.costoTotal)
    expect(especial.precioFinal).toBeGreaterThan(hermana.precioFinal)
  })
})

describe('calcularFlete — combustible y rendimiento', () => {
  it('viaje sencillo: litros = km / rendimiento', () => {
    const unidad = UNIDADES[0] // rendimiento 3.2
    const result = calcularFlete(makeInput({ kmIda: 320, unidad, viajeRedondo: false }))

    // 320 / 3.2 = 100 litros exactos
    expect(result.litros).toBe(100)
  })

  it('viaje redondo: regreso usa rendimiento × 1.15 (vacío)', () => {
    const unidad = UNIDADES[0] // rendimiento 3.2
    const result = calcularFlete(makeInput({ kmIda: 320, unidad, viajeRedondo: true }))

    // ida: 320/3.2 = 100, vacío: 320/(3.2×1.15) = 86.96
    // total ≈ 186.96, redondeado a 1 decimal = 187.0
    expect(result.litros).toBeCloseTo(187.0, 1)
  })

  it('combustible Diésel cobra 26.6 MXN/litro', () => {
    const unidad = UNIDADES[0] // Diésel
    const result = calcularFlete(makeInput({ kmIda: 320, unidad, viajeRedondo: false }))
    // 100 litros × 26.6 = 2660
    expect(result.costoCombustible).toBe(2660)
  })

  it('combustible Gasolina cobra 25.0 MXN/litro', () => {
    const unidadGasolina = UNIDADES.find(u => u.combustible === 'Gasolina')!
    const result = calcularFlete(makeInput({ kmIda: unidadGasolina.rendimiento * 100, unidad: unidadGasolina, viajeRedondo: false }))
    // 100 litros × 25.0 = 2500
    expect(result.costoCombustible).toBe(2500)
  })
})

describe('calcularFlete — bonos operador', () => {
  it('incluyeBonos=false no calcula viáticos ni bonosBase', () => {
    const result = calcularFlete(makeInput({ incluyeBonos: false }))
    expect(result.viaticos).toBe(0)
    expect(result.bonosBase).toBe(0)
  })

  it('incluyeBonos=true calcula viáticos por días', () => {
    // 1 día (3h < 8h) × 3 comidas × 150 = 450 comida, 0 hospedaje (dias=1)
    const result = calcularFlete(makeInput({
      incluyeBonos: true,
      bonoComida: 150,
      bonoSueldo: 420,
      bonoKmCarga: 1,
      bonoKmVacio: 0.5,
    }))

    expect(result.viaticos).toBe(450)
    // bonosBase = 420 × 1 día + 200 × 1 (carga) + 0 × 0.5 (vacío) = 620
    expect(result.bonosBase).toBe(420 + 200)
  })

  it('viáticos extras se suman a los calculados', () => {
    const withExtras = calcularFlete(makeInput({
      incluyeBonos: true,
      bonoComida: 150,
      bonoSueldo: 0,
      bonoKmCarga: 0,
      bonoKmVacio: 0,
      viaticosExtras: 500,
    }))
    // 450 base + 500 extras = 950
    expect(withExtras.viaticos).toBe(950)
    expect(withExtras.viaticosExtras).toBe(500)
  })

  it('viáticos extras negativos se tratan como 0', () => {
    const result = calcularFlete(makeInput({
      incluyeBonos: true,
      bonoComida: 150,
      viaticosExtras: -999,
    }))
    expect(result.viaticosExtras).toBe(0)
  })
})

describe('calcularFlete — maniobra', () => {
  it('maniobra = horas × costoPorHora', () => {
    const result = calcularFlete(makeInput({
      maniobrasHoras: 2,
      maniobrasMinutos: 30, // 2.5 horas total
      maniobraCosto: 200,
    }))
    expect(result.maniobra).toBe(500) // 2.5 × 200
    expect(result.maniobraDetalle).toEqual({ horas: 2, minutos: 30, costoPorHora: 200 })
  })

  it('maniobristas internos se propagan al result (string formateado)', () => {
    const result = calcularFlete(makeInput({
      maniobristas: [{ id: 'm1', nombre: 'Juan Pérez', esExterno: false }],
    }))
    expect(result.maniobrista).toBe('Juan Pérez (interno)')
    expect(result.maniobristas).toHaveLength(1)
  })

  it('mezcla interno + externo se concatena con +', () => {
    const result = calcularFlete(makeInput({
      maniobristas: [
        { id: 'm1', nombre: 'Juan', esExterno: false },
        { id: 'm2', nombre: 'Pedro', esExterno: true },
      ],
    }))
    expect(result.maniobrista).toBe('Juan (interno) + Pedro (externo)')
    expect(result.maniobristas).toHaveLength(2)
  })
})

describe('calcularFlete — días especiales (horas extra)', () => {
  it('matutino + nocturno cobran 200 c/u', () => {
    const result = calcularFlete(makeInput({ dMatutino: 2, dNocturno: 1 }))
    expect(result.horasExtra).toBe(2 * 200 + 1 * 200)
  })

  it('sábado + domingo cobran 500 c/u', () => {
    const result = calcularFlete(makeInput({ dSabado: 1, dDomingo: 1 }))
    expect(result.horasExtra).toBe(500 + 500)
  })

  it('festivo cobra 1000', () => {
    const result = calcularFlete(makeInput({ dFestivo: 1 }))
    expect(result.horasExtra).toBe(1000)
  })

  it('mix de días especiales suma todo', () => {
    const result = calcularFlete(makeInput({
      dMatutino: 1, dNocturno: 1, dSabado: 1, dDomingo: 1, dFestivo: 1,
    }))
    expect(result.horasExtra).toBe(200 + 200 + 500 + 500 + 1000)
  })
})

describe('calcularFlete — multi-paradas', () => {
  it('modo multiparadas suma km/casetas/horas de todas las paradas', () => {
    const result = calcularFlete(makeInput({
      modoMultiparadas: true,
      kmIda: 0, // ignorado en multi
      paradas: [
        { id: 1, nombre: 'Parada 1', km: 100, casetas: 50, horas: 1, minutos: 30 },
        { id: 2, nombre: 'Parada 2', km: 150, casetas: 75, horas: 2, minutos: 0 },
      ],
    }))

    expect(result.kmTotal).toBe(250)
    expect(result.casetas).toBe(125)
    expect(result.esMultiparadas).toBe(true)
    expect(result.paradas).toHaveLength(2)
  })

  it('multiparadas + viajeRedondo agrega el regreso', () => {
    const result = calcularFlete(makeInput({
      modoMultiparadas: true,
      viajeRedondo: true,
      paradas: [{ id: 1, nombre: 'P1', km: 100, casetas: 50, horas: 1, minutos: 0 }],
      kmRegreso: 80,
      casetasRegresoMulti: 40,
      horasRegreso: 1,
      minutosRegreso: 0,
    }))

    expect(result.kmTotal).toBe(180)
    expect(result.casetas).toBe(90)
  })

  it('multiparadas concatena nombres en destino con " → "', () => {
    const result = calcularFlete(makeInput({
      modoMultiparadas: true,
      paradas: [
        { id: 1, nombre: 'A', km: 50, casetas: 0, horas: 0, minutos: 30 },
        { id: 2, nombre: 'B', km: 50, casetas: 0, horas: 0, minutos: 30 },
      ],
    }))

    expect(result.destino).toBe('A → B')
  })
})

describe('calcularFlete — fijos + depreciación', () => {
  it('viaje de 1 día aplica 1× FIJOS_DIA + 1× depreciacion', () => {
    const unidad = UNIDADES[0] // depreciacion 346.78
    const result = calcularFlete(makeInput({ unidad, horasIda: 3 }))

    expect(result.dias).toBe(1)
    expect(result.gastosFijos).toBe(Math.round(FIJOS_DIA))
    expect(result.depreciacion).toBe(Math.round(unidad.depreciacion))
  })

  it('viaje largo (>8h) escala días apropiadamente', () => {
    // 16 horas / 8 = 2 días
    const result = calcularFlete(makeInput({ horasIda: 16, kmIda: 1000 }))
    expect(result.dias).toBe(2)
    expect(result.gastosFijos).toBe(Math.round(FIJOS_DIA * 2))
  })
})

describe('calcularFlete — edge cases', () => {
  it('km = 0 no truena, precioFinal puede ser solo fijos', () => {
    const result = calcularFlete(makeInput({ kmIda: 0, casetasIda: 0 }))

    expect(result.kmTotal).toBe(0)
    expect(result.litros).toBe(0)
    expect(result.costoCombustible).toBe(0)
    // costoTotal todavía incluye gastosFijos + depreciacion del día
    expect(result.costoTotal).toBeGreaterThan(0)
  })

  it('sin contenedores el array sale vacío', () => {
    const result = calcularFlete(makeInput({ contenedores: [] }))
    expect(result.contenedores).toEqual([])
  })

  it('multiparadas con 0 paradas no truena', () => {
    const result = calcularFlete(makeInput({
      modoMultiparadas: true,
      paradas: [],
    }))
    expect(result.kmTotal).toBe(0)
    expect(result.esMultiparadas).toBe(true)
  })
})

describe('calcularFlete — invariantes (sanity)', () => {
  it('costoTotal nunca es negativo', () => {
    const result = calcularFlete(makeInput())
    expect(result.costoTotal).toBeGreaterThanOrEqual(0)
  })

  it('ganancia siempre = costoTotal × margenPct/100 (±1 por redondeo)', () => {
    const result = calcularFlete(makeInput({ kmIda: 500 }))
    const expected = result.costoTotal * (MARGENES_CLIENTE[result.tipoCliente] ?? 0.35)
    expect(Math.abs(result.ganancia - expected)).toBeLessThanOrEqual(1)
  })

  it('precioFinal siempre ≥ costoTotal', () => {
    const result = calcularFlete(makeInput({ tipoCliente: 'HERMANA' }))
    expect(result.precioFinal).toBeGreaterThanOrEqual(result.costoTotal)
  })

  it('viaje redondo siempre kmTotal ≥ ida', () => {
    const ida = calcularFlete(makeInput({ kmIda: 300, viajeRedondo: false }))
    const redondo = calcularFlete(makeInput({ kmIda: 300, viajeRedondo: true }))
    expect(redondo.kmTotal).toBeGreaterThanOrEqual(ida.kmTotal)
  })
})

describe('calcularFlete — dádiva (contingencia Guardia Nacional)', () => {
  it('sin dádiva (undefined) no altera costoTotal ni precioFinal y dadiva = 0', () => {
    const base = calcularFlete(makeInput())
    const sin  = calcularFlete(makeInput({ dadiva: undefined }))
    expect(sin.dadiva).toBe(0)
    expect(sin.costoTotal).toBe(base.costoTotal)
    expect(sin.precioFinal).toBe(base.precioFinal)
  })

  it('la dádiva se suma al costoTotal y gana markup en el precioFinal', () => {
    const margen = MARGENES_CLIENTE.FINAL // 0.35
    const base = calcularFlete(makeInput({ tipoCliente: 'FINAL' }))
    const conD = calcularFlete(makeInput({ tipoCliente: 'FINAL', dadiva: 2000 }))

    expect(conD.dadiva).toBe(2000)
    expect(conD.costoTotal).toBe(base.costoTotal + 2000)
    expect(conD.ganancia).toBe(base.ganancia + Math.round(2000 * margen))            // +700
    expect(conD.precioFinal).toBe(base.precioFinal + 2000 + Math.round(2000 * margen)) // +2700
  })

  it('caso concreto: cliente FINAL 35% + dádiva 2000 → +2000 costo, +700 ganancia, +2700 precio', () => {
    const base = calcularFlete(makeInput({ tipoCliente: 'FINAL' }))
    const conD = calcularFlete(makeInput({ tipoCliente: 'FINAL', dadiva: 2000 }))
    expect(conD.costoTotal - base.costoTotal).toBe(2000)
    expect(conD.ganancia - base.ganancia).toBe(700)
    expect(conD.precioFinal - base.precioFinal).toBe(2700)
  })

  it('gananciaNeta es alias de ganancia (la dádiva ya no se descuenta del margen)', () => {
    const result = calcularFlete(makeInput({ dadiva: 2000 }))
    expect(result.gananciaNeta).toBe(result.ganancia)
  })

  it('dádiva negativa se acota a 0 (sin efecto)', () => {
    const base = calcularFlete(makeInput())
    const neg  = calcularFlete(makeInput({ dadiva: -5000 }))
    expect(neg.dadiva).toBe(0)
    expect(neg.costoTotal).toBe(base.costoTotal)
    expect(neg.precioFinal).toBe(base.precioFinal)
  })
})
