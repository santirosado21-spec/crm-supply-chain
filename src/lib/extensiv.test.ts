import { describe, it, expect } from 'vitest'
import { buildCreateItemPayload } from './extensiv'

describe('buildCreateItemPayload — mapeo del alta de item a Extensiv', () => {
  it('arma el body con sku, description, unitOfMeasure, storageDimension y weight', () => {
    const payload = buildCreateItemPayload({
      customerId:    42,
      sku:           'ABC-123',
      description:   'Caja de prueba',
      unitOfMeasure: 'EA',
      length: 1.5, width: 2, height: 0.5,
      weight: 10,
    })
    expect(payload).toEqual({
      sku:              'ABC-123',
      description:      'Caja de prueba',
      unitOfMeasure:    'EA',
      storageDimension: { length: 1.5, width: 2, height: 0.5 },
      weight:           10,
    })
  })

  it('no incluye customerId en el body (va en el path /customers/{id}/items)', () => {
    const payload = buildCreateItemPayload({
      customerId: 7, sku: 'X-1', description: 'd', unitOfMeasure: 'BOX',
      length: 0, width: 0, height: 0, weight: 0,
    })
    expect(payload).not.toHaveProperty('customerId')
  })
})
