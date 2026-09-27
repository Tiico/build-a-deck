import type { Key } from '../i18n/index.js'

// Why the game could not be made (#476), as a sentence in the catalogue rather than a status code
// or the browser's own words. The wizard says it after «Spelet skapades inte.», so every reason is
// read as what went wrong and what to do about it.
export class NotMade extends Error {
  constructor(readonly reason: Key) {
    super(reason)
  }
}
