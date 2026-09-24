import { useEffect, useRef, useState } from 'react'
import { useFetchClient } from '@strapi/strapi/admin'

interface StockSyncResultado {
  totalProductos: number
  actualizados: string[]
  desactivados: string[]
  reactivados: string[]
  noEncontrados: { nombre: string; sku: string }[]
  errores: { nombre: string; error: string }[]
}

interface StockSyncProgreso {
  corriendo: boolean
  procesados: number
  total: number
  actual: string | null
  mensaje: string | null
  resultado: StockSyncResultado | null
  error: string | null
  actualizadoEn: number
}

const C = {
  bg: '#1C1C2E', surface: '#212134', surface2: '#181826',
  primary: '#7B79FF', primaryBg: '#272750',
  text: '#F0F0FF', muted: '#8E8EA9',
  border: '#32324D', danger: '#EE5E52', success: '#5EC26A',
}

const Stat = ({ label, value, color }: { label: string; value: number; color?: string }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '16px 20px', flex: 1 }}>
    <div style={{ fontSize: '24px', fontWeight: '700', color: color ?? C.text }}>{value}</div>
    <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>{label}</div>
  </div>
)

const Lista = ({ titulo, items, color }: { titulo: string; items: string[]; color: string }) => {
  if (!items.length) return null
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '16px 20px', marginTop: '16px' }}>
      <p style={{ fontSize: '13px', fontWeight: '700', color, margin: '0 0 8px' }}>{titulo} ({items.length})</p>
      <p style={{ fontSize: '13px', color: C.text, margin: 0, lineHeight: 1.7 }}>{items.join(', ')}</p>
    </div>
  )
}

const TablaNoEncontrados = ({ items }: { items: { nombre: string; sku: string }[] }) => {
  if (!items.length) return null
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '16px 20px', marginTop: '16px' }}>
      <p style={{ fontSize: '13px', fontWeight: '700', color: C.muted, margin: '0 0 4px' }}>
        No encontrados en Contabilium ({items.length})
      </p>
      <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 12px' }}>
        Estos SKU no aparecieron del lado de Contabilium (o figuran inactivos ahí), por eso quedaron
        desactivados en la tienda.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` }}>
              SKU
            </th>
            <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` }}>
              Producto
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.sku}-${i}`}>
              <td style={{ padding: '8px 10px', fontSize: '13px', fontFamily: 'monospace', color: C.text, borderBottom: `1px solid ${C.border}` }}>
                {it.sku}
              </td>
              <td style={{ padding: '8px 10px', fontSize: '13px', color: C.text, borderBottom: `1px solid ${C.border}` }}>
                {it.nombre}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ProgresoBar = ({ progreso }: { progreso: StockSyncProgreso }) => {
  const pct = progreso.total > 0 ? Math.min(100, Math.round((progreso.procesados / progreso.total) * 100)) : 0

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: C.text, margin: 0 }}>
          Productos{progreso.total > 0 ? ` — ${progreso.procesados} de ${progreso.total}` : ''}
        </p>
        <p style={{ fontSize: '13px', fontWeight: '700', color: C.primary, margin: 0 }}>{pct}%</p>
      </div>
      <div style={{ background: C.surface2, borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
        <div
          style={{
            background: C.primary,
            height: '100%',
            width: `${pct}%`,
            borderRadius: '999px',
            transition: 'width 300ms ease',
          }}
        />
      </div>
      <p style={{ fontSize: '12px', color: C.muted, margin: '10px 0 0' }}>
        {progreso.mensaje ?? 'Sincronizando…'}
      </p>
      <p style={{ fontSize: '13px', color: '#FFC14D', fontWeight: '600', margin: '14px 0 0' }}>
        ⚠️ No cierres ni recargues esta página hasta que termine — puede tardar bastante
        (respeta el límite de pedidos de Contabilium, uno por uno).
      </p>
    </div>
  )
}

export const ContabiliumSyncPage = () => {
  const { post, get } = useFetchClient()
  const [progreso, setProgreso] = useState<StockSyncProgreso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const detenerPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const consultarProgreso = async () => {
    try {
      const { data } = await get('/api/contabilium-sync/progreso')
      const p: StockSyncProgreso = data.data
      setProgreso(p)
      if (!p.corriendo) detenerPolling()
    } catch {
      // un fallo puntual de polling no corta el proceso en el servidor — se reintenta en el próximo tick
    }
  }

  const iniciarPolling = () => {
    detenerPolling()
    consultarProgreso()
    intervalRef.current = setInterval(consultarProgreso, 1500)
  }

  // Si se recarga la página mientras hay una sincronización en curso (disparada
  // desde acá o desde el cron), la detecta y retoma el polling sola.
  useEffect(() => {
    iniciarPolling()
    return detenerPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const correr = async () => {
    setError(null)
    try {
      await post('/api/contabilium-sync/run')
      iniciarPolling()
    } catch {
      setError('Error al iniciar la sincronización. Revisá los logs del servidor.')
    }
  }

  const loading = progreso?.corriendo ?? false
  const resultado = progreso?.resultado ?? null

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '32px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '600', margin: 0 }}>Sincronización con Contabilium</h1>
          <p style={{ fontSize: '13px', color: C.muted, margin: '4px 0 0' }}>
            Corre automáticamente todos los días a las 00:00 (hora Argentina). Usá el botón para forzarla ahora.
          </p>
        </div>
        <button
          onClick={correr}
          disabled={loading}
          style={{
            background: loading ? C.surface : C.primary,
            color: C.text,
            border: 'none',
            borderRadius: '4px',
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sincronizando...' : 'Correr ahora'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#3D0C0C', border: `1px solid ${C.danger}40`, borderRadius: '6px', padding: '16px', color: C.danger, fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading && progreso && <ProgresoBar progreso={progreso} />}

      {!loading && resultado && (
        <>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Stat label="Productos revisados" value={resultado.totalProductos} />
            <Stat label="Actualizados" value={resultado.actualizados.length} color={C.success} />
            <Stat label="Desactivados" value={resultado.desactivados.length} color="#FFC14D" />
            <Stat label="Reactivados" value={resultado.reactivados.length} color={C.primary} />
            <Stat label="No encontrados" value={resultado.noEncontrados.length} color={C.muted} />
            <Stat label="Errores" value={resultado.errores.length} color={C.danger} />
          </div>

          <Lista titulo="Desactivados" items={resultado.desactivados} color="#FFC14D" />
          <Lista titulo="Reactivados" items={resultado.reactivados} color={C.primary} />
          <TablaNoEncontrados items={resultado.noEncontrados} />
          {resultado.errores.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.danger}40`, borderRadius: '6px', padding: '16px 20px', marginTop: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: C.danger, margin: '0 0 8px' }}>Errores ({resultado.errores.length})</p>
              {resultado.errores.map((e, i) => (
                <p key={i} style={{ fontSize: '12px', color: C.text, margin: '0 0 4px' }}>{e.nombre}: <span style={{ color: C.muted }}>{e.error}</span></p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ContabiliumSyncPage
