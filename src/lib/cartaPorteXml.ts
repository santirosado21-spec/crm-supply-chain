// Generador del XML CFDI 4.0 con complemento Carta Porte 3.1 (sin timbrar).
// Los campos NoCertificado/Certificado/Sello/UUID se dejan vacíos — el XML está
// listo para ser timbrado por un PAC externo (Facturama, FinkOk, etc.).

import type { CartaPorte, Ubicacion, Mercancia } from '../types/cartaPorte'

// Escape de caracteres XML obligatorios.
function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function num(n: number | undefined | null, decimals = 2): string {
  return (n ?? 0).toFixed(decimals)
}

// Fecha en formato ISO sin Z (SAT espera 'YYYY-MM-DDTHH:mm:ss' sin timezone).
function fechaSat(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function xmlUbicacion(u: Ubicacion, tipo: 'Origen' | 'Destino', idUbicacion: string): string {
  return `    <cartaporte31:Ubicacion TipoUbicacion="${esc(tipo)}" IDUbicacion="${esc(idUbicacion)}" RFCRemitenteDestinatario="${esc(u.rfc)}" NombreRemitenteDestinatario="${esc(u.nombre)}">
      <cartaporte31:Domicilio Calle="${esc(u.calle)}" NumeroExterior="${esc(u.numext)}" Colonia="${esc(u.colonia)}" Municipio="${esc(u.municipio)}" Estado="${esc(u.estado)}" Pais="MEX" CodigoPostal="${esc(u.cp)}"/>
    </cartaporte31:Ubicacion>`
}

function xmlMercancia(m: Mercancia): string {
  return `      <cartaporte31:Mercancia BienesTransp="${esc(m.claveSat || '00000000')}" Descripcion="${esc(m.descripcion)}" Cantidad="${num(m.cantidad, 3)}" ClaveUnidad="${esc(m.unidad)}" PesoEnKg="${num(m.pesoBruto, 3)}"/>`
}

function xmlConcepto(cp: CartaPorte): string {
  // Carta Porte usa concepto único de servicio de transporte (Clave SAT 78101800 estándar).
  return `    <cfdi:Concepto ClaveProdServ="78101800" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio de transporte de carga" ValorUnitario="0.00" Importe="0.00" ObjetoImp="01"/>`
  void cp
}

export function generarCartaPorteXML(cp: CartaPorte): string {
  const fecha = fechaSat(cp.fecha)
  const totalDist = 0     // distancia total recorrida en km (no la tenemos calculada — opcional para SAT)
  const numMercancias = cp.mercancias.length

  const ubicaciones: string[] = []
  ubicaciones.push(xmlUbicacion(cp.remitente, 'Origen', 'OR000001'))
  cp.destinatarios.forEach((d, i) => {
    ubicaciones.push(xmlUbicacion(d, 'Destino', `DE${String(i + 1).padStart(6, '0')}`))
  })

  const mercanciasXml = cp.mercancias.map(xmlMercancia).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/CartaPorte31 http://www.sat.gob.mx/sitio_internet/cfd/CartaPorte/CartaPorte31.xsd" Version="4.0" Serie="A" Folio="${esc(cp.folio)}" Fecha="${esc(fecha)}" FormaPago="99" SubTotal="0.00" Moneda="XXX" Total="0.00" TipoDeComprobante="T" Exportacion="01" LugarExpedicion="${esc(cp.emisor_cp_expedicion ?? '00000')}" NoCertificado="" Certificado="" Sello="">
  <cfdi:Emisor Rfc="${esc(cp.emisor_rfc ?? '')}" Nombre="${esc(cp.emisor_razon_social ?? '')}" RegimenFiscal="${esc(cp.emisor_regimen_fiscal ?? '601')}"/>
  <cfdi:Receptor Rfc="${esc(cp.destinatarios[0]?.rfc ?? '')}" Nombre="${esc(cp.destinatarios[0]?.nombre ?? '')}" DomicilioFiscalReceptor="${esc(cp.destinatarios[0]?.cp ?? '00000')}" RegimenFiscalReceptor="601" UsoCFDI="S01"/>
  <cfdi:Conceptos>
${xmlConcepto(cp)}
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <cartaporte31:CartaPorte Version="3.1" TranspInternac="No" TotalDistRec="${num(totalDist, 2)}">
      <cartaporte31:Ubicaciones>
${ubicaciones.join('\n')}
      </cartaporte31:Ubicaciones>
      <cartaporte31:Mercancias PesoBrutoTotal="${num(cp.total_peso_bruto, 3)}" UnidadPeso="KGM" NumTotalMercancias="${numMercancias}">
${mercanciasXml}
        <cartaporte31:Autotransporte PermSCT="TPAF01" NumPermisoSCT="${esc(cp.transporte.rfcPermisionario ?? '')}">
          <cartaporte31:IdentificacionVehicular ConfigVehicular="C2" PesoBrutoVehicular="${num(cp.transporte.pesoBrutoVehicular, 3)}" PlacaVM="${esc(cp.transporte.placas)}" AnioModeloVM="${new Date().getFullYear() - 5}"/>
          <cartaporte31:Seguros AseguraRespCivil="${esc(cp.transporte.linea || 'POR DEFINIR')}" PolizaRespCivil="POR-DEFINIR"/>
        </cartaporte31:Autotransporte>
      </cartaporte31:Mercancias>
      <cartaporte31:FiguraTransporte>
        <cartaporte31:TiposFigura TipoFigura="01" RFCFigura="${esc(cp.figura.operadorRfc)}" NombreFigura="${esc(cp.figura.operadorNombre)}" NumLicencia="${esc(cp.figura.operadorLicencia)}"/>
      </cartaporte31:FiguraTransporte>
    </cartaporte31:CartaPorte>
  </cfdi:Complemento>
</cfdi:Comprobante>`
}

// Validación local — verifica campos requeridos antes de generar.
export function validarCartaPorte(cp: CartaPorte): string[] {
  const errors: string[] = []
  if (!cp.emisor_rfc)                   errors.push('Emisor RFC obligatorio.')
  if (!cp.remitente.rfc || !cp.remitente.cp) errors.push('Remitente: RFC y CP obligatorios.')
  if (cp.destinatarios.length === 0)    errors.push('Al menos un destinatario.')
  if (cp.destinatarios.some(d => !d.rfc || !d.cp)) errors.push('Cada destinatario requiere RFC y CP.')
  if (!cp.transporte.placas)            errors.push('Placas del vehículo obligatorias.')
  if (cp.transporte.pesoBrutoVehicular <= 0) errors.push('Peso bruto vehicular > 0.')
  if (!cp.figura.operadorRfc || !cp.figura.operadorLicencia) {
    errors.push('Figura del transporte: RFC y licencia del operador.')
  }
  if (cp.mercancias.length === 0)       errors.push('Al menos una mercancía.')
  return errors
}
