export interface Productor {
  indice: number
  nombre: string
  direccion: string
  pendienteWei: string
  balanceWei: string
}

export interface Cuenta {
  indice: number
  nombre: string
  direccion: string
  esOraculo: boolean
  pendienteWei: string
  balanceWei: string
}

export interface ContratoPractica {
  tipo: 'receptor' | 'atacante'
  nombre: string
  direccion: string
  pendienteWei: string
  balanceWei: string
}

export interface Estado {
  contrato: string
  oraculo: string
  depositante: string
  chainId: number
  bloque: number
  garantiaWei: string
  maxEth: number
  limites: { temperaturaMaxima: number; acidezMinima: number; acidezMaxima: number }
  productores: Productor[]
  oraculoIndice: number | null
  cuentas: Cuenta[]
  practicas: ContratoPractica[]
  indicesOraculo: number[]
}

export interface Evento {
  txHash: string
  logIndex: number
  bloque: number
  tipo: 'GarantiaDepositada' | 'PagoAutorizado' | 'PagoRetirado'
  idLote: string | null
  cuenta: string
  montoWei: string
}

export interface PaqueteFirmado {
  lectura: { idLote: number; temperatura: number; acidez: number; nonce: string }
  firma: string
}

export interface RespuestaLectura {
  paquete: PaqueteFirmado
  resultado: { aprobada: boolean; motivos: string[]; txHash: string | null } | null
  rechazo: { codigo: 'FIRMA_INVALIDA' | 'LECTURA_REPETIDA'; mensaje: string } | null
}

export type Prueba = 'normal' | 'repetida' | 'alterada'

/** Error de la API: si viene de una función del contrato, trae el nombre del error de Solidity. */
export class ErrorApi extends Error {
  codigo?: string
  revert?: string
  constructor(mensaje: string, codigo?: string, revert?: string) {
    super(mensaje)
    this.codigo = codigo
    this.revert = revert
  }
}

export async function api<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/api${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.')
  }
  const datos = await r.json().catch(() => null)
  if (!r.ok) throw new ErrorApi(datos?.error ?? 'No pudimos completar la acción.', datos?.codigo, datos?.revert)
  return datos as T
}
