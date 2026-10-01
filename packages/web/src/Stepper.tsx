import { useRef, type KeyboardEvent } from 'react'
import { settled, useNumberDraft } from './editor/number-draft.js'
import { MinusGlyph, PlusGlyph } from './glyphs.js'
import './stepper.css'

// A whole number between two ends, chosen a step at a time or written straight in (#620, variant
// A): «[−] [4] [+]» on one row of 44 px.
//
// It replaced a row of buttons, one per number — eight 44 px targets for the seat count, which
// wrapped onto two rows in Bord's recipe column and took 445 px of the guided start. Three
// targets do the same work, and both surfaces draw the same control on their own ground.
//
// The number is the control (WAI-ARIA's spinbutton): it is the one stop on the way through, the
// arrow keys step it, and what is typed into it is a draft until the field is left or Enter is
// pressed — then it is written once, held to the two ends, and a draft that is no number at all
// writes nothing and the field shows what it had (`number-draft.ts`, #478). The two buttons are
// for a pointer and stay out of the tab order: a keyboard already has the arrows, and three stops
// for one number is two too many.
export function Stepper({ value, min, max, onChange, label, fewer, more, readOnly = false }: { value: number; min: number; max: number; onChange(next: number): void; label: string; fewer: string; more: string; readOnly?: boolean }) {
  const field = useRef<HTMLInputElement>(null)
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))
  const draft = useNumberDraft({ value, min, max, onCommit: (next) => {
      const n = clamp(next)
      if (n !== value) onChange(n)
    },
  })
  // A step over a draft steps from what was written: 5 typed and ↑ is 6, whatever stood there.
  const step = (by: number) => {
    const from = settled(draft.value, { min, max }) ?? value
    draft.drop()
    const next = clamp(from + by)
    if (next !== value) onChange(next)
    return next
  }
  // A button that has just reached its end goes out under the pointer, and a disabled button
  // cannot hold focus: the browser would drop it on the body. It lands on the number instead,
  // which is where the arrows can take it back.
  const press = (by: number) => {
    const next = step(by)
    const at = document.activeElement
    if ((next === min || next === max) && at instanceof HTMLButtonElement && at.parentElement === field.current?.parentElement) field.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (draft.onKey(event)) return
    if (readOnly) return
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      step(event.key === 'ArrowUp' ? 1 : -1)
    }
  }
  return (
    <span className="byd-stepper-row">
      <span className="byd-stepper">
        <button type="button" className="byd-stepper-step" tabIndex={-1} aria-label={fewer} disabled={readOnly || value <= min} onClick={() => press(-1)}>
          <MinusGlyph />
        </button>
        <input
          ref={field}
          className="byd-stepper-field"
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          value={draft.value}
          readOnly={readOnly}
          onChange={draft.onChange}
          onBlur={draft.onBlur}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="byd-stepper-step" tabIndex={-1} aria-label={more} disabled={readOnly || value >= max} onClick={() => press(1)}>
          <PlusGlyph />
        </button>
      </span>
      {/* The two ends, said where the number is chosen; the field's own name says them to a
          reader already. */}
      <small className="byd-stepper-ends" aria-hidden="true">
        {min}–{max}
      </small>
    </span>
  )
}
