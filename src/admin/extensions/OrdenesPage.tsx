import * as React from 'react'
import { useFetchClient } from '@strapi/strapi/admin'
import { Box, Button, Typography, Flex, TextInput, SingleSelect, SingleSelectOption } from '@strapi/design-system'
import * as XLSX from 'xlsx'

const ESTADOS = ['Pendiente', 'Pagado', 'Enviado', 'Completado', 'Cancelado']
const METODOS_PAGO = ['Transferencia', 'MercadoPago', 'Convenir']

interface OrdenProducto {
  id: number
  cantidad: number
  precioUnidad: number
  precioConDescuento: number
  producto: string
}

interface Orden {
  documentId: string
  id: number
  estado: string
  metodoPago: string
  createdAt: string
  numeroFactura?: string
  user?: { username?: string; email?: string }
  direccion?: { direccion?: string; ciudad?: string }
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
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [expandido, setExpandido] = React.useState<string | null>(null)
  const [guardando, setGuardando] = React.useState<string | null>(null)

  const [filtroEstado, setFiltroEstado] = React.useState<string>('')
  const [filtroMetodoPago, setFiltroMetodoPago] = React.useState<string>('')
  const [busqueda, setBusqueda] = React.useState('')

  const cargar = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await get('/content-manager/collection-types/api::orden.orden', {
        params: {
          pageSize: 200,
          sort: 'createdAt:desc',
          populate: {
            user: { fields: ['username', 'email'] },
            direccion: { fields: ['direccion', 'ciudad'] },
            orden_productos: true,
            comprobantePago: { fields: ['url', 'name'] },
          },
        },
      })
      setOrdenes(data?.results || [])
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
                      <Button
                        variant="tertiary"
                        size="S"
                        onClick={() => setExpandido(expandido === o.documentId ? null : o.documentId)}
                      >
                        {expandido === o.documentId ? 'Ocultar' : 'Ver productos'}
                      </Button>
                    </td>
                  </tr>
                  {expandido === o.documentId && (
                    <tr>
                      <td colSpan={9} style={{ padding: '8px 12px 16px 32px', background: '#fafafb' }}>
                        {(o.orden_productos || []).map((op) => (
                          <Typography key={op.id} as="p" variant="pi">
                            {op.producto} — x{op.cantidad} — ${op.precioConDescuento.toLocaleString('es-AR')}
                          </Typography>
                        ))}
                        {o.direccion && (
                          <Typography as="p" variant="pi" textColor="neutral600" marginTop={2}>
                            Envío: {o.direccion.direccion}, {o.direccion.ciudad}
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
