import { useRef } from 'react'
import { Lifted } from './Lifted.js'
import { useT } from '../i18n/index.js'

// A column's filter, in the column's own head (#617, variant A).
//
// The filter used to be a row of chips in the crown: fourteen of them on Sal's Saloon, three
// quarters of the row, 204 px of them past the edge at 1280 and 420 at 1024, and none of them
// saying which column it belonged to — «Diamant» stood beside «Character» with nothing between
// them. The one control in the crown that answers to anything, the search, had been squeezed to
// a sixth of the row to make room.
//
// So the filter stands where the column is. A column with a vocabulary gets a door beside its
// sort, and the door lists the values as ticks with how many cards carry each. What is ticked is
// not only here: it is said as a token in the search field — «typ: varelse ×» — so the state is
// read without opening anything, which is the rule #128 wrote for the crown and #130 kept the
// chips in the row for. The head says it too, as a count on the door's handle.
export type ColumnFilterProps = {
  field: string
  label: string
  // The column's vocabulary, with how many cards carry each word, and which of them are on.
  values: readonly { value: string; count: number }[]
  chosen: readonly string[]
  onToggle(value: string): void
  open: boolean
  onOpen(open: boolean): void
}

export function ColumnFilter({ label, values, chosen, onToggle, open, onOpen }: ColumnFilterProps) {
  const t = useT()
  const handle = useRef<HTMLButtonElement>(null)
  const name = chosen.length > 0 ? t('table.filterOn.count', { field: label, n: chosen.length }) : t('table.filterOn', { field: label })
  return (
    <>
      <button
        ref={handle}
        type="button"
        className="byd-column-filter"
        aria-label={name}
        title={name}
        aria-expanded={open}
        {...(chosen.length > 0 ? { 'data-on': chosen.length } : {})}
        onClick={() => onOpen(!open)}
      >
        {/* The count takes the glyph's place, so the handle never changes width (#617). */}
        <span aria-hidden="true">{chosen.length > 0 ? chosen.length : '▾'}</span>
      </button>
      {open && (
        <Lifted handle={handle} label={t('table.filterOn', { field: label })} className="byd-column-filter-door" onClose={() => onOpen(false)}>
          {values.map(({ value, count }) => (
            <label key={value} className="byd-column-filter-tick">
              <input type="checkbox" aria-label={value} checked={chosen.includes(value)} onChange={() => onToggle(value)} />
              <span>{value}</span>
              <small>{t(count === 1 ? 'table.filter.cards.one' : 'table.filter.cards.other', { n: count })}</small>
            </label>
          ))}
        </Lifted>
      )}
    </>
  )
}
