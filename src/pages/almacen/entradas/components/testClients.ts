import type { ExtensivCustomer } from '../../../../lib/extensiv'

// Clientes de PRUEBA que aún NO existen en Extensiv (id negativo = sentinela).
// El nombre debe coincidir con el perfil en clientImportFormats para que aplique
// el hint correcto (p.ej. "Garrido"). loadCatalog cortocircuita los ids < 0 y
// el Paso 3 usa inventario vacío para estos clientes.
export const TEST_CLIENTS: ExtensivCustomer[] = [
  { id: -1, name: 'Garrido (prueba)' },
]
