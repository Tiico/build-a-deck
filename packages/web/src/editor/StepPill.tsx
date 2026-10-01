import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { placedProps, usePlacement } from './placement.js'
import { useRoving } from './roving.js'

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
  // The choices behind the measure, when there are any; their name is the menu's.
  choices?: { label: string; items: PillChoice[] } | undefined
}

export function StepPill({ label, value, said, note, less, more, onStep, choices }: StepPillProps) {
  return (
    <div className="byd-pill" role="group" aria-label={label}>
      <button type="button" className="byd-pill-step" aria-label={less} onClick={() => onStep(-1)}>
        <span aria-hidden="true">&#x2212;</span>
      </button>
      {choices ? (
        <Measure value={value} said={said} note={note} onStep={onStep} choices={choices} />
      ) : (
        <output className="byd-pill-value" aria-label={said}>
          {value}
        </output>
      )}
      <button type="button" className="byd-pill-step" aria-label={more} onClick={() => onStep(1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}

// The measure that opens the choices.
type MeasureProps = Pick<StepPillProps, 'value' | 'said' | 'note' | 'onStep'> & { choices: NonNullable<StepPillProps['choices']> }
function Measure({ value, said, note, onStep, choices }: MeasureProps) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement | null>(null)
  const menu = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  // Upward, since the pill stands at the foot of its surface; and lifted over the page there, so
  // nothing the surface scrolls in cuts it (L55). Which way is the room's to say, not this file's.
  const place = usePlacement(open, menu)
  const ids = choices.items.map((c) => c.id)
  const checked = choices.items.find((c) => c.checked)?.id ?? null
  const { itemProps, focus } = useRoving({ ids, selected: checked, orientation: 'vertical' })
  // The keys land on the choice the card stands on the moment the menu opens, so the first arrow
  // moves from where the designer already is. On opening only: the menu must not take the focus
  // back from what the designer does inside it.
  useEffect(() => {
    if (open) focus(checked ?? ids[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on opening only: the menu must not take the focus back
  }, [open])
  // The way out, and back to the measure the menu was opened from: closing unmounts whatever had
  // the focus, so without this a keyboard that opened the menu is dropped on `<body>`.
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const pick = (choice: PillChoice) => {
    close()
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
        <span className="byd-pill-number">{value}</span>
        {note && (
          <small className="byd-pill-note" aria-hidden="true" data-on={note.on}>
            {note.word}
          </small>
        )}
        <span className="byd-pill-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="byd-pill-menu"
          {...placedProps(place)}
          role="menu"
          aria-label={choices.label}
          // The focus leaving the menu takes the menu with it. The measure it hangs from is the
          // one place that does not count: pressing it while the menu is open moves the focus
          // there *and* toggles, and a menu that closed on the move would open again on the toggle.
          onBlur={(event) => {
            if (event.relatedTarget !== button.current && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            event.preventDefault()
            close()
          }}
        >
          {choices.items.map((choice) => (
            <button key={choice.id} type="button" className="byd-pill-choice" role="menuitemradio" aria-checked={choice.checked} onClick={() => pick(choice)} {...itemProps(choice.id)}>
              {choice.label}
              {/* Said by `aria-checked`; the mark is for the eye. */}
              {choice.checked && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
