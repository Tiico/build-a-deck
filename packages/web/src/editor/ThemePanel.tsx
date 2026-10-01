import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { CARD_PX, cornerPx } from './corner.js'
import { iconFieldsOf, previewIcons } from './assets.js'
import { cardWords, previewFonts } from './fonts.js'
import { CATEGORIES, INK, LIBRARY, searchSymbols, symbolName, symbolPreview, type GameSymbol } from './symbols.js'
import { ROLE_MIN_CONTRAST, groundOf, iconsIn, iconsPainted, iconsUsed, paletteIssues, rolesUsed, type Painted } from './palette.js'
import { SymbolSample, SymbolSheet } from './SymbolSample.js'
import { FontShelf } from './FontShelf.js'
import { ThemeGallery } from './ThemeGallery.js'
import { FontCatalog } from './FontCatalog.js'
import { contrastRatio, elementsFor, isSymbolName } from '@byd/template'
import type { ProjectClient } from './ProjectClient.js'
import { useT, type Key } from '../i18n/index.js'
import { Help } from './HelpDrawer.js'
import { Question } from './Question.js'
import { useSay } from '../status/StatusLive.js'

// Speltema (L57, #630), in Symbolers ställe. The game's identity used to stand in three places:
// the meanings and the icon set under a library on Symboler, and the typefaces in Mall's panel,
// and there only while no layer was chosen. Here they are one tab, and each part is folded behind
// a head that carries its value while it is closed — as L25's panel sections do (#478) — so
// nothing is hidden without being said. The library is no longer the tab: it opens from Spelets
// ikoner, and a symbol taken in from it becomes one of the game's icons, its licence with it (E4).
export type ThemePanelProps = { doc: ProjectDoc; client: ProjectClient; assetBase: string }

export type ThemeSectionId = 'fonts' | 'colours' | 'icons'
const SECTION_IDS: readonly ThemeSectionId[] = ['fonts', 'colours', 'icons']

// What is open belongs to this browser and not to the game (L4's pattern for a view), and every
// part starts folded: the tab is calm for the designer who is content with her theme, and one
// press away for the one who is not (L57). One store for the whole editor, so Mall can open the
// typefaces before it hands the designer over (`revealThemeSection`).
const OPEN_KEY = 'byd.theme-open'
const listeners = new Set<() => void>()
// Read from the browser every time and parsed only when what is kept has changed, so the snapshot
// is the same object until it is not — and a store cleared under the editor is believed.
let kept: { raw: string | null; open: ReadonlySet<ThemeSectionId> } | null = null
// Where the browser keeps nothing, what is open lives here for the visit.
let unkept: ReadonlySet<ThemeSectionId> = new Set()
function openSections(): ReadonlySet<ThemeSectionId> {
  let raw: string | null
  try {
    raw = localStorage.getItem(OPEN_KEY)
  } catch {
    return unkept
  }
  if (kept?.raw === raw) return kept.open
  let open: ReadonlySet<ThemeSectionId> = new Set()
  try {
    const list = JSON.parse(raw ?? 'null') as unknown
    if (Array.isArray(list)) open = new Set(SECTION_IDS.filter((id) => list.includes(id)))
  } catch {
    // Something else under the key: start folded.
  }
  kept = { raw, open }
  return open
}
function keepOpen(next: ReadonlySet<ThemeSectionId>): void {
  unkept = next
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(SECTION_IDS.filter((id) => next.has(id))))
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
// Opens one part of the theme, wherever the hand is coming from.
export function revealThemeSection(id: ThemeSectionId): void {
  const now = openSections()
  if (!now.has(id)) keepOpen(new Set([...now, id]))
}
function toggleSection(id: ThemeSectionId): void {
  const next = new Set(openSections())
  if (next.has(id)) next.delete(id)
  else next.add(id)
  keepOpen(next)
}
function useOpenSections(): ReadonlySet<ThemeSectionId> {
  return useSyncExternalStore(subscribe, openSections, openSections)
}

