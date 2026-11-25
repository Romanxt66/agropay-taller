import { useState } from 'react'
import { api } from '../api'
import { corto, eth } from '../format'
import { Cabecera, Dialogo, ReiniciarCuentas, Resultado, salidaDeError, type Salida } from '../ui'
import type { Contexto } from '../App'

interface RespReceptor {
  direccion: string
  montoWei: string
  intento: { exito: boolean; codigo?: string; revert?: string; mensaje?: string }
  pendienteWei: string
}
interface RespAtacante {
  direccion: string
  montoWei: string
  intentosReentrada: number
  reentradaExitosa: boolean
  recibidoWei: string
  pendienteWei: string
}

export function Laboratorio({ estado, recargar }: Contexto) {
  const [monto, setMonto] = useState('1')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [salida, setSalida] = useState<Salida | null>(null)
  const [receptor, setReceptor] = useState<RespReceptor | null>(null)
  const [atacante, setAtacante] = useState<RespAtacante | null>(null)
  const [eleccion, setEleccion] = useState<string>(String(estado.oraculoIndice ?? 1))
  const [confirmando, setConfirmando] = useState(false)

  const correr = async (clave: string, titulo: string, tarea: () => Promise<void>) => {
    setOcupado(clave)
    setSalida(null)
    try {
      await tarea()
    } catch (err) {
      setSalida(salidaDeError(err, titulo))
    } finally {
      await recargar()
      setOcupado(null)
    }
  }

  const reiniciar = () =>
    correr('reiniciar', 'Desplegar contrato nuevo', async () => {
      setConfirmando(false)
      await api('/reiniciar', { oraculo: eleccion === 'cero' ? 'cero' : Number(eleccion) })
      setReceptor(null)
      setAtacante(null)
      setSalida({ ok: true, titulo: 'Contrato nuevo desplegado. La garantía y el registro volvieron a cero.' })
    })

  const oraculoActual = estado.cuentas.find(c => c.esOraculo)

  return (
    <>
      <Cabecera
        antetitulo="Laboratorio"
        titulo={
          <>
            Casos <em className="destaque">límite</em>
          </>
        }
        texto="Los contratos de práctica del taller, en vivo: un destinatario que rechaza el pago, un ataque de reentrada y el constructor con otro oráculo."
      />

      <div className="rejilla-2">
        <section className="tarjeta">
          <h2>Receptor que rechaza</h2>
          <p className="intro">
            Autoriza un pago a un contrato que rechaza cualquier transferencia y llama a retirar. El contrato revierte con FalloTransferencia y el saldo no se pierde.
          </p>
          <div className="campo">
            <label htmlFor="lab-monto-r">Monto del pago (ETH)</label>
            <input id="lab-monto-r" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
          <div className="fila">
            <button
              className="btn btn-lleno"
              type="button"
              disabled={ocupado !== null}
              onClick={() => void correr('receptor', 'Receptor que rechaza', async () => setReceptor(await api<RespReceptor>('/practica/receptor', { montoEth: monto })))}
            >
              {ocupado === 'receptor' ? 'Probando' : 'Probar el retiro'}
            </button>
          </div>
          {receptor && (
            <div className="aviso alerta" aria-live="polite">
              <span>{receptor.intento.exito ? 'El retiro se completó' : `El contrato revirtió: ${receptor.intento.revert}`}</span>
              <span className="detalle">{receptor.intento.mensaje}</span>
              <span className="codigo">
                Saldo pendiente conservado: {eth(receptor.pendienteWei)} · {corto(receptor.direccion)}
              </span>
            </div>
          )}
        </section>

        <section className="tarjeta">
          <h2>Atacante de reentrada</h2>
          <p className="intro">
            Autoriza un pago a un contrato que vuelve a llamar a retirar mientras recibe los fondos. El orden revisar, actualizar, transferir lo frena: cobra una sola vez.
          </p>
          <div className="fila">
            <button
              className="btn btn-lleno"
              type="button"
              disabled={ocupado !== null}
              onClick={() => void correr('atacante', 'Atacante de reentrada', async () => setAtacante(await api<RespAtacante>('/practica/atacante', { montoEth: monto })))}
            >
              {ocupado === 'atacante' ? 'Atacando' : 'Lanzar el ataque'}
            </button>
          </div>
          {atacante && (
            <div className={`aviso ${atacante.reentradaExitosa ? 'mal' : ''}`} aria-live="polite">
              <span>{atacante.reentradaExitosa ? 'La reentrada tuvo éxito' : 'Reentrada bloqueada'}</span>
              <span className="detalle">
                Intentos de reentrada: {atacante.intentosReentrada}. El atacante recibió {eth(atacante.recibidoWei)} de {eth(atacante.montoWei)} autorizados y le queda {eth(atacante.pendienteWei)} pendiente.
              </span>
            </div>
          )}
        </section>

        <section className="tarjeta">
          <h2>Constructor y oráculo</h2>
          <p className="intro">
            El oráculo se fija al desplegar y no cambia. Despliega un contrato nuevo con otra cuenta como oráculo, o con la dirección cero para ver DireccionInvalida.
          </p>
          <p className="meta">
            Oráculo actual: <strong>{oraculoActual?.nombre ?? 'ninguno'}</strong> {oraculoActual && <span className="codigo">{corto(oraculoActual.direccion)}</span>}
          </p>
          <div className="campo">
            <label htmlFor="lab-oraculo">Oráculo del contrato nuevo</label>
            <select id="lab-oraculo" value={eleccion} onChange={e => setEleccion(e.target.value)}>
              {estado.indicesOraculo.map(i => (
                <option key={i} value={i}>
                  Cuenta {i + 1} · {corto(estado.cuentas[i].direccion)}
                </option>
              ))}
              <option value="cero">Dirección cero (0x000…000)</option>
            </select>
          </div>
          <div className="fila">
            <button className="btn btn-peligro" type="button" disabled={ocupado !== null} onClick={() => setConfirmando(true)}>
              Desplegar contrato nuevo
            </button>
          </div>
          <div className="separado">
            <p className="meta" style={{ marginBottom: 8 }}>
              Para empezar de cero también con los saldos: las 10 cuentas vuelven a 10.000 ETH y el oráculo a la Cuenta 2.
            </p>
            <ReiniciarCuentas
              deshabilitado={ocupado !== null}
              onSalida={s => {
                setSalida(s)
                setReceptor(null)
                setAtacante(null)
                setEleccion('1')
              }}
              alTerminar={recargar}
            />
          </div>
        </section>

        <section className="tarjeta">
          <h2>Contratos de práctica desplegados</h2>
          {estado.practicas.length === 0 ? (
            <p className="vacio">Aún no hay ninguno. Lanza una de las pruebas.</p>
          ) : (
            <div className="envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th className="num">Pendiente</th>
                    <th className="num">Recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.practicas.map(p => (
                    <tr key={p.direccion}>
                      <td>
                        <div>{p.nombre}</div>
                        <div className="codigo meta">{corto(p.direccion)}</div>
                      </td>
                      <td className="num">{eth(p.pendienteWei)}</td>
                      <td className="num">{eth(p.balanceWei)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Resultado salida={salida} />

      <Dialogo abierto={confirmando} titulo="¿Desplegar un contrato nuevo?" confirmar="Desplegar" peligro onConfirmar={() => void reiniciar()} onCancelar={() => setConfirmando(false)}>
        <p className="meta">Se perderán la garantía, los saldos y el registro actuales.</p>
      </Dialogo>
    </>
  )
}
