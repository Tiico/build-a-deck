import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n/index.js'
import { type CatalogFamily, isVariable, parseCatalog, sampleSheetHref, searchCatalog } from './font-catalog.js'
import { useFocusTrap } from './focusTrap.js'
import type { CardWords } from './fonts.js'

// «Provraden» — variant C of the three rooms prototyped for #329, and the one the owner chose
// (L27). A sheet under the card where every hit sets the card's own heading *and* its rule text,
// in the card's own grade: a family name in nineteen points looks well in nearly anything, and
// the hard test is twelve-point body copy on a 63 mm card.
//
// The price is stated in L27 and is not conjured away here: the sheet is 62 % of the canvas, the
// card moves up when it opens, and the card's lower third is hidden while the designer chooses.
//
// Nothing about the catalog is fetched before this component mounts, and this component is
// mounted only by the designer pressing the button. That is the measured criterion in #329 and
// the boundary in DRIFT §12: the list itself is behind a dynamic import, and the samples are one
// stylesheet asked for from here.

// How many hits a page of the sheet shows, and therefore how many faces are asked for. The
// catalog is eighteen hundred families; a sheet that drew them all would ask Google for a URL no
// server would answer and draw a list nobody reads past the top of. The prototype showed
// twenty-four and that is what was approved.
const PAGE = 24

const CATEGORIES = ['alla', 'serif', 'sans', 'display', 'handskrift', 'mono'] as const

export type FontCatalogProps = {
  words: CardWords | null
  // The families the project already holds, so a hit already taken says so rather than offering
  // to be taken twice.
  inGame: string[]
  onChoose(family: CatalogFamily): Promise<void>
  onClose(): void
}

export function FontCatalog({ words, inGame, onChoose, onClose }: FontCatalogProps) {
  const t = useT()
  const [all, setAll] = useState<CatalogFamily[] | null>(null)
  const [failed, setFailed] = useState(false)
  // What went wrong bringing a family home, said where the family was pressed (L27).
  const [refused, setRefused] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('alla')
  const sheet = useRef<HTMLDivElement | null>(null)
  const search = useRef<HTMLInputElement | null>(null)
  useFocusTrap(sheet, { onEscape: onClose, initial: () => search.current })

  // The list, fetched from the build and not from Google — and only now, because this component
  // exists only while the picker is open.
  useEffect(() => {
    let standing = true
    void import('./google-fonts.js')
      .then(({ GOOGLE_FONTS }) => standing && setAll(parseCatalog(GOOGLE_FONTS)))
      .catch(() => standing && setFailed(true))
    return () => {
      standing = false
    }
  }, [])

  const hits = useMemo(() => (all ? searchCatalog(all, { query, category }) : []), [all, query, category])
  const shown = useMemo(() => hits.slice(0, PAGE), [hits])

  // The faces the samples are drawn in, in one request for the whole page of hits. A sheet per
  // search and not per row: twenty-four rows is one round trip, which is also what makes the
  // traffic countable in the gate that proves nothing went out before this.
  const href = sampleSheetHref(shown)
  useEffect(() => {
    if (href === null) return
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href })
    // A catalog that does not answer is said in the panel and not passed over in silence (L27).
    link.addEventListener('error', () => setFailed(true))
    document.head.append(link)
    return () => link.remove()
  }, [href])

  return (
    <div className="byd-font-catalog" role="dialog" aria-modal="true" aria-label={t('fonts.catalog.title')} ref={sheet}>
      <header>
        <label className="byd-font-catalog-search">
          <span className="byd-offscreen">{t('fonts.catalog.title')}</span>
          <input ref={search} type="search" value={query} placeholder={t('fonts.catalog.search', { count: String(all?.length ?? 0) })} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className="byd-font-catalog-close" onClick={onClose}>
          {t('fonts.catalog.close')}
        </button>
        <div className="byd-font-catalog-kinds" role="group" aria-label={t('fonts.catalog.category')}>
          {CATEGORIES.map((kind) => (
            <button key={kind} type="button" aria-pressed={kind === category} onClick={() => setCategory(kind)}>
              {t(`fonts.catalog.category.${kind}` as 'fonts.catalog.category.alla')}
            </button>
          ))}
        </div>
      </header>
      {failed ? (
        <p className="byd-font-catalog-said" role="alert">
          {t('fonts.catalog.failed')}
        </p>
      ) : all === null ? (
        <p className="byd-font-catalog-said" role="status">
          {t('fonts.catalog.loading')}
        </p>
      ) : shown.length === 0 ? (
        <p className="byd-font-catalog-said">{t('fonts.catalog.none')}</p>
      ) : (
        <ul className="byd-font-catalog-hits" aria-label={t('fonts.catalog.hits')}>
          {shown.map((family) => (
            <Hit key={family.family} family={family} words={words} taken={inGame.includes(family.family)} onChoose={onChoose} onRefused={setRefused} />
          ))}
        </ul>
      )}
      {refused !== null && (
        <p className="byd-font-catalog-said" role="alert">
          {refused}
        </p>
      )}
      <footer>
        <span>{t('fonts.catalog.foot')}</span>
        <span className="byd-font-catalog-count">{all === null ? '' : t('fonts.catalog.count', { shown: String(shown.length), all: String(hits.length) })}</span>
      </footer>
    </div>
  )
}

// One hit. The sample is the card's own words in the family's own face — which is the whole of
// why C was chosen over A and B — and the meta line under it is what the project would take on:
// the licence a catalog entry knows and an uploaded file does not.
function Hit({ family, words, taken, onChoose, onRefused }: { family: CatalogFamily; words: CardWords | null; taken: boolean; onChoose(family: CatalogFamily): Promise<void>; onRefused(why: string | null): void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  // The face is asked for by name; the stylesheet the sheet fetched is what makes it the real
  // one rather than a fallback.
  const face = `"${family.family}", serif`
  return (
    <li data-family={family.family}>
      {words && (
        <>
          <span className="byd-font-catalog-heading" style={{ fontFamily: face, fontSize: `${words.heading.sizePt}pt` }}>
            {words.heading.text}
          </span>
          <span className="byd-font-catalog-body" style={{ fontFamily: face, fontSize: `${words.body.sizePt}pt` }}>
            {words.body.text}
          </span>
        </>
      )}
      <span className="byd-font-catalog-meta">
        {t('fonts.catalog.meta', { family: family.family, licence: family.licence })}
        {isVariable(family) ? t('fonts.catalog.variable') : ''}
      </span>
      <button
        type="button"
        disabled={taken || busy}
        onClick={() => {
          setBusy(true)
          onRefused(null)
          void onChoose(family)
            .catch((err: unknown) => onRefused(err instanceof Error ? err.message : String(err)))
            .finally(() => setBusy(false))
        }}
      >
        {taken ? t('fonts.catalog.taken', { family: family.family }) : t('fonts.catalog.add', { family: family.family })}
      </button>
    </li>
  )
}
