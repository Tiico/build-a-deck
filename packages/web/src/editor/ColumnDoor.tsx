import { NewField } from './NewField.js'
import { fieldLabel } from './fields.js'
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
export function ColumnDoor({ columns, canRemove, onRemove, removeRef, asking, taken, keeps, onCreate, onCancel }: ColumnDoorProps) {
  const t = useT()
  return (
    <div className="byd-columns" role="group" aria-label={t('table.columns')} onKeyDown={(event) => event.key === 'Escape' && onCancel()}>
      <ul className="byd-columns-list">
        {columns.map((field) => (
          <li key={field} data-col={field}>
            <span className="byd-columns-name">{fieldLabel(field, t)}</span>
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
          </li>
        ))}
      </ul>
      {!asking && <NewField taken={taken} keeps={keeps} onCreate={onCreate} onCancel={onCancel} />}
    </div>
  )
}
