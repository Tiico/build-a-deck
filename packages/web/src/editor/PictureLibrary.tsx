import { useId, useRef, useState } from 'react'
import { assetUrl } from './assets.js'
import { useFocusTrap } from './focusTrap.js'
import { useT } from '../i18n/index.js'

// The library dialog (#296, variant B, chosen by the requester 2026-09-20). The game's pictures
// in one large, centred window, opened from a picture cell or from the marked cards in Data, so
// that a picture already in the game reaches a card without a walk to the Media tab and back.
//
// It writes nothing by itself. Picking a picture is picking; the footer says which picture is in
// hand and what the press will replace, and one explicit button — «Använd bilden», or «Använd på
// N kort» — is the only thing that applies it. Avbryt, the × and Escape close it with nothing
// changed. What it applies is a hash: the same asset reference the picture already has, so a
// picture on ninety more cards is ninety cells and no upload (E1).
//
// It is a component of its own and not a corner of the table: a target sentence, the pictures,
// how many things the press reaches and how many of them already hold a picture, and two
// callbacks. The template's fixed picture (#320) is the next thing that will open it, and it
// must be able to without the table's state coming along.
export type LibraryPicture = {
  hash: string
  // What the file was called, where that was kept (L22, beslut 6). A picture from before names
  // falls back to the cards drawn from it, and one nothing uses says so.
  name: string | undefined
  cards: readonly string[]
  // Whether the template draws it by itself (#320), which is a use even where no card names it.
  template?: boolean | undefined
}

export type PictureLibraryDialogProps = {
  // What the picture lands on, in words: the card and its field, or the marked cards and the
  // column. Said by the caller, because only the caller knows what it is about.
  target: string
  // How many things the press reaches, which is what the button counts.
  count: number
  // How many of them already hold a picture, which is what the footer warns about.
  replacing: number
  pictures: readonly LibraryPicture[]
  assetBase: string
  onApply(hash: string): void
  onClose(): void
  // The way in from here (#320): a file the designer brings, answered with the hash it was filed
  // under, by the same path Media takes — so the picture lands in the library and the window then
  // holds it. Only an opener that can take one offers it; Data's windows stay what they were.
  onUpload?: ((file: File) => Promise<string>) | undefined
}

export function PictureLibraryDialog({ target, count, replacing, pictures, assetBase, onApply, onClose, onUpload }: PictureLibraryDialogProps) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // The focus opens on the search when there is anything to search, because finding a picture
  // is what the window is for; an empty library opens on its close, which is the only way on.
  useFocusTrap(box, { onEscape: onClose, initial: () => search.current })
  const [query, setQuery] = useState('')
  const [unusedOnly, setUnusedOnly] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const nameOf = (p: LibraryPicture): string => p.name ?? (p.cards.length === 0 ? t('media.picture.unused') : t('table.image.alt', { cards: p.cards.join(', ') }))
  const needle = query.trim().toLowerCase()
  const shown = pictures.filter((p) => (!unusedOnly || p.cards.length === 0) && (needle === '' || nameOf(p).toLowerCase().includes(needle)))
  const chosen = picked === null ? undefined : pictures.find((p) => p.hash === picked)
  // What the upload said when it did not land. Said where the picture in hand is said, in the
  // same live region: a designer who cannot see the grid has nothing else to tell her.
  const [refused, setRefused] = useState<string | null>(null)
  const take = async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    // Cleared at once, so choosing the same file again is a choice and not a silence.
    input.value = ''
    if (!file || !onUpload) return
    setRefused(null)
    try {
      setPicked(await onUpload(file))
    } catch (err) {
      setRefused(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="byd-library-veil">
      <div ref={box} className="byd-library" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="byd-library-head">
          <h2 id={`${id}-title`}>{t('table.images')}</h2>
          {/* A label around an off-screen input, as every other file in the tool is chosen: a tab
              stop with a name, so the picture can be brought in without a pointer. */}
          {onUpload && (
            <label className="byd-secondary byd-library-upload">
              {t('library.upload')}
              <input className="byd-offscreen" type="file" accept="image/*" aria-label={t('library.upload')} onChange={(event) => void take(event.target)} />
            </label>
          )}
          <button type="button" className="byd-library-close" aria-label={t('library.close')} onClick={onClose}>
            ×
          </button>
        </header>
        <p className="byd-library-target">{target}</p>
        {pictures.length === 0 ? (
          <p className="byd-library-empty">{t(onUpload ? 'library.none.upload' : 'library.none')}</p>
        ) : (
          <>
            <div className="byd-library-find">
              <input ref={search} type="search" aria-label={t('library.search')} placeholder={t('library.search.placeholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
              <div role="group" aria-label={t('library.filter')} className="byd-library-filter">
                <button type="button" className="byd-choice" aria-pressed={!unusedOnly} onClick={() => setUnusedOnly(false)}>
                  {t('library.filter.all')}
                </button>
                <button type="button" className="byd-choice" aria-pressed={unusedOnly} onClick={() => setUnusedOnly(true)}>
                  {t('library.filter.unused')}
                </button>
              </div>
            </div>
            {/* The grid is the one thing that scrolls: the target above it and the actions under
                it stay where they are, whatever size the library has grown to. */}
            <div className="byd-library-scroll">
              {shown.length === 0 ? (
                <p className="byd-library-empty">{t('library.noHits')}</p>
              ) : (
                <ul className="byd-library-grid">
                  {shown.map((p) => (
                    <li key={p.hash} {...(p.cards.length === 0 ? { 'data-unused': 'true' } : {})}>
                      <button type="button" className="byd-library-tile byd-choice" data-asset={p.hash} aria-pressed={picked === p.hash} aria-label={nameOf(p)} onClick={() => setPicked(p.hash)}>
                        <img loading="lazy" src={assetUrl(assetBase, p.hash)} alt="" />
                        <span>{nameOf(p)}</span>
                        <small>{p.cards.length === 0 ? t('media.unused') : t(p.cards.length === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: p.cards.length })}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        <footer className="byd-library-foot">
          <div className="byd-library-said" role="status">
            {refused !== null ? (
              <em>{refused}</em>
            ) : chosen ? (
              <>
                <img src={assetUrl(assetBase, chosen.hash)} alt="" />
                <span>{t('library.chosen', { name: nameOf(chosen) })}</span>
                {replacing > 0 && <em>{t(count === 1 ? 'library.replacing.one' : 'library.replacing.other', { n: replacing })}</em>}
              </>
            ) : (
              <span>{t('library.chosen.none')}</span>
            )}
          </div>
          <button type="button" className="byd-primary" disabled={!chosen} onClick={() => chosen && onApply(chosen.hash)}>
            {count === 1 ? t('library.use') : t('library.use.many', { n: count })}
          </button>
          <button type="button" className="byd-secondary" onClick={onClose}>
            {t('editor.cancel')}
          </button>
        </footer>
      </div>
    </div>
  )
}
