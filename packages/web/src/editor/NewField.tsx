import { useLayoutEffect, useRef, useState } from 'react'
import { suggestFieldKey, type FieldKind } from './fields.js'
import { placedProps, usePlacement } from './placement.js'
import { useT } from '../i18n/index.js'

export type NewFieldProps = {
  // Every name the table already answers to: the fields, `antal`, and the card's own `id`. A
  // name that is one of them is not a new column but a collision, and is said so.
  taken: readonly string[]
  // Whether a column made here would have anywhere to be kept (#32). The head's door asks the
  // deck, because a column is a key on every card and a deck with no cards keeps nothing; the
  // canvas's door binds an element to the column as it makes it, which is a place of its own, so
  // it never has to ask. A door that says nothing is a door that can keep what it makes.
  keeps?: boolean
  // What the new column is for, where the door knows it — the canvas's picture element asks for a
  // picture column — which is only what the suggested name is made from. The table's own door does
  // not ask (#479, beslut 2026-09-27, variant B): a column is a picture column where the template
  // draws it as one, and the door says so in a line instead of offering a choice that did nothing.
  kind?: FieldKind
  onCreate(field: string): void
  onCancel(): void
}

// One form, two doors (#32): the table head opens it where the column will stand, and the
// template's binding opens it where the designer noticed the field was missing. It is the same
// component either way, so the designer never has to leave what she is doing to make a field
// possible.
export function NewField({ taken, keeps = true, kind, onCreate, onCancel }: NewFieldProps) {
  const t = useT()
  const [name, setName] = useState(() => suggestFieldKey(kind ?? 'text', taken))
  const [refused, setRefused] = useState<string | null>(null)
  const submit = () => {
    const field = name.trim()
    // Asked before anything about the name, because when the deck keeps nothing the name is not
    // what is wrong. A refusal here never reaches the document: an edit that changes nothing is
    // still a version and still a step to take back, and that is the silence #32 forbids.
    if (!keeps) return setRefused(t('table.field.needsCards'))
    if (field === '') return setRefused(t('table.field.needsName'))
    if (taken.includes(field)) return setRefused(t('table.field.taken', { field }))
    onCreate(field)
  }
  // The form hangs under the table's head and is the way to make a column, so a form off the foot
  // of the window is the very thing that falls away (#229).
  const form = useRef<HTMLFormElement>(null)
  const place = usePlacement(true, form)
  // The caret goes into the name as the form is drawn, and nothing is scrolled to show it (#611).
  // The form is placed in the room the window has, so it never needs a scroll to be seen — but it
  // is focused before a lifted door around it has left the table it hangs from, and `autoFocus`
  // then scrolled the table down to reveal a box that was about to stand over it anyway.
  const nameBox = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    nameBox.current?.focus({ preventScroll: true })
  }, [])
  return (
    <form
      ref={form}
      className="byd-newfield"
      {...placedProps(place)}
      aria-label={t('table.field.new')}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <label>
        {t('table.field.name')}
        <input
          ref={nameBox}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setRefused(null)
          }}
        />
      </label>
      {refused !== null && <p role="alert">{refused}</p>}
      <div className="byd-newfield-do">
        <button type="submit" className="byd-secondary">{t('table.field.create')}</button>
        <button type="button" data-kind="quiet" onClick={onCancel}>
          {t('editor.cancel')}
        </button>
      </div>
    </form>
  )
}
