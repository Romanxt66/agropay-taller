import { numero } from './format'

interface Props {
  etiqueta: string
  unidad: string
  valor: number
  minimo: number
  maximo: number
  /** Rango permitido dentro de la escala */
  desde: number
  hasta: number
  texto: string
}

const pct = (v: number, min: number, max: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))

/** Pone una lectura contra su rango permitido. Es el momento visual de la pantalla de lectura. */
function Banda({ etiqueta, unidad, valor, minimo, maximo, desde, hasta, texto }: Props) {
  const ok = valor >= desde && valor <= hasta
  const zonaDesde = pct(desde, minimo, maximo)
  const zonaHasta = pct(hasta, minimo, maximo)
  return (
    <div className="banda-fila">
      <div className="banda-cab">
        <span className="sec">{etiqueta}</span>
        <span className={`banda-valor ${ok ? 'ok' : 'fuera'}`}>
          {numero(valor)}
          {unidad}
        </span>
      </div>
      <div className="pista" role="img" aria-label={`${etiqueta} ${numero(valor)}${unidad}. ${texto}. ${ok ? 'Dentro del rango' : 'Fuera del rango'}`}>
        <div className="zona" style={{ left: `${zonaDesde}%`, width: `${zonaHasta - zonaDesde}%` }} />
        <div className={`marca ${ok ? 'ok' : 'fuera'}`} style={{ left: `${pct(valor, minimo, maximo)}%` }} />
      </div>
      <div className="escala">
        <span>
          {minimo}
          {unidad}
        </span>
        <span>{texto}</span>
        <span>
          {maximo}
          {unidad}
        </span>
      </div>
    </div>
  )
}

export function BandaLectura(props: {
  temperatura: number
  acidez: number
  limites: { temperaturaMaxima: number; acidezMinima: number; acidezMaxima: number }
}) {
  const { limites } = props
  return (
    <div className="banda">
      <Banda
        etiqueta="Temperatura"
        unidad=" °C"
        valor={props.temperatura}
        minimo={-2}
        maximo={10}
        desde={-2}
        hasta={limites.temperaturaMaxima}
        texto={`máximo ${limites.temperaturaMaxima} °C`}
      />
      <Banda
        etiqueta="Acidez"
        unidad=""
        valor={props.acidez}
        minimo={10}
        maximo={22}
        desde={limites.acidezMinima}
        hasta={limites.acidezMaxima}
        texto={`rango ${limites.acidezMinima} a ${limites.acidezMaxima}`}
      />
    </div>
  )
}
