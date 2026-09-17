import { useMemo, useRef, useState } from 'react'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { Crown, CrownBox, CrownDrawer, CrownFoot } from './Crown.js'
import { iconFieldsOf, previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { CATEGORIES, INK, LIBRARY, searchSymbols, symbolName, symbolPreview, type GameSymbol } from './symbols.js'
import { ROLE_MIN_CONTRAST, groundOf, iconsIn, iconsUsed, paletteIssues, rolesUsed } from './palette.js'
import { contrastRatio } from '@byd/template'
import type { ProjectClient } from './ProjectClient.js'
import { useT, type Key } from '../i18n/index.js'

// The symbol library (E4), from the prototype: the library is a surface of its own, with search,
// categories and the licence on every symbol. Taking one in names it in the project's icon set,
// which is what `{namn}` in card text looks up (L2). The set stands beside the library with what
// to write, what each symbol is licensed under, and which cards use it.
export type SymbolPanelProps = { doc: ProjectDoc; client: ProjectClient; assetBase: string }

export function SymbolPanel({ doc, client, assetBase }: SymbolPanelProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Which cards the deck below shows (#178): one symbol, or the whole deck as a choice of its own.
  // It used to show every card in the game, always — a deck of 308 under a line saying the game
  // had no symbols yet, each one compiled by the card renderer. The tab is about symbols and where
  // they are said, so what it draws is what says the symbol in hand.
  const [showing, setShowing] = useState<string | null>(null)
  const categoryBox = useRef<HTMLButtonElement>(null)
  const found = searchSymbols(query, category, t)
  const front = doc.template.faces['front']
  // What the deck below is compiled from, worked out once per document. Both of these build a
  // fresh object every call, and a fresh object is a fresh compile of every card in the deck —
  // so without this, searching the library recompiles the whole deck on every keystroke.
  const icons = useMemo(() => previewIcons(doc, assetBase), [doc, assetBase])
  const fonts = useMemo(() => previewFonts(doc, assetBase), [doc, assetBase])
  // Which symbols each card says, by the same walk the set beside the library counts with, so the
  // tally on a chip and the cards under it can never disagree.
  const bare = useMemo(() => iconFieldsOf(doc), [doc])
  const said = useMemo(() => doc.rows.map((r) => ({ row: r, icons: iconsIn(r.fields, bare) })), [doc.rows, bare])
  const names = Object.keys(doc.icons)
  // The symbol in hand: the first in the set until one is picked, so the tab opens on a symbol and
  // never on the whole deck. A set that loses the symbol being shown falls back the same way.
  const chosen = showing !== null && (showing === ALL || names.includes(showing)) ? showing : (names[0] ?? null)
  const shown = chosen === null ? [] : chosen === ALL ? said : said.filter((c) => c.icons.has(chosen))
  const take = (symbol: GameSymbol) => {
    void client.useSymbol(symbol, undefined, t).catch((err: unknown) => setNotice(err instanceof Error ? err.message : String(err)))
  }
  return (
    <div className="byd-symbols" data-symbol-panel>
      {/* The crown (#128, variant B). The search and the categories used to stand inside the
          library column, which is why that column grew a scroll bar of its own inside a panel that
          was already scrolling — two bars for one gesture. They belong to the panel, so they are
          the panel's crown, and the library below is free to be part of the one thing that
          scrolls here. */}
      <Crown>
        <input
          className="byd-crown-search"
          type="search"
          aria-label={t('symbols.search')}
          placeholder={t('symbols.search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <CrownBox
          name={t('symbols.category')}
          state={category === null ? t('symbols.all') : t(category as Key)}
          open={open}
          onToggle={() => setOpen((now) => !now)}
          boxRef={categoryBox}
        />
      </Crown>
      {open && (
        <CrownDrawer label={t('symbols.categories')} opener={categoryBox} onClose={() => setOpen(false)}>
          <button type="button" className="byd-choice" aria-pressed={category === null} onClick={() => setCategory(null)}>
            {t('symbols.all')}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="byd-choice" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {t(c)}
            </button>
          ))}
        </CrownDrawer>
      )}
      <div className="byd-symbols-work">
        <aside className="byd-symbols-library">
          <h2>{t('symbols.library')}</h2>
          <p>{t('symbols.lead')}</p>
          {found.length === 0 ? (
            <p className="byd-symbols-empty">{t('symbols.none')}</p>
          ) : (
            <div className="byd-symbols-grid">
              {found.map((s) => (
                <button key={s.id} type="button" className="byd-symbols-tile" aria-label={t('symbols.take', { name: symbolName(s, t) })} onClick={() => take(s)}>
                  <img src={symbolPreview(s)} alt="" />
                  <span>{symbolName(s, t)}</span>
                  <small>{s.licence}</small>
                </button>
              ))}
            </div>
          )}
          {notice && <p role="alert">{notice}</p>}
        </aside>
        <div className="byd-symbols-main">
          <ProjectSet doc={doc} client={client} assetBase={assetBase} />
          <GameColours doc={doc} client={client} />
          {/* The chips, and under them the cards that say what is chosen. A game with no symbol at
              all draws neither: there is nothing to ask about, and the set above already says what
              to do instead. */}
          {names.length > 0 && (
            <section className="byd-symbols-deck">
              <h2>{t('symbols.deck')}</h2>
              <div className="byd-symbols-chips" role="group" aria-label={t('symbols.deck')}>
                {names.map((name) => (
                  <button key={name} type="button" className="byd-choice" aria-pressed={chosen === name} onClick={() => setShowing(name)}>
                    {name} <small>{said.filter((c) => c.icons.has(name)).length}</small>
                  </button>
                ))}
                <button type="button" className="byd-choice" aria-pressed={chosen === ALL} onClick={() => setShowing(ALL)}>
                  {t('symbols.deck.all')}
                </button>
              </div>
              {shown.length === 0 && <p className="byd-symbols-empty">{t('symbols.deck.unused')}</p>}
              <div className="byd-wall" role="list">
                {front &&
                  shown.map(({ row: r }) => (
                    <div key={r.id} role="listitem" className="byd-wall-card" data-card-ref={r.id}>
                      <CardPreview id={`sym-${r.id}`} face={front} row={r.fields} icons={icons} fonts={fonts} assetBase={assetBase} palette={doc.palette} scale={0.55} />
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <CrownFoot>
        <span>{t('symbols.foot', { n: found.length, of: SYMBOL_COUNT, m: Object.keys(doc.icons).length })}</span>
      </CrownFoot>
    </div>
  )
}

// The game's own set: what to write, what it is licensed under, and where it is already used.
function ProjectSet({ doc, client, assetBase }: SymbolPanelProps) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const names = Object.keys(doc.icons)
  // Counted by the same walk the palette uses, so a symbol written in a meaning still counts. The
  // old check looked for `{namn}` exactly and told a deck that had painted every one of its
  // symbols that it used none of them.
  const used = iconsUsed(doc.rows, iconFieldsOf(doc))
  if (names.length === 0) return <p className="byd-symbols-empty">{t('symbols.set.none')}</p>
  return (
    <section className="byd-symbols-set">
      <h2>{t('symbols.inGame')}</h2>
      <ul aria-label={t('symbols.inGame')}>
        {names.map((name) => {
          const credit = doc.credits?.[name]
          const n = used[name] ?? 0
          return (
            <li key={name} data-icon={name}>
              <img src={iconSrc(doc.icons[name] ?? '', assetBase)} alt="" />
              <code>{`{${name}}`}</code>
              <input
                aria-label={t('symbols.rename', { name })}
                defaultValue={name}
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  if (!next || next === name) return
                  try {
                    client.renameIcon(name, next)
                    setError(null)
                  } catch (err) {
                    e.target.value = name
                    setError(err instanceof Error ? err.message : String(err))
                  }
                }}
              />
              <small>{credit ? `${credit.licence} · ${credit.by}` : t('symbols.own')}</small>
              <small>{t(n === 1 ? 'wall.cards.one' : 'wall.cards.other', { n })}</small>
              <button type="button" aria-label={t('symbols.remove', { name })} onClick={() => client.removeIcon(name)}>
                ×
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// A symbol in the set is one of the project's assets; anything else is a URL as it stands.
const iconSrc = (url: string, assetBase: string): string => (url.startsWith('asset:') ? `${assetBase}/assets/${url.slice('asset:'.length)}` : url)

// The whole deck, as a choice beside the symbols. A name no symbol can have, because a symbol's
// name is what goes between the braces in card text and a space cannot.
const ALL = 'hela leken'

export const SYMBOL_COUNT = LIBRARY.length

// The inks a meaning may be painted in. A palette and not a colour wheel: naming a meaning should
// not begin with inventing a colour, and every one of these clears the graphic's 3:1 on paper.
// A deck that wants its own shade writes the hex; this is the path that has to be short.
export const INKS: readonly { hex: string; name: Key }[] = [
  { hex: INK, name: 'symbols.ink.black' },
  { hex: '#8f2d20', name: 'symbols.ink.rust' },
  { hex: '#a8410c', name: 'symbols.ink.ember' },
  { hex: '#7a5c00', name: 'symbols.ink.gold' },
  { hex: '#2f6136', name: 'symbols.ink.grove' },
  { hex: '#155e75', name: 'symbols.ink.deep' },
  { hex: '#3b3a86', name: 'symbols.ink.night' },
  { hex: '#6b2d5c', name: 'symbols.ink.plum' },
]

// The game's own colours (E4): a meaning, what it is painted in, and how many cards say it. The
// cards write the meaning and never the colour, so repainting a deck happens here and nowhere
// else — and so does hearing that a colour cannot be read, or that two meanings have become one.
function GameColours({ doc, client }: { doc: ProjectDoc; client: ProjectClient }) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const palette = doc.palette ?? {}
  const roles = Object.entries(palette)
  const ground = groundOf(doc, 'front')
  const used = rolesUsed(doc.rows)
  const issues = paletteIssues(palette, ground)
  // A new meaning starts on an ink the deck is not already using, so naming one is one press.
  const add = () => {
    const free = INKS.find((ink) => !roles.some(([, hex]) => hex.toLowerCase() === ink.hex.toLowerCase())) ?? { hex: INK, name: 'symbols.ink.black' as const }
    let name = t('symbols.colours.new')
    for (let n = 2; palette[name] !== undefined; n++) name = `${t('symbols.colours.new')}-${n}`
    say(() => client.setRole(name, free.hex))
  }
  const say = (change: () => void) => {
    try {
      change()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <section className="byd-symbols-colours">
      <h2>{t('symbols.colours')}</h2>
      <p className="byd-symbols-lead">{t('symbols.colours.lead')}</p>
      {roles.length === 0 ? (
        <p className="byd-symbols-empty">{t('symbols.colours.none')}</p>
      ) : (
        <ul aria-label={t('symbols.colours')}>
          {roles.map(([role, hex]) => {
            const n = used[role] ?? 0
            const ratio = contrastRatio(hex, ground)
            return (
              <li key={role} data-role={role} data-faint={ratio < ROLE_MIN_CONTRAST}>
                <span className="byd-symbols-swatch" style={{ background: hex }} />
                <input
                  aria-label={t('symbols.colours.rename', { role })}
                  defaultValue={role}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (!next || next === role) return
                    try {
                      client.renameRole(role, next)
                      setError(null)
                    } catch (err) {
                      e.target.value = role
                      setError(err instanceof Error ? err.message : String(err))
                    }
                  }}
                />
                <div className="byd-symbols-inks" role="group" aria-label={t('symbols.colours.inks', { role })}>
                  {INKS.map((ink) => (
                    <button
                      key={ink.hex}
                      type="button"
                      aria-pressed={hex.toLowerCase() === ink.hex.toLowerCase()}
                      aria-label={t('symbols.colours.paint', { role, ink: t(ink.name) })}
                      onClick={() => say(() => client.setRole(role, ink.hex))}
                    >
                      <span style={{ background: ink.hex }} />
                    </button>
                  ))}
                </div>
                <small>{t(n === 1 ? 'wall.cards.one' : n === 0 ? 'symbols.colours.unused' : 'wall.cards.other', { n })}</small>
                <small>{t('symbols.colours.ratio', { ratio: ratio.toFixed(1) })}</small>
                <button type="button" aria-label={t('symbols.colours.remove', { role })} onClick={() => say(() => client.removeRole(role))}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button type="button" className="byd-symbols-add" onClick={add}>
        {t('symbols.colours.add')}
      </button>
      {issues.map((issue) => (
        <p key={`${issue.code}-${issue.role}`} role="alert" className="byd-symbols-issue">
          {issue.code === 'too-faint'
            ? t('symbols.colours.faint', { role: issue.role, min: ROLE_MIN_CONTRAST })
            : t('symbols.colours.collide', { a: issue.with, b: issue.role, blindness: t(`wall.eye.${issue.blindness}`) })}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
