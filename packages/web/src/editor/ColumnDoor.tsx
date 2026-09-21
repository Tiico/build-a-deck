import { useEffect, useRef, useState } from 'react'
import { NewField } from './NewField.js'
import { fieldLabel } from './fields.js'
import { placedProps, usePlacement } from './placement.js'
import { useT } from '../i18n/index.js'

export type ColumnDoorProps = {
  // Every column of the table, in the order it shows them — the card's own `id` included, which
  // is a column of the table without being a field of a card.
  columns: readonly string[]
  // Which of them are the designer's to take away. The two that are not are the card's id and
  // `antal`, which is how many copies of the card the deck holds (L4).
  canRemove(field: string): boolean
  onRemove(field: string): void
  // The × of each column, so the question one of them asks can hand the focus back to it (#8).
  removeRef(field: string, el: HTMLButtonElement | null): void
  // Whether a column is being asked about right now (#8). The question is asked from inside the
  // door and the × that asked has to stay, to take the focus back when the answer is no — but
  // the form for making a column is not what the designer is being asked about, and two
  // “Avbryt” in one place is two answers to one question.
  asking: boolean
  // The widths the designer set herself (#46), by column, and the way to give one back. The door
  // is the only place that fact can be read at all — a column drawn narrow looks the same whether
  // the deck asked for it or a hand did — and the only way back to the measurement without a
  // pointer, since the edge that gives it back is an edge.
  widths: Record<string, number>
  onWidth(field: string, px: number | null): void
  // A column's name, changed where the column already is a column (#384). The name *is* the key —
  // `fieldLabel` hands back the key unchanged for everything but `antal` — so there is one field
  // and no key field beside it, and what the designer writes is what is read out (A4).
  onRename?: ((from: string, to: string) => void) | undefined
  // What the form under the list needs, unchanged from when it stood here alone (#32).
  taken: readonly string[]
  keeps: boolean
  onCreate(field: string): void
  onCancel(): void
}

// The head's own door, and everything about the table's columns behind it (#46 on #32).
//
// A column used to be taken away by an × on its own heading, and the heading paid for it: two
// 44 px targets do not fit in a column a number wide — 44 and 44 do not go into 64 — so the ×
// had to leave the heading's flow, lie over its right-hand 44 px in the head's own ground, and
// be handed the heading's width in turn with the control that sorts it. In a `cost` column the
// part of the sort control a thumb could still reach was ten pixels. None of that arithmetic was
// ever about taking a column away; it was about where the control stood.
//
// So it stands here. The door was already the place the table says something about its columns
// as columns — it is where one is made (#32) — and a panel has room for what a heading never
// had: the name, whether the column is the designer's, and the reason when it is not, in words
// rather than as a padlock nobody asked about. What the heading keeps is its name and the way it
// sorts, which is all a heading that can also be dragged and pulled has room to be.

// What the door leaves below itself, and the least it will ever be. The air is the shadow's own
// room plus the panel's padding, which is outside a content-box height; the floor is what holds a
// door open as a door — a window shorter than that is one the list scrolls inside, as it always
// did.
const DOOR_AIR = 24
const DOOR_FLOOR = 240

// Only one name is ever being written in the door, so the sentence about it has one name of its
// own — which is what the box being written in points at.
const REFUSED = 'byd-column-refused'

