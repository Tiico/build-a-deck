import { useRef, useState, type InputHTMLAttributes, type RefObject } from 'react'
import { normaliseCode } from '@byd/protocol'
import { useT } from '../i18n/index.js'

// A field a room code is typed into (#675): `/join` without a code, and the row under the login
// card. Both take a code that could be one to the room's own address, `/KOD`, with the development
// server along as on every other way in; whether the room exists is the address's to say. What
// could never be a code is said here, in the one sentence a code that names nothing gets, and an
// empty field says what is missing — either way at the field, with the focus put back there.
export type CodeField = {
  field: RefObject<HTMLInputElement | null>
  says: string | null
  // Whether what is said came from a press, and is drawn as the alert it is then. What the page
  // opens with is said in the page's own live region instead (D5), never twice.
  pressed: boolean
  saysId: string
  input: InputHTMLAttributes<HTMLInputElement>
  submit(): void
}

export function useCodeField({ id, server, onOpen, typed = '', unknown = false }: { id: string; server: string | null; onOpen(url: string): void; typed?: string; unknown?: boolean }): CodeField {
  const t = useT()
  const [value, setValue] = useState(typed)
  const [says, setSays] = useState<string | null>(unknown ? t('join.code.unknown') : null)
  const [pressed, setPressed] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const saysId = `${id}-says`
  const submit = () => {
    const raw = value.trim()
    const code = normaliseCode(raw)
    if (!code) {
      setSays(t(raw ? 'join.code.unknown' : 'join.code.empty'))
      setPressed(true)
      field.current?.focus()
      return
    }
    onOpen(`/${code}${server ? `?${new URLSearchParams({ server }).toString()}` : ''}`)
  }
  const input: InputHTMLAttributes<HTMLInputElement> = {
    className: 'byd-code-field',
    value,
    onChange: (e) => {
      setValue(e.target.value)
      // A sentence about the old code standing under a new one is a sentence about nothing.
      setSays(null)
    },
    // A code is upper case and no word: a phone's keyboard is told so, and the field takes no
    // autocomplete from anything typed into another site's field.
    autoCapitalize: 'characters',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'go',
    'aria-required': true,
    'aria-invalid': says ? true : false,
    ...(says ? { 'aria-describedby': saysId } : {}),
  }
  return { field, says, pressed, saysId, input, submit }
}
