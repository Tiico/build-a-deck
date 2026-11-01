import { useContext, useEffect, useId, useRef } from 'react'
import type { ComponentTypeDef } from '@byd/engine'
import type { ProjectDeck } from '@byd/server'
import type { Marker } from '@byd/server/doc'
import { useT, type T } from '../i18n/index.js'
import { ChevronGlyph } from '../glyphs.js'
import { useNumberDraft } from './number-draft.js'
import { Reading } from './setup-rows.js'
import { TILE_TYPES, shapeWords, tileType, tilesIn, typeRef } from './tiles.js'

// The tiles in Bord's tree (#1487, editorvariant A i #1474): the two choices «＋ Bricka» opens, and the
// rows a marker and a deck of tiles stand as under the zone they lie in.

// The two kinds of tile side by side (fråga 8 i #1470): a marker is one picture in n copies and costs
// a row here; a pile from a deck is a picture per row of a table of its own and costs a deck with a
// template and a table. Each says what it costs, so the choice is made with the price in view.
export type TileChoice = { kind: 'marker' | 'deck'; pick(): void }
export function TileChoiceItem({ choice, onPick }: { choice: TileChoice; onPick(): void }) {
  const t = useT()
  const id = useId()
  const marker = choice.kind === 'marker'
  return (
    <button type="button" role="menuitem" aria-label={t(marker ? 'setup.tile.marker' : 'setup.tile.deck')} aria-describedby={`${id}-what ${id}-cost`} onClick={onPick}>
      <b>{t(marker ? 'setup.tile.marker' : 'setup.tile.deck')}</b>
      <i aria-hidden="true" data-kind="tile" data-shape={marker ? 'round' : 'hex'} />
      <span id={`${id}-what`}>{t(marker ? 'setup.tile.marker.what' : 'setup.tile.deck.what')}</span>
      <em id={`${id}-cost`}>{t(marker ? 'setup.tile.marker.cost' : 'setup.tile.deck.cost')}</em>
    </button>
  )
}

// The shape a tile type is drawn in on a row's icon.
export const shapeOf = (type: ComponentTypeDef | undefined): 'hex' | 'square' | 'round' => (type?.physical.shape === 'hex' ? 'hex' : type?.physical.shape === 'circle' ? 'round' : 'square')

// What a marker's row says before it is opened: «30 × Guld · rund 25 mm, totalt».
export function markerWords(marker: Marker, t: T): { label: string; detail: string } {
  const type = tileType(marker.type)
  const count = t(marker.role !== undefined || marker.perSeat ? 'setup.die.perSeat' : 'setup.die.total')
  return { label: t('setup.piece.row', { count: marker.count, kind: marker.name }), detail: t('setup.tile.detail', { shape: type ? shapeWords(type, t) : '', rest: count }) }
}

// What a deck of tiles' row says: «18 × Landskap · sexhörning 52 mm, hög ur en lek».
export function deckWords(deck: ProjectDeck, t: T): { label: string; detail: string } {
  const type = tileType(deck.type)
  return { label: t('setup.piece.row', { count: tilesIn(deck), kind: deck.name }), detail: t('setup.tile.detail', { shape: type ? shapeWords(type, t) : t('tile.shape.card'), rest: t('setup.tile.fromDeck') }) }
}

// The shape a tile is cut in, chosen among the registry's four (B3): one type per shape and size.
function ShapeSelect({ label, value, onChange }: { label: string; value: { id: string; version: number }; onChange(type: ComponentTypeDef): void }) {
  const t = useT()
  const reading = useContext(Reading)
  return (
    <select aria-label={label} value={value.id} disabled={reading} onChange={(e) => onChange(TILE_TYPES.find((d) => d.id === e.target.value) ?? TILE_TYPES[0]!)}>
      {TILE_TYPES.map((type) => (
        <option key={type.id} value={type.id}>
          {shapeWords(type, t)}
        </option>
      ))}
    </select>
  )
}

