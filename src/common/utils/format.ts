const bRLFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/**
 * Formats a value as BRL currency (R$ 1.234,56). Accepts number or string —
 * useful for Prisma Decimal fields that come back over JSON as strings. Falls
 * back to R$ 0,00 for anything that can't be parsed.
 */
export function formatBRL(value: number | string | null | undefined): string {
  if (value == null) return bRLFormatter.format(0)
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return bRLFormatter.format(0)
  return bRLFormatter.format(n)
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Formats an ISO date string (or Date) as "10 nov, 14:32" in pt-BR.
 * Returns empty string on invalid input.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return dateTimeFormatter.format(d).replace('.', '')
}
