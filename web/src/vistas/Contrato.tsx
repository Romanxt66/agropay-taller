import { useState } from 'react'
import { api } from '../api'
import { corto, eth } from '../format'
import { Cabecera, Resultado, SelectorCuenta, salidaDeError, type Salida } from '../ui'
import type { Contexto } from '../App'

interface Consulta {
  oraculo: string
  garantiaWei: string
  saldoDe?: { direccion: string; pendienteWei: string }
  lote?: { idLote: string; autorizado: boolean }
}

/** Cada función de GarantiaAgroPay, llamada desde la cuenta que elijas. */
export function Contrato({ estado, recargar }: Contexto) {
  const cuentas = estado.cuentas
  const indiceOraculo = estado.oraculoIndice ?? 1
  const [salida, setSalida] = useState<Salida | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // depositarGarantia
  const [depCuenta, setDepCuenta] = useState(0)
  const [depMonto, setDepMonto] = useState('1')
  // autorizarPago
  const [autCuenta, setAutCuenta] = useState(indiceOraculo)
  const [autLote, setAutLote] = useState(100)
  const [autDestino, setAutDestino] = useState(2)
  const [autDestinoExtra, setAutDestinoExtra] = useState('')
  const [autOtra, setAutOtra] = useState('')
  const [autMonto, setAutMonto] = useState('1')
  // retirar
  const [retCuenta, setRetCuenta] = useState(2)
  // consultas
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  const [conSaldo, setConSaldo] = useState(2)
  const [conLote, setConLote] = useState('100')

  const ejecutar = async (clave: string, titulo: string, tarea: () => Promise<{ txHash: string } & Record<string, unknown>>, ok: (r: { txHash: string }) => string) => {
    setOcupado(clave)
    try {
      const r = await tarea()
      setSalida({ ok: true, titulo: ok(r), tx: r.txHash })
      await recargar()
    } catch (err) {
      setSalida(salidaDeError(err, titulo))
      await recargar()
    } finally {
      setOcupado(null)
    }
  }

  const consultar = async () => {
    setOcupado('consulta')
    try {
      const params = new URLSearchParams({ saldo: cuentas[conSaldo].direccion, lote: conLote })
      setConsulta(await api<Consulta>(`/consulta?${params}`))
      setSalida(null)
    } catch (err) {
      setSalida(salidaDeError(err, 'Consulta al contrato'))
    } finally {
      setOcupado(null)
    }
  }

  const destino = () =>
    autDestinoExtra === 'cero'
      ? { direccion: '0x0000000000000000000000000000000000000000' }
      : autDestinoExtra === 'otra'
        ? { direccion: autOtra.trim() }
        : { cuenta: autDestino }

  const nombreCuenta = (i: number) => cuentas[i]?.nombre ?? 'cuenta'

  return (
    <>
      <Cabecera
        antetitulo="Contrato GarantiaAgroPay"
        titulo={
          <>
            Todas las <em className="destaque">funciones</em>
          </>
        }
        texto="Llama cada función del contrato desde la cuenta que quieras. Si el contrato rechaza la llamada, verás el error exacto de Solidity."
      />

      <div className="rejilla-2">
        <section className="tarjeta">
          <h2>depositarGarantia</h2>
          <p className="intro">Cualquier cuenta puede aportar fondos. El monto debe ser mayor que cero: prueba con 0 para ver MontoInvalido.</p>
          <SelectorCuenta id="dep-cuenta" etiqueta="Desde la cuenta" cuentas={cuentas} valor={depCuenta} onCambio={setDepCuenta} />
          <div className="campo">
            <label htmlFor="dep-monto">Monto (ETH)</label>
            <input id="dep-monto" inputMode="decimal" value={depMonto} onChange={e => setDepMonto(e.target.value)} />
          </div>
          <div className="fila">
            <button
              className="btn btn-lleno"
              type="button"
              disabled={ocupado !== null}
              onClick={() =>
                void ejecutar('dep', 'depositarGarantia', () => api('/contrato/deposito', { eth: depMonto, cuenta: depCuenta }), () => `${nombreCuenta(depCuenta)} depositó ${depMonto} ETH`)
              }
            >
              {ocupado === 'dep' ? 'Enviando' : 'Depositar garantía'}
            </button>
          </div>
        </section>

        <section className="tarjeta">
          <h2>autorizarPago</h2>
          <p className="intro">Reserva un pago para un productor. Solo la cuenta del oráculo puede llamarla: prueba con otra para ver SoloOraculo.</p>
          <SelectorCuenta id="aut-cuenta" etiqueta="Desde la cuenta" cuentas={cuentas} valor={autCuenta} onCambio={setAutCuenta} />
          <div className="dos">
            <div className="campo">
              <label htmlFor="aut-lote">Número de lote</label>
              <input id="aut-lote" type="number" min={0} step={1} value={autLote} onChange={e => setAutLote(Number(e.target.value))} />
            </div>
            <div className="campo">
              <label htmlFor="aut-monto">Monto (ETH)</label>
              <input id="aut-monto" inputMode="decimal" value={autMonto} onChange={e => setAutMonto(e.target.value)} />
            </div>
          </div>
          <SelectorCuenta
            id="aut-destino"
            etiqueta="Productor que recibe"
            cuentas={cuentas}
            valor={autDestino}
            onCambio={setAutDestino}
            extra={[
              { valor: 'cero', etiqueta: 'Dirección cero (0x000…000)' },
              { valor: 'otra', etiqueta: 'Otra dirección…' },
            ]}
            valorExtra={autDestinoExtra || undefined}
            onExtra={setAutDestinoExtra}
          />
          {autDestinoExtra === 'otra' && (
            <div className="campo">
              <label htmlFor="aut-otra">Dirección</label>
              <input id="aut-otra" value={autOtra} onChange={e => setAutOtra(e.target.value)} placeholder="0x…" spellCheck={false} />
            </div>
          )}
          <div className="fila">
            <button
              className="btn btn-lleno"
              type="button"
              disabled={ocupado !== null}
              onClick={() =>
                void ejecutar('aut', 'autorizarPago', () => api('/contrato/autorizar', { cuenta: autCuenta, idLote: autLote, destino: destino(), montoEth: autMonto }), () => `Lote ${autLote} autorizado por ${nombreCuenta(autCuenta)}`)
              }
            >
              {ocupado === 'aut' ? 'Enviando' : 'Autorizar pago'}
            </button>
          </div>
        </section>

        <section className="tarjeta">
          <h2>retirar</h2>
          <p className="intro">Transfiere a quien llama todo su saldo pendiente y lo deja en cero. Sin saldo, el contrato revierte con SinSaldoPendiente.</p>
          <SelectorCuenta id="ret-cuenta" etiqueta="Desde la cuenta" cuentas={cuentas} valor={retCuenta} onCambio={setRetCuenta} mostrarPendiente />
          <div className="fila">
            <button
              className="btn btn-lleno"
              type="button"
              disabled={ocupado !== null}
              onClick={() =>
                void ejecutar('ret', 'retirar', () => api('/contrato/retiro', { cuenta: retCuenta }), () => `${nombreCuenta(retCuenta)} retiró su saldo`)
              }
            >
              {ocupado === 'ret' ? 'Enviando' : 'Retirar saldo'}
            </button>
          </div>
        </section>

        <section className="tarjeta">
          <h2>Consultas</h2>
          <p className="intro">oraculo, garantiaDisponible, saldoPendiente y loteAutorizado. No cuestan gas ni cambian nada.</p>
          <SelectorCuenta id="con-saldo" etiqueta="saldoPendiente de la cuenta" cuentas={cuentas} valor={conSaldo} onCambio={setConSaldo} />
          <div className="campo">
            <label htmlFor="con-lote">loteAutorizado del número</label>
            <input id="con-lote" type="number" min={0} step={1} value={conLote} onChange={e => setConLote(e.target.value)} />
          </div>
          <div className="fila">
            <button className="btn" type="button" disabled={ocupado !== null} onClick={() => void consultar()}>
              {ocupado === 'consulta' ? 'Consultando' : 'Consultar'}
            </button>
          </div>
          {consulta && (
            <dl className="separado" style={{ display: 'grid', gap: 8 }} aria-live="polite">
              <div>
                <dt className="codigo meta">oraculo()</dt>
                <dd className="codigo">{corto(consulta.oraculo, 10, 8)}</dd>
              </div>
              <div>
                <dt className="codigo meta">garantiaDisponible()</dt>
                <dd>{eth(consulta.garantiaWei)}</dd>
              </div>
              {consulta.saldoDe && (
                <div>
                  <dt className="codigo meta">saldoPendiente({corto(consulta.saldoDe.direccion)})</dt>
                  <dd>{eth(consulta.saldoDe.pendienteWei)}</dd>
                </div>
              )}
              {consulta.lote && (
                <div>
                  <dt className="codigo meta">loteAutorizado({consulta.lote.idLote})</dt>
                  <dd>
                    <span className={`etiqueta ${consulta.lote.autorizado ? 'si' : 'apagada'}`}>{consulta.lote.autorizado ? 'Autorizado' : 'Sin autorizar'}</span>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </section>
      </div>

      <Resultado salida={salida} />
    </>
  )
}
