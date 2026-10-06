// What a room code is (DRIFT §9), said once for the server that mints it and the app that reads it
// off an address: six characters from an alphabet without the ones people confuse.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

// What was typed, as a code: upper case, without spaces or dashes; null when it cannot be one.
export function normaliseCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}

// The code is the address (#675, beslut C 2026-10-06): the television says `värd/KOD`, and the
// phone that opens it lands in the seat picker. So a code shares the first step of a path with
// every address the app answers itself, and must never be one of them: `/guests` is the server's
// and `/assets` the built app's, and both are six letters of the alphabet. These are the first
// words of every such address, the server's and the app's both. It is not a list to keep by hand:
// a test reads the server's routes, another reads the app's router and the files it ships, and
// both fail the day a word here is missing.
export const ROUTE_WORDS: readonly string[] = [
  // The server's (packages/server/src).
  'assets', 'auth', 'faces', 'guests', 'health', 'invites', 'me', 'projects', 'rooms', 'sessions',
  // The app's pages (`fetchPage` in packages/web/src/App.tsx).
  'claim', 'editor', 'join', 'login', 'new', 'observe', 'online', 'play', 'table',
]

// Whether a code would read as one of the app's own addresses, in whatever case it is typed.
export const isRouteWord = (code: string): boolean => ROUTE_WORDS.includes(code.toLowerCase())

// The room an address names, when its path is `/KOD` and nothing else: the code as the server
// minted it, in any case — a phone's keyboard may well start it in lower case — and never one of
// the app's own words. Spaces and dashes are forgiven in a typed field, not in an address.
export function codeOfAddress(pathname: string): string | null {
  const word = /^\/([^/]+)$/.exec(pathname)?.[1] ?? ''
  if (word.length !== CODE_LENGTH || isRouteWord(word)) return null
  const code = word.toUpperCase()
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}
