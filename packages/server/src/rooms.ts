import { randomBytes, randomInt } from 'node:crypto'
import { CODE_ALPHABET, CODE_LENGTH, isRouteWord } from '@byd/protocol'

// Room codes (DRIFT §9): what a guest types or scans to reach a table. Short, from an alphabet
// without the characters people confuse, and alive for a few hours after the last connection.
// The host's key is what opens the table's own view (K14: the screen that acts for the group);
// a guest token is what a phone or an observer connects with, and what a kick revokes.

export { CODE_ALPHABET, CODE_LENGTH, normaliseCode } from '@byd/protocol'
export const CODE_TTL_MS = 3 * 3600_000
// A guest has this long to open the socket before an unclaimed seat reservation is released.
export const GUEST_PENDING_TTL_MS = 2 * 60_000

// The code is also the table's address, `/KOD` (#675), so a draw that spells one of the app's own
// words — `GUESTS`, `ASSETS` — is drawn again: that address already answers something else.
// `draw` is the randomness, and a test's to replace.
export function newCode(draw: (n: number) => number = randomInt): string {
  for (;;) {
    let out = ''
    for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[draw(CODE_ALPHABET.length)]
    if (!isRouteWord(out)) return out
  }
}

// A host key or a guest token: random, shown once, stored hashed.
export function newSecret(): string {
  return randomBytes(24).toString('base64url')
}

export const codeExpiry = (now: Date): string => new Date(now.getTime() + CODE_TTL_MS).toISOString()
