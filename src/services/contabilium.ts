/**
 * Servicio de integración con Contabilium (Argentina)
 * Documentación: https://rest.contabilium.com
 *
 * Variables de entorno requeridas:
 *   CONTABILIUM_ENABLED       - 'true' para activar la integración
 *   CONTABILIUM_CLIENT_ID     - Email de la cuenta Contabilium
 *   CONTABILIUM_CLIENT_SECRET - API Key de la cuenta Contabilium
 *   CONTABILIUM_ID_INTEGRACION - ID de la integración ecommerce
 */

const CONTABILIUM_BASE_URL = 'https://rest.contabilium.com'
const TOKEN_BUFFER_MS = 5 * 60 * 1000 // Renovar token 5 min antes de expirar

interface TokenCache {
  access_token: string
  expires_at: number
}

let tokenCache: TokenCache | null = null

async function getToken(): Promise<string> {
  const now = Date.now()

  if (tokenCache && tokenCache.expires_at - TOKEN_BUFFER_MS > now) {
    return tokenCache.access_token
  }

  const clientId = process.env.CONTABILIUM_CLIENT_ID
  const clientSecret = process.env.CONTABILIUM_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Contabilium: faltan CONTABILIUM_CLIENT_ID o CONTABILIUM_CLIENT_SECRET en las variables de entorno.')
  }

  const params = new URLSearchParams()
  params.append('grant_type', 'client_credentials')
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)

  const response = await fetch(`${CONTABILIUM_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Contabilium: error al obtener token (HTTP ${response.status}): ${errorText}`)
  }

  const data = await response.json() as any

  tokenCache = {
    access_token: data.access_token,
    expires_at: now + data.expires_in * 1000, // expires_in viene en segundos
  }

  return tokenCache.access_token
}

function mapCondicionVenta(metodoPago: string): string {
  const mapa: Record<string, string> = {
    MercadoPago: 'MercadoPago',
    Transferencia: 'Transferencia',
    Convenir: 'A convenir',
  }
  return mapa[metodoPago] ?? 'Contado'
}

// ─────────────────────────────────────────────
// enviarVenta
// ─────────────────────────────────────────────

export interface EnviarVentaParams {
  ordenId: number | string
  metodoPago: string
  usuario: {
    email: string
    username: string
  }
  detallesUsuario?: {
    razonSocial?: string
    CUIT?: string
    tipoUsuario?: string
    telefono?: string
  } | null
  productos: {
    nombre: string
    slug: string
    cantidad: number
    precioConDescuento: number
  }[]
  observaciones?: string
}

/**
 * Envía la orden al módulo de ecommerce de Contabilium.
 * No falla la orden si hay un error — el caller debe capturar la excepción.
 */
export async function enviarVenta(params: EnviarVentaParams): Promise<void> {
  if (process.env.CONTABILIUM_ENABLED !== 'true') return

  const token = await getToken()
  const idIntegracion = Number(process.env.CONTABILIUM_ID_INTEGRACION)

  const fechaEmision = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const { razonSocial, CUIT, telefono } = params.detallesUsuario ?? {}

  const cliente = {
    Nombre: razonSocial || params.usuario.username,
    Apellido: '',
    TipoDocumento: CUIT ? 'CUIT' : 'DNI',
    Documento: CUIT ?? '',
    Email: params.usuario.email,
    Telefono: telefono ?? '',
    Pais: 'Argentina',
  }

  const items = params.productos.map((p) => ({
    Codigo: p.slug,
    Concepto: p.nombre,
    Cantidad: p.cantidad,
    PrecioUnitario: Math.round(p.precioConDescuento * 100) / 100,
    Iva: 21,
    Bonificacion: 0,
  }))

  const body = {
    IDVentaIntegracion: params.ordenId,
    IDEstadoIntegracion: 'Aceptada',
    IDIntegracion: idIntegracion,
    CondicionVenta: mapCondicionVenta(params.metodoPago),
    FechaEmision: fechaEmision,
    Observaciones: params.observaciones || `Orden RXM-${params.ordenId}`,
    Cliente: cliente,
    Items: items,
  }

  const response = await fetch(`${CONTABILIUM_BASE_URL}/notificador/ecommerce`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Contabilium enviarVenta: HTTP ${response.status} - ${errorText}`)
  }
}

// ─────────────────────────────────────────────
// facturarVenta
// ─────────────────────────────────────────────

export interface FacturarVentaResult {
  linkFactura: string | null
  numeroFactura: string | null
  caeFactura: string | null
}

/**
 * Emite la factura electrónica para la orden ya enviada a Contabilium.
 * Solo se llama para pagos confirmados (MercadoPago).
 * Para Transferencia/Convenir se factura manualmente desde el admin.
 * No falla la orden si hay un error — el caller debe capturar la excepción.
 */
export async function facturarVenta(ordenId: number | string): Promise<FacturarVentaResult | null> {
  if (process.env.CONTABILIUM_ENABLED !== 'true') return null

  const token = await getToken()
  const idIntegracion = process.env.CONTABILIUM_ID_INTEGRACION

  if (!idIntegracion) {
    throw new Error('Contabilium: falta CONTABILIUM_ID_INTEGRACION en las variables de entorno.')
  }

  const url = new URL(`${CONTABILIUM_BASE_URL}/api/ordenesventa/emitirFE`)
  url.searchParams.set('nro', String(ordenId))
  url.searchParams.set('idIntegracion', idIntegracion)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Contabilium facturarVenta: HTTP ${response.status} - ${errorText}`)
  }

  const data = await response.json() as any

  if (data?.Error) {
    throw new Error(`Contabilium facturarVenta devolvió error: ${data.Error}`)
  }

  return {
    linkFactura: data?.LinkPublico ?? null,
    numeroFactura: data?.Numero ?? null,
    caeFactura: data?.CAE ?? null,
  }
}
