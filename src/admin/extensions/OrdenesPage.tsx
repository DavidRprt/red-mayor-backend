import * as React from 'react'
import { useFetchClient } from '@strapi/strapi/admin'
import { Box, Button, Typography, Flex, TextInput, SingleSelect, SingleSelectOption } from '@strapi/design-system'
import * as XLSX from 'xlsx'

const ESTADOS = ['Pendiente', 'Pagado', 'Enviado', 'Completado', 'Cancelado']
const METODOS_PAGO = ['Transferencia', 'MercadoPago', 'Convenir']

// Cuentas propias de prueba — nunca deben verse en el panel ni en los exports.
const EMAILS_EXCLUIDOS = ['davirapo@gmail.com']

interface OrdenProducto {
  id: number
  cantidad: number
  precioUnidad: number
  precioConDescuento: number
  producto: string
}

interface ProductoInfo {
  slug: string
  nombreProducto: string
  Subtitulo?: string
}

interface Orden {
  documentId: string
  id: number
  estado: string
  metodoPago: string
  createdAt: string
  numeroFactura?: string
  user?: { username?: string; email?: string }
  direccion?: { direccion?: string; ciudad?: string; provincia?: string; codigoPostal?: string }
  orden_productos?: OrdenProducto[]
  comprobantePago?: { url: string; name: string } | null
}

