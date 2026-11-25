import { useState, type FormEvent } from 'react'
import { ArrowDownToLine } from 'lucide-react'
import { api } from '../api'
import { corto, eth } from '../format'
import type { Contexto } from '../App'

export function Resumen({ estado, eventos, recargar, avisar }: Contexto) {
  const [monto, setMonto] = useState('2')
  const [enviando, setEnviando] = useState(false)
  const [retirando, setRetirando] = useState<number | null>(null)

  const pendiente = estado.productores.reduce((s, p) => s + BigInt(p.pendienteWei), 0n)
  const lotesPagados = eventos.filter(e => e.tipo === 'PagoAutorizado').length

  const depositar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    try {
      await api('/garantia', { eth: monto })
      avisar(`Garantía de ${monto} ETH depositada.`)
      await recargar()
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No pudimos depositar la garantía.', 'mal')
    } finally {
      setEnviando(false)
    }
  }

  const retirar = async (indice: number, nombre: string) => {
    setRetirando(indice)
    try {
      const r = await api<{ montoWei: string }>('/retiros', { productor: indice })
      avisar(`${nombre} retiró ${eth(r.montoWei)}.`)
      await recargar()
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No pudimos completar el retiro.', 'mal')
    } finally {
      setRetirando(null)
    }
  }

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Garantía y pagos</h1>
          <p>Fondos en custodia del contrato y saldos que los productores pueden retirar.</p>
        </div>
      </div>

      <div className="cards-3">
        <section className="card cifra clave" aria-label="Garantía disponible">
          <span className="sec">Garantía disponible</span>
          <span className="valor">{eth(estado.garantiaWei)}</span>
        </section>
        <section className="card cifra" aria-label="Pendiente de retiro">
          <span className="sec">Pendiente de retiro</span>
          <span className="valor">{eth(pendiente.toString())}</span>
        </section>
        <section className="card cifra" aria-label="Lotes pagados">
          <span className="sec">Lotes con pago autorizado</span>
          <span className="valor">{lotesPagados}</span>
        </section>
      </div>

      <div className="dos-col">
        <section className="card">
          <h2>Productores</h2>
          <div className="envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="num">Pendiente</th>
                  <th className="num">Saldo en cartera</th>
                  <th className="num">
                    <span className="sr">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.productores.map(p => (
                  <tr key={p.indice}>
                    <td>
                      <div>{p.nombre}</div>
                      <div className="mono muted">{corto(p.direccion)}</div>
                    </td>
                    <td className="num">{eth(p.pendienteWei)}</td>
                    <td className="num sec">{eth(p.balanceWei)}</td>
                    <td className="num">
                      <button
                        className="btn chico"
                        type="button"
                        disabled={p.pendienteWei === '0' || retirando !== null}
                        onClick={() => void retirar(p.indice, p.nombre)}
                        aria-label={`Retirar el pago de ${p.nombre}`}
                      >
                        {retirando === p.indice ? 'Retirando' : 'Retirar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form className="card" onSubmit={depositar}>
          <h2>Depositar garantía</h2>
          <div className="campo">
            <label htmlFor="monto-garantia">Monto en ETH</label>
            <input
              id="monto-garantia"
              className="entrada"
              inputMode="decimal"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              aria-describedby="ayuda-garantia"
            />
            <span id="ayuda-garantia" className="mono muted">
              Hasta {estado.maxEth} ETH por depósito
            </span>
          </div>
          <div className="fila-acciones" style={{ marginTop: 16 }}>
            <button className="btn primario" type="submit" disabled={enviando}>
              <ArrowDownToLine aria-hidden="true" />
              {enviando ? 'Depositando' : 'Depositar garantía'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
