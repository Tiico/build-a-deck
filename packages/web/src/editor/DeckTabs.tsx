import { CARD_STANDARD_63x88, type ComponentTypeDef } from '@byd/engine'
import type { DeckTab } from '@byd/server/doc'
import type { ProjectDeck } from '@byd/server'
import { useT } from '../i18n/index.js'
import { shapeOf } from './TileRows.js'
import { TILE_TYPES, shapeName, stepOf, tileType, typeRef } from './tiles.js'

// A tab per deck in Mall and Tabell (#1487, editorvariant A i #1474): the document's own deck first as
// «Kort», every other deck by its name with its shape and its count, and in Mall every marker's two
// sides. Drawn only when the game has more than one: whoever has only cards sees nothing new until a
// second deck is there (prototypens «+»). «＋ Lek» makes a deck of tiles and opens it.
export function DeckTabs({ tabs, current, onPick, onNew }: { tabs: readonly DeckTab[]; current: string | null; onPick(ref: string | null): void; onNew?: (() => void) | undefined }) {
  const t = useT()
  if (tabs.length < 2) return null
  return (
    <div className="byd-deck-tabs" role="group" aria-label={t('deck.tabs')}>
      {tabs.map((tab) => {
        const tile = tab.type.id !== CARD_STANDARD_63x88.id
        const name = tab.ref === null ? t('deck.tabs.own') : (tab.name ?? tab.ref)
        return (
          <button key={tab.ref ?? ''} type="button" aria-pressed={current === tab.ref} onClick={() => onPick(tab.ref)} data-deck-tab={tab.ref ?? ''}>
            <span>{name}</span>
            {tile && <i aria-hidden="true" data-kind="tile" data-shape={shapeOf(tab.type)} />}
            <small>{tab.kind === 'marker' ? t('deck.tabs.marker') : tab.rows}</small>
          </button>
        )
      })}
      {onNew && (
        <button type="button" className="byd-deck-tabs-new" onClick={onNew}>
          {t('deck.tabs.new')}
        </button>
      )}
    </div>
  )
}

// «Brickan» at the head of Mall's properties for a deck of tiles or a marker (#1487, #1474 A): the
// shape it is cut in, chosen among the registry's types (B3), and what the type says of it, the size,
// the cardboard and the step it turns in at the table (K34). The size, the cardboard and the step are
// the type's and are read here, not typed: a type is one shape in one size (beslutet 2026-11-01).
export function TileProps({ type, reading, onType }: { type: ComponentTypeDef; reading: boolean; onType(type: ComponentTypeDef): void }) {
  const t = useT()
  const shape = shapeOf(type)
  // The round tile comes in two sizes, so its choice is a size and the shape's buttons pick the first.
  const sizes = TILE_TYPES.filter((d) => shapeOf(d) === shape)
  return (
    <section className="byd-tile-props" aria-labelledby="byd-tile-props">
      <h3 id="byd-tile-props">{t('tile.props')}</h3>
      <div role="group" aria-label={t('tile.props.shape')} className="byd-tile-shapes">
        {(['hex', 'square', 'round'] as const).map((s) => {
          const first = TILE_TYPES.find((d) => shapeOf(d) === s)!
          return (
            <button key={s} type="button" className="byd-choice" aria-pressed={shape === s} disabled={reading} onClick={() => shape !== s && onType(first)}>
              <i aria-hidden="true" data-kind="tile" data-shape={s} />
              {shapeName(first, t)}
            </button>
          )
        })}
      </div>
      {sizes.length > 1 && (
        <div role="group" aria-label={t('tile.props.size')} className="byd-tile-shapes">
          {sizes.map((d) => (
            <button key={d.id} type="button" className="byd-choice" aria-pressed={d.id === type.id} disabled={reading} onClick={() => d.id !== type.id && onType(d)}>
              {t('tile.props.mm', { mm: Math.round(d.physical.widthMm) })}
            </button>
          ))}
        </div>
      )}
      <dl className="byd-tile-measures">
        <div>
          <dt>{t(shape === 'hex' ? 'tile.props.across' : shape === 'round' ? 'tile.props.diameter' : 'tile.props.side')}</dt>
          <dd>{t('tile.props.mm', { mm: Math.round(type.physical.widthMm) })}</dd>
        </div>
        <div>
          <dt>{t('tile.props.board')}</dt>
          <dd>{t('tile.props.mm', { mm: type.physical.thicknessMm })}</dd>
        </div>
        <div>
          <dt>{t('tile.props.step')}</dt>
          <dd>{t('tile.props.deg', { deg: stepOf(type) })}</dd>
        </div>
      </dl>
    </section>
  )
}

// A deck with its type changed, or a marker's (#1487).
export const typed = <D extends Pick<ProjectDeck, 'type'>>(deck: D, type: ComponentTypeDef): D => ({ ...deck, type: typeRef(type) })
export const isTileType = (type: ComponentTypeDef): boolean => tileType(type) !== undefined
