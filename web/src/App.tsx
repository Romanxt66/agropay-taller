import { useCallback, useEffect, useState } from 'react'
import { FlaskConical, LayoutGrid, ScrollText, SlidersHorizontal, Thermometer } from 'lucide-react'
import { api, type Estado, type Evento, type RespuestaLectura } from './api'
import { corto } from './format'
import { Resumen } from './vistas/Resumen'
import { Lectura } from './vistas/Lectura'
import { Contrato } from './vistas/Contrato'
import { Laboratorio } from './vistas/Laboratorio'
import { Registro } from './vistas/Registro'

const RUTAS = [
  { id: '', largo: 'Resumen', corto: 'Resumen', Icono: LayoutGrid },
  { id: 'lectura', largo: 'Lectura de lote', corto: 'Lectura', Icono: Thermometer },
  { id: 'contrato', largo: 'Funciones del contrato', corto: 'Contrato', Icono: SlidersHorizontal },
  { id: 'laboratorio', largo: 'Laboratorio', corto: 'Lab', Icono: FlaskConical },
  { id: 'registro', largo: 'Registro', corto: 'Registro', Icono: ScrollText },
] as const

const rutaActual = () => window.location.hash.replace(/^#\/?/, '')

export interface Contexto {
  estado: Estado
  eventos: Evento[]
  recargar: () => Promise<void>
  ultima: RespuestaLectura | null
  guardarUltima: (r: RespuestaLectura) => void
}

export function App() {
  const [ruta, setRuta] = useState(rutaActual)
  const [estado, setEstado] = useState<Estado | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [error, setError] = useState<string | null>(null)
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

  const ctx: Contexto | null = estado ? { estado, eventos, recargar, ultima, guardarUltima: setUltima } : null
  const vista = RUTAS.some(r => r.id === ruta) ? ruta : ''

  return (
    <>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="riel">
        <a className="logo" href="#/" aria-label="AgroPay, ir al resumen">
          Agro<em>Pay</em>
        </a>
        <nav className="riel-nav" aria-label="Principal">
          {RUTAS.map(({ id, largo, corto: cortoNombre, Icono }) => (
            <a key={id} href={`#/${id}`} aria-current={vista === id ? 'page' : undefined}>
              <Icono className="icono" aria-hidden="true" />
              <span className="largo">{largo}</span>
              <span className="corto">{cortoNombre}</span>
            </a>
          ))}
        </nav>
        <div className="riel-pie">
          <span className={`sello-chico ${error ? 'no' : ''}`} style={error ? { background: 'var(--no)' } : undefined}>
            {error ? 'Sin conexión' : 'Red de práctica'}
          </span>
          {estado && (
            <span className="meta">
              Bloque {estado.bloque} · {corto(estado.contrato)}
            </span>
          )}
          <span className="meta">Fondos sin valor monetario</span>
        </div>
      </header>

      <main id="contenido" className="zona-trabajo" key={vista}>
        {error && !estado && (
          <div className="aviso mal" role="alert">
            <span>No pudimos cargar los datos.</span>
            <span className="detalle">{error}</span>
            <span>
              <button className="btn btn-chico" type="button" onClick={() => void recargar()}>
                Reintentar
              </button>
            </span>
          </div>
        )}
        {!estado && !error && <p className="meta">Cargando</p>}
        {ctx && vista === '' && <Resumen {...ctx} />}
        {ctx && vista === 'lectura' && <Lectura {...ctx} />}
        {ctx && vista === 'contrato' && <Contrato {...ctx} />}
        {ctx && vista === 'laboratorio' && <Laboratorio {...ctx} />}
        {ctx && vista === 'registro' && <Registro {...ctx} />}
      </main>
    </>
  )
}
