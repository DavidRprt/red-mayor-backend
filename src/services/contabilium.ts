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
  cuponPorcentaje?: number
  productos: {
    nombre: string
    slug: string
    cantidad: number
    precioBase: number       // precio con IVA incluido (como está en Strapi)
    porcentajeDescuento: number // % de descuento propio del producto (0 si no tiene)
    tasaIva: number          // 21 (estándar) o 10.5 (lámparas LED)
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

  console.log(
    `[Contabilium] Calculando precios | Orden: RXM-${params.ordenId} | Cupón: ${params.cuponPorcentaje ?? 0}%`
  )

  const items = params.productos.map((p) => {
    // Contabilium agrega IVA por su cuenta → mandamos precio SIN IVA
    const ivaFactor = 1 + p.tasaIva / 100 // 1.21 o 1.105
    const precioSinIva = Math.round((p.precioBase / ivaFactor) * 100) / 100

    // Bonificacion: descuento del producto tiene prioridad sobre cupón
    let bonificacion = 0
    let motivoBonif = 'sin bonificación'
    if (p.porcentajeDescuento > 0) {
      bonificacion = p.porcentajeDescuento
      motivoBonif = `descuento producto ${p.porcentajeDescuento}%`
    } else if (params.cuponPorcentaje && params.cuponPorcentaje > 0) {
      bonificacion = params.cuponPorcentaje
      motivoBonif = `cupón ${params.cuponPorcentaje}%`
    }

    console.log(
      `[Contabilium]   ${p.slug} | Base: $${p.precioBase} | IVA: ${p.tasaIva}% (÷${ivaFactor}) | ` +
      `SinIVA: $${precioSinIva} | Bonif: ${bonificacion}% (${motivoBonif})`
    )

    return {
      Codigo: p.slug,
      Concepto: p.nombre,
      Cantidad: p.cantidad,
      PrecioUnitario: precioSinIva,
      Iva: p.tasaIva,
      Bonificacion: bonificacion,
    }
  })

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

// ─────────────────────────────────────────────
// getStockBySKU
// ─────────────────────────────────────────────

export interface StockContabilium {
  stockActual: number
  stockReservado: number
  stockConReservas: number
}

/**
 * Consulta el stock de un producto por SKU, tomando únicamente el depósito
 * web (CONTABILIUM_DEPOSITO_WEB) — así no se cuenta como disponible el stock
 * que Contabilium tiene reservado para otros canales (local físico, etc).
 * Devuelve null si el SKU no existe en Contabilium.
 */
export async function getStockBySKU(sku: string): Promise<StockContabilium | null> {
  const depositoWeb = process.env.CONTABILIUM_DEPOSITO_WEB
  if (!depositoWeb) {
    throw new Error('Contabilium: falta CONTABILIUM_DEPOSITO_WEB en las variables de entorno.')
  }

  const token = await getToken()

  let response: Response | undefined
  const REINTENTOS = 3
  for (let intento = 0; intento < REINTENTOS; intento++) {
    response = await fetch(
      `${CONTABILIUM_BASE_URL}/api/inventarios/getStockBySKU?codigo=${encodeURIComponent(sku)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (response.status !== 429) break
    // Backoff creciente: 1s, 2s, 3s — el límite de Contabilium se resetea cada 10s.
    await new Promise((resolve) => setTimeout(resolve, 1000 * (intento + 1)))
  }

  if (!response || response.status === 429) {
    throw new Error('Contabilium getStockBySKU: rate limit (429)')
  }
  if (!response.ok) {
    return null
  }

  const data = await response.json() as any
  if (!data || !data.Codigo) {
    return null
  }

  const depositos = Array.isArray(data.stock) ? data.stock : []
  const deposito = depositos.find((d: any) => d.Codigo === depositoWeb)

  if (!deposito) {
    console.warn(`[Contabilium] getStockBySKU: SKU ${sku} no tiene depósito "${depositoWeb}" — se toma stock 0.`)
    return { stockActual: 0, stockReservado: 0, stockConReservas: 0 }
  }

  return {
    stockActual: Number(deposito.StockActual ?? 0),
    stockReservado: Number(deposito.StockReservado ?? 0),
    stockConReservas: Number(deposito.StockConReservas ?? 0),
  }
}