// A marker's row opened (#1487): its name, how many and how the count is read as a piece's, the shape
// it is cut in, and the way to its two sides, which are drawn in Mall with the card's layers (L1).
export function MarkerFields({ marker, n, focus, onFocused, visit, token, onChange, onDraw }: { marker: Marker; n: number; focus: boolean; onFocused(): void; visit: Record<string, unknown>; token(): string; onChange(marker: Marker, gesture?: string): void; onDraw?: (() => void) | undefined }) {
  const t = useT()
  const reading = useContext(Reading)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    first.current?.focus()
    onFocused()
  }, [focus, onFocused])
  const count = useNumberDraft({ value: marker.count, min: 1, max: 200, onCommit: (value) => onChange({ ...marker, count: Math.trunc(value) }) })
  return (
    <div className="byd-setup-piece">
      <span className="byd-setup-piece-line">
        <span aria-hidden="true">{t('setup.piece.number')}</span>
        <input ref={first} aria-label={t('setup.marker.count', { n })} type="number" min={1} max={200} value={count.value} readOnly={reading} onChange={count.onChange} onBlur={count.onBlur} onKeyDown={count.onKey} />
        {marker.role !== undefined ? (
          <span>{t('setup.die.perSeat')}</span>
        ) : (
          <select aria-label={t('setup.marker.mode', { n })} value={marker.perSeat ? 'perSeat' : 'total'} disabled={reading} onChange={(e) => onChange(e.target.value === 'perSeat' ? { ...marker, perSeat: true } : (({ perSeat: _p, ...rest }) => rest)(marker))}>
            <option value="perSeat">{t('setup.die.perSeat')}</option>
            <option value="total">{t('setup.die.total')}</option>
          </select>
        )}
      </span>
      <span className="byd-setup-piece-line">
        <span aria-hidden="true">{t('setup.tile.name')}</span>
        <input aria-label={t('setup.marker.name', { n })} value={marker.name} maxLength={40} readOnly={reading} {...visit} onChange={(e) => e.target.value.trim() !== '' && onChange({ ...marker, name: e.target.value }, token())} />
      </span>
      <span className="byd-setup-piece-line">
        <span aria-hidden="true">{t('setup.tile.shape')}</span>
        <ShapeSelect label={t('setup.marker.shape', { n })} value={marker.type} onChange={(type) => onChange({ ...marker, type: typeRef(type) })} />
      </span>
      {onDraw && (
        <button type="button" className="byd-secondary byd-setup-tile-go" onClick={onDraw}>
          {t('setup.marker.draw')}
        </button>
      )}
    </div>
  )
}

// A deck of tiles' row opened (#1487): its name, the shape every tile of it is cut in, and the way to
// its template and its table, which are its tabs in Mall and Tabell.
export function DeckFields({ deck, n, focus, onFocused, visit, token, onChange, onOpen }: { deck: ProjectDeck; n: number; focus: boolean; onFocused(): void; visit: Record<string, unknown>; token(): string; onChange(deck: ProjectDeck, gesture?: string): void; onOpen?: ((where: 'template' | 'table') => void) | undefined }) {
  const t = useT()
  const reading = useContext(Reading)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    first.current?.focus()
    onFocused()
  }, [focus, onFocused])
  return (
    <div className="byd-setup-piece">
      <span className="byd-setup-piece-line">
        <span aria-hidden="true">{t('setup.tile.name')}</span>
        <input ref={first} aria-label={t('setup.tileDeck.name', { n })} value={deck.name} maxLength={40} readOnly={reading} {...visit} onChange={(e) => e.target.value.trim() !== '' && onChange({ ...deck, name: e.target.value }, token())} />
      </span>
      {tileType(deck.type) && (
        <span className="byd-setup-piece-line">
          <span aria-hidden="true">{t('setup.tile.shape')}</span>
          <ShapeSelect label={t('setup.tileDeck.shape', { n })} value={deck.type} onChange={(type) => onChange({ ...deck, type: typeRef(type) })} />
        </span>
      )}
      {onOpen && (
        <span className="byd-setup-piece-line">
          <button type="button" className="byd-secondary byd-setup-tile-go" aria-label={t('setup.tileDeck.open.template', { name: deck.name })} onClick={() => onOpen('template')}>
            {t('setup.tileDeck.template')}
            <ChevronGlyph to="right" />
          </button>
          <button type="button" className="byd-secondary byd-setup-tile-go" aria-label={t('setup.tileDeck.open.table', { name: deck.name })} onClick={() => onOpen('table')}>
            {t('setup.tileDeck.table')}
            <ChevronGlyph to="right" />
          </button>
        </span>
      )}
    </div>
  )
}
