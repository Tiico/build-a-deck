import { useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import type { Counter, Die } from '@byd/server/doc'
import { useT } from '../i18n/index.js'
import { CloseGlyph } from '../glyphs.js'
import { useNumberDraft } from './number-draft.js'
import { DIE_FACES, Reading, movedTo, placeOf, type DiePlace } from './setup-rows.js'

// A piece of material as a row in Bord's tree (#1403, K31): a die or a counter, said in a breath
// («2 × d6 · per spelare», «Guld · från 0») under the zone it lies in, and opened into its fields
// like a zone is. Where it lies is the tree's to say, so the row has no picker for it — except
// when the zone is gone, and the row has to be told where to go instead (#1139).
export type MaterialKey = `die:${number}` | `counter:${number}`

export function MaterialRow({ id, kind, label, detail, removeLabel, open, note, onOpen, onRemove, children }: { id: MaterialKey; kind: 'die' | 'counter'; label: string; detail: string; removeLabel: string; open: boolean; note?: ReactNode; onOpen(open: boolean): void; onRemove(): void; children: ReactNode }) {
  const reading = useContext(Reading)
  return (
    <li data-material-row={id} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={() => onOpen(!open)}>
          <i aria-hidden="true" data-kind={kind} />
          <span>{label}</span> <small>{detail}</small>
        </button>
        {!reading && (
          <button type="button" className="byd-setup-x" aria-label={removeLabel} onClick={onRemove}>
            <CloseGlyph />
          </button>
        )}
      </div>
      {note}
      {open && <div className="byd-setup-props">{children}</div>}
    </li>
  )
}

// One line of the game's dice (#1139, K28): how many, which kind, and how the count is read — per
// seat in an area each seat has, where there is nothing to choose; total or per player on the
// table. `gone` is a line whose area no longer exists: it stays, says so, and asks for another.
export function DieFields({ die, n, places, gone, focus, onFocused, onChange }: { die: Die; n: number; places: { table: DiePlace[]; seats: DiePlace[] }; gone: boolean; focus: boolean; onFocused(): void; onChange(die: Die): void }) {
  const t = useT()
  const reading = useContext(Reading)
  const note = useId()
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    first.current?.focus()
    onFocused()
  }, [focus, onFocused])
  const count = useNumberDraft({ value: die.count, min: 1, max: 20, onCommit: (value) => onChange({ ...die, count: Math.trunc(value) }) })
  return (
    <>
      <div className="byd-setup-die">
        <input ref={first} aria-label={t('setup.die.count', { n })} type="number" min={1} max={20} value={count.value} readOnly={reading} onChange={count.onChange} onBlur={count.onBlur} onKeyDown={count.onKey} />
        <select aria-label={t('setup.die.kind', { n })} value={die.faces} disabled={reading} onChange={(e) => onChange({ ...die, faces: Number(e.target.value) as Die['faces'] })}>
          {DIE_FACES.map((faces) => (
            <option key={faces} value={faces}>
              {t('setup.die.faces', { n: faces })}
            </option>
          ))}
        </select>
        {die.role !== undefined ? (
          <span>{t('setup.die.perSeat')}</span>
        ) : (
          <select aria-label={t('setup.die.mode', { n })} value={die.perSeat ? 'perSeat' : 'total'} disabled={reading} onChange={(e) => onChange(e.target.value === 'perSeat' ? { ...die, perSeat: true } : (({ perSeat: _p, ...rest }) => rest)(die))}>
            <option value="perSeat">{t('setup.die.perSeat')}</option>
            <option value="total">{t('setup.die.total')}</option>
          </select>
        )}
      </div>
      {gone && (
        <>
          <span className="byd-setup-die-where">
            <span>{t('setup.die.in')}</span>
            <select aria-label={t('setup.die.place', { n })} value="" disabled={reading} aria-invalid aria-describedby={note} onChange={(e) => onChange(movedTo(die, e.target.value))}>
              <option value="" disabled>
                {t('setup.die.place.gone')}
              </option>
              <optgroup label={t('setup.group.table')}>
                {places.table.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {places.seats.length > 0 && (
                <optgroup label={t('setup.group.seats')}>
                  {places.seats.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </span>
          <p id={note} className="byd-setup-note" role="status">
            {t('setup.die.homeless', { n })}
          </p>
        </>
      )}
    </>
  )
}

// What a die's row says before it is opened.
export function dieWords(die: Die, t: ReturnType<typeof useT>): { label: string; detail: string } {
  return { label: t('setup.die.row', { count: die.count, faces: die.faces }), detail: t(die.role !== undefined || die.perSeat ? 'setup.die.perSeat' : 'setup.die.total') }
}
export const dieKey = (die: Die): string => placeOf(die)

// A counter's name and what it starts at (C4). The name is written a letter at a time, so the
// row's gesture token makes the whole word one step back (L14).
export function CounterFields({ counter, n, focus, onFocused, visit, onChange }: { counter: Counter; n: number; focus: boolean; onFocused(): void; visit: Record<string, unknown>; onChange(patch: Partial<Counter>): void }) {
  const t = useT()
  const reading = useContext(Reading)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    first.current?.focus()
    onFocused()
  }, [focus, onFocused])
  return (
    <div className="byd-setup-counter">
      <input ref={first} aria-label={t('setup.counter.name', { n })} value={counter.name} readOnly={reading} {...visit} onChange={(e) => onChange({ name: e.target.value })} />
      <span>{t('setup.counter.from')}</span>
      <input aria-label={t('setup.counter.start', { n })} type="number" value={counter.start} readOnly={reading} {...visit} onChange={(e) => onChange({ start: Math.trunc(Number(e.target.value) || 0) })} />
    </div>
  )
}
