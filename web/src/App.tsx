import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, ScrollText, Thermometer, TriangleAlert, Check } from 'lucide-react'
import { api, type Estado, type Evento, type RespuestaLectura } from './api'
import { corto } from './format'
import { Resumen } from './vistas/Resumen'
import { Lectura } from './vistas/Lectura'
import { Registro } from './vistas/Registro'

const RUTAS = [
  { id: '', etiqueta: 'Resumen', Icono: LayoutGrid },
  { id: 'lectura', etiqueta: 'Lectura de lote', Icono: Thermometer },
  { id: 'registro', etiqueta: 'Registro', Icono: ScrollText },
] as const

const rutaActual = () => window.location.hash.replace(/^#\/?/, '')

export interface Contexto {
  estado: Estado
  eventos: Evento[]
  recargar: () => Promise<void>
  avisar: (texto: string, tipo?: 'ok' | 'mal') => void
  ultima: RespuestaLectura | null
  guardarUltima: (r: RespuestaLectura) => void
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M9 21.5V15a7 7 0 0 1 14 0v6.5M9 21.5h14" fill="none" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function App() {
  const [ruta, setRuta] = useState(rutaActual)
  const [estado, setEstado] = useState<Estado | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'mal' } | null>(null)
  const [ultima, setUltima] = useState<RespuestaLectura | null>(null)

  useEffect(() => {
    const alCambiar = () => setRuta(rutaActual())
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  const recargar = useCallback(async () => {
    try {
      const [e, ev] = await Promise.all([api<Estado>('/estado'), api<Evento[]>('/eventos')])
      setEstado(e)
      setEventos(ev)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar los datos.')
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  const avisar = useCallback((texto: string, tipo: 'ok' | 'mal' = 'ok') => setAviso({ texto, tipo }), [])

  const contexto: Contexto | null = estado
    ? { estado, eventos, recargar, avisar, ultima, guardarUltima: setUltima }
    : null

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Logo />
          AgroPay
        </div>
        <nav className="nav" aria-label="Principal">
          <span className="nav-label mono">Navegación</span>
          {RUTAS.map(({ id, etiqueta, Icono }) => (
            <a key={id} href={`#/${id}`} aria-current={ruta === id ? 'page' : undefined}>
              <Icono aria-hidden="true" />
              {etiqueta}
            </a>
          ))}
        </nav>
        <div className="red">
          <div className="red-linea">
            <span className={`punto ${error ? 'off' : ''}`} aria-hidden="true" />
            <span>{error ? 'Sin conexión' : 'Red local de práctica'}</span>
          </div>
          {estado && (
            <span className="mono muted">
              Bloque {estado.bloque} · {corto(estado.contrato)}
            </span>
          )}
          <span className="mono muted">Fondos sin valor monetario</span>
        </div>
      </aside>

      <main className="main" key={ruta}>
        {error && !estado && (
          <div className="aviso mal" role="alert">
            <TriangleAlert aria-hidden="true" />
            <span>No pudimos cargar los datos. {error}</span>
            <button className="btn chico" type="button" onClick={() => void recargar()} style={{ marginLeft: 'auto' }}>
              Reintentar
            </button>
          </div>
        )}
        {!estado && !error && <p className="muted">Cargando</p>}
        {contexto && ruta === '' && <Resumen {...contexto} />}
        {contexto && ruta === 'lectura' && <Lectura {...contexto} />}
        {contexto && ruta === 'registro' && <Registro {...contexto} />}
        {contexto && !['', 'lectura', 'registro'].includes(ruta) && <Resumen {...contexto} />}
        <div role="status" aria-live="polite">
          {aviso && (
            <div className={`aviso ${aviso.tipo === 'mal' ? 'mal' : ''}`}>
              {aviso.tipo === 'mal' ? <TriangleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}
              <span>{aviso.texto}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
