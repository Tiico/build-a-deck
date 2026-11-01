import type { ProjectDoc } from '@byd/server'
import { copiesOf } from '@byd/server/doc'
import type { Motif } from '@byd/template'
import { useMemo } from 'react'
import { useT } from '../i18n/index.js'
import { ChevronGlyph } from '../glyphs.js'
import { CardPreview } from './CardPreview.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { shapeOf } from './TileRows.js'
import { shapeWords, stepOf, tileType, tilesIn } from './tiles.js'

// Kortväggen med ett avsnitt per lek (#1487, editorvariant A i #1474): när spelet har fler lekar än
// den egna står varje lek under ett eget huvud med sin form och sitt antal, och vägen till dess flik i
// Mall och Tabell. Ett spel med en lek ser ut som det alltid gjort: inga huvuden, inga avsnitt.

const CSS_MM_PX = 96 / 25.4
// How wide a tile is drawn on the wall: the size the prototype drew a hexagon at beside the cards.
const TILE_PX = 84

type Go = (ref: string | null, where: 'template' | 'table') => void

function Head({ name, about, deck, onGo }: { name: string; about: string; deck: string | null; onGo: Go }) {
  const t = useT()
  return (
    <div className="byd-wall-deck-head">
      <h2>{name}</h2>
      <small>{about}</small>
      <button type="button" className="byd-secondary" aria-label={t('setup.tileDeck.open.template', { name })} onClick={() => onGo(deck, 'template')}>
        {t('setup.tileDeck.template')}
        <ChevronGlyph to="right" />
      </button>
      <button type="button" className="byd-secondary" aria-label={t('setup.tileDeck.open.table', { name })} onClick={() => onGo(deck, 'table')}>
        {t('setup.tileDeck.table')}
        <ChevronGlyph to="right" />
      </button>
    </div>
  )
}

// The head over the document's own deck, drawn only when another deck stands under it.
export function OwnDeckHead({ doc, onGo }: { doc: ProjectDoc; onGo: Go }) {
  const t = useT()
  if ((doc.decks ?? []).length === 0) return null
  const n = doc.rows.reduce((sum, r) => sum + copiesOf(r.fields), 0)
  return <Head name={t('deck.tabs.own')} about={t('wall.decks.cards', { n, w: 63, h: 88 })} deck={null} onGo={onGo} />
}

// Every other deck, each in a section of its own under the document's (#1487).
export function OtherDecks({ doc, assetBase, motifs, onGo }: { doc: ProjectDoc; assetBase?: string | undefined; motifs?: Record<string, Motif> | undefined; onGo: Go }) {
  const t = useT()
  const fonts = useMemo(() => previewFonts({ template: doc.template, fonts: doc.fonts }, assetBase), [doc.template, doc.fonts, assetBase])
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, assetBase), [doc.icons, assetBase])
  const decks = doc.decks ?? []
  if (decks.length === 0) return null
  return (
    <>
      {decks.map((deck) => {
        const type = tileType(deck.type)
        const face = deck.template.faces['front'] ?? { base: [], variants: {} }
        const about = type ? t('wall.decks.tiles', { n: tilesIn(deck), shape: shapeWords(type, t), deg: stepOf(type) }) : t('wall.decks.cards', { n: tilesIn(deck), w: 63, h: 88 })
        return (
          <section key={deck.id} className="byd-wall-other" data-deck={deck.id} aria-label={deck.name}>
            <Head name={deck.name} about={about} deck={deck.id} onGo={onGo} />
            <ul className="byd-wall-tiles">
              {deck.rows.map((row) => (
                <li key={row.id} data-shape={type ? shapeOf(type) : undefined} style={{ width: TILE_PX, height: type ? (TILE_PX * type.physical.heightMm) / type.physical.widthMm : TILE_PX * (88 / 63) }}>
                  <CardPreview
                    face={face}
                    row={row.fields}
                    {...(type ? { type } : {})}
                    icons={icons}
                    fonts={fonts}
                    id={`byd-wall-${deck.id}-${row.id}`}
                    scale={TILE_PX / ((type?.physical.widthMm ?? 63) * CSS_MM_PX)}
                    assetBase={assetBase}
                    motifs={motifs}
                    palette={doc.palette}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}
