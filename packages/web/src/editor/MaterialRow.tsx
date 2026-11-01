import { useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import type { Counter, Die, Piece } from '@byd/server/doc'
import { useT } from '../i18n/index.js'
import { CloseGlyph } from '../glyphs.js'
import { useNumberDraft } from './number-draft.js'
import { DIE_FACES, Reading, movedTo, placeOf, type DiePlace } from './setup-rows.js'

// A piece of material as a row in Bord's tree (#1403, K31): a die or a counter, said in a breath
// («2 × d6 · per spelare», «Guld · från 0») under the zone it lies in, and opened into its fields
// like a zone is. Where it lies is the tree's to say, so the row has no picker for it — except
// when the zone is gone, and the row has to be told where to go instead (#1139).
export type MaterialKey = `die:${number}` | `counter:${number}` | `piece:${number}` | `marker:${number}` | `deck:${number}`

export function MaterialRow({ id, kind, piece, shape, label, detail, removeLabel, open, note, onOpen, onRemove, children }: { id: MaterialKey; kind: 'die' | 'counter' | 'piece' | 'tile'; piece?: Piece['kind']; shape?: 'hex' | 'square' | 'round'; label: string; detail: string; removeLabel: string; open: boolean; note?: ReactNode; onOpen(open: boolean): void; onRemove(): void; children: ReactNode }) {
  const reading = useContext(Reading)
  return (
    <li data-material-row={id} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={() => onOpen(!open)}>
          <i aria-hidden="true" data-kind={kind} data-piece={piece} data-shape={shape} />
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
      {gone && <GonePlace places={places} label={t('setup.die.place', { n })} homeless={t('setup.die.homeless', { n })} onPick={(value) => onChange(movedTo(die, value))} />}
    </>
  )
}

// Where a line goes whose area is gone (#1139): it stays, says so, and asks for another. A die's and
// a piece's row ask the same way (#1477).
function GonePlace({ places, label, homeless, onPick }: { places: { table: DiePlace[]; seats: DiePlace[] }; label: string; homeless: string; onPick(value: string): void }) {
  const t = useT()
  const reading = useContext(Reading)
  const note = useId()
  return (
    <>
      <span className="byd-setup-die-where">
        <span>{t('setup.die.in')}</span>
        <select aria-label={label} value="" disabled={reading} aria-invalid aria-describedby={note} onChange={(e) => onPick(e.target.value)}>
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
        {homeless}
      </p>
    </>
  )
}

// The kinds of wooden piece (K33), in the order the row offers them.
export const PIECE_KINDS = ['meeple', 'cube', 'disc'] as const satisfies readonly Piece['kind'][]

// One line of the game's wooden pieces (#1477, editorvariant B in #1472): the kind chosen in the row
// among meeple, cube and disc, how many and how the count is read as a die's, and for a meeple
// whether it starts standing or lying. The colour is the seat's (L11), so there is none to choose.
export function PieceFields({ piece, n, places, gone, focus, onFocused, onChange }: { piece: Piece; n: number; places: { table: DiePlace[]; seats: DiePlace[] }; gone: boolean; focus: boolean; onFocused(): void; onChange(piece: Piece): void }) {
  const t = useT()
  const reading = useContext(Reading)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    first.current?.focus()
    onFocused()
  }, [focus, onFocused])
  const count = useNumberDraft({ value: piece.count, min: 1, max: 20, onCommit: (value) => onChange({ ...piece, count: Math.trunc(value) }) })
  // Only a meeple has a side to lie on, so another kind leaves «lying» behind.
  const { lying: _lying, ...standing } = piece
  const kindOf = (kind: Piece['kind']): Piece => (kind === 'meeple' && piece.lying ? { ...standing, kind, lying: true } : { ...standing, kind })
  return (
    <div className="byd-setup-piece">
      <span className="byd-setup-piece-line">
        <span aria-hidden="true">{t('setup.piece.sort')}</span>
        <span role="group" aria-label={t('setup.piece.kind', { n })} className="byd-setup-piece-choice">
          {PIECE_KINDS.map((kind) => (
            <button key={kind} type="button" className="byd-choice" aria-pressed={piece.kind === kind} disabled={reading} onClick={() => piece.kind !== kind && onChange(kindOf(kind))}>
              <i aria-hidden="true" data-kind="piece" data-piece={kind} />
              {t(`setup.piece.kind.${kind}`)}
            </button>
          ))}
        </span>
      </span>
      <span className="byd-setup-piece-line">
        <span aria-hidden="true">{t('setup.piece.number')}</span>
        <input ref={first} aria-label={t('setup.piece.count', { n })} type="number" min={1} max={20} value={count.value} readOnly={reading} onChange={count.onChange} onBlur={count.onBlur} onKeyDown={count.onKey} />
        {piece.role !== undefined ? (
          <span>{t('setup.die.perSeat')}</span>
        ) : (
          <select aria-label={t('setup.piece.mode', { n })} value={piece.perSeat ? 'perSeat' : 'total'} disabled={reading} onChange={(e) => onChange(e.target.value === 'perSeat' ? { ...piece, perSeat: true } : (({ perSeat: _p, ...rest }) => rest)(piece))}>
            <option value="perSeat">{t('setup.die.perSeat')}</option>
            <option value="total">{t('setup.die.total')}</option>
          </select>
        )}
      </span>
      {piece.kind === 'meeple' && (
        <span className="byd-setup-piece-line">
          <span aria-hidden="true">{t('setup.piece.begins')}</span>
          <span role="group" aria-label={t('setup.piece.start', { n })} className="byd-setup-piece-choice">
            <button type="button" className="byd-choice" aria-pressed={!piece.lying} disabled={reading} onClick={() => piece.lying && onChange(standing)}>
              {t('setup.piece.standing')}
            </button>
            <button type="button" className="byd-choice" aria-pressed={piece.lying === true} disabled={reading} onClick={() => !piece.lying && onChange({ ...piece, lying: true })}>
              {t('setup.piece.lying')}
            </button>
          </span>
        </span>
      )}
      {gone && <GonePlace places={places} label={t('setup.piece.place', { n })} homeless={t('setup.piece.homeless', { n })} onPick={(value) => onChange(movedTo(piece, value))} />}
    </div>
  )
}

// What a piece's row says before it is opened: «5 × meeple · per spelare».
export function pieceWords(piece: Piece, t: ReturnType<typeof useT>): { label: string; detail: string } {
  return { label: t('setup.piece.row', { count: piece.count, kind: t(`setup.piece.kind.${piece.kind}`) }), detail: t(piece.role !== undefined || piece.perSeat ? 'setup.die.perSeat' : 'setup.die.total') }
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
