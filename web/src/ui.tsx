import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ErrorApi, type Cuenta } from './api'
import { corto, eth } from './format'

/** Resultado de una llamada al contrato: transacción confirmada o reversión con el nombre del error. */
export interface Salida {
  ok: boolean
  titulo: string
  detalle?: string
  revert?: string
  tx?: string
}

export function salidaDeError(err: unknown, titulo: string): Salida {
  if (err instanceof ErrorApi) return { ok: false, titulo, detalle: err.message, revert: err.revert }
  return { ok: false, titulo, detalle: err instanceof Error ? err.message : 'No pudimos completar la acción.' }
}

export function Resultado({ salida }: { salida: Salida | null }) {
  return (
    <div role="status" aria-live="polite">
      {salida && (
        <div className={`aviso ${salida.ok ? '' : salida.revert ? 'alerta' : 'mal'}`}>
          <span>
            {salida.ok ? 'Transacción confirmada' : salida.revert ? `El contrato revirtió: ${salida.revert}` : 'No se pudo completar'}
            {' · '}
            {salida.titulo}
          </span>
          {salida.detalle && <span className="detalle">{salida.detalle}</span>}
          {salida.tx && <span className="codigo">Tx {corto(salida.tx, 10, 8)}</span>}
        </div>
      )}
    </div>
  )
}

export function SelectorCuenta(props: {
  id: string
  etiqueta: string
  cuentas: Cuenta[]
  valor: number
  onCambio: (i: number) => void
  extra?: { valor: string; etiqueta: string }[]
  valorExtra?: string
  onExtra?: (v: string) => void
  mostrarPendiente?: boolean
}) {
  const seleccion = props.valorExtra ?? String(props.valor)
  return (
    <div className="campo">
      <label htmlFor={props.id}>{props.etiqueta}</label>
      <select
        id={props.id}
        value={seleccion}
        onChange={e => {
          const v = e.target.value
          if (props.extra?.some(x => x.valor === v)) props.onExtra?.(v)
          else {
            props.onExtra?.('')
            props.onCambio(Number(v))
          }
        }}
      >
        {props.cuentas.map(c => (
          <option key={c.indice} value={c.indice}>
            {c.nombre} · {corto(c.direccion)}
            {props.mostrarPendiente ? ` · pendiente ${eth(c.pendienteWei)}` : ''}
          </option>
        ))}
        {props.extra?.map(x => (
          <option key={x.valor} value={x.valor}>
            {x.etiqueta}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Diálogo nativo de confirmación (ver diseno-bustra: foco en la acción segura, Escape cierra). */
export function Dialogo(props: {
  abierto: boolean
  titulo: string
  confirmar: string
  peligro?: boolean
  onConfirmar: () => void
  onCancelar: () => void
  children?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (props.abierto && !d.open) d.showModal()
    if (!props.abierto && d.open) d.close()
  }, [props.abierto])
  return (
    <dialog ref={ref} className="dialogo" onCancel={e => { e.preventDefault(); props.onCancelar() }} aria-labelledby="dialogo-titulo">
      <h2 id="dialogo-titulo">{props.titulo}</h2>
      {props.children}
      <div className="dialogo-botones">
        <button className={`btn ${props.peligro ? 'btn-peligro' : ''}`} type="button" onClick={props.onConfirmar}>
          {props.confirmar}
        </button>
        <button className="btn btn-lleno" type="button" autoFocus onClick={props.onCancelar}>
          Cancelar
        </button>
      </div>
    </dialog>
  )
}

export function Cabecera(props: { antetitulo: string; titulo: ReactNode; texto?: string; acciones?: ReactNode }) {
  return (
    <div className="cabecera">
      <div>
        <span className="antetitulo">{props.antetitulo}</span>
        <h1>{props.titulo}</h1>
        {props.texto && <p>{props.texto}</p>}
      </div>
      {props.acciones && <div className="fila">{props.acciones}</div>}
    </div>
  )
}

/** Reinicia toda la red: las 10 cuentas vuelven a su saldo inicial y se despliega un contrato nuevo. */
export function ReiniciarCuentas(props: { onSalida: (s: Salida) => void; alTerminar: () => Promise<void> | void; deshabilitado?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const confirmar = async () => {
    setAbierto(false)
    setOcupado(true)
    try {
      await api('/reiniciar-cuentas', {})
      props.onSalida({ ok: true, titulo: 'Cuentas reiniciadas', detalle: 'Las 10 cuentas volvieron a 10.000 ETH y se desplegó un contrato nuevo. La garantía y el registro están en cero.' })
    } catch (err) {
      props.onSalida(salidaDeError(err, 'Reiniciar todas las cuentas'))
    } finally {
      await props.alTerminar()
      setOcupado(false)
    }
  }

  return (
    <>
      <button className="btn btn-peligro" type="button" disabled={ocupado || props.deshabilitado} onClick={() => setAbierto(true)}>
        {ocupado ? 'Reiniciando' : 'Reiniciar todas las cuentas'}
      </button>
      <Dialogo abierto={abierto} titulo="¿Reiniciar todas las cuentas?" confirmar="Reiniciar" peligro onConfirmar={() => void confirmar()} onCancelar={() => setAbierto(false)}>
        <p className="meta">Las 10 cuentas vuelven a 10.000 ETH, se despliega un contrato nuevo y se pierden la garantía, los saldos pendientes y el registro.</p>
      </Dialogo>
    </>
  )
}
