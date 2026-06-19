/**
 * Maps a Stripe card brand string ('visa', 'mastercard', ...) to a display
 * label. Unknown brands fall back to 'Cartão'.
 */
export const brandDisplay = (brand: string): string => {
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    elo: 'Elo',
    hipercard: 'Hipercard',
  }
  return map[brand.toLowerCase()] ?? 'Cartão'
}
