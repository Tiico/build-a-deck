// Whether the designer has asked for stillness (`prefers-reduced-motion`): then «Visa upp» (#1414)
// changes place without folding, and the box does not turn of its own (#1441).
export const STILL = '(prefers-reduced-motion: reduce)'
export const still = () => typeof matchMedia === 'function' && matchMedia(STILL).matches
