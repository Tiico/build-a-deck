// Who «vi» are in the beta's terms and privacy text (#1272, F4 beslut 1): the one who runs Deckster
// today. The beställare fills these in, and this is the one place they are written; every sentence
// of the text that names them reads them from here. Until then each stands in square brackets, so
// the page says outright what is still missing rather than inventing it.
//
// `contact` is where the terms send a report, a complaint and a request to erase. It is also what
// the box says as «Kontakt» (`BYD_CONTACT`, #757), and the two should be the same address.
// `processors` is the sentence about the agreements with Cloudflare and Resend (G6), which is true
// only once they are signed; `transfer` is what Resend's transfer to the USA rests on (G6, F6).
export const OPERATOR = {
  name: '[namn]',
  address: '[adress]',
  contact: '[kontaktadressen]',
  processors: '[Biträdesavtalen med Cloudflare och Resend är tecknade.]',
  transfer: '[EU–USA-ramverket eller standardavtalsklausuler]',
} as const

export type Operator = typeof OPERATOR
