import { useMemo, useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import { api, type Prueba, type RespuestaLectura } from '../api'
import { BandaLectura } from '../Banda'
import { corto, eth, grados, numero } from '../format'
import type { Contexto } from '../App'

type Estado = 'hecho' | 'fallo' | 'omitido'

function Paso({ estado, titulo, children }: { estado: Estado; titulo: string; children?: React.ReactNode }) {
  return (
    <li className={`paso ${estado}`}>
      <span className="nodo" aria-hidden="true" />
      <div>
        <div className="titulo">{titulo}</div>
        {children}
      </div>
    </li>
  )
}

function Recorrido({ r }: { r: RespuestaLectura }) {
  const { paquete, resultado, rechazo } = r
  const verificacion: Estado = rechazo ? 'fallo' : 'hecho'
  const reglas: Estado = rechazo ? 'omitido' : resultado && !resultado.aprobada ? 'fallo' : 'hecho'
  const pago: Estado = resultado?.txHash ? 'hecho' : 'omitido'
  return (
    <ol className="pasos">
      <Paso estado="hecho" titulo="Lectura firmada por el oráculo">
        <span className="sello mono" title={paquete.firma}>
          Firma {corto(paquete.firma, 8, 6)}
        </span>
      </Paso>
      <Paso estado={verificacion} titulo={rechazo ? 'Firma o nonce rechazados' : 'Firma y nonce verificados'}>
        {rechazo && <p className="sec">{rechazo.mensaje}</p>}
      </Paso>
      <Paso estado={reglas} titulo={rechazo ? 'Reglas sin evaluar' : resultado?.aprobada ? 'Lectura dentro de las reglas' : 'Lectura fuera de las reglas'}>
        {resultado && !resultado.aprobada && (
          <ul className="motivos">
            {resultado.motivos.map(m => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </Paso>
      <Paso estado={pago} titulo={pago === 'hecho' ? 'Pago autorizado en la cadena' : 'Sin transacción, no se autoriza pago'}>
        {resultado?.txHash && (
          <span className="sello mono" title={resultado.txHash}>
            Tx {corto(resultado.txHash, 8, 6)}
          </span>
        )}
      </Paso>
    </ol>
  )
}

export function Lectura({ estado, eventos, recargar, avisar, ultima, guardarUltima }: Contexto) {
  const siguienteLote = useMemo(
    () => Math.max(0, ...eventos.filter(e => e.idLote).map(e => Number(e.idLote))) + 1,
    [eventos],
  )
  const [idLote, setIdLote] = useState<number | null>(null)
  const [productor, setProductor] = useState(0)
  const [montoEth, setMontoEth] = useState('1')
  const [temperatura, setTemperatura] = useState(3.5)
  const [acidez, setAcidez] = useState(16)
  const [enviando, setEnviando] = useState<Prueba | null>(null)

  const { limites } = estado
  const cumple = temperatura <= limites.temperaturaMaxima && acidez >= limites.acidezMinima && acidez <= limites.acidezMaxima
  const lote = idLote ?? siguienteLote

  const enviar = async (prueba: Prueba, e?: FormEvent) => {
    e?.preventDefault()
    setEnviando(prueba)
    try {
      const r = await api<RespuestaLectura>('/lecturas', { idLote: lote, temperatura, acidez, productor, montoEth, prueba })
      guardarUltima(r)
      setIdLote(null)
      await recargar()
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No pudimos enviar la lectura.', 'mal')
    } finally {
      setEnviando(null)
    }
  }

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Lectura de lote</h1>
          <p>El oráculo firma la lectura, el servicio verifica la firma y evalúa las reglas. Solo una lectura conforme autoriza el pago.</p>
        </div>
      </div>

      <div className="dos-col">
        <form className="card" onSubmit={e => void enviar('normal', e)}>
          <h2>Medición</h2>
          <div className="banda-wrap">
            <BandaLectura temperatura={temperatura} acidez={acidez} limites={limites} />
          </div>

          <div className="rejilla" style={{ marginTop: 24 }}>
            <div className="campo">
              <label htmlFor="temperatura">Temperatura (°C)</label>
              <input
                id="temperatura"
                className="entrada"
                type="number"
                step="0.1"
                min={-50}
                max={100}
                value={temperatura}
                onChange={e => setTemperatura(Number(e.target.value))}
              />
              <input
                type="range"
                aria-label="Ajustar temperatura"
                min={-2}
                max={10}
                step={0.1}
                value={Math.min(10, Math.max(-2, temperatura))}
                onChange={e => setTemperatura(Number(e.target.value))}
              />
            </div>
            <div className="campo">
              <label htmlFor="acidez">Acidez</label>
              <input
                id="acidez"
                className="entrada"
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={acidez}
                onChange={e => setAcidez(Number(e.target.value))}
              />
              <input
                type="range"
                aria-label="Ajustar acidez"
                min={10}
                max={22}
                step={0.1}
                value={Math.min(22, Math.max(10, acidez))}
                onChange={e => setAcidez(Number(e.target.value))}
              />
            </div>
            <div className="campo">
              <label htmlFor="lote">Número de lote</label>
              <input
                id="lote"
                className="entrada"
                type="number"
                min={1}
                step={1}
                value={lote}
                onChange={e => setIdLote(Number(e.target.value))}
              />
            </div>
            <div className="campo">
              <label htmlFor="productor">Productor</label>
              <select id="productor" className="entrada" value={productor} onChange={e => setProductor(Number(e.target.value))}>
                {estado.productores.map(p => (
                  <option key={p.indice} value={p.indice}>
                    {p.nombre} · {corto(p.direccion)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="monto-pago">Pago si el lote es conforme (ETH)</label>
              <input id="monto-pago" className="entrada" inputMode="decimal" value={montoEth} onChange={e => setMontoEth(e.target.value)} />
            </div>
            <div className="campo">
              <span className="sec">Vista previa de las reglas</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, color: cumple ? 'var(--pos)' : 'var(--neg)' }}>
                {cumple ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : <X size={16} strokeWidth={1.5} aria-hidden="true" />}
                {cumple ? 'Cumple las reglas' : 'No cumple las reglas'}
              </span>
            </div>
          </div>

          <div className="fila-acciones" style={{ marginTop: 24 }}>
            <button className="btn primario" type="submit" disabled={enviando !== null}>
              {enviando === 'normal' ? 'Firmando y enviando' : 'Firmar y enviar lectura'}
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card" aria-live="polite">
            <h2>Recorrido de la última lectura</h2>
            {ultima ? (
              <>
                <p className="mono muted" style={{ marginBottom: 16 }}>
                  Lote {ultima.paquete.lectura.idLote} · {grados(ultima.paquete.lectura.temperatura)} · acidez {numero(ultima.paquete.lectura.acidez)}
                </p>
                <Recorrido r={ultima} />
              </>
            ) : (
              <p className="vacio">Envía una lectura para ver cada paso de la verificación.</p>
            )}
          </section>

          <section className="card">
            <h2>Pruebas de seguridad</h2>
            <p className="sec" style={{ marginBottom: 16 }}>
              Usan los valores del formulario. Ninguna debería autorizar un pago.
            </p>
            <div className="fila-acciones">
              <button className="btn" type="button" disabled={enviando !== null || !ultima} onClick={() => void enviar('repetida')}>
                Repetir la última lectura
              </button>
              <button className="btn" type="button" disabled={enviando !== null} onClick={() => void enviar('alterada')}>
                Alterar un dato tras firmar
              </button>
            </div>
            <p className="mono muted" style={{ marginTop: 16 }}>
              Garantía disponible {eth(estado.garantiaWei)}
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
