const UNIDAD = 10n ** 18n

/** Wei (cadena) a ETH con hasta 4 decimales y coma decimal, sin ceros sobrantes. */
export function eth(wei: string): string {
  const w = BigInt(wei)
  const entero = w / UNIDAD
  const decimales = (w % UNIDAD).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '')
  const miles = new Intl.NumberFormat('es-CO').format(entero)
  return `${miles}${decimales ? `,${decimales}` : ''} ETH`
}

export const corto = (valor: string, inicio = 6, fin = 4) =>
  valor.length > inicio + fin + 1 ? `${valor.slice(0, inicio)}…${valor.slice(-fin)}` : valor

export const grados = (n: number) =>
  `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n)} °C`

export const numero = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n)

export const TIPOS: Record<string, string> = {
  GarantiaDepositada: 'Garantía depositada',
  PagoAutorizado: 'Pago autorizado',
  PagoRetirado: 'Pago retirado',
}
