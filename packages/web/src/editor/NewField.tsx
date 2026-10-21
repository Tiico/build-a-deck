import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ColumnKind } from '@byd/server/doc'
import { KINDS } from './KindSwitch.js'
import { clashOf, suggestFieldKey, type FieldKind } from './fields.js'
import { placedProps, usePlacement } from './placement.js'
import { useT } from '../i18n/index.js'

export type NewFieldProps = {
  // Every name the table already answers to: the fields, `antal`, and the card's own `id`. A
  // name that is one of them, in any capitals, is not a new column but a collision, and is said so.
  taken: readonly string[]
  // Whether a column made here would have anywhere to be kept (#32). The head's door asks the
  // deck, because a column is a key on every card and a deck with no cards keeps nothing; the
  // canvas's door binds an element to the column as it makes it, which is a place of its own, so
  // it never has to ask. A door that says nothing is a door that can keep what it makes.
  keeps?: boolean
  // What the new column is for, where the door knows it — the canvas's picture element asks for a
  // picture column — which is only what the suggested name is made from.
  kind?: FieldKind
  // Whether the form asks what the column is (#1085, beslut 2026-10-21, variant B): the table's
  // door does, with the same three the switch on every row has, so a picture column takes
  // pictures the moment it is made instead of after a visit to the template. The canvas's door
  // does not: the element it is opened from already says what the column is drawn as.
  //
  // It once did, and was taken away (#479, variant B, 2026-09-27), because the choice only changed
  // the suggested name; it now writes what the column is.
  choose?: boolean
  onCreate(field: string, kind?: ColumnKind): void
  onCancel(): void
}

// One form, two doors (#32): the table head opens it where the column will stand, and the
// template's binding opens it where the designer noticed the field was missing. It is the same
// component either way, so the designer never has to leave what she is doing to make a field
// possible.
export function NewField({ taken, keeps = true, kind, choose = false, onCreate, onCancel }: NewFieldProps) {
  const t = useT()
  const [made, setMade] = useState<ColumnKind>('text')
  const [name, setName] = useState(() => suggestFieldKey(kind ?? 'text', taken))
  // The name follows the kind until the designer has written one of her own (#1085): `bild1` for
  // a picture, and never over a word she typed.
  const [typed, setTyped] = useState(false)
  const kindLabel = useId()
  const makeAs = (as: ColumnKind) => {
    setMade(as)
    if (!typed) setName(suggestFieldKey(as === 'image' ? 'image' : 'text', taken))
    setRefused(null)
  }
  const [refused, setRefused] = useState<string | null>(null)
  const submit = () => {
    const field = name.trim()
    // Asked before anything about the name, because when the deck keeps nothing the name is not
    // what is wrong. A refusal here never reaches the document: an edit that changes nothing is
    // still a version and still a step to take back, and that is the silence #32 forbids.
    if (!keeps) return setRefused(t('table.field.needsCards'))
    if (field === '') return setRefused(t('table.field.needsName'))
    const clash = clashOf(field, taken, t)
    if (clash !== null) return setRefused(t('table.field.taken', { field: clash }))
    if (choose) onCreate(field, made)
    else onCreate(field)
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
      {choose && (
        <div className="byd-newfield-kind">
          <span id={kindLabel}>{t('table.field.kind')}</span>
          <span className="byd-kind-switch" role="group" aria-labelledby={kindLabel} data-from="choice">
            {KINDS.map((as) => (
              <button
                key={as}
                type="button"
                aria-pressed={made === as}
                // One stop in the form's tab order, with the arrows between the three, as every row
                // of the door above it is (#388): three stops between the list and the name made the
                // way back up to the list three presses longer.
                tabIndex={made === as ? 0 : -1}
                onClick={() => makeAs(as)}
                onKeyDown={(event) => {
                  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
                  if (step === 0) return
                  event.preventDefault()
                  const to = (KINDS.indexOf(as) + step + KINDS.length) % KINDS.length
                  const next = KINDS[to]
                  if (next === undefined) return
                  makeAs(next)
                  ;(event.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus()
                }}
              >
                {t(`table.kind.as.${as}`)}
              </button>
            ))}
          </span>
          <small>{t(`table.field.kind.${made}`)}</small>
        </div>
      )}
      <label>
        {t('table.field.name')}
        <input
          ref={nameBox}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setTyped(true)
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
