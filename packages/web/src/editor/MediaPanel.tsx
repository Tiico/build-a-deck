import { useId, useState } from 'react'
import type { ProjectDoc, ProjectRow } from './types.js'
import { assetRef, assetUrl, imageFieldsOf, mediaInGame } from './assets.js'
import { setColumn } from './selection.js'
import { useMarked } from './marked.js'
import { fieldLabel } from './fields.js'
import { useT } from '../i18n/index.js'

// The media library (#222, L22, prototype A · egen flik). Every picture the game holds, in one
// place, so that finding one and tidying one are the same errand. The card table shows the
// pictures that are in use and nothing else; a library that only listed those would have nothing
// to tidy.
//
// A picture here has no name of its own: the bytes are content-addressed and nothing stores what
// the file was called. What can be said about one truthfully is which cards are drawn from it, so
// that is what names it — the same sentence the card table's own strip uses — and a picture no
// card uses says exactly that instead.
//
// Nothing is uploaded from here. A picture already in the game is a hash, and putting it on
// ninety more cards writes that hash into ninety cells: the same bytes, stored once, however many
// cards are drawn from them (E1). That is the whole answer to "samma fil laddas upp igen så fort
// någon glömmer att den redan finns".
export type MediaPanelProps = {
  doc: ProjectDoc
  assetBase: string
  // The whole list of rows at once, exactly as the card table's own bulk changes travel (#17):
  // one picture onto a marked selection is one version and one step back.
  onReplaceRows(rows: ProjectRow[]): void
}

export function MediaPanel({ doc, assetBase, onReplaceRows }: MediaPanelProps) {
  const t = useT()
  const said = useId()
  const media = mediaInGame(doc)
  const [marked] = useMarked()
  // The picture in hand. A library opens on a picture rather than on nothing, so the first one is
  // chosen until the designer says otherwise, and a picture that leaves the game takes the choice
  // with it.
  const [picked, setPicked] = useState<string | null>(null)
  const chosen = picked !== null && media.some((m) => m.hash === picked) ? picked : (media[0]?.hash ?? null)
  // Which column the picture is written into. Only the template knows which columns are drawn as
  // pictures (E1), and a deck with one such column is not asked the question at all.
  const columns = imageFieldsOf(doc)
  const [column, setColumnPicked] = useState<string | null>(null)
  const field = column !== null && columns.includes(column) ? column : (columns[0] ?? null)
  // What a press would actually reach: the marked cards the deck still holds.
  const reaches = doc.rows.filter((row) => marked.has(row.id))
  const [done, setDone] = useState<number | null>(null)
  const put = () => {
    if (chosen === null || field === null || reaches.length === 0) return
    onReplaceRows(setColumn(doc.rows, marked, field, assetRef(chosen)))
    setDone(reaches.length)
  }
  return (
    <div className="byd-media" data-media-panel>
      <section>
        <h2>{t('media.title')}</h2>
        <ul className="byd-media-grid" aria-label={t('media.title')}>
          {media.map(({ hash, cards }) => {
            const spare = cards.length === 0
            return (
              <li key={hash} data-asset={hash} {...(spare ? { 'data-unused': 'true' } : {})}>
                <button
                  type="button"
                  className="byd-media-tile byd-choice"
                  aria-pressed={chosen === hash}
                  aria-describedby={`${said}-${hash}`}
                  onClick={() => {
                    setPicked(hash)
                    setDone(null)
                  }}
                >
                  {/* The library is the editor's densest surface: a game of real size brings
                      three hundred pictures to it, and fetching them all the moment the tab
                      opens is three hundred requests in one breath. The ones below the fold
                      wait until they are to be seen. */}
                  <img loading="lazy" src={assetUrl(assetBase, hash)} alt={spare ? t('media.picture.unused') : t('table.image.alt', { cards: cards.join(', ') })} />
                </button>
                {/* Marked, never purged (L22, beslut 4): an older version of the deck may still
                    be drawn from these bytes, so the library says nobody uses it and leaves it
                    where it is. */}
                <small id={`${said}-${hash}`}>{spare ? t('media.unused') : t(cards.length === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: cards.length })}</small>
              </li>
            )
          })}
        </ul>
      </section>
      {/* The way from a picture to the cards. The selection is the bulk editor's own and not a
          second mechanism (L22), so this says how many cards are marked and never offers a way to
          mark them: that is the card table's, where the cards are. */}
      <aside className="byd-media-use">
        <h2>{t('media.use')}</h2>
        {columns.length > 1 && (
          <label>
            {t('table.column')}
            <select aria-label={t('table.column')} value={field ?? ''} onChange={(event) => setColumnPicked(event.target.value)}>
              {columns.map((f) => (
                <option key={f} value={f}>
                  {fieldLabel(f, t)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="byd-secondary" disabled={chosen === null || field === null || reaches.length === 0} onClick={put}>
          {t('media.put', { n: reaches.length })}
        </button>
        <p role="status">
          {field === null ? t('media.put.noColumn') : reaches.length === 0 ? t('media.put.unmarked') : done !== null ? t('media.put.done', { n: done }) : ''}
        </p>
      </aside>
    </div>
  )
}
