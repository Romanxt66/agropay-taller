import { useState } from 'react'
import { api } from '../api'
import { corto, eth, TIPOS } from '../format'
import { Cabecera, Resultado, salidaDeError, type Salida } from '../ui'
import type { Contexto } from '../App'

export function Registro({ estado, eventos, recargar }: Contexto) {
  const [ocupado, setOcupado] = useState(false)
  const [salida, setSalida] = useState<Salida | null>(null)

  const reconstruir = async () => {
    setOcupado(true)
    try {
      const r = await api<{ leidos: number; nuevos: number }>('/reconstruir', {})
      setSalida({ ok: true, titulo: 'Proyección reconstruida desde la cadena', detalle: `${r.leidos} eventos leídos, ${r.nuevos} registrados.` })
      await recargar()
    } catch (err) {
      setSalida(salidaDeError(err, 'Reconstruir la proyección'))
    } finally {
      setOcupado(false)
    }
  }

  const nombreDe = (direccion: string) => {
    const d = direccion.toLowerCase()
    return (
      estado.cuentas.find(c => c.direccion.toLowerCase() === d)?.nombre ??
      estado.practicas.find(p => p.direccion.toLowerCase() === d)?.nombre
    )
  }

  return (
    <>
      <Cabecera
        antetitulo="Indexador"
        titulo={
          <>
            Registro de <em className="destaque">eventos</em>
          </>
        }
        texto="La cadena es la fuente de verdad. Esta tabla es una proyección que se puede borrar y reconstruir leyendo los eventos del contrato."
        acciones={
          <button className="btn" type="button" disabled={ocupado} onClick={() => void reconstruir()}>
            {ocupado ? 'Reconstruyendo' : 'Reconstruir proyección'}
          </button>
        }
      />

      <section className="tarjeta">
        <div className="envoltura">
          {eventos.length === 0 ? (
            <p className="vacio">Aún no hay eventos. Deposita una garantía para registrar el primero.</p>
          ) : (
            <table className="tabla">
              <caption className="oculto">Eventos del contrato</caption>
              <thead>
                <tr>
                  <th>Bloque</th>
                  <th>Evento</th>
                  <th>Lote</th>
                  <th>Cuenta</th>
                  <th className="num">Monto</th>
                  <th>Transacción</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map(e => {
                  const nombre = nombreDe(e.cuenta)
                  return (
                    <tr key={`${e.txHash}:${e.logIndex}`}>
                      <td className="codigo">{e.bloque}</td>
                      <td>
                        <span className={`etiqueta ${e.tipo === 'PagoRetirado' ? 'medio' : e.tipo === 'PagoAutorizado' ? 'si' : ''}`}>{TIPOS[e.tipo]}</span>
                      </td>
                      <td className="codigo">{e.idLote ?? '—'}</td>
                      <td>
                        {nombre ? `${nombre} ` : ''}
                        <span className="codigo meta">{corto(e.cuenta)}</span>
                      </td>
                      <td className="num">{eth(e.montoWei)}</td>
                      <td className="codigo meta" title={e.txHash}>
                        {corto(e.txHash, 8, 6)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <Resultado salida={salida} />
    </>
  )
}