function calcularTotal(orden: Orden): number {
  return (orden.orden_productos || []).reduce(
    (acc, op) => acc + op.precioConDescuento * op.cantidad,
    0
  )
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const OrdenesPage = () => {
  const { get, put } = useFetchClient()
  const [ordenes, setOrdenes] = React.useState<Orden[]>([])
  const [productos, setProductos] = React.useState<Map<string, ProductoInfo>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [expandido, setExpandido] = React.useState<string | null>(null)
  const [guardando, setGuardando] = React.useState<string | null>(null)

  const [filtroEstado, setFiltroEstado] = React.useState<string>('')
  const [filtroMetodoPago, setFiltroMetodoPago] = React.useState<string>('')
  const [busqueda, setBusqueda] = React.useState('')
  const [filtroFecha, setFiltroFecha] = React.useState<'todas' | 'hoy' | '24h' | 'semana' | 'rango'>('todas')
  const [fechaDesde, setFechaDesde] = React.useState('')
  const [fechaHasta, setFechaHasta] = React.useState('')

  const cargar = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ordenesRes, productosRes] = await Promise.all([
        get('/content-manager/collection-types/api::orden.orden', {
          params: {
            pageSize: 200,
            sort: 'createdAt:desc',
            populate: {
              user: { fields: ['username', 'email'] },
              direccion: { fields: ['direccion', 'ciudad', 'provincia', 'codigoPostal'] },
              orden_productos: true,
              comprobantePago: { fields: ['url', 'name'] },
            },
          },
        }),
        get('/content-manager/collection-types/api::product.product', {
          params: {
            pageSize: 1000,
            fields: ['slug', 'nombreProducto', 'Subtitulo'],
          },
        }),
      ])

      // Fuera de producción sí se muestran — en local son casi todas las órdenes de prueba.
      const resultados: Orden[] = ordenesRes.data?.results || []
      setOrdenes(
        import.meta.env.PROD
          ? resultados.filter((o) => !EMAILS_EXCLUIDOS.includes((o.user?.email || '').toLowerCase()))
          : resultados
      )

      const mapa = new Map<string, ProductoInfo>()
      for (const p of productosRes.data?.results || []) {
        mapa.set(p.documentId, { slug: p.slug, nombreProducto: p.nombreProducto, Subtitulo: p.Subtitulo })
      }
      setProductos(mapa)
    } catch (err: any) {
      setError('No se pudieron cargar las órdenes.')
    } finally {
      setLoading(false)
    }
  }, [get])

  React.useEffect(() => {
    cargar()
  }, [cargar])

  const cambiarEstado = async (orden: Orden, nuevoEstado: string) => {
    setGuardando(orden.documentId)
    try {
      await put(`/content-manager/collection-types/api::orden.orden/${orden.documentId}`, {
        estado: nuevoEstado,
      })
      setOrdenes((prev) =>
        prev.map((o) => (o.documentId === orden.documentId ? { ...o, estado: nuevoEstado } : o))
      )
    } catch {
      setError('No se pudo actualizar el estado de la orden.')
    } finally {
      setGuardando(null)
    }
  }

  const filtradas = ordenes.filter((o) => {
    if (filtroEstado && o.estado !== filtroEstado) return false
    if (filtroMetodoPago && o.metodoPago !== filtroMetodoPago) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      const enId = String(o.id).includes(q)
      const enUsuario = (o.user?.username || '').toLowerCase().includes(q) || (o.user?.email || '').toLowerCase().includes(q)
      if (!enId && !enUsuario) return false
    }
    if (filtroFecha === 'rango') {
      if (fechaDesde && new Date(o.createdAt) < new Date(`${fechaDesde}T00:00:00`)) return false
      if (fechaHasta && new Date(o.createdAt) > new Date(`${fechaHasta}T23:59:59.999`)) return false
    } else if (filtroFecha !== 'todas') {
      const corte = new Date()
      if (filtroFecha === 'hoy') corte.setHours(0, 0, 0, 0)
      else if (filtroFecha === '24h') corte.setHours(corte.getHours() - 24)
      else if (filtroFecha === 'semana') corte.setDate(corte.getDate() - 7)
      if (new Date(o.createdAt) < corte) return false
    }
    return true
  })

  const descargarExcel = () => {
    const resumen = filtradas.map((o) => ({
      'N° Orden': `RXM-${o.id}`,
      Fecha: formatFecha(o.createdAt),
      Cliente: o.user?.username || '',
      Email: o.user?.email || '',
      Estado: o.estado,
      'Método de pago': o.metodoPago,
      'Cant. productos': (o.orden_productos || []).length,
      Total: calcularTotal(o),
      Dirección: o.direccion?.direccion || '',
      Ciudad: o.direccion?.ciudad || '',
      Provincia: o.direccion?.provincia || '',
      CP: o.direccion?.codigoPostal || '',
      Comprobante: o.comprobantePago ? 'Sí' : 'No',
      'N° Factura': o.numeroFactura || '',
    }))

    const detalle = filtradas.flatMap((o) =>
      (o.orden_productos || []).map((op) => ({
        'N° Orden': `RXM-${o.id}`,
        Producto: op.producto,
        Cantidad: op.cantidad,
        'Precio unidad': op.precioUnidad,
        'Precio con descuento': op.precioConDescuento,
      }))
    )

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle')

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ordenes_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Box padding={8}>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Typography variant="alpha" as="h1">Órdenes</Typography>
        <Button onClick={descargarExcel} disabled={filtradas.length === 0}>
          Descargar Excel ({filtradas.length})
        </Button>
      </Flex>

      <Flex gap={4} marginBottom={6} wrap="wrap">
        <Box minWidth="200px">
          <SingleSelect
            placeholder="Todos los estados"
            value={filtroEstado}
            onClear={() => setFiltroEstado('')}
            onChange={(v: string | number) => setFiltroEstado(String(v))}
          >
            {ESTADOS.map((e) => (
              <SingleSelectOption key={e} value={e}>{e}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box minWidth="200px">
          <SingleSelect
            placeholder="Todos los métodos de pago"
            value={filtroMetodoPago}
            onClear={() => setFiltroMetodoPago('')}
            onChange={(v: string | number) => setFiltroMetodoPago(String(v))}
          >
            {METODOS_PAGO.map((m) => (
              <SingleSelectOption key={m} value={m}>{m}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box minWidth="240px">
          <TextInput
            placeholder="Buscar por N° orden, usuario o email"
            aria-label="Buscar"
            value={busqueda}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusqueda(e.target.value)}
          />
        </Box>
        <Box minWidth="180px">
          <SingleSelect
            placeholder="Cualquier fecha"
            value={filtroFecha}
            onChange={(v: string | number) => setFiltroFecha(String(v) as typeof filtroFecha)}
          >
            <SingleSelectOption value="todas">Cualquier fecha</SingleSelectOption>
            <SingleSelectOption value="hoy">Hoy</SingleSelectOption>
            <SingleSelectOption value="24h">Últimas 24 hs</SingleSelectOption>
            <SingleSelectOption value="semana">Última semana</SingleSelectOption>
            <SingleSelectOption value="rango">Rango de fechas</SingleSelectOption>
          </SingleSelect>
        </Box>
        {filtroFecha === 'rango' && (
          <>
            <input
              type="date"
              value={fechaDesde}
              title="Desde"
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{ border: '1px solid #dcdce4', borderRadius: 4, padding: '8px 10px', fontSize: 13, color: 'inherit', background: 'transparent' }}
            />
            <Typography variant="pi" textColor="neutral600">hasta</Typography>
            <input
              type="date"
              value={fechaHasta}
              title="Hasta"
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{ border: '1px solid #dcdce4', borderRadius: 4, padding: '8px 10px', fontSize: 13, color: 'inherit', background: 'transparent' }}
            />
          </>
        )}
      </Flex>

      {loading && <Typography>Cargando órdenes...</Typography>}
      {error && <Typography textColor="danger600">{error}</Typography>}

      {!loading && !error && (
        <Box style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dcdce4', textAlign: 'left' }}>
                {['N° Orden', 'Fecha', 'Cliente', 'Estado', 'Método de pago', 'Total', 'Comprobante', 'Factura', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o) => (
                <React.Fragment key={o.documentId}>
                  <tr style={{ borderBottom: '1px solid #eaeaef' }}>
                    <td style={{ padding: '8px 12px' }}>RXM-{o.id}</td>
                    <td style={{ padding: '8px 12px' }}>{formatFecha(o.createdAt)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {o.user?.username}
                      <br />
                      <Typography variant="pi" textColor="neutral600">{o.user?.email}</Typography>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <SingleSelect
                        size="S"
                        value={o.estado}
                        disabled={guardando === o.documentId}
                        onChange={(v: string | number) => cambiarEstado(o, String(v))}
                      >
                        {ESTADOS.map((e) => (
                          <SingleSelectOption key={e} value={e}>{e}</SingleSelectOption>
                        ))}
                      </SingleSelect>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{o.metodoPago}</td>
                    <td style={{ padding: '8px 12px' }}>${calcularTotal(o).toLocaleString('es-AR')}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {o.comprobantePago ? (
                        <a href={o.comprobantePago.url} target="_blank" rel="noreferrer">Ver comprobante</a>
                      ) : (
                        <Typography variant="pi" textColor="neutral600">—</Typography>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{o.numeroFactura || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        onClick={() => setExpandido(expandido === o.documentId ? null : o.documentId)}
                        style={{
                          background: 'transparent',
                          border: '1px solid currentColor',
                          borderRadius: 4,
                          padding: '4px 10px',
                          fontSize: 12,
                          color: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {expandido === o.documentId ? 'Ocultar' : 'Ver productos'}
                      </button>
                    </td>
                  </tr>
                  {expandido === o.documentId && (
                    <tr>
                      <td colSpan={9} style={{ padding: '8px 12px 16px 32px', background: '#fafafb' }}>
                        {(o.orden_productos || []).map((op) => {
                          const info = productos.get(op.producto)
                          return (
                            <Box key={op.id} marginBottom={2}>
                              <Typography as="p" variant="pi" style={{ color: '#32324d' }}>
                                SKU: {info?.slug || op.producto} — {info?.nombreProducto || 'Producto no encontrado'}
                                {' '}— x{op.cantidad} — ${op.precioConDescuento.toLocaleString('es-AR')}
                              </Typography>
                              {info?.Subtitulo && (
                                <Typography as="p" variant="pi" style={{ color: '#666687' }}>
                                  {info.Subtitulo}
                                </Typography>
                              )}
                            </Box>
                          )
                        })}
                        {o.direccion && (
                          <Typography as="p" variant="pi" style={{ color: '#666687', marginTop: 8 }}>
                            Envío: {o.direccion.direccion}, {o.direccion.ciudad}, {o.direccion.provincia} (CP {o.direccion.codigoPostal})
                          </Typography>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {filtradas.length === 0 && <Typography marginTop={4}>No hay órdenes que coincidan con los filtros.</Typography>}
        </Box>
      )}
    </Box>
  )
}
