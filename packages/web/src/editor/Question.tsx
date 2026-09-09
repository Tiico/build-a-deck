import type { ReactNode } from 'react'
import { useT } from '../i18n/index.js'

// The one question the editor asks before something cannot be looked at afterwards: taking cards
// out of the deck (#17, #8), ending a table (#19), leaving unsaved work behind (#8).
//
// It is a strip and not a modal window: it stands where the action was asked for, takes the focus
// so it is answered where it is read, answers Escape, and hands the focus back to whatever opened
// it. Nothing traps the keyboard — a person who tabs past the question simply leaves it standing.
//
// Every answer says whether it loses anything, and the question opens on the first answer that
// loses nothing: `keep` when there is one, otherwise `cancel`. The focus is never on the answer
// that cannot be undone, so the reflex that answers a question without reading it — Enter, Space
// on the way past — keeps the work rather than throws it away (#8, UX-kontrollen 2026-09-06).
// The answer that cannot be undone stands exactly where it did, in red and in plain words; it is
// one Tab away, not one step further into the question.
export type QuestionProps = {
  // What the question is called for a screen reader. The same words as the sentence it asks, so
  // hearing the name and reading the strip are the same sentence twice.
  label: string
  // The surface it is drawn on at this call site: the action row over the table, the row under
  // the header, the table's own card.
  className: string
  children: ReactNode
  // The answer that cannot be undone, in the words for what it does ("Ja, ta bort").
  confirm: string
  onConfirm(): void
  // The answer that does nothing, and is therefore always the safe one. Every question has it,
  // and a question that does not name it gets the catalogue's word in the reader's language —
  // never a Swedish default written into the code (A4).
  onCancel(): void
  cancel?: string
  // An answer that loses nothing and does the work anyway ("Spara och lämna"). When there is one
  // it comes first and is the safe answer the question opens on.
  keep?: { label: string; disabled?: boolean; onChoose(): void }
}

type Answer = {
  key: string
  // What the stylesheet calls this answer; the plain one goes unnamed.
  kind: 'keep' | 'danger' | undefined
  label: string
  disabled: boolean
  // Whether this answer can be given by mistake without costing anything.
  safe: boolean
  onChoose(): void
}

export function Question({ label, className, children, confirm, onConfirm, onCancel, cancel, keep }: QuestionProps) {
  const t = useT()
  const answers: Answer[] = [
    ...(keep ? [{ key: 'keep', kind: 'keep' as const, label: keep.label, disabled: keep.disabled === true, safe: true, onChoose: keep.onChoose }] : []),
    { key: 'confirm', kind: 'danger', label: confirm, disabled: false, safe: false, onChoose: onConfirm },
    { key: 'cancel', kind: undefined, label: cancel ?? t('editor.cancel'), disabled: false, safe: true, onChoose: onCancel },
  ]
  // The first answer that loses nothing and can actually be given. Not an index the call sites
  // count out: the question works out for itself which of its answers is the safe one.
  const opensOn = answers.find((answer) => answer.safe && !answer.disabled)
  return (
    <div
      className={className}
      role="alertdialog"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // The question is what Escape is about while it stands; whatever opened around it keeps
        // standing.
        event.stopPropagation()
        onCancel()
      }}
    >
      <p>{children}</p>
      {answers.map((answer) => (
        <button
          key={answer.key}
          type="button"
          data-kind={answer.kind}
          autoFocus={answer === opensOn}
          disabled={answer.disabled}
          onClick={answer.onChoose}
        >
          {answer.label}
        </button>
      ))}
    </div>
  )
}
