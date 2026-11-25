import { useState } from 'react'
import { RotateCcw, DatabaseBackup } from 'lucide-react'
import { api } from '../api'
import { corto, eth, TIPOS } from '../format'
import type { Contexto } from '../App'

export function Registro({ estado, eventos, recargar, avisar }: Contexto) {
  const [ocupado, setOcupado] = useState<'reconstruir' | 'reiniciar' | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const reconstruir = async () => {
    setOcupado('reconstruir')
    try {
      const r = await api<{ leidos: number; nuevos: number }>('/reconstruir', {})
      avisar(`Proyección reconstruida desde la cadena: ${r.leidos} eventos leídos, ${r.nuevos} registrados.`)
      await recargar()
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No pudimos reconstruir la proyección.', 'mal')
    } finally {
      setOcupado(null)
    }
  }

  const reiniciar = async () => {
    setOcupado('reiniciar')
    try {
      await api('/reiniciar', {})
      avisar('Contrato nuevo desplegado. La garantía y el registro volvieron a cero.')
      setConfirmando(false)
      await recargar()
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No pudimos reiniciar la red.', 'mal')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Registro de eventos</h1>
          <p>La cadena es la fuente de verdad. Esta tabla es una proyección que se puede borrar y reconstruir leyendo los eventos del contrato.</p>
        </div>
        <div className="fila-acciones">
          <button className="btn" type="button" disabled={ocupado !== null} onClick={() => void reconstruir()}>
            <DatabaseBackup aria-hidden="true" />
            {ocupado === 'reconstruir' ? 'Reconstruyendo' : 'Reconstruir proyección'}
          </button>
          <button className="btn suave" type="button" disabled={ocupado !== null} onClick={() => setConfirmando(true)}>
            <RotateCcw aria-hidden="true" />
            Reiniciar red
          </button>
        </div>
      </div>

      {confirmando && (
        <div className="aviso" role="alertdialog" aria-label="Confirmar reinicio">
          <span>Se desplegará un contrato nuevo y se perderán la garantía y el registro actuales.</span>
          <span className="fila-acciones" style={{ marginLeft: 'auto' }}>
            <button className="btn chico suave" type="button" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button className="btn chico primario" type="button" disabled={ocupado !== null} onClick={() => void reiniciar()}>
              Reiniciar
            </button>
          </span>
        </div>
      )}

      <section className="card">
        <div className="envoltura">
          {eventos.length === 0 ? (
            <p className="vacio">Aún no hay eventos. Deposita una garantía en Resumen para registrar el primero.</p>
          ) : (
            <table className="tabla">
              <caption className="sr">Eventos del contrato</caption>
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
                  const productor = estado.productores.find(p => p.direccion.toLowerCase() === e.cuenta.toLowerCase())
                  return (
                    <tr key={`${e.txHash}:${e.logIndex}`}>
                      <td className="mono">{e.bloque}</td>
                      <td>{TIPOS[e.tipo]}</td>
                      <td className="mono">{e.idLote ?? '—'}</td>
                      <td>
                        {productor ? `${productor.nombre} ` : ''}
                        <span className="mono muted">{corto(e.cuenta)}</span>
                      </td>
                      <td className="num">{eth(e.montoWei)}</td>
                      <td className="mono muted" title={e.txHash}>
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
    </>
  )
}
