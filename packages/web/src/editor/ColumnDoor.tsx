import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { NewField } from './NewField.js'
import { Help } from './HelpDrawer.js'
import { KindSwitch, KindReset } from './KindSwitch.js'
import type { ColumnKind } from '@byd/server/doc'
import { useFocusTrap } from './focusTrap.js'
import { useRoving } from './roving.js'
import { clashOf, fieldLabel } from './fields.js'
import { placedProps, usePlacement } from './placement.js'
import { useT } from '../i18n/index.js'
import { CloseGlyph, LockGlyph } from '../glyphs.js'

export type ColumnDoorProps = {
  // The head's last cell: the ＋ that opens the door and the door itself, which is what the
  // keyboard is held inside of while the door stands (#388). The handle belongs in the trap — it
  // is the door's own control, it says `aria-expanded`, and the table hands the focus back to it
  // when a column has been taken away — so the ring is ＋, the list, and the form.
  cell: RefObject<HTMLElement | null>
  // Every column of the table, in the order it shows them — the card's own `id` included, which
  // is a column of the table without being a field of a card.
  columns: readonly string[]
  // Which of them are the designer's to take away. The two that are not are the card's id and
  // `antal`, which is how many copies of the card the deck holds (L4).
  canRemove(field: string): boolean
  // Which of them stand still on the rail when the table scrolls sideways (#1408), and the way to
  // turn that for any column — the tool's own two included.
  locked: readonly string[]
  onLock(field: string, on: boolean): void
  onRemove(field: string): void
  // The × of each column, so the question one of them asks can hand the focus back to it (#8).
  removeRef(field: string, el: HTMLButtonElement | null): void
  // Which column is being asked about right now (#8), and the question itself (#1061). It stands
  // in the door, where the × that asked it is, in the form's place at the door's foot: the form
  // for making a column is not what the designer is being asked about, and two «Avbryt» in one
  // place is two answers to one question. The × that asked stays, to take the focus back when the
  // answer is no.
  asked: string | null
  question?: ReactNode
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
  // What a column is written as, and the way to turn it (L43, #615). `null` for a column that is
  // never prose — the two the tool keeps — and absent altogether where there is no project to
  // write in, in which case no row has a switch.
  kindOf?: ((field: string) => { kind: ColumnKind; chosen: boolean } | null) | undefined
  onKind?: ((field: string, next: ColumnKind | null) => void) | undefined
  // Hur många kort som har text kvar i en kolumn som blivit bild (#1085), som raden säger under
  // växeln. Den enda förklaringen en rad bär: allt annat står i dörrens hjälp (beslut 2026-10-03).
  keptIn?: ((field: string) => number) | undefined
  // What the form under the list needs, unchanged from when it stood here alone (#32).
  taken: readonly string[]
  keeps: boolean
  onCreate(field: string, kind: ColumnKind): void
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
// had: the name, whether the column is the designer's, and a lock when it is not.
// Explanations are shared behind the question mark. What the heading keeps is its name and the way it
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

// What a row of the list can hold, in the order it holds it (#388). The name is a control only
// where the column is the designer's own, and the width only where a hand set one.
type Cell = 'name' | 'width' | ColumnKind | 'follow' | 'lock' | 'remove'

export function ColumnDoor({ cell, columns, canRemove, locked, onLock, onRemove, removeRef, asked, question, widths, onWidth, onRename, kindOf, onKind, keptIn, taken, keeps, onCreate, onCancel }: ColumnDoorProps) {
  const t = useT()
  // A column's switch, where there is one: the door has to have somewhere to write the answer.
  const kindHere = (field: string) => (onKind ? (kindOf?.(field) ?? null) : null)
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
  // A column the designer owns can be renamed; the title, like the two the tool keeps, cannot
  // (#476) — it is what every card is called, and `renameField` refuses it.
  const canRename = (field: string): boolean => canRemove(field) && field !== 'title' && onRename !== undefined
  const trouble = (from: string, to: string): string | null => {
    const name = to.trim()
    if (name === '') return t('table.field.needsName')
    if (name === from) return null
    const clash = clashOf(name, taken, t, from)
    if (clash !== null) return t('table.field.taken', { field: clash })
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
  // How tall the list stood when a × was pressed (#1061). The question takes the form's place, and
  // the form is taller than a short question: a list free to take the difference grew, its scroll
  // was clamped, and the row whose × had just been pressed slid 53–76 px under the pointer — with
  // a different × under it. So the list keeps the height it had while the question stands. Held
  // as state and set in the press itself, because the question takes the focus in the commit that
  // draws it, and a focus is a layout: a height set one effect later is a clamp already made.
  const list = useRef<HTMLUListElement>(null)
  const [held, setHeld] = useState<number | null>(null)
  // The keyboard is held inside the door for as long as it stands (#388, L45). It is the same trap the
  // library and the font sheet have; what it holds is the head's last cell, so the ＋ that opened
  // the door is the ring's first stop and not the way out of it. Escape is deliberately not the
  // trap's: the door has two of them since #384 — the name box answers its own without closing the
  // door, and the panel answers the door's — and a trap that swallowed the press would answer for
  // both. The question about a column stands in the door (#1061), so the trap holds while it is
  // asked too: the ring is then the handle, the help and the two answers, since the list is inert.
  useFocusTrap(cell, {
    // The door opens on the form, as it always did (#388 chose D precisely because it does not
    // move the hand): whatever the door itself has already focused is where the trap leaves it.
    initial: () => (document.activeElement instanceof HTMLElement && cell.current?.contains(document.activeElement) ? document.activeElement : null),
  })
  // The list is one tab stop and the arrows move inside it (#388, L45; APG's roving tabindex) — the
  // same `roving.ts` the layer list, the tabs and the felt use, because a tenth pattern for the
  // tenth list is nine patterns too many. `↑`/`↓` and Home/End walk the rows, `←`/`→` the controls
  // of one row. Measured at ten columns: the list was 18 stops and is one, and the door's mark on
  // the document's ring goes from 23 to 6.
  //
  // What a row has to stand on. `id` and `antal` have neither a name that is a control nor an × —
  // they are span names with the padlock in the ×'s place — so a row with nothing to focus is no
  // row in the ring at all. A width is a control only for a column a hand has pulled (#46).
  // The switch stands between the name and the × (#615), and the way back to the height beside
  // the switch it answers (#674), so the arrows walk the row in the order it is read and the × —
  // or the lock in its place — is every row's last.
  const cellsOf = (field: string): Cell[] => {
    const kind = kindHere(field)
    return [
      ...(canRename(field) ? (['name'] as Cell[]) : []),
      ...(widths[field] !== undefined ? (['width'] as Cell[]) : []),
      ...(kind ? (['text', 'prose', 'image'] as Cell[]) : []),
      ...(kind?.chosen ? (['follow'] as Cell[]) : []),
      // The lock stands before the × (#1408): the × stays the row's last cell, which is where the
      // hand is set down again when the row it stood in is taken away (#388), and the tool's two
      // rows, which have nothing else, are a lock alone.
      'lock',
      ...(canRemove(field) ? (['remove'] as Cell[]) : []),
    ]
  }
  const rows = columns.filter((field) => cellsOf(field).length > 0)
  const roving = useRoving({ ids: rows, selected: null, orientation: 'vertical' })
  // How far along its row the hand stands. A row arrived at from another row takes the hand on its
  // name, which is what the row is called — the rows are not the same length, so an index carried
  // between them would land on the × of one column and the name of the next.
  const [along, setAlong] = useState(0)
  const spots = useRef(new Map<string, HTMLElement>())
  const spot = (field: string, one: Cell) => `${field}\u0000${one}`
  const keysOf = (field: string) => {
    const mine = cellsOf(field)
    const item = roving.itemProps(field)
    const here = roving.here === field
    const cursor = here ? Math.min(along, mine.length - 1) : 0
    return (one: Cell, also?: (el: HTMLElement | null) => void) => {
      const i = mine.indexOf(one)
      return {
        tabIndex: here && i === cursor ? 0 : -1,
        ref: (el: HTMLElement | null) => {
          if (el) spots.current.set(spot(field, one), el)
          else spots.current.delete(spot(field, one))
          // The row is one item to the list, and the item is wherever the hand stands in it.
          if (i === cursor) item.ref(el)
          also?.(el)
        },
        onFocus: () => {
          item.onFocus()
          setAlong(i)
        },
        onKeyDown: (event: KeyboardEvent) => {
          const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
          if (step === 0) return item.onKeyDown(event)
          const to = (i + step + mine.length) % mine.length
          spots.current.get(spot(field, mine[to] ?? one))?.focus()
          setAlong(to)
          event.preventDefault()
        },
      }
    }
  }
  return (
    <div ref={panel} className="byd-columns" {...placedProps(place)} role="group" aria-label={t('table.columns')} onKeyDown={(event) => {
      if (event.key === 'Escape' && !(event.target as Element).closest('.byd-help-box')) onCancel()
    }}>
      <div className="byd-columns-head byd-help-row">
        <strong>{t('table.columns')}</strong>
        <Help topic={t('table.columns.help.topic')}>
          <p>{t('table.columns.help.prose')}</p>
          <p>{t('table.columns.help.auto')}</p>
          <p>{t('table.columns.help.manage')}</p>
        </Help>
      </div>
      {/* While a column is asked about, the list is inert and the other rows are drawn dimmed
          (#1061, L58): nothing behind the question can be pressed by mistake, and one question
          stands at a time. The row it is about is marked in the question's colours. */}
      <ul ref={list} className="byd-columns-list" inert={asked !== null} {...(asked !== null && held !== null ? { style: { '--byd-columns-held': `${held}px` } as CSSProperties } : {})}>
        {columns.map((field) => {
          const keys = keysOf(field)
          const kind = kindHere(field)
          const kept = kind?.kind === 'image' ? (keptIn?.(field) ?? 0) : 0
          return (
            <li key={field} data-col={field} {...(renaming === field ? { 'data-renaming': '' } : {})} {...(asked === field ? { 'data-asked': '' } : {})}>
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
                  {canRename(field) ? (
                    <button
                      type="button"
                      className="byd-columns-name"
                      {...keys('name', (el) => {
                        if (el instanceof HTMLButtonElement) names.current.set(field, el)
                        else names.current.delete(field)
                      })}
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
                    <button type="button" className="byd-columns-width" {...keys('width')} aria-label={t('table.column.width.auto', { field })} onClick={() => onWidth(field, null)}>
                      {t('table.column.width.px', { px: widths[field] })}
                    </button>
                  )}
                  {kind && <KindSwitch label={fieldLabel(field, t)} {...kind} onKind={(next) => onKind?.(field, next)} keys={keys} />}
                  {kind && <KindReset label={fieldLabel(field, t)} {...kind} onKind={(next) => onKind?.(field, next)} keys={keys} />}
                  {/* The column's lock (#1408, beställarens val A): on the rail, standing still
                      when the table scrolls sideways, or in the row with the rest. Every column
                      has one, the tool's own two included; what they cannot be is taken away or
                      renamed, which the row says by having no × and no name to press. */}
                  <button
                    type="button"
                    className="byd-columns-lock"
                    {...keys('lock')}
                    aria-pressed={locked.includes(field)}
                    aria-label={t(locked.includes(field) ? 'table.column.unlock' : 'table.column.lock', { field: fieldLabel(field, t) })}
                    onClick={() => onLock(field, !locked.includes(field))}
                  >
                    <LockGlyph open={!locked.includes(field)} />
                  </button>
                  {canRemove(field) ? (
                    <button
                      type="button"
                      {...keys('remove', (el) => removeRef(field, el instanceof HTMLButtonElement ? el : null))}
                      className="byd-data-dropfield"
                      aria-label={t('table.field.remove', { field })}
                      onClick={() => {
                        setHeld(list.current?.getBoundingClientRect().height ?? null)
                        onRemove(field)
                      }}
                    >
                      <CloseGlyph />
                    </button>
                  ) : (
                    // The word replaces an unavailable action, and its name explains why. It was
                    // a padlock, meaning «the game's»; since #1408 a padlock on this row means
                    // «stands still», so the word is the sign now.
                    <span className="byd-columns-system" role="img" aria-label={t('table.field.system', { field: fieldLabel(field, t) })} title={t('table.field.system', { field: fieldLabel(field, t) })}>
                      {t('table.field.system.short')}
                    </span>
                  )}
                </>
              )}
              {/* Text kept in a column made a picture (#1085): not lost, and back with Text. Said on
                  a line of its own like a refused name, and only while there is such text: the
                  door's other explanations live in its help (beslut 2026-10-03). */}
              {renaming !== field && kept > 0 && (
                <p className="byd-columns-note">{t(kept === 1 ? 'table.kind.kept.one' : 'table.kind.kept.other', { n: kept, field: fieldLabel(field, t) })}</p>
              )}
              {renaming === field && refused !== null && (
                // Said while the name is written, not when it is submitted, and said politely: a
                // sentence shouted over every keystroke is a sentence nobody can type through.
                <p className="byd-columns-refused" id={REFUSED} role="status">
                  {refused}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {asked === null ? <NewField taken={taken} keeps={keeps} choose onCreate={(field, kind) => onCreate(field, kind ?? 'text')} onCancel={onCancel} /> : question}
    </div>
  )
}
