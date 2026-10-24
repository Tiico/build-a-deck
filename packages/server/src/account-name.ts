// The account's own name (#1254, beställarens beslut 2026-10-24): what the others call a designer —
// in Dela, in the editor's header, at her tables when she watches, in an invitation and in the
// sentence that says whose ceiling a co-editor met. It is the account's data, written by the
// designer herself, and it is never the address: a name the designer has not given is no name.
//
// Pure, so that the welcome step, the band on Mina spel and the profile's card say the same
// suggestion and hold the same ceiling as the server that keeps it (`@byd/server/doc`).

// At most forty characters (beslut 4), counted as a reader counts them: an emoji is one.
export const NAME_MAX = 40

// The name an address suggests (#1198): the first word before the @ that reads as one — two letters
// or more, nothing else — with a capital. «nicklas.ockelberg@…» suggests Nicklas; «x92@…» suggests
// nothing. It is only ever a suggestion: shown to the designer, filled in for her, and said to
// nobody else until she has said yes to it (beslut 2).
export function suggestedName(email: string): string | null {
  const local = email.split('@')[0] ?? ''
  const word = local.split(/[._+-]/).find((part) => /^\p{L}{2,}$/u.test(part))
  return word ? word.charAt(0).toLocaleUpperCase('sv') + word.slice(1).toLocaleLowerCase('sv') : null
}

// A name as the account keeps it: trimmed, and nothing but space is no name. Text of at most
// `NAME_MAX` characters on one line, or it is not a name at all.
export function nameOf(raw: unknown): { ok: true; name: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, name: null }
  if (typeof raw !== 'string') return { ok: false }
  const name = raw.trim()
  if (name === '') return { ok: true, name: null }
  if ([...name].length > NAME_MAX || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) return { ok: false }
  return { ok: true, name }
}
