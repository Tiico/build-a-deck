import { useId, useMemo, useState } from 'react'
import { WHOLE_PICTURE, showsWholePicture, type AssetCrop } from '@byd/protocol'
import { croppedMotif, type Motif } from '@byd/template'
import type { ProjectDoc, ProjectRow } from './types.js'
import { assetRef, assetUrl, imageFieldsOf, mediaInGame, previewIcons } from './assets.js'
import { setColumn } from './selection.js'
import { useMarked } from './marked.js'
import { fieldLabel } from './fields.js'
import { Crop } from './Crop.js'
import { previewFonts } from './fonts.js'
import { CardPreview } from './CardPreview.js'
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
//
// The crop is cut here (beslut 2): a picture is cropped once and every card drawn from it shows
// that window, which is what makes a library worth having rather than a hundred and fifty-four
// drags. Beside the window stands the card itself, through the compiler the table and the printer
// use — so what is judged is the card and not a drawing of one.
export type MediaPanelProps = {
  doc: ProjectDoc
  assetBase: string
  // What is drawn inside each of the deck's pictures (E1), keyed by the URL a resolved row
  // carries. The card beside the crop needs them for the same reason every other preview does,
  // and the file's own size is what turns a window in shares into one in pixels.
  motifs?: Record<string, Motif> | undefined
  // The whole list of rows at once, exactly as the card table's own bulk changes travel (#17):
  // one picture onto a marked selection is one version and one step back.
  onReplaceRows(rows: ProjectRow[]): void
  // The window this picture is looked at through, for every card drawn from it. `null` is the
  // picture going back to whole.
  onCrop?: ((hash: string, crop: AssetCrop | null) => void) | undefined
}

export function MediaPanel({ doc, assetBase, motifs, onReplaceRows, onCrop }: MediaPanelProps) {
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
  // The window being cut, which is not the same thing as the window that is stored: a drag is
  // hundreds of positions and one edit, and the card beside has to follow every one of them.
  // Held by the picture it belongs to, so choosing another picture shows that one's own window.
  const [drafted, setDrafted] = useState<{ hash: string; crop: AssetCrop } | null>(null)
  const stored = chosen === null ? undefined : doc.pictures?.[chosen]?.crop
  const window_ = drafted?.hash === chosen ? drafted.crop : (stored ?? WHOLE_PICTURE)
  const cut = (crop: AssetCrop, settled: boolean) => {
    if (chosen === null) return
    setDrafted({ hash: chosen, crop })
    if (settled) onCrop?.(chosen, crop)
  }
  return (
    <div className="byd-media" data-media-panel>
      <section>
        <h2>{t('media.title')}</h2>
        <ul className="byd-media-grid" aria-label={t('media.title')}>
          {media.map(({ hash, cards }) => {
            const spare = cards.length === 0
            // What is stored, not what is being dragged: the tile says how the picture stands in
            // the game, and the window on its way somewhere is shown where it is being cut.
            const cropped = doc.pictures?.[hash]?.crop
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
                  <span className="byd-media-tile-shot">
                    <img loading="lazy" src={assetUrl(assetBase, hash)} alt={spare ? t('media.picture.unused') : t('table.image.alt', { cards: cards.join(', ') })} />
                    {/* A cropped picture says so where it is looked over, rather than only where
                        it is opened: what has been done to a picture is half of what a library
                        is for. An uncropped one wears nothing, so the mark means something. */}
                    {cropped && (
                      <u data-window style={{ left: `${cropped.x * 100}%`, top: `${cropped.y * 100}%`, width: `${cropped.w * 100}%`, height: `${cropped.h * 100}%` }} />
                    )}
                  </span>
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
      {/* The picture in hand: the window being cut, the card it lands on, and the way from it to
          the deck's rows — one column, in the order the approved prototype put them. */}
      <div className="byd-media-side">
        {chosen !== null && onCrop && (
          <Cropping
            doc={doc}
            assetBase={assetBase}
            motifs={motifs}
            hash={chosen}
            field={field}
            crop={window_}
            stored={stored}
            onCut={cut}
            onWhole={() => {
              setDrafted(null)
              onCrop(chosen, null)
            }}
          />
        )}
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
    </div>
  )
}

// The picture in hand, and what the deck sees of it. The window on the left is the whole file
// with the crop lit over it; the card below is that crop arriving where it is going.
//
// The card is a real compile and not a drawing of a card (E2): the same `compile` the table's
// textures and the print PDF come out of, handed the very window the designer is dragging. A
// second way of showing "what lands on the card" is a second way of being wrong about it.
function Cropping({
  doc,
  assetBase,
  motifs,
  hash,
  field,
  crop,
  stored,
  onCut,
  onWhole,
}: {
  doc: ProjectDoc
  assetBase: string
  motifs: Record<string, Motif> | undefined
  hash: string
  field: string | null
  crop: AssetCrop
  stored: AssetCrop | undefined
  onCut(crop: AssetCrop, settled: boolean): void
  onWhole(): void
}) {
  const t = useT()
  const url = assetUrl(assetBase, hash)
  // The type the game is pinned to (B3), so the card beside the window is set the way it prints.
  const fonts = useMemo(() => previewFonts(doc, assetBase), [doc, assetBase])
  // A picture nothing has measured has no size here either, and the window is then laid over a
  // box of the commonest shape rather than over a claim about the file.
  const file = motifs?.[url]
  const face = Object.values(doc.template.faces)[0]
  // The card the picture is already on, so the window is judged against this game's own text and
  // not against an empty template. A picture no card is drawn from yet is shown on a bare card.
  const on = field === null ? undefined : doc.rows.find((row) => row.fields[field] === assetRef(hash))
  const row = field === null ? undefined : (on?.fields ?? { [field]: assetRef(hash) })
  return (
    <section className="byd-media-crop" aria-label={t('media.crop')}>
      <h2>{t('media.crop')}</h2>
      {/* Beslut 2 said where the crop belongs; this is that decision said out loud, where the
          designer is about to act on it. Without it the window looks like something done to this
          one card, which is the very thing the library exists to stop being true. */}
      <p className="byd-media-crop-lead">{t('media.crop.lead')}</p>
      <Crop url={url} ratio={file && file.h > 0 ? file.w / file.h : 3 / 2} crop={crop} onChange={onCut} />
      <button type="button" className="byd-secondary" disabled={stored === undefined} onClick={onWhole}>
        {t('media.crop.whole')}
      </button>
      {face && row && (
        <figure className="byd-media-crop-card">
          <CardPreview
            id="byd-crop-card"
            fonts={fonts}
            face={face}
            row={row}
            icons={previewIcons(doc, assetBase)}
            assetBase={assetBase}
            // A window that shows all of the picture is not a crop, here either: the card then
            // gets the measurement untouched, air and all, exactly as it will when it is printed.
            motifs={file && !showsWholePicture(crop) ? { ...motifs, [url]: croppedMotif(file, crop) } : motifs}
            palette={doc.palette}
            scale={0.7}
          />
          <figcaption>{t('media.crop.card')}</figcaption>
        </figure>
      )}
    </section>
  )
}
