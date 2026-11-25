import { useState } from 'react'
import { api } from '../api'
import { corto, eth } from '../format'
import { Cabecera, ReiniciarCuentas, Resultado, salidaDeError, type Salida } from '../ui'
import type { Contexto } from '../App'

export function Resumen({ estado, eventos, recargar }: Contexto) {
  const [monto, setMonto] = useState('2')
  const [enviando, setEnviando] = useState(false)
  const [retirando, setRetirando] = useState<number | null>(null)
  const [salida, setSalida] = useState<Salida | null>(null)

  const pendiente = estado.cuentas.reduce((s, c) => s + BigInt(c.pendienteWei), 0n)
  const lotesPagados = eventos.filter(e => e.tipo === 'PagoAutorizado').length

  const depositar = async () => {
    setEnviando(true)
    try {
      const r = await api<{ txHash: string }>('/contrato/deposito', { eth: monto, cuenta: 0 })
      setSalida({ ok: true, titulo: `Garantía de ${monto} ETH depositada`, tx: r.txHash })
      await recargar()
    } catch (err) {
      setSalida(salidaDeError(err, 'Depositar garantía'))
    } finally {
      setEnviando(false)
    }
  }

  const retirar = async (indice: number, nombre: string) => {
    setRetirando(indice)
    try {
      const r = await api<{ txHash: string; montoWei: string }>('/contrato/retiro', { cuenta: indice })
      setSalida({ ok: true, titulo: `${nombre} retiró ${eth(r.montoWei)}`, tx: r.txHash })
      await recargar()
    } catch (err) {
      setSalida(salidaDeError(err, `Retiro de ${nombre}`))
    } finally {
      setRetirando(null)
    }
  }

  // Los tres productores y cualquier otra cuenta que tenga saldo pendiente
  const conSaldo = estado.cuentas.filter(c => (c.indice >= 2 && c.indice <= 4) || c.pendienteWei !== '0')

  return (
    <>
      <Cabecera
        antetitulo="Resumen"
        titulo={
          <>
            Garantía y <em className="destaque">pagos</em>
          </>
        }
        texto="Fondos en custodia del contrato y saldos que los productores pueden retirar."
        acciones={<ReiniciarCuentas onSalida={setSalida} alTerminar={recargar} />}
      />

      <div className="rejilla-3">
        <section className="cifra color-1" aria-label="Garantía disponible">
          <span className="rotulo">Garantía disponible</span>
          <span className="valor">{eth(estado.garantiaWei)}</span>
        </section>
        <section className="cifra color-2" aria-label="Pendiente de retiro">
          <span className="rotulo">Pendiente de retiro</span>
          <span className="valor">{eth(pendiente.toString())}</span>
        </section>
        <section className="cifra color-4" aria-label="Lotes pagados">
          <span className="rotulo">Lotes con pago autorizado</span>
          <span className="valor">{lotesPagados}</span>
        </section>
      </div>

      <div className="rejilla-dos-uno">
        <section className="tarjeta">
          <h2>Productores</h2>
          <div className="envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="num">Pendiente</th>
                  <th className="num">En cartera</th>
                  <th className="num">
                    <span className="oculto">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {conSaldo.map(p => (
                  <tr key={p.indice}>
                    <td>
                      <div>{p.nombre}</div>
                      <div className="codigo meta">{corto(p.direccion)}</div>
                    </td>
                    <td className="num">{eth(p.pendienteWei)}</td>
                    <td className="num meta">{eth(p.balanceWei)}</td>
                    <td className="num">
                      <button
                        className="btn btn-chico"
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
          <p className="meta">Las cuentas con saldo pendiente aparecen aquí. Para llamar cualquier función desde otra cuenta, usa Funciones del contrato.</p>
        </section>

        <form
          className="tarjeta"
          onSubmit={e => {
            e.preventDefault()
            void depositar()
          }}
        >
          <h2>Depositar garantía</h2>
          <div className="campo">
            <label htmlFor="monto-garantia">Monto en ETH</label>
            <input id="monto-garantia" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} aria-describedby="ayuda-garantia" />
            <span id="ayuda-garantia" className="ayuda">
              Hasta {estado.maxEth} ETH por depósito
            </span>
          </div>
          <button className="btn btn-lleno" type="submit" disabled={enviando}>
            {enviando ? 'Depositando' : 'Depositar garantía'}
          </button>
        </form>
      </div>

      <Resultado salida={salida} />
    </>
  )
}
