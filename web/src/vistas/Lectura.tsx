import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { api, type Prueba, type RespuestaLectura } from '../api'
import { BandaLectura } from '../Banda'
import { corto, grados, numero } from '../format'
import { Cabecera, Resultado, salidaDeError, type Salida } from '../ui'
import type { Contexto } from '../App'

type Paso = 'hecho' | 'fallo' | 'omitido'

function PasoLinea({ n, estado, titulo, children }: { n: number; estado: Paso; titulo: string; children?: ReactNode }) {
  return (
    <li className={estado}>
      <b aria-hidden="true">{estado === 'hecho' ? '✓' : estado === 'fallo' ? '!' : n}</b>
      <div>
        <div className="titulo">{titulo}</div>
        {children}
      </div>
    </li>
  )
}

function Recorrido({ r }: { r: RespuestaLectura }) {
  const { paquete, resultado, rechazo } = r
  const reglas: Paso = rechazo ? 'omitido' : resultado && !resultado.aprobada ? 'fallo' : 'hecho'
  const pago: Paso = resultado?.txHash ? 'hecho' : 'omitido'
  return (
    <ol className="pasos-num">
      <PasoLinea n={1} estado="hecho" titulo="Lectura firmada por el oráculo">
        <span className="etiqueta codigo" title={paquete.firma}>
          Firma {corto(paquete.firma, 8, 6)}
        </span>
      </PasoLinea>
      <PasoLinea n={2} estado={rechazo ? 'fallo' : 'hecho'} titulo={rechazo ? 'Firma o nonce rechazados' : 'Firma y nonce verificados'}>
        {rechazo && <p className="meta">{rechazo.mensaje}</p>}
      </PasoLinea>
      <PasoLinea n={3} estado={reglas} titulo={rechazo ? 'Reglas sin evaluar' : resultado?.aprobada ? 'Lectura dentro de las reglas' : 'Lectura fuera de las reglas'}>
        {resultado && !resultado.aprobada && (
          <ul className="motivos">
            {resultado.motivos.map(m => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </PasoLinea>
      <PasoLinea n={4} estado={pago} titulo={pago === 'hecho' ? 'Pago autorizado en la cadena' : 'Sin transacción, no se autoriza pago'}>
        {resultado?.txHash && (
          <span className="etiqueta si codigo" title={resultado.txHash}>
            Tx {corto(resultado.txHash, 8, 6)}
          </span>
        )}
      </PasoLinea>
    </ol>
  )
}

export function Lectura({ estado, eventos, recargar, ultima, guardarUltima }: Contexto) {
  const siguienteLote = useMemo(
    () => Math.max(0, ...eventos.filter(e => e.idLote && Number(e.idLote) < 3_000_000_000).map(e => Number(e.idLote))) + 1,
    [eventos],
  )
  const [idLote, setIdLote] = useState<number | null>(null)
  const [productor, setProductor] = useState(0)
  const [montoEth, setMontoEth] = useState('1')
  const [temperatura, setTemperatura] = useState(3.5)
  const [acidez, setAcidez] = useState(16)
  const [enviando, setEnviando] = useState<Prueba | null>(null)
  const [salida, setSalida] = useState<Salida | null>(null)

  const { limites } = estado
  const cumple = temperatura <= limites.temperaturaMaxima && acidez >= limites.acidezMinima && acidez <= limites.acidezMaxima
  const lote = idLote ?? siguienteLote

  const enviar = async (prueba: Prueba, e?: FormEvent) => {
    e?.preventDefault()
    setEnviando(prueba)
    setSalida(null)
    try {
      const r = await api<RespuestaLectura>('/lecturas', { idLote: lote, temperatura, acidez, productor, montoEth, prueba })
      guardarUltima(r)
      setIdLote(null)
      await recargar()
    } catch (err) {
      setSalida(salidaDeError(err, 'Lectura de lote'))
    } finally {
      setEnviando(null)
    }
  }

  const oraculo = estado.cuentas.find(c => c.esOraculo)

  return (
    <>
      <Cabecera
        antetitulo="Oráculo"
        titulo={
          <>
            Lectura de <em className="destaque">lote</em>
          </>
        }
        texto={`La cuenta ${oraculo ? oraculo.nombre : 'del oráculo'} firma la lectura, el servicio verifica la firma y evalúa las reglas. Solo una lectura conforme autoriza el pago.`}
      />

      <div className="rejilla-dos-uno">
        <form className="tarjeta" onSubmit={e => void enviar('normal', e)}>
          <h2>Medición</h2>
          <BandaLectura temperatura={temperatura} acidez={acidez} limites={limites} />

          <div className="dos">
            <div className="campo">
              <label htmlFor="temperatura">Temperatura (°C)</label>
              <input id="temperatura" type="number" step="0.1" min={-50} max={100} value={temperatura} onChange={e => setTemperatura(Number(e.target.value))} />
              <input type="range" aria-label="Ajustar temperatura" min={-2} max={10} step={0.1} value={Math.min(10, Math.max(-2, temperatura))} onChange={e => setTemperatura(Number(e.target.value))} />
            </div>
            <div className="campo">
              <label htmlFor="acidez">Acidez</label>
              <input id="acidez" type="number" step="0.1" min={0} max={100} value={acidez} onChange={e => setAcidez(Number(e.target.value))} />
              <input type="range" aria-label="Ajustar acidez" min={10} max={22} step={0.1} value={Math.min(22, Math.max(10, acidez))} onChange={e => setAcidez(Number(e.target.value))} />
            </div>
            <div className="campo">
              <label htmlFor="lote">Número de lote</label>
              <input id="lote" type="number" min={1} step={1} value={lote} onChange={e => setIdLote(Number(e.target.value))} />
            </div>
            <div className="campo">
              <label htmlFor="productor">Productor</label>
              <select id="productor" value={productor} onChange={e => setProductor(Number(e.target.value))}>
                {estado.productores.map(p => (
                  <option key={p.indice} value={p.indice}>
                    {p.nombre} · {corto(p.direccion)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="monto-pago">Pago si el lote es conforme (ETH)</label>
              <input id="monto-pago" inputMode="decimal" value={montoEth} onChange={e => setMontoEth(e.target.value)} />
            </div>
            <div className="campo">
              <span className="rotulo">Vista previa de las reglas</span>
              <span className={`etiqueta ${cumple ? 'si' : 'no'}`} style={{ alignSelf: 'start', marginTop: 8 }}>
                {cumple ? 'Cumple las reglas' : 'No cumple las reglas'}
              </span>
              <span className="ayuda">Temperatura {grados(temperatura)} · acidez {numero(acidez)}</span>
            </div>
          </div>

          <div className="fila">
            <button className="btn btn-lleno" type="submit" disabled={enviando !== null}>
              {enviando === 'normal' ? 'Firmando y enviando' : 'Firmar y enviar lectura'}
            </button>
          </div>
        </form>

        <div className="pila-v">
          <section className="tarjeta" aria-live="polite">
            <h2>Recorrido de la última lectura</h2>
            {ultima ? (
              <>
                <p className="codigo meta">
                  Lote {ultima.paquete.lectura.idLote} · {grados(ultima.paquete.lectura.temperatura)} · acidez {numero(ultima.paquete.lectura.acidez)}
                </p>
                <Recorrido r={ultima} />
              </>
            ) : (
              <p className="vacio">Envía una lectura para ver cada paso de la verificación.</p>
            )}
          </section>

          <section className="tarjeta">
            <h2>Pruebas de seguridad</h2>
            <p className="intro">Usan los valores del formulario. Ninguna debería autorizar un pago.</p>
            <div className="fila">
              <button className="btn btn-chico" type="button" disabled={enviando !== null || !ultima} onClick={() => void enviar('repetida')}>
                Repetir la última lectura
              </button>
              <button className="btn btn-chico" type="button" disabled={enviando !== null} onClick={() => void enviar('alterada')}>
                Alterar un dato tras firmar
              </button>
            </div>
          </section>
        </div>
      </div>

      <Resultado salida={salida} />
    </>
  )
}