// How large a card is drawn beside a symbol: small enough that a handful fit in the section,
// large enough that the symbol in the text can be seen. Stated as the zoom and once more as the
// pixels it comes to, because the tile and its corner both have to be told the same width (#332)
// — the grid used to say 150 px while the card was drawn 131, and the two disagreeing is what
// put a badge eleven pixels off the card's edge.
const SHOWN = 0.55
const SHOWN_PX = CARD_PX * SHOWN

export function ThemePanel({ doc, client, assetBase }: ThemePanelProps) {
  const t = useT()
  const open = useOpenSections()
  // What stands beside the sections: the symbol library, or the typeface catalog. One at a time,
  // in the same place, and each hands the focus back to what opened it.
  const [sheet, setSheet] = useState<'library' | 'catalog' | null>(null)
  const libraryOpener = useRef<HTMLButtonElement>(null)
  const catalogOpener = useRef<HTMLButtonElement>(null)
  const closeSheet = () => {
    const back = sheet === 'library' ? libraryOpener.current : catalogOpener.current
    setSheet(null)
    back?.focus()
  }
  const families = Object.keys(doc.fonts ?? {})
  const roles = Object.keys(doc.palette ?? {})
  const names = Object.keys(doc.icons)
  const reading = !client.mayEdit
  const icons = useMemo(() => previewIcons(doc, assetBase), [doc, assetBase])
  // The catalog sets its samples in the card's own words (L27): the first card of the deck, as the
  // wall draws it first.
  const front = doc.template.faces['front']
  const first = doc.rows[0]?.fields
  const words = useMemo(() => (front && first ? cardWords(elementsFor(front, first), first) : null), [front, first])
  return (
    <div className="byd-theme" data-theme-panel {...(sheet ? { 'data-sheet': sheet } : {})}>
      <div className="byd-theme-work">
        {/* The gallery of ready themes, and the line that says what departs from the chosen one,
            stand here above the parts a theme is made of (L57, #632). */}
        <ThemeGallery doc={doc} client={client} />
        <ThemeSection id="fonts" open={open.has('fonts')} name={t('theme.fonts')} value={families.length === 0 ? t('theme.fonts.none') : families.join(' · ')}>
          {reading ? (
            <fieldset className="byd-reading-set" disabled>
              <ThemeFonts doc={doc} client={client} onOpenCatalog={() => undefined} />
            </fieldset>
          ) : (
            <ThemeFonts doc={doc} client={client} catalogRef={catalogOpener} onOpenCatalog={() => setSheet('catalog')} />
          )}
        </ThemeSection>
        <ThemeSection
          id="colours"
          open={open.has('colours')}
          name={t('theme.colours')}
          value={roles.length === 0 ? t('theme.none') : roles.join(' · ')}
          help={
            <Help topic={t('symbols.colours.help.topic')}>
              <p>{t('symbols.colours.help')}</p>
            </Help>
          }
        >
          <GameColours doc={doc} client={client} icons={icons} />
        </ThemeSection>
        <ThemeSection id="icons" open={open.has('icons')} name={t('theme.icons')} value={names.length === 0 ? t('theme.none') : t(names.length === 1 ? 'theme.icons.count.one' : 'theme.icons.count.other', { n: names.length })}>
          <ProjectSet doc={doc} client={client} assetBase={assetBase} />
          {/* The library's only verb is taking a symbol in (#489), so a reader is not offered it. */}
          {!reading && (
            <button type="button" ref={libraryOpener} className="byd-theme-library-open byd-secondary" aria-expanded={sheet === 'library'} onClick={() => setSheet(sheet === 'library' ? null : 'library')}>
              {t('theme.library.open')}
            </button>
          )}
          <IconDeck doc={doc} assetBase={assetBase} icons={icons} />
        </ThemeSection>
      </div>
      {sheet === 'library' && <SymbolLibrary doc={doc} client={client} onClose={closeSheet} />}
      {sheet === 'catalog' && (
        <div className="byd-theme-sheet">
          <FontCatalog words={words} inGame={families} onChoose={async (family) => void (await client.useCatalogFont(family, t))} onClose={closeSheet} />
        </div>
      )}
    </div>
  )
}

