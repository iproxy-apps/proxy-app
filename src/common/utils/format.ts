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
