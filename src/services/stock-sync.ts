/**
 * Sincronización diaria de stock con Contabilium.
 * Contabilium es la fuente de verdad del stock — este proceso trae el stock
 * disponible real (StockConReservas) de cada producto y lo refleja en Strapi.
 *
 * Si un SKU no se encuentra en Contabilium, se desactiva automáticamente
 * (inactivoPorSync: true) y se reactiva solo si el sync vuelve a encontrarlo
 * — nunca reactiva algo que se desactivó a mano por otro motivo.
 */

import { getStockBySKU } from './contabilium'

const RATE_LIMIT_DELAY_MS = 600 // bien por debajo del límite de Contabilium (25 cada 10s)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface StockSyncResultado {
  totalProductos: number
  actualizados: string[]
  desactivados: string[]
  reactivados: string[]
  noEncontrados: string[]
  errores: { nombre: string; error: string }[]
}

function resultadoVacio(): StockSyncResultado {
  return { totalProductos: 0, actualizados: [], desactivados: [], reactivados: [], noEncontrados: [], errores: [] }
}

// Evita que dos corridas (el cron diario y una manual, por ejemplo) pisen a
// Contabilium con el doble de pedidos por segundo al mismo tiempo.
let sincronizacionEnCurso = false

/** Sincroniza el stock de todos los productos activos e inactivos contra Contabilium. */
export async function sincronizarStock(strapi: any): Promise<StockSyncResultado> {
  if (process.env.CONTABILIUM_ENABLED !== 'true') {
    strapi.log.warn('[Stock Sync] Contabilium deshabilitado (CONTABILIUM_ENABLED != true), se omite la sincronización.')
    return resultadoVacio()
  }

  if (!process.env.CONTABILIUM_DEPOSITO_WEB) {
    strapi.log.warn('[Stock Sync] Falta CONTABILIUM_DEPOSITO_WEB, se omite la sincronización para no pisar el stock con datos incorrectos.')
    return resultadoVacio()
  }

  if (sincronizacionEnCurso) {
    strapi.log.warn('[Stock Sync] Ya hay una sincronización en curso — se omite esta corrida para no duplicar pedidos a Contabilium.')
    return resultadoVacio()
  }
  sincronizacionEnCurso = true

  try {
    const resultado = await sincronizarProductos(strapi)
    await enviarResumenSync(strapi, resultado)
    return resultado
  } finally {
    sincronizacionEnCurso = false
  }
}

async function sincronizarProductos(strapi: any): Promise<StockSyncResultado> {
  const uid = 'api::product.product'
  const resultado = resultadoVacio()

  const items = await strapi.documents(uid).findMany({
    fields: ['documentId', 'slug', 'nombreProducto', 'stock', 'activo', 'inactivoPorSync'],
  })

  resultado.totalProductos = items.length
  strapi.log.info(`[Stock Sync] Productos: iniciando sincronización de ${items.length}`)

  for (const item of items) {
    const nombre = item.nombreProducto
    if (!item.slug) continue

    try {
      const stock = await getStockBySKU(item.slug)
      await sleep(RATE_LIMIT_DELAY_MS)

      if (!stock) {
        resultado.noEncontrados.push(nombre)
        if (item.activo) {
          await strapi.documents(uid).update({
            documentId: item.documentId,
            data: { activo: false, inactivoPorSync: true } as any,
          })
          resultado.desactivados.push(nombre)
          strapi.log.info(`[Stock Sync] Productos: desactivado (no encontrado en Contabilium) | ${nombre} (${item.slug})`)
        }
        continue
      }

      const nuevoStock = Math.round(stock.stockConReservas)
      const updates: any = {}

      if (nuevoStock !== item.stock) {
        updates.stock = nuevoStock
      }

      // Reactivar solo si fue este mismo proceso el que lo había desactivado
      if (!item.activo && item.inactivoPorSync) {
        updates.activo = true
        updates.inactivoPorSync = false
        resultado.reactivados.push(nombre)
        strapi.log.info(`[Stock Sync] Productos: reactivado (vuelto a encontrar en Contabilium) | ${nombre} (${item.slug})`)
      }

      if (Object.keys(updates).length > 0) {
        await strapi.documents(uid).update({
          documentId: item.documentId,
          data: updates,
        })
        resultado.actualizados.push(nombre)
        if (updates.stock !== undefined) {
          strapi.log.info(`[Stock Sync] Productos: stock actualizado | ${nombre} (${item.slug}): ${item.stock} -> ${updates.stock}`)
        }
      }
    } catch (err: any) {
      resultado.errores.push({ nombre, error: String(err?.message || err) })
      strapi.log.error(`[Stock Sync] Productos: error con ${nombre} (${item.slug}): ${err}`)
    }
  }

  strapi.log.info(
    `[Stock Sync] Productos: terminado — actualizados: ${resultado.actualizados.length}, desactivados: ${resultado.desactivados.length}, reactivados: ${resultado.reactivados.length}, no encontrados: ${resultado.noEncontrados.length}, errores: ${resultado.errores.length}`
  )

  return resultado
}

async function enviarResumenSync(strapi: any, r: StockSyncResultado) {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) return

  const huboErrores = r.errores.length > 0

  const filas = [
    { label: 'Total revisados', value: String(r.totalProductos) },
    { label: 'Con stock actualizado', value: String(r.actualizados.length) },
    { label: 'Desactivados (no encontrados en Contabilium)', value: String(r.desactivados.length) },
    { label: 'Reactivados (vueltos a encontrar)', value: String(r.reactivados.length) },
    { label: 'No encontrados en Contabilium', value: String(r.noEncontrados.length) },
    { label: 'Errores', value: String(r.errores.length) },
  ]

  const listaHTML = (titulo: string, items: string[], color = '#1a1a36') =>
    items.length
      ? `<p style="font-size:13px;color:${color};margin:16px 0 4px;font-weight:700;">${titulo}:</p><p style="font-size:12px;color:#6b6b6b;margin:0;">${items.join(', ')}</p>`
      : ''

  const filasHTML = filas
    .map(
      (f) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#1a1a36;">${f.label}</td><td style="padding:6px 0;font-size:14px;color:#1a1a36;text-align:right;font-weight:700;">${f.value}</td></tr>`
    )
    .join('')

  const listasHTML = [
    listaHTML('Desactivados', r.desactivados),
    listaHTML('Reactivados', r.reactivados),
    listaHTML('Errores', r.errores.map((e) => `${e.nombre}: ${e.error}`), '#dc2626'),
  ].join('')

  const html = `
<table style="width:100%; background-color:#f4f4f8; padding:20px; font-family:Arial,sans-serif;">
  <tr>
    <td>
      <table style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#1a1a36; padding:20px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:20px;">${huboErrores ? '⚠️ Sincronización de stock — con errores' : '✅ Sincronización de stock completada'}</h1>
            <p style="color:#8f9fd1; margin:4px 0 0 0; font-size:13px;">${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px;">
            <table style="width:100%; border-collapse:collapse;">${filasHTML}</table>
            ${listasHTML}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`

  await strapi.plugins['email'].services.email.send({
    to: adminEmail,
    from: strapi.config.get('plugin.email.settings.defaultFrom'),
    subject: huboErrores
      ? `⚠️ Sync stock Contabilium — ${r.errores.length} error(es)`
      : `✅ Sync stock Contabilium — ${r.actualizados.length} actualizados`,
    html,
  })
}