// One part of the theme. The head is a disclosure button inside a heading, and while it is closed
// it says the part's value, so the folded tab still reads as the game's theme.
function ThemeSection({ id, open, name, value, help, children }: { id: ThemeSectionId; open: boolean; name: string; value: string; help?: ReactNode; children: ReactNode }) {
  const body = `byd-theme-${id}`
  return (
    <section className="byd-theme-sec" aria-label={name} data-theme-section={id}>
      <div className="byd-theme-head">
        <h2>
          <button type="button" aria-expanded={open} aria-controls={open ? body : undefined} onClick={() => toggleSection(id)}>
            <span className="byd-theme-name">{name}</span>
            {!open && <span className="byd-theme-sum">{value}</span>}
          </button>
        </h2>
        {open && help}
      </div>
      {open && (
        <div className="byd-theme-body" id={body}>
          {children}
        </div>
      )}
    </section>
  )
}

function ThemeFonts({ doc, client, catalogRef, onOpenCatalog }: { doc: ProjectDoc; client: ProjectClient; catalogRef?: Ref<HTMLButtonElement>; onOpenCatalog(): void }) {
  const t = useT()
  return (
    <FontShelf
      doc={doc}
      onFontFile={(file) => client.useFont(file, t)}
      onFontLicence={(family, licence) => client.setFontLicence(family, licence)}
      onRemoveFont={(family) => client.removeFont(family)}
      onOpenCatalog={onOpenCatalog}
      {...(catalogRef ? { catalogRef } : {})}
    />
  )
}

// The symbol library (E4), opened from Spelets ikoner (L57): search, categories and the licence on
// every symbol. Taking one in names it in the game's icon set, which is what `{namn}` in card text
// looks up (L2). It stands beside the sections rather than over them, so the set can be seen
// growing while symbols are taken in.
function SymbolLibrary({ doc, client, onClose }: { doc: ProjectDoc; client: ProjectClient; onClose(): void }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => search.current?.focus(), [])
  const found = searchSymbols(query, category, t)
  // The library's symbols the game already has, by the source its credit names (#481): the name
  // in the game is the designer's and may be anything, the source is the library's own id.
  const had = new Map(Object.entries(doc.credits ?? {}).flatMap(([name, credit]) => (doc.icons[name] !== undefined && credit.source ? [[credit.source, name] as const] : [])))
  const [hadSaid, setHadSaid] = useState<string | null>(null)
  const take = (symbol: GameSymbol) => {
    // A second press on a symbol the game has says so, rather than doing nothing without a word.
    const kept = had.get(symbol.id)
    if (kept !== undefined) return setHadSaid(t('symbols.take.had', { name: symbolName(symbol, t), as: `{${kept}}` }))
    setHadSaid(null)
    void client
      .useSymbol(symbol, undefined, t)
      // Taking it in is said where a second press is (#558): the tile changed and nothing read it.
      .then(() => setHadSaid(t('symbols.taken', { name: symbolName(symbol, t) })))
      .catch((err: unknown) => setNotice(err instanceof Error ? err.message : String(err)))
  }
  return (
    <section
      className="byd-theme-sheet byd-symbols-library"
      aria-label={t('symbols.library')}
      onKeyDown={(e) => {
        // Escape inside a help box closes the box, not the library under it.
        if (e.key !== 'Escape' || (e.target as Element).closest('.byd-help')) return
        e.preventDefault()
        onClose()
      }}
    >
      <header>
        <h2>{t('symbols.library')}</h2>
        <Help topic={t('symbols.help.topic')}>
          <p>{t('symbols.help')}</p>
        </Help>
        <button type="button" className="byd-theme-sheet-done" onClick={onClose}>
          {t('theme.library.done')}
        </button>
      </header>
      <input ref={search} className="byd-theme-search" type="search" aria-label={t('symbols.search')} placeholder={t('symbols.search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="byd-theme-kinds" role="group" aria-label={t('symbols.categories')}>
        <button type="button" className="byd-choice" aria-pressed={category === null} onClick={() => setCategory(null)}>
          {t('symbols.all')}
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className="byd-choice" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {t(c)}
          </button>
        ))}
      </div>
      <div className="byd-theme-sheet-scroll">
        {found.length === 0 ? (
          <p className="byd-symbols-empty">{t('symbols.none')}</p>
        ) : (
          <div className="byd-symbols-grid">
            {found.map((s) => (
              <button
                key={s.id}
                type="button"
                className="byd-symbols-tile"
                // A symbol the game has is named by what the tile shows (#558), since a press on it
                // no longer takes anything in: it says it is already there.
                aria-label={had.has(s.id) ? t('symbols.had.name', { name: symbolName(s, t) }) : t('symbols.take', { name: symbolName(s, t) })}
                {...(had.has(s.id) ? { 'data-had': 'true' } : {})}
                onClick={() => take(s)}
              >
                <img src={symbolPreview(s)} alt="" />
                <span>{symbolName(s, t)}</span>
                {/* In words and not only as a mark (L13): the game already has this one. */}
                {had.has(s.id) ? <small className="byd-symbols-had">{t('symbols.had')}</small> : <small>{s.licence}</small>}
              </button>
            ))}
          </div>
        )}
        {notice && <p role="alert">{notice}</p>}
        <p className="byd-symbols-note" role="status">
          {hadSaid ?? ''}
        </p>
      </div>
      <footer>{t('symbols.foot', { n: found.length, of: SYMBOL_COUNT, m: Object.keys(doc.icons).length })}</footer>
    </section>
  )
}