export function ColumnDoor({ columns, canRemove, onRemove, removeRef, asking, widths, onWidth, onRename, taken, keeps, onCreate, onCancel }: ColumnDoorProps) {
  const t = useT()
  const panel = useRef<HTMLDivElement>(null)
  // Which column is being renamed, what stands in the box, and what the surface has to say about
  // it. The draft is the door's own and never the document's: nothing reaches the actor until the
  // designer says so, so a half-typed name is not a version and not a step to take back.
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Where the focus goes when the box closes — to the name it came from, under whatever the column
  // is called now. A control that unmounts under the designer's finger drops the focus to `<body>`
  // (#8), and here the finger may well be a keyboard.
  const [back, setBack] = useState<string | null>(null)
  const names = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => {
    if (back === null) return
    names.current.get(back)?.focus()
    setBack(null)
  }, [back])
  // The three questions the verb asks, asked here first and while the designer types — a refusal
  // that arrives at Enter is a throw in a better typeface, and a throw is no answer at all. The
  // door's own list of names is the same one the form under it collides against, so a column
  // cannot be renamed onto `id`, onto `antal`, or onto a column that already exists.
  const trouble = (from: string, to: string): string | null => {
    const name = to.trim()
    if (name === '') return t('table.field.needsName')
    if (name === from) return null
    if (taken.includes(name)) return t('table.field.taken', { field: name })
    return null
  }
  const refused = renaming === null ? null : trouble(renaming, draft)
  const stop = (to: string) => {
    setRenaming(null)
    setDraft('')
    setBack(to)
  }
  const rename = (from: string) => {
    if (refused !== null) return
    const to = draft.trim()
    // An edit that changes nothing is still a version and still a step to take back, so the name
    // it already had is answered by closing the box rather than by asking the actor.
    if (to !== from) onRename?.(from, to)
    stop(to)
  }
  // The height the window really leaves the door (#46). The list was 232 px whatever room there
  // was — five rows, the fifth cut against the form's own line, with nothing to say the list went
  // on — and a taller list was not the answer either: the form under it is the way to make the
  // next column, and a form off the bottom of the window is the thing that falls away.
  //
  // Only the door can ask this. It hangs under the head's last cell, and where that cell stands
  // depends on the deck above it, so no stylesheet knows the number: `100vh` minus a guess is a
  // guess. A layout effect, because a door painted at its natural height and corrected afterwards
  // is a door that jumps.
  // The door hangs under the head's last cell, and where that cell stands depends on the deck above
  // it, so no stylesheet knows the number: `100vh` minus a guess is a guess. That reading — and the
  // one this door did not make, which way to open at all — is `placement.ts` now, asked by every
  // box in the editor that opens under something (#229).
  const place = usePlacement(true, panel, { least: DOOR_FLOOR, gap: DOOR_AIR })
  return (
    <div ref={panel} className="byd-columns" {...placedProps(place)} role="group" aria-label={t('table.columns')} onKeyDown={(event) => event.key === 'Escape' && onCancel()}>
      <ul className="byd-columns-list">
        {columns.map((field) => (
          <li key={field} data-col={field} {...(renaming === field ? { 'data-renaming': '' } : {})}>
            {renaming === field ? (
              // The row is the box while the name is being written in it: the × and the measured
              // width belong to a column that is standing still, and a second control beside a
              // field being typed in is a second answer to one question.
              <input
                autoFocus
                className="byd-columns-rename"
                value={draft}
                aria-label={t('table.column.name', { field })}
                {...(refused === null ? {} : { 'aria-invalid': true, 'aria-describedby': REFUSED })}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    rename(field)
                  }
                  if (event.key === 'Escape') {
                    // The door stays open: Escape answers the box the designer is in, and the
                    // panel's own Escape is what closes the door once she has left it.
                    event.preventDefault()
                    event.stopPropagation()
                    stop(field)
                  }
                }}
              />
            ) : (
              <>
                {/* A column the designer owns is named by a control and not by a word: the name is
                    the key (#384), so reading it and changing it are the same place. The two the
                    tool owns keep the word they had — they are exactly the two `renameField`
                    refuses, for exactly the reason the padlock beside them gives. */}
                {canRemove(field) && onRename ? (
                  <button
                    type="button"
                    className="byd-columns-name"
                    ref={(el) => {
                      if (el) names.current.set(field, el)
                      else names.current.delete(field)
                    }}
                    aria-label={t('table.column.rename', { field })}
                    onClick={() => {
                      setRenaming(field)
                      setDraft(field)
                    }}
                  >
                    {fieldLabel(field, t)}
                  </button>
                ) : (
                  <span className="byd-columns-name">{fieldLabel(field, t)}</span>
                )}
                {widths[field] !== undefined && (
                  <button type="button" className="byd-columns-width" aria-label={t('table.column.width.auto', { field })} onClick={() => onWidth(field, null)}>
                    {t('table.column.width.px', { px: widths[field] })}
                  </button>
                )}
                {canRemove(field) ? (
                  <button
                    type="button"
                    ref={(el) => removeRef(field, el)}
                    className="byd-data-dropfield"
                    aria-label={t('table.field.remove', { field })}
                    onClick={() => onRemove(field)}
                  >
                    ×
                  </button>
                ) : (
                  // A hole explains nothing (L4): where a column cannot be taken away the reason
                  // stands in the ×'s place, and here it can be read rather than hovered for.
                  <span className="byd-columns-system">
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                      <path d="M3.4 5V3.6a2.6 2.6 0 0 1 5.2 0V5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <rect x="2.2" y="5" width="7.6" height="5.6" rx="1.2" fill="currentColor" />
                    </svg>
                    {t('table.field.system', { field })}
                  </span>
                )}
              </>
            )}
            {renaming === field && refused !== null && (
              // Said while the name is written, not when it is submitted, and said politely: a
              // sentence shouted over every keystroke is a sentence nobody can type through.
              <p className="byd-columns-refused" id={REFUSED} role="status">
                {refused}
              </p>
            )}
          </li>
        ))}
      </ul>
      {!asking && <NewField taken={taken} keeps={keeps} onCreate={onCreate} onCancel={onCancel} />}
    </div>
  )
}
