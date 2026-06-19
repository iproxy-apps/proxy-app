/**
 * Design tokens — premium-neutro palette.
 *
 * One source of truth for every color used in the app. Component files should
 * import from here instead of declaring local consts.
 *
 * Gradient stop colors that only appear in a single component (e.g., the card
 * preview's graphite gradient, the splash linear background, Logo SVG stops)
 * stay inline at the call site — they're one-offs, not part of the palette.
 */

// -----------------------------------------------------------------------------
// Foreground / neutrals
// -----------------------------------------------------------------------------

export const GRAPHITE = 'hsl(220, 10%, 12%)'
export const FOCUS = 'hsl(220, 10%, 22%)' // input focused border
export const MUTED = 'hsl(220, 8%, 42%)' // secondary text
export const SUBTLE = 'hsl(220, 8%, 60%)' // tertiary text, chevrons, placeholders

export const GRAPHITE_TINT = 'hsla(220, 10%, 12%, 0.06)' // subtle bg (forgot-password icon container)
export const GRAPHITE_TINT_SOFT = 'hsla(220, 10%, 12%, 0.04)' // even more subtle (pressed states)

// -----------------------------------------------------------------------------
// Accent (brand mustard)
// -----------------------------------------------------------------------------

export const ACCENT = 'hsl(45, 95%, 55%)'
export const ACCENT_TINT = 'hsla(45, 95%, 55%, 0.15)' // default subtle accent bg
export const ACCENT_TINT_STRONG = 'hsla(45, 95%, 55%, 0.18)' // for focal elements (badges)
export const ACCENT_BORDER = 'hsla(45, 95%, 55%, 0.35)' // chip borders
export const ACCENT_BORDER_STRONG = 'hsla(45, 95%, 55%, 0.45)' // decorative card borders

// -----------------------------------------------------------------------------
// Background / surfaces
// -----------------------------------------------------------------------------

export const BG = 'hsl(40, 20%, 97%)' // app background (warm off-white)
export const CREAM = 'hsl(40, 20%, 96%)' // foreground on dark surfaces
export const CREAM_75 = 'hsla(40, 20%, 96%, 0.75)' // secondary on dark
export const CREAM_45 = 'hsla(40, 20%, 96%, 0.45)' // tertiary on dark
export const BORDER = 'hsl(40, 10%, 88%)' // hairlines, input borders

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------

export const SUCCESS = 'hsl(152, 60%, 38%)'
export const SUCCESS_TINT = 'hsla(152, 60%, 38%, 0.12)'

export const DESTRUCTIVE = 'hsl(358, 70%, 52%)'
export const DESTRUCTIVE_TINT = 'hsla(358, 70%, 52%, 0.12)'

export const INFO = 'hsl(215, 80%, 52%)'
export const INFO_TINT = 'hsla(215, 80%, 52%, 0.12)'
