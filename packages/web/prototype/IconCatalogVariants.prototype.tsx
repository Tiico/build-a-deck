// PROTOTYP — släng mig. Ikonarket medan Game Icons och Lucide läses in: tre sätt att säga det,
// med Decksters egna symboler sökbara direkt. Kopia av src/editor/IconCatalog.tsx utan egen-ikon-
// formuläret; biblioteken hålls av sidan tills man släpper dem.
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLang, useT, type Key } from '../src/i18n/index.js'
import { decksterIcons, searchIcons, type CatalogIcon, type IconSource } from '../src/editor/icon-catalog.js'
import { useFocusTrap } from '../src/editor/focusTrap.js'

const PAGE = 63
type Shelf = 'alla' | 'spelet' | IconSource
const SHELVES: readonly Shelf[] = ['alla', 'spelet', 'deckster', 'game-icons', 'lucide']
const fileUrl = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

export type Variant = 'A' | 'B' | 'C'

const LOADING_BOTH = 'Game Icons och Lucide läses in …'
const loadingOne = (s: Shelf) => `${s === 'lucide' ? 'Lucide' : 'Game Icons'} läses in …`

export function IconCatalogVariant({ variant, libs, colour, paper, target }: { variant: Variant; libs: CatalogIcon[] | null; colour: string; paper: string; target: string }) {
  const t = useT()
  const { lang } = useLang()
  const all = useMemo(() => [...decksterIcons(lang), ...(libs ?? [])], [lang, libs])
  const loading = libs === null
  const [query, setQuery] = useState('svärd')
  const [shelf, setShelf] = useState<Shelf>('alla')
  const sheet = useRef<HTMLDivElement | null>(null)
  const search = useRef<HTMLInputElement | null>(null)
  useFocusTrap(sheet, { onEscape: () => undefined, initial: () => search.current })

  const hits = useMemo(() => (shelf === 'spelet' ? [] : searchIcons(all, { query, source: shelf }, lang)), [all, query, shelf, lang])
  const waitingShelf = loading && (shelf === 'game-icons' || shelf === 'lucide')
  const count = hits.length
  const shelfCount = (s: Shelf): number | null => (s === 'spelet' ? 0 : loading && (s === 'game-icons' || s === 'lucide') ? null : s === 'alla' ? all.length : all.filter((i) => i.source === s).length)

  return (
    <div className="byd-font-catalog byd-icon-catalog" role="dialog" aria-modal="true" aria-label={t('icons.catalog.title')} ref={sheet}>
      <header>
        <label className="byd-font-catalog-search">
          <span className="byd-offscreen">{t('icons.catalog.title')}</span>
          <input ref={search} type="search" value={query} placeholder={t('icons.catalog.search', { count: all.length.toLocaleString(lang) })} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="byd-icon-catalog-actions">
          <label className="byd-font-catalog-close byd-icon-catalog-upload">{t('icons.own.upload')}</label>
          <button type="button" className="byd-font-catalog-close">
            {t('icons.catalog.close')}
          </button>
        </div>
        <div className="byd-font-catalog-kinds" role="group" aria-label={t('icons.catalog.source')}>
          {SHELVES.map((s) => {
            const n = shelfCount(s)
            return (
              <button key={s} type="button" className="byd-choice" aria-pressed={s === shelf} onClick={() => setShelf(s)}>
                {t(`icons.catalog.source.${s}` as Key)}
                {n !== null && <small> {n.toLocaleString(lang)}</small>}
                {n === null && variant === 'C' && <small className="proto-shelf-wait"> …</small>}
              </button>
            )
          })}
          <span className="byd-icon-catalog-target">{target}</span>
        </div>
      </header>
      {variant === 'A' && loading && !waitingShelf && (
        <p className="proto-libs-line" role="status">
          {LOADING_BOTH}
        </p>
      )}
      {waitingShelf ? (
        <p className="byd-font-catalog-said" role="status">
          {loadingOne(shelf)}
        </p>
      ) : count === 0 && !(variant === 'B' && loading) ? (
        <p className="byd-font-catalog-said">{t('icons.catalog.none')}</p>
      ) : (
        <ul className="byd-icon-catalog-hits" aria-label={t('icons.catalog.hits')}>
          {hits.slice(0, PAGE).map((icon) => {
            const source = t(`icons.catalog.source.${icon.source}` as Key)
            return <Tile key={icon.id} label={t('icons.catalog.tile', { name: icon.name, source, licence: icon.licence, by: icon.by })} name={icon.name} meta={`${source} · ${icon.licence}`} src={fileUrl(icon.svg)} ink={colour} paper={paper} />
          })}
          {variant === 'B' && loading && shelf !== 'deckster' && (
            <li className="proto-libs-tile" role="status">
              <span className="proto-libs-ghosts" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {LOADING_BOTH}
            </li>
          )}
        </ul>
      )}
      <footer>
        <span>{t('icons.catalog.foot')}</span>
        <span className="byd-font-catalog-count">
          {count === 0 ? '' : t('icons.catalog.count', { shown: String(Math.min(PAGE, count)), all: count.toLocaleString(lang) })}
          {variant === 'C' && loading && (
            <span role="status">
              {count === 0 ? '' : ' · '}
              {LOADING_BOTH}
            </span>
          )}
        </span>
      </footer>
    </div>
  )
}

function Tile({ label, name, meta, src, ink, paper }: { label: string; name: string; meta: string; src: string; ink: string; paper: string }) {
  const mask = `url("${src}")`
  const sample: CSSProperties = { background: ink, WebkitMaskImage: mask, maskImage: mask }
  return (
    <li>
      <button type="button" aria-label={label}>
        <span className="byd-icon-paper" style={{ background: paper }}>
          <span className="byd-icon-sample" style={sample} />
        </span>
        <span className="byd-icon-name">{name}</span>
        <span className="byd-icon-meta">{meta}</span>
      </button>
    </li>
  )
}
