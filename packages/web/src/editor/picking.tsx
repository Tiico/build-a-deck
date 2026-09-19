import { useEffect, useRef, type ReactNode } from 'react'
import { placedProps, usePlacement } from './placement.js'

// One character opens a list, everywhere in the tool (L23). The card table's `{` did it first and
// did it right — write the character, get a list that narrows, arrows and Enter, and the focus
// never leaves the sentence being written — and the rulebook's `[[` is the same doing (#215). So
// it is one mechanism used twice rather than two that can come to differ: what is written to open
// it, what may stand in the list, and what is written back are the caller's; finding the mark
// behind the caret, narrowing, the keys, keeping the focus and pointing at the live option are
// this module's.
//
// What is deliberately *not* here is which state a surface holds. The table's lookup belongs to a
// cell and carries a bar and a flag of its own; the book's belongs to one field of one block.
// Those are two different things to remember, and pretending otherwise would be a shared shape
// with two shapes inside it.

// Where the mark stands behind the caret, and what has been written since it.
export type Trigger = { at: number; query: string }

// The mark the designer wrote, read backwards from where she is writing. `stops` are what says
// the lookup is over rather than merely unfinished: a closed reference is written text, and a line
// break is a new sentence. Nothing after the caret is looked at — what is being asked is what she
// has typed, not what the field happens to hold further on.
export function triggerBehind(value: string, caret: number, mark: string, stops: readonly string[]): Trigger | null {
  const upto = value.slice(0, caret)
  const at = upto.lastIndexOf(mark)
  if (at < 0) return null
  const query = upto.slice(at + mark.length)
  return stops.some((stop) => query.includes(stop)) ? null : { at, query }
}

// The text with the mark and what was written after it replaced by what was chosen, and where the
// caret is left: at the end of what was written, which is where the designer's next word goes.
export function writeTrigger(value: string, trigger: Trigger, mark: string, written: string): { text: string; caret: number } {
  const to = trigger.at + mark.length + trigger.query.length
  return { text: `${value.slice(0, trigger.at)}${written}${value.slice(to)}`, caret: trigger.at + written.length }
}

// What a key means over the list. A pure answer rather than a handler, because every list of this
// kind is driven from somewhere the focus already is — a cell, a field, a tool in the rail — and
// all of them must answer the same key identically.
export type PickAction = { active: number } | 'pick' | 'close'
export function pickKey(key: string, count: number, active: number): PickAction | null {
  // An empty list still answers Escape. A surface that draws nothing when nothing matches has
  // nothing to close and never asks; one that says so out loud has a box on the screen, and a box
  // on the screen that cannot be dismissed is a box the designer is stuck behind.
  if (count === 0) return key === 'Escape' ? 'close' : null
  switch (key) {
    case 'ArrowDown':
      return { active: Math.min(count - 1, active + 1) }
    case 'ArrowUp':
      return { active: Math.max(0, active - 1) }
    // The two ends, which every other list in the editor answers (#235). A list narrowed by a
    // letter or two is very often longest exactly when the designer already knows which end of it
    // she wants, and eight matches is five presses to the one at the bottom.
    case 'Home':
      return { active: 0 }
    case 'End':
      return { active: count - 1 }
    case 'Enter':
      return 'pick'
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

// Which option the driver points at. Built from the list's own id, so two lists on a page — the
// rail's and a cell's — never name the same element.
export const pickOptionId = (list: string, key: string): string => `${list}-${key}`

export type PickListProps<O> = {
  // The id the list is known by, and what its options' ids are built from.
  id: string
  options: readonly O[]
  // What tells one option from the next, in the document and in React's own bookkeeping.
  keyOf(option: O): string
  active: number
  label: string
  // Where this one is drawn: the shared look is the class every list wears, and this places it.
  className: string
  // What to say when nothing matches what was typed. A list that simply vanished would read as a
  // control that broke, so a surface whose candidates are the designer's own words says so. The
  // symbol library, whose words are the tool's own, has nothing to explain and leaves it out.
  empty?: string | undefined
  // What the surface writes on its own rows, when it has something to write there: the library
  // marks each row with the name it would put in the text. It is the row's own word and not the
  // list's, which is why the list takes it rather than inventing one.
  attrs?: ((option: O) => Record<string, string>) | undefined
  onPick(option: O): void
  // What an option looks like. The list owns what an option *is* — a stop nobody tabs to, the one
  // the keys are on, a press that does not take the focus — and never what it says.
  children(option: O): ReactNode
}

export function PickList<O>({ id, options, keyOf, active, label, className, empty, attrs, onPick, children }: PickListProps<O>) {
  const box = useRef<HTMLDivElement>(null)
  // A box opens where there is room for it (#229), and a narrowing list is a box like any other:
  // eight rows are 376 px in the rulebook since #288, and a cell at the foot of a long table or a
  // block at the foot of a long book has nothing like that under it. Each sheet says what its two
  // directions mean; the reading is `placement`'s and is taken here so that no list of this kind
  // can be the one that forgot. The wish is `scrollHeight` and so is everything the list holds,
  // whatever its own sheet caps the drawing at — which is why raising a cap moves no box.
  const place = usePlacement(true, box)
  // The one the keys are on, brought into the box. Every target in the editor is 44 px tall, so a
  // list is very often taller than the box it opens in and the arrows walk past its edge; a control
  // that answers and cannot be seen to answer has not answered (#235). The rulebook's `[[` no longer
  // needs this — its eight are eight since #288 — but the library's list is as long as the search
  // leaves it, so this is what a list of this kind does and not what one of them needed. The option
  // cannot bring itself — it never takes the focus, which is the whole arrangement that keeps the
  // sentence being written in the caller's field. `nearest` and not `center`, so a box already
  // showing the row stands still.
  const marked = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    marked.current?.scrollIntoView?.({ block: 'nearest' })
  }, [active])
  // Both readings stand above the one early return: a render that draws nothing may not call fewer
  // hooks than one that draws a list.
  if (options.length === 0 && empty === undefined) return null
  return (
    <div ref={box} id={id} className={`byd-pick-list ${className}`} role="listbox" aria-label={label} {...placedProps(place)}>
      {options.length === 0 && <p className="byd-pick-none">{empty}</p>}
      {options.map((option, i) => (
        <button
          key={keyOf(option)}
          {...(i === active ? { ref: marked } : {})}
          id={pickOptionId(id, keyOf(option))}
          type="button"
          role="option"
          tabIndex={-1}
          aria-selected={i === active}
          {...(attrs ? attrs(option) : {})}
          // The press must not be a change of focus: what is driving the list is a field being
          // typed into or the tool that opened it, and either would lose the list on losing it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(option)}
        >
          {children(option)}
        </button>
      ))}
    </div>
  )
}
