import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLang, useT, type Key } from '../i18n/index.js'
import { saidOr } from '../i18n/said.js'
import { loadIconCatalog, searchIcons, type CatalogIcon, type IconSource } from './icon-catalog.js'
import { useFocusTrap } from './focusTrap.js'
import { INK } from './symbols.js'

// The icon libraries' sheet (#1087, L71, beslut A): the typeface catalog's form (L27), standing
// under the card in Mall, so a library looks the same whether it holds families or icons. It is
// opened for one thing — the layer's icon, or its icon for one value of a column — and says which.
//
// Nothing about the libraries is loaded before this component mounts, and it is mounted only by the
// designer pressing for it: the catalog is behind `loadIconCatalog`'s dynamic import.

// A page of hits. Seven to a row in the sheet under the card at 1280, nine rows: enough to find
// a sword among swords, and few enough that the samples cost nothing to draw.
const PAGE = 63

type Shelf = 'alla' | 'spelet' | IconSource
const SHELVES: readonly Shelf[] = ['alla', 'spelet', 'deckster', 'game-icons', 'lucide']

// An icon the game already holds: what the card text writes, and where its file is drawn from.
export type GameIcon = { name: string; src: string }

export type IconChoice = { inGame: string } | { icon: CatalogIcon }

export type IconCatalogProps = {
  inGame: readonly GameIcon[]
  // What every sample is painted in: the colour the layer will wear where the icon is going, or
  // the tool's ink for a layer without one (E4).
  colour: string | undefined
  // The card's paper, which every sample stands on (L34).
  paper: string
  // What the icon is being chosen for, in words: «för alla kort», «för typ = Anfall».
  target: string
  onChoose(choice: IconChoice): Promise<void>
  onClose(): void
}

const fileUrl = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

export function IconCatalog({ inGame, colour, paper, target, onChoose, onClose }: IconCatalogProps) {
  const t = useT()
  const { lang } = useLang()
  const [all, setAll] = useState<CatalogIcon[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState<Shelf>('alla')
  const sheet = useRef<HTMLDivElement | null>(null)
  const search = useRef<HTMLInputElement | null>(null)
  useFocusTrap(sheet, { onEscape: onClose, initial: () => search.current })

  useEffect(() => {
    let standing = true
    loadIconCatalog(lang).then(
      (icons) => standing && setAll(icons),
      () => standing && setFailed(true),
    )
    return () => {
      standing = false
    }
  }, [lang])

  // The game's own icons are searched by the name the game gave them, which is the designer's word.
  const own = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inGame.filter((g) => q === '' || g.name.toLowerCase().includes(q))
  }, [inGame, query])
  const hits = useMemo(() => (shelf === 'spelet' || !all ? [] : searchIcons(all, { query, source: shelf }, lang)), [all, query, shelf, lang])
  const count = shelf === 'spelet' ? own.length : hits.length
  const ink = colour ?? INK

  const choose = (choice: IconChoice, name: string) => {
    setRefused(null)
    void onChoose(choice).catch((err: unknown) => setRefused(saidOr(err, t('icons.catalog.refused', { name }))))
  }

  const shelfCount = (s: Shelf): number | null => (s === 'spelet' ? inGame.length : all === null ? null : s === 'alla' ? all.length : all.filter((i) => i.source === s).length)

  return (
    <div className="byd-font-catalog byd-icon-catalog" role="dialog" aria-modal="true" aria-label={t('icons.catalog.title')} ref={sheet}>
      <header>
        <label className="byd-font-catalog-search">
          <span className="byd-offscreen">{t('icons.catalog.title')}</span>
          <input ref={search} type="search" value={query} placeholder={t('icons.catalog.search', { count: (all?.length ?? 0).toLocaleString(lang) })} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className="byd-font-catalog-close" onClick={onClose}>
          {t('icons.catalog.close')}
        </button>
        <div className="byd-font-catalog-kinds" role="group" aria-label={t('icons.catalog.source')}>
          {SHELVES.map((s) => {
            const n = shelfCount(s)
            return (
              <button key={s} type="button" aria-pressed={s === shelf} onClick={() => setShelf(s)}>
                {t(`icons.catalog.source.${s}` as Key)}
                {n !== null && <small> {n.toLocaleString(lang)}</small>}
              </button>
            )
          })}
          <span className="byd-icon-catalog-target">{target}</span>
        </div>
      </header>
      {failed ? (
        <p className="byd-font-catalog-said" role="alert">
          {t('icons.catalog.failed')}
        </p>
      ) : all === null && shelf !== 'spelet' ? (
        <p className="byd-font-catalog-said" role="status">
          {t('icons.catalog.loading')}
        </p>
      ) : count === 0 ? (
        <p className="byd-font-catalog-said">{t('icons.catalog.none')}</p>
      ) : (
        <ul className="byd-icon-catalog-hits" aria-label={t('icons.catalog.hits')}>
          {shelf === 'spelet'
            ? own.slice(0, PAGE).map((g) => (
                <Tile key={g.name} label={t('icons.catalog.tile.inGame', { name: g.name })} name={g.name} meta={t('icons.catalog.source.spelet')} src={g.src} ink={ink} paper={paper} onPress={() => choose({ inGame: g.name }, g.name)} />
              ))
            : hits.slice(0, PAGE).map((icon) => {
                const source = t(`icons.catalog.source.${icon.source}` as Key)
                return (
                  <Tile
                    key={icon.id}
                    label={t('icons.catalog.tile', { name: icon.name, source, licence: icon.licence, by: icon.by })}
                    name={icon.name}
                    meta={`${source} · ${icon.licence}`}
                    src={fileUrl(icon.svg)}
                    ink={ink}
                    paper={paper}
                    onPress={() => choose({ icon }, icon.name)}
                  />
                )
              })}
        </ul>
      )}
      {refused !== null && (
        <p className="byd-font-catalog-said" role="alert">
          {refused}
        </p>
      )}
      <footer>
        <span>{t('icons.catalog.foot')}</span>
        <span className="byd-font-catalog-count">{count === 0 || failed ? '' : t('icons.catalog.count', { shown: String(Math.min(PAGE, count)), all: count.toLocaleString(lang) })}</span>
      </footer>
    </div>
  )
}

// One hit: the icon's own shape as a mask, painted in the layer's colour on the card's paper —
// the very way the compiler draws it on the card (E4), so the sample cannot promise another icon.
function Tile({ label, name, meta, src, ink, paper, onPress }: { label: string; name: string; meta: string; src: string; ink: string; paper: string; onPress(): void }) {
  const mask = `url("${src}")`
  const sample: CSSProperties = { background: ink, WebkitMaskImage: mask, maskImage: mask }
  return (
    <li>
      <button type="button" aria-label={label} onClick={onPress}>
        <span className="byd-icon-paper" style={{ background: paper }}>
          <span className="byd-icon-sample" style={sample} />
        </span>
        <span className="byd-icon-name">{name}</span>
        <span className="byd-icon-meta">{meta}</span>
      </button>
    </li>
  )
}
