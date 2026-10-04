import { useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Lifted } from './Lifted.js'

// One control for «how big is the thing I am looking at drawn» (#619): `[−][164 % ▾][+]`.
//
// The canvas had six controls in a stack for it — the percentage, `−`, a slider, `+`, «Passa in»
// and «100 %», 94 × 269 px at 1280 — and the wall had another pair, `− +` in the crown with the
// width said in the foot half a screen away. Two surfaces, the same question, two shapes and
// neither of them compact. The decision (L19, tillägg #619) is one pill of three targets on both:
// a step down, the measure, a step up. Where the pill is in the canvas and where in the crown is
// still each surface's own business; what it is made of is this file's.
//
// The measure is the middle. On the canvas it is a button that opens the choices — «Passa in»,
// «100 %», «50 %», «200 %» — upward, into the page's top layer like every opened box (L55); the
// arrow keys on it step, so the slider's keyboard is kept without the slider. On the wall there is
// nothing to choose from and the measure is read, not pressed: a button that does nothing is a
// dead control, and the foot that used to repeat the number says it no more.
export type PillChoice = { id: string; label: string; checked: boolean; pick(): void }

export type StepPillProps = {
  // What the pill is about, as the group's name: «Förstoring», «Täthet».
  label: string
  // The measure as it is shown — «164 %», «150 px» — and as it is heard, with what the number alone
  // does not say: «Förstoring: 164 %, inpassad», «Korten 150 px breda».
  value: string
  said: string
  // A word beside the measure while a choice stands on it, so the fit is seen and not inferred
  // from a percentage: «Passa in». Room for it is kept whether or not it is on, since a pill
  // that grows a word between one step and the next moves the step under the hand.
  note?: { word: string; on: boolean } | undefined
  less: string
  more: string
  onStep(by: 1 | -1): void
  // Why the steps do not answer, while something else holds the measure (#701): on the wall the
  // guide at arm's length and the reading views draw the card at a width of their own. The steps
  // stay in place and keep the focus — `aria-disabled` and not `disabled`, as everywhere in the
  // editor (#477) — say the reason, and a press on them is refused rather than counted.
  held?: string | undefined
  // The choices behind the measure, when there are any; their name is the menu's.
  choices?: { label: string; items: PillChoice[] } | undefined
}

export function StepPill({ label, value, said, note, less, more, onStep, held, choices }: StepPillProps) {
  const why = useId()
  const step = (by: 1 | -1) => {
    if (!held) onStep(by)
  }
  const refused = held ? { 'aria-disabled': true, 'aria-describedby': why, title: held } : {}
  return (
    <div className="byd-pill" role="group" aria-label={label}>
      <button type="button" className="byd-pill-step" aria-label={less} {...refused} onClick={() => step(-1)}>
        <span aria-hidden="true">&#x2212;</span>
      </button>
      {choices ? (
        <Measure value={value} said={said} note={note} onStep={onStep} choices={choices} />
      ) : (
        <output className="byd-pill-value" aria-label={said}>
          {value}
        </output>
      )}
      <button type="button" className="byd-pill-step" aria-label={more} {...refused} onClick={() => step(1)}>
        <span aria-hidden="true">+</span>
      </button>
      {held && (
        <span id={why} className="byd-offscreen">
          {held}
        </span>
      )}
    </div>
  )
}

// The measure that opens the choices.
type MeasureProps = Pick<StepPillProps, 'value' | 'said' | 'note' | 'onStep'> & { choices: NonNullable<StepPillProps['choices']> }
function Measure({ value, said, note, onStep, choices }: MeasureProps) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement | null>(null)
  const menuId = useId()
  const checked = choices.items.find((c) => c.checked)?.id ?? null
  // The menu is the editor's one lifted box (#647, `Lifted`): over the page (L55), opened on the
  // choice the card stands on, Escape back to the measure, and closed by a press anywhere in the
  // work with the focus left where the pointer put it (#133).
  const pick = (choice: PillChoice) => {
    setOpen(false)
    button.current?.focus()
    choice.pick()
  }
  // The arrows on the measure step it, as they stepped the slider this pill replaces: up and right
  // for more, down and left for less.
  const keys = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const by = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : null
    if (by === null) return
    event.preventDefault()
    onStep(by)
  }
  return (
    <div className="byd-pill-measure">
      <button
        ref={button}
        type="button"
        className="byd-pill-value"
        aria-haspopup="menu"
        aria-expanded={open}
        {...(open ? { 'aria-controls': menuId } : {})}
        aria-label={said}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={keys}
      >
        <span className="byd-pill-number">
          {value}
          <span className="byd-pill-caret" aria-hidden="true">
            ▾
          </span>
        </span>
        {note && (
          <small className="byd-pill-note" aria-hidden="true" data-on={note.on}>
            {note.word}
          </small>
        )}
      </button>
      {open && (
        <Lifted handle={button} id={menuId} label={choices.label} className="byd-pill-menu" role="menu" opensOn={checked ? `[data-choice="${checked}"]` : undefined} onClose={() => setOpen(false)}>
          {choices.items.map((choice) => (
            <button key={choice.id} type="button" className="byd-pill-choice" role="menuitemradio" aria-checked={choice.checked} data-choice={choice.id} onClick={() => pick(choice)}>
              {choice.label}
              {/* Said by `aria-checked`; the mark is for the eye. */}
              {choice.checked && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </Lifted>
      )}
    </div>
  )
}