// The cards that say a symbol (#178): one symbol, or the whole deck as a choice of its own. The
// tab used to draw every card in the game, always — a deck of 308 under a line saying the game had
// no symbols yet, each one compiled by the card renderer. What it draws is what says the symbol in
// hand, and only while the icons are open.
function IconDeck({ doc, assetBase, icons }: { doc: ProjectDoc; assetBase: string; icons: Record<string, string> }) {
  const t = useT()
  const [showing, setShowing] = useState<string | null>(null)
  const front = doc.template.faces['front']
  // Built once per document: a fresh object is a fresh compile of every card in the deck.
  const fonts = useMemo(() => previewFonts(doc, assetBase), [doc, assetBase])
  // Which symbols each card says, by the same walk the set counts with, so the tally on a chip and
  // the cards under it can never disagree.
  const bare = useMemo(() => iconFieldsOf(doc), [doc])
  const said = useMemo(() => doc.rows.map((r) => ({ row: r, icons: iconsIn(r.fields, bare) })), [doc.rows, bare])
  // And which symbols no row says because the template paints them (#213).
  const painted = useMemo(() => iconsPainted(doc), [doc])
  const names = Object.keys(doc.icons)
  // The symbol in hand: the first in the set until one is picked, so the deck opens on a symbol and
  // never on the whole deck. A set that loses the symbol being shown falls back the same way.
  const chosen = showing !== null && (showing === ALL || names.includes(showing)) ? showing : (names[0] ?? null)
  const shown = chosen === null ? [] : chosen === ALL ? said : said.filter((c) => c.icons.has(chosen))
  // A game with no symbol at all draws neither chips nor cards: there is nothing to ask about, and
  // the set above already says what to do instead.
  if (names.length === 0) return null
  return (
    <section className="byd-symbols-deck">
      <h3>{t('symbols.deck')}</h3>
      <div className="byd-symbols-chips" role="group" aria-label={t('symbols.deck')}>
        {names.map((name) => {
          const n = said.filter((c) => c.icons.has(name)).length
          return (
            <button key={name} type="button" className="byd-choice" aria-pressed={chosen === name} onClick={() => setShowing(name)}>
              {name} <small>{n === 0 && painted[name] ? t(paintedChip(painted[name])) : n}</small>
            </button>
          )
        })}
        <button type="button" className="byd-choice" aria-pressed={chosen === ALL} onClick={() => setShowing(ALL)}>
          {t('symbols.deck.all')}
        </button>
      </div>
      {shown.length === 0 && <p className="byd-symbols-empty">{t(chosen !== null && chosen !== ALL && painted[chosen] ? paintedWhy(painted[chosen]) : 'symbols.deck.unused')}</p>}
      {/* The same wall and the same tile the deck is drawn with, so the card is cut at the same
          corner here as it is there (#332). */}
      <div className="byd-wall" role="list" style={{ ['--byd-wall-card' as string]: `${SHOWN_PX}px`, ['--byd-wall-radius' as string]: `${cornerPx(SHOWN_PX)}px` }}>
        {front &&
          shown.map(({ row: r }) => (
            <div key={r.id} role="listitem" className="byd-wall-card" data-card-ref={r.id}>
              <div className="byd-wall-face">
                <CardPreview id={`sym-${r.id}`} face={front} row={r.fields} icons={icons} fonts={fonts} assetBase={assetBase} palette={doc.palette} scale={SHOWN} />
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}

// The game's own set: what to write, what it is licensed under, and where it is already used.
function ProjectSet({ doc, client, assetBase }: ThemePanelProps) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const names = Object.keys(doc.icons)
  // Counted by the same walk the palette uses, so a symbol written in a meaning still counts. The
  // old check looked for `{namn}` exactly and told a deck that had painted every one of its
  // symbols that it used none of them.
  const bare = iconFieldsOf(doc)
  const used = iconsUsed(doc.rows, bare)
  const painted = iconsPainted(doc)
  // Asked about first when a card says it, as Media asks about a picture (#481; L22, #318). The
  // row goes with it, so the hand lands on the set itself rather than on the page.
  const list = useRef<HTMLUListElement>(null)
  // Taken once the set has drawn itself without the symbol.
  const [landing, setLanding] = useState(0)
  // The last one leaves the line that says the game has none where the list stood, and that is
  // where the hand goes (#558), rather than to the library's search at the top of the page.
  const none = useRef<HTMLParagraphElement>(null)
  const say = useSay()
  useEffect(() => {
    if (landing === 0) return
    ;(list.current ?? none.current)?.focus()
  }, [landing])
  const [ask, removing] = useRemoval((name) => {
    client.removeIcon(name)
    setLanding((n) => n + 1)
    say?.('polite', t('symbols.removed', { name }))
  }, (name) => `[aria-label="${CSS.escape(t('symbols.remove', { name }))}"]`)
  if (names.length === 0)
    return (
      <p ref={none} className="byd-symbols-empty" tabIndex={-1}>
        {t(client.mayEdit ? 'symbols.set.none' : 'symbols.set.none.reading')}
      </p>
    )
  return (
    <section className="byd-symbols-set">
      {removing}
      <ul ref={list} tabIndex={-1} aria-label={t('symbols.inGame')}>
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
                  // A name the card text would not read as a symbol is refused here with the rule it
                  // broke, before the cards that say the old one are rewritten into letters (#481).
                  if (!isSymbolName(next)) {
                    e.target.value = name
                    return setError(t('symbols.name.unwritable', { name: next }))
                  }
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
              <small>{n === 0 && painted[name] ? t(paintedSaid(painted[name])) : t(n === 1 ? 'wall.cards.one' : 'wall.cards.other', { n })}</small>
              <button type="button" aria-label={t('symbols.remove', { name })} onClick={() => ask(name, doc.rows.filter((r) => iconsIn(r.fields, bare).has(name)).map((r) => r.id))}>
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

// Why a symbol the template paints counts 0 cards (#213). The number measures cards that *say* the
// symbol, and a symbol the template paints is said by none of them — so the zero is right and the
// surface says what it means instead of looking like a fault. The set beside the library and the
// chip on the tab read it off the same walk, because the same symbol must not be described two
// ways depending on which of them is being looked at.
//
// It never promises more than the template does: an element under a condition, or in a variant,
// is drawn on some of the deck and the message says so.
const paintedSaid = (how: Painted | undefined): Key => (how === 'some' ? 'symbols.painted.some' : 'symbols.painted')

// The same fact in the room a chip has. A chip is a name and a number in a row of chips, and the
// sentence above — seven words for a symbol a variant paints — drew one four times the width of
// its neighbours: the row stopped being a row of counts and became a paragraph with numbers in it.
// So the chip carries the short form, and the long one stays where there is a line to hold it: in
// the set above, and under the chips for whichever symbol is in hand. What may not differ is
// *whether* it says the template paints the symbol, and that is the one walk above.
const paintedChip = (how: Painted | undefined): Key => (how === 'some' ? 'symbols.painted.chip.some' : 'symbols.painted.chip')
const paintedWhy = (how: Painted | undefined): Key => (how === 'some' ? 'symbols.deck.painted.some' : 'symbols.deck.painted')

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
//
// The relation between the name and the colour is said by being shown (L34, #302): the same
// symbol drawn once per meaning, on the card's paper, with the string that writes it beside it —
// so the name-to-colour link is a concrete example and not prose. Ink is one of the rows and not
// an exception. The symbol is the one the deck says most, or the first of the set; a game with no
// symbol yet has nothing to show the meaning with and keeps the plain swatch.
function GameColours({ doc, client, icons }: { doc: ProjectDoc; client: ProjectClient; icons: Record<string, string> }) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const palette = doc.palette ?? {}
  const roles = Object.entries(palette)
  const ground = groundOf(doc, 'front')
  const used = rolesUsed(doc.rows)
  const issues = paletteIssues(palette, ground)
  const shown = mostSaid(doc)
  const symbols = useMemo(() => ({ icons, palette: doc.palette }), [icons, doc.palette])
  // The string that writes the example in a meaning, or in none; only asked while there is one.
  const example = (role: string | null): string => `{${shown ?? ''}${role === null ? '' : `|${role}`}}`
  // A new meaning starts on an ink the deck is not already using, so naming one is one press.
  const add = () => {
    const free = INKS.find((ink) => !roles.some(([, hex]) => hex.toLowerCase() === ink.hex.toLowerCase())) ?? { hex: INK, name: 'symbols.ink.black' as const }
    let name = t('symbols.colours.new')
    for (let n = 2; palette[name] !== undefined; n++) name = `${t('symbols.colours.new')}-${n}`
    say(() => client.setRole(name, free.hex))
    setNaming(name)
  }
  // The name of the meaning just made takes the hand once its row is drawn: it is a placeholder,
  // and the next thing the designer does is write the real one (#481).
  const [naming, setNaming] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs until the new row is drawn; it stops itself by clearing `naming`
  useEffect(() => {
    if (naming === null) return
    const field = document.querySelector<HTMLInputElement>(`[aria-label="${CSS.escape(t('symbols.colours.rename', { role: naming }))}"]`)
    if (!field) return
    field.focus()
    field.select()
    setNaming(null)
  })
  const say = (change: () => void) => {
    try {
      change()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  // Taken away at once when nothing writes it, and asked about first when a card does (#481). The
  // row goes with it, so the hand lands on «Ny betydelse», which always stands.
  const adder = useRef<HTMLButtonElement>(null)
  const [ask, removing] = useRemoval((role) => {
    say(() => client.removeRole(role))
    adder.current?.focus()
  }, (role) => `[aria-label="${CSS.escape(t('symbols.colours.remove', { role }))}"]`)
  return (
    <section className="byd-symbols-colours">
      {roles.length === 0 ? (
        <p className="byd-symbols-empty">{t('symbols.colours.none')}</p>
      ) : (
        <>
          <SymbolSheet />
          {shown !== null && (
            <p className="byd-symbols-ink" data-ink>
              <SymbolSample written={example(null)} symbols={symbols} paper={ground} />
              <span>{t('symbols.colours.ink')}</span>
              <code>{example(null)}</code>
            </p>
          )}
        <ul aria-label={t('symbols.colours')}>
          {roles.map(([role, hex]) => {
            const n = used[role] ?? 0
            const ratio = contrastRatio(hex, ground)
            return (
              <li key={role} data-role={role} data-faint={ratio < ROLE_MIN_CONTRAST}>
                {shown === null ? <span className="byd-symbols-swatch" style={{ background: hex }} /> : <SymbolSample written={example(role)} symbols={symbols} paper={ground} />}
                <input
                  aria-label={t('symbols.colours.rename', { role })}
                  defaultValue={role}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (!next || next === role) return
                    if (!isSymbolName(next)) {
                      e.target.value = role
                      return setError(t('symbols.name.unwritable', { name: next }))
                    }
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
                {/* What the row says about the meaning, on a line of its own under the name (#481):
                    left to wrap on their own they pushed the × onto a line of its own at 1024. */}
                <span className="byd-symbols-said">
                  <small>{t(n === 1 ? 'wall.cards.one' : n === 0 ? 'symbols.colours.unused' : 'wall.cards.other', { n })}</small>
                  <small>{t('symbols.colours.ratio', { ratio: ratio.toFixed(1) })}</small>
                  {shown !== null && <code>{example(role)}</code>}
                </span>
                <button type="button" aria-label={t('symbols.colours.remove', { role })} onClick={() => ask(role, doc.rows.filter((r) => (rolesUsed([r])[role] ?? 0) > 0).map((r) => r.id))}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        </>
      )}
      {removing}
      <button type="button" className="byd-symbols-add" ref={adder} onClick={add}>
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

// The symbol the palette demonstrates with: the one the deck says most, and the first of the set
// while nothing says any of them. Null when the game has no symbol at all.
function mostSaid(doc: ProjectDoc): string | null {
  const used = iconsUsed(doc.rows, iconFieldsOf(doc))
  let best: string | null = null
  for (const name of Object.keys(doc.icons)) if (best === null || (used[name] ?? 0) > (used[best] ?? 0)) best = name
  return best
}

// How many cards a question names before it counts the rest, the number Media's own uses.
const NAMED = 5

// The question before a symbol or a meaning goes (#481, fynd 11). What goes with it is words on
// cards, so the question names the cards that write it: the first five by id and the rest counted,
// as Media's does for a picture. Nothing that writes it, nothing to ask.
function useRemoval(remove: (name: string) => void, opener: (name: string) => string): [(name: string, cards: readonly string[]) => void, ReactNode] {
  const t = useT()
  const [asked, setAsked] = useState<{ name: string; cards: readonly string[] } | null>(null)
  const ask = (name: string, cards: readonly string[]) => (cards.length === 0 ? remove(name) : setAsked({ name, cards }))
  const named = asked ? (asked.cards.length > NAMED ? t('media.remove.more', { cards: asked.cards.slice(0, NAMED).join(', '), n: asked.cards.length - NAMED }) : asked.cards.join(', ')) : ''
  const sentence = asked ? t(asked.cards.length === 1 ? 'symbols.remove.question.one' : 'symbols.remove.question', { name: asked.name, n: asked.cards.length, cards: named }) : ''
  const question = asked && (
    <Question
      className="byd-symbols-question"
      label={sentence}
      confirm={t('media.remove.yes')}
      cancel={t('editor.cancel')}
      onConfirm={() => {
        setAsked(null)
        remove(asked.name)
      }}
      onCancel={() => {
        setAsked(null)
        // Back to the × that asked, which is still there.
        ;(document.querySelector(opener(asked.name)) as HTMLElement | null)?.focus()
      }}
    >
      {sentence}
    </Question>
  )
  return [ask, question]
}
