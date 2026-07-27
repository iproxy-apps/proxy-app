/**
 * Extracts the first + last initials from a full name.
 * "Leandro Martins" → "LM". "Leandro" → "L". Empty/null → "?".
 */
export function initialsOf(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}
