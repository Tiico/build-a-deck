import { randomBytes, randomInt } from 'node:crypto'

// Room codes (DRIFT §9): what a guest types or scans to reach a table. Short, from an alphabet
// without the characters people confuse, and alive for a few hours after the last connection.
// The host's key is what opens the table's own view (K14: the screen that acts for the group);
// a guest token is what a phone or an observer connects with, and what a kick revokes.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
export const CODE_TTL_MS = 3 * 3600_000

export function newCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

// What was typed, as a code: upper case, without spaces or dashes; null when it cannot be one.
export function normaliseCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}

// A host key or a guest token: random, shown once, stored hashed.
export function newSecret(): string {
  return randomBytes(24).toString('base64url')
}

export const codeExpiry = (now: Date): string => new Date(now.getTime() + CODE_TTL_MS).toISOString()
