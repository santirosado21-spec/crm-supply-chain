-- Agrega la unidad 58D1AC (Rabón Diésel, rendimiento 3.5 km/L) al catálogo
-- de vehículos propios. Coincide con el fallback hardcoded en
-- src/pages/cotizador/cotizadorConstants.ts (RAB_58D1AC).
INSERT INTO vehiculos (clave, placa, modelo, tipo, combustible, rendimiento, depreciacion, es_propio, activo)
VALUES ('RAB_58D1AC', '58D1AC', 'Por confirmar', 'Rabon', 'Diesel', 3.5, 200.00, true, true)
ON CONFLICT (clave) DO NOTHING;
