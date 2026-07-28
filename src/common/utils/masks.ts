/**
 * Masking helpers for Brazilian fields. Each function takes a raw input
 * (possibly with formatting) and returns the same with the canonical mask
 * applied up to the maximum length of the field.
 */

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function maskPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function maskCPF(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function maskCNPJ(value: string): string {
  const digits = onlyDigits(value).slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

export function maskDocument(value: string, type: 'CPF' | 'CNPJ'): string {
  return type === 'CPF' ? maskCPF(value) : maskCNPJ(value)
}

export function unmask(value: string): string {
  return onlyDigits(value)
}

export function maskCEP(value: string): string {
  const digits = onlyDigits(value).slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/** Uppercase 2-letter Brazilian state abbreviation. */
export function maskState(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
}

/**
 * Applies BRL currency mask treating input as raw cents.
 * Empty input → "". "1" → "R$ 0,01". "1234567" → "R$ 12.345,67".
 * Cap at 10 digits (R$ 99.999.999,99).
 */
export function maskBRL(value: string): string {
  const digits = onlyDigits(value).slice(0, 10)
  if (!digits) return ''
  const padded = digits.padStart(3, '0')
  const intPart = padded.slice(0, -2).replace(/^0+/, '') || '0'
  const decPart = padded.slice(-2)
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${intFormatted},${decPart}`
}

/** Extracts the numeric value from a BRL-masked string. "R$ 12,50" → 12.5. */
export function parseBRLToNumber(masked: string): number {
  const digits = onlyDigits(masked)
  if (!digits) return 0
  return Number(digits) / 100
}
