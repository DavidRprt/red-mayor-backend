import * as React from 'react'
import { useFetchClient } from '@strapi/strapi/admin'
import { Box, Button, Typography, Flex, Alert } from '@strapi/design-system'

interface StockSyncResultado {
  totalProductos: number
  actualizados: string[]
  desactivados: string[]
  reactivados: string[]
  noEncontrados: string[]
  errores: { nombre: string; error: string }[]
}

const Lista = ({ titulo, items }: { titulo: string; items: string[] }) => {
  if (items.length === 0) return null
  return (
    <Box marginTop={4}>
      <Typography variant="delta">{titulo} ({items.length})</Typography>
      <Typography variant="omega" textColor="neutral600" as="p">
        {items.join(', ')}
      </Typography>
    </Box>
  )
}

export const ContabiliumSyncPage = () => {
  const { post } = useFetchClient()
  const [loading, setLoading] = React.useState(false)
  const [resultado, setResultado] = React.useState<StockSyncResultado | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const correr = async () => {
    setLoading(true)
    setError(null)
    setResultado(null)
    try {
      const { data } = await post('/api/contabilium-sync/run')
      setResultado(data.data)
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Error al sincronizar stock con Contabilium.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box padding={8}>
      <Typography variant="alpha" as="h1">Sincronizar stock con Contabilium</Typography>
      <Typography variant="epsilon" textColor="neutral600" as="p" marginTop={2}>
        Dispara manualmente la misma sincronización que corre todas las noches. Contabilium es
        la fuente de verdad del stock: los productos no encontrados se desactivan automáticamente.
      </Typography>

      <Box marginTop={6}>
        <Button onClick={correr} loading={loading} disabled={loading}>
          {loading ? 'Sincronizando...' : 'Sincronizar ahora'}
        </Button>
      </Box>

      {error && (
        <Box marginTop={6}>
          <Alert closeLabel="Cerrar" title="Error" variant="danger">
            {error}
          </Alert>
        </Box>
      )}

      {resultado && (
        <Box marginTop={6}>
          <Alert
            closeLabel="Cerrar"
            title={resultado.errores.length > 0 ? 'Terminado con errores' : 'Sincronización completada'}
            variant={resultado.errores.length > 0 ? 'warning' : 'success'}
          >
            {resultado.totalProductos} productos revisados
          </Alert>

          <Flex direction="column" alignItems="stretch" gap={2} marginTop={4}>
            <Typography>Actualizados: {resultado.actualizados.length}</Typography>
            <Typography>Desactivados: {resultado.desactivados.length}</Typography>
            <Typography>Reactivados: {resultado.reactivados.length}</Typography>
            <Typography>No encontrados en Contabilium: {resultado.noEncontrados.length}</Typography>
            <Typography>Errores: {resultado.errores.length}</Typography>
          </Flex>

          <Lista titulo="Desactivados" items={resultado.desactivados} />
          <Lista titulo="Reactivados" items={resultado.reactivados} />
          <Lista titulo="No encontrados" items={resultado.noEncontrados} />
          <Lista titulo="Errores" items={resultado.errores.map((e) => `${e.nombre}: ${e.error}`)} />
        </Box>
      )}
    </Box>
  )
}
