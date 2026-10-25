import type { ChangedCell } from '@byd/server/proposal'
import { cellLine } from './proposals.js'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ProjectDoc } from '@byd/server'
import { oversetOf, type FitReport, type Motif, type Warning } from '@byd/template'
import { titleOfRow } from '@byd/server/doc'
import { CardPreview } from './CardPreview.js'
import { OversetMarks } from './OversetMarks.js'
import { overflowing, oversetWords } from './overset.js'
import { CARD_PX, cornerPx } from './corner.js'
import { Crown, CrownBox, CrownDrawer, CrownFoot } from './Crown.js'
import { DENSITY, DENSITY_DEFAULT, heldDensity, rememberDensity } from './density.js'
import { StepPill } from './StepPill.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { deckIssues, fixesFor, groupIssues, issueDetail, issueWords, type Fix, type Found } from './checks.js'
import { useSay } from '../status/StatusLive.js'
import { groupColumn } from './groups.js'
import { bandAtTop, bandPaints, bandsOf, groupableColumns, tileColours } from './bands.js'
import { filterRows, isFiltering, noFilter, type FilterState } from './filtering.js'
import { fieldsOf } from './fields.js'
import { heldGrouped, heldJumpOpen, rememberGrouped, rememberJumpOpen } from './grouping.js'
import { useRoving } from './roving.js'
import { useLang, useT, type Key, type T } from '../i18n/index.js'
import { READING_VIEWS, SCREENS, textPxOnCard, type ReadingView } from '../legibility.js'
import { Help } from './HelpDrawer.js'
import { FootSaid } from './said.js'
import { useDoor } from '../doors.js'

export type DeckWallProps = {
  doc: ProjectDoc
  face: string
  selectedRow: string | null
  // `null` is no card chosen: the template's base and no row (#477).
  onSelectRow(cardRef: string | null): void
  onSelectElement(id: string): void
  assetBase?: string | undefined
  // What is drawn inside each picture (E1), keyed by the URL a resolved row carries.
  motifs?: Record<string, Motif> | undefined
  // One edit that mends a whole check (#233). The wall works out what to change; applying it is
  // the project's, like every other change the wall judges.
  onFixChecks?(fixes: readonly Fix[]): void
  // The two doors an empty game needs (#476, variant A): the first card, made here, and the front
  // that draws it, which is drawn in Mall.
  onAddCard?(): void
  onOpenTemplate?(): void
  // Where a font nothing pins is mended (#737): the game's typefaces, which stand in Speltema (L57).
  // A remark that cannot be mended for the reader still says where it is mended.
  onOpenFonts?(): void
  // A card's row in Tabell (#808): where a remark about one card's own words is mended, which is
  // the link E6 asks of a text that does not fit.
  onOpenRow?(cardRef: string): void
  // Where the wall was left (#477): the search, the eye and how far down it stood. The editor
  // holds it for as long as the project is open, so a tab switch does not throw it away.
  view?: WallView | undefined
  onView?(view: WallView): void
  // A role that may read the deck and not change it (D3): the checks are read, and their remedies
  // are said to be someone else's rather than offered (#477).
  readOnly?: boolean | undefined
  // The cards of an AI proposal laid among the deck's own (#1002): rows the wall is handed in `doc`
  // that are not in the game. They are drawn as the deck's cards are, by the one renderer, marked
  // «Förslag», and are nothing to choose — there is no row to open until they are accepted.
  proposed?: ReadonlySet<string> | undefined
  // The cards of the game an AI proposal changes (#1003), with what each changed cell was and
  // becomes: drawn in their own places with the values they would have, marked «Ändrat», and with
  // old → new under them. They are still the game's cards, and are chosen as ever.
  changed?: ReadonlyMap<string, readonly ChangedCell[]> | undefined
  // The cards of the game a proposed template draws differently (#1005): the wall is handed the
  // game with that template, so each is drawn as the proposal would draw it, and marked «Ändrat» as a
  // changed card is — with old → new under it only where a cell changes too.
  redrawn?: ReadonlySet<string> | undefined
  // The way to the print package (#1208, beslut B): what would be sent to a printer, with these
  // checks applied. Only for those who may take the package.
  printPackage?: { href: string; onGo(from: HTMLElement): void } | undefined
}

// What the wall is read at (L81): the width it is drawn in, and the eye it is seen with, are two
// choices and not one, so a reading view can be seen through any eye. `panel` is the side of the
// wall's panel that stands open, if one does.
export type WallView = { filter: FilterState; eye: string; size?: Size | undefined; panel?: Panel | null | undefined; scrollTop: number }

// The eyes a card is read with (E5). The simulations are the transforms the check uses, applied
// to the real cards: colour blindness is not something a sentence can convey.
const EYES: readonly { key: string; name: Key }[] = [
  { key: 'normal', name: 'wall.eye.normal' },
  { key: 'deuteranopia', name: 'wall.eye.deuteranopia' },
  { key: 'protanopia', name: 'wall.eye.protanopia' },
  { key: 'tritanopia', name: 'wall.eye.tritanopia' },
  { key: 'gray', name: 'wall.eye.gray' },
]
// A card at arm's length is the cheapest check of all, and needs no validation at all. It says what
// the deck looks like across a table, so it names one width rather than stepping through the ladder.
const ARM_PX = 90
// The sizes the wall is drawn at (L81): free, on the density's ladder, or one width named for what it
// is. Arm's length is the deck across a table, and each reading view is the width a play surface
// holds a card up at to read it (#512, K26), read from the one module their measuring tests check
// them against. Each has a short word for where the crown is narrow (#1047): the surface's name.
export type Size = 'free' | 'arm' | `read.${ReadingView['key']}`
type Named = { key: Size; name: Key; short: Key; px: number; view?: ReadingView }
const SIZES: readonly Named[] = [
  { key: 'arm', name: 'wall.size.arm', short: 'wall.size.arm.short', px: ARM_PX },
  ...READING_VIEWS.map((view) => ({
    key: `read.${view.key}` as const,
    name: `wall.eye.read.${view.key}` as Key,
    short: `wall.eye.read.${view.key}.short` as Key,
    px: view.width,
    view,
  })),
]
const MATRICES: Record<string, string> = {
  protanopia: '0.11238 0.88762 0 0 0  0.11238 0.88762 0 0 0  0.00401 -0.00401 1 0 0  0 0 0 1 0',
  deuteranopia: '0.29275 0.70725 0 0 0  0.29275 0.70725 0 0 0  -0.02234 0.02234 1 0 0  0 0 0 1 0',
  tritanopia: '1 0.14461 -0.14461 0 0  0 0.85924 0.14076 0 0  0 0.85924 0.14076 0 0  0 0 0 1 0',
}
const sizeOf = (key: Size | undefined) => SIZES.find((s) => s.key === key)
// The swatch each eye shows of itself, seen through its own filter (L81): the colours a deck most
// often tells apart by, so the difference is seen before the eye is chosen.
const SWATCH = ['#e0442e', '#f2a516', '#3f9b4b', '#3c7de0']

// The two sides of the wall's panel (L81). The grouping is the crown's one drawer.
export type Panel = 'view' | 'checks'

// The deck as a wall (C as the home view): every row as a card, copies and faults on each, the
// whole deck visible at once — a balance change on forty cards is seen as one thing. Beside it
// the physical checks (E5), gathered by kind, and the eyes to read the deck with.
export function DeckWall({ doc, face, selectedRow, onSelectRow, onSelectElement, assetBase, motifs, onFixChecks, onAddCard, onOpenTemplate, onOpenFonts, onOpenRow, view, onView, readOnly = false, proposed, changed, redrawn, printPackage }: DeckWallProps) {
  const t = useT()
  // What was mended is said out loud: an edit that changes the template under a deck of forty
  // cards and says nothing is the silence #32 forbids.
  const say = useSay()
  const faceTemplate = doc.template.faces[face]
  // The fonts the version is pinned to (B3), worked out once per document: a fresh object every
  // render is a fresh compile of every card on the wall, and a card recompiled under the pointer
  // is a card that cannot be clicked.
  // Held by what it is read from and not by the document (#661): an edit of one cell is a new
  // document with the same fonts in it, and keyed on the document it recompiled and refitted every
  // card on the wall to show the one that changed.
  const fonts = useMemo(() => previewFonts({ template: doc.template, fonts: doc.fonts }, assetBase), [doc.template, doc.fonts, assetBase])
  // The project's icons, resolved once for the same reason: `previewIcons` builds a fresh object
  // every call, and a fresh object is a fresh compile of the whole wall (E1).
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, assetBase), [doc.icons, assetBase])
  const [warnings, setWarnings] = useState<Record<string, number>>({})
  // The texts on each card the fitting could not fit (#808), as its own card measured them: what the
  // card is marked with, and what the physical check reads, so the badge, the mark and the list are
  // one measurement. Held for a card a search has taken off the wall, as its badge's count is.
  const [cut, setCut] = useState<Record<string, FitReport[]>>({})
  // The smallest text each card carries once E6 has fitted it, in pt (#512).
  const [smallest, setSmallest] = useState<Record<string, number>>({})
  const { lang } = useLang()
  const [eye, setEye] = useState<string>(view?.eye ?? 'normal')
  const [size, setSize] = useState<Size>(view?.size ?? 'free')
  const [trim, setTrim] = useState(false)
  // How close the deck is packed is this browser's and not this project's (#128), so it is read
  // from where it was left rather than started afresh on every mount.
  const [step, setStep] = useState(heldDensity)
  const [grouping, setGrouping] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(view?.panel ?? null)
  // In a reading view, only the cards whose text falls under its floor (L81). Any other size lets
  // the deck back.
  const [underOnly, setUnderOnly] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  // Which band stands at the top of the view, and the boxes the answer is measured from.
  const [atTop, setAtTop] = useState<string | null>(null)
  // The same question the data tab asks of the same fields (#130): one search, reused, so a term
  // that finds a card there finds it here. It is a view of the deck and never touches `doc.rows`.
  const [filter, setFilter] = useState<FilterState>(view?.filter ?? noFilter)
  // Whether the wall stands in bands is this browser's, and which column it stands in is this
  // deck's: the template has already said what its groups are, and a column chosen over that
  // answer belongs to the deck it was chosen in (see `grouping.ts`).
  const [grouped, setGrouped] = useState(heldGrouped)
  const [byColumn, setByColumn] = useState<string | null>(null)
  // The table of contents costs a card column at every width the editor is measured at, so it can
  // be folded to a strip — and the choice is this browser's, opening open.
  const [jumpOpen, setJumpOpen] = useState(heldJumpOpen)
  const jumpId = useId()
  // The column folds itself (#1019): its control stands in the open column's head and at the top of
  // the strip, so a press takes away the button that was pressed. The focus goes to the one that
  // took its place — never to the document, where the next Tab would start over (#477, fynd 6).
  const foldRef = useRef<HTMLButtonElement>(null)
  const folded = useRef(false)
  useEffect(() => {
    if (!folded.current) return
    folded.current = false
    foldRef.current?.focus()
  }, [jumpOpen])
  const deckRef = useRef<HTMLDivElement>(null)
  // What the wall tells the editor about where it stands. The scroll goes by a ref, because a
  // re-render per scrolled pixel is the price of nothing.
  const scrolled = useRef(view?.scrollTop ?? 0)
  const told = useRef(onView)
  told.current = onView
  useEffect(() => {
    told.current?.({ filter, eye, size, panel, scrollTop: scrolled.current })
  }, [filter, eye, size, panel])
  // Back where it was left, and then the chosen card brought into view if it is not in it: a
  // card chosen in Tabell could stand 2 800 px down the wall with nothing on the screen.
  useLayoutEffect(() => {
    const deck = deckRef.current
    if (deck && scrolled.current > 0) deck.scrollTop = scrolled.current
  }, [])
  useLayoutEffect(() => {
    if (!selectedRow) return
    deckRef.current?.querySelector(`[data-card-ref="${CSS.escape(selectedRow)}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedRow])
  // A proposal laid on the wall is brought into view (#1002): its cards stand at the end of their
  // bands, and on a deck of seventy cards that is screens away from where the designer is reading —
  // a press that changes nothing she can see reads as a press that did nothing.
  const proposedKey = [...(proposed ?? []), ...(changed?.keys() ?? []), ...(redrawn ?? [])].join(' ')
  const ghosts = proposed?.size ?? 0
  const own = doc.rows.length - ghosts
  // A proposal is not the deck's yet (#1002), so every count on the wall says the deck's cards and
  // the proposed ones apart, the foot's way — «132 kort · 2 föreslagna» — and the bands add up to
  // the foot (#1037). A band's tile is its share of the deck, which the proposal is no part of.
  const isGhost = (row: { id: string }) => proposed?.has(row.id) === true
  const proposedSaid = (m: number) => t(m === 1 ? 'wall.foot.proposed.one' : 'wall.foot.proposed.other', { n: m })
  const withProposed = (said: string, m: number) => (m === 0 ? said : t('wall.cards.proposed', { cards: said, proposed: proposedSaid(m) }))
  const bandCount = (band: { cards: readonly { id: string }[] }) => {
    const m = band.cards.filter(isGhost).length
    return { n: band.cards.length - m, m }
  }
  const bandHead = (band: { cards: readonly { id: string }[] }) => {
    const { n, m } = bandCount(band)
    return withProposed(t(n === 1 ? 'wall.cards.one' : 'wall.cards.other', { n }), m)
  }
  const bandName = (band: { name: string; cards: readonly { id: string }[] }) => {
    const { n, m } = bandCount(band)
    return withProposed(t(n === 1 ? 'wall.tile.one' : 'wall.tile.other', { group: band.name, n }), m)
  }
  useLayoutEffect(() => {
    if (!proposedKey) return
    deckRef.current?.querySelector('[data-proposed], [data-changed]')?.scrollIntoView?.({ block: 'center' })
  }, [proposedKey])
  const sections = useRef(new Map<string, HTMLElement>())
  // Where a jump from the table of contents will come to rest, for as long as it is on its way.
  // The reader's own hand on the wall — a wheel, a finger, the scrollbar, a key — lets go of it,
  // and so does a scroll that stops short of it.
  const jumping = useRef<number | null>(null)
  const letGo = () => {
    jumping.current = null
  }
  // A drawer or the panel hands the focus back to the box it came from when it closes (#133), so
  // each box has to be findable from what it opened.
  const viewBox = useRef<HTMLButtonElement>(null)
  const groupingBox = useRef<HTMLButtonElement>(null)
  const checksBox = useRef<HTMLButtonElement>(null)
  const onFitted = useCallback((cardRef: string, sizes: { sizePt: number }[]) => {
    const least = sizes.length > 0 ? Math.min(...sizes.map((s) => s.sizePt)) : undefined
    setSmallest((m) => {
      if (m[cardRef] === least) return m
      if (least !== undefined) return { ...m, [cardRef]: least }
      return Object.fromEntries(Object.entries(m).filter(([row]) => row !== cardRef))
    })
  }, [])
  const onMeasured = useCallback((cardRef: string, fitted: FitReport[]) => {
    const over = overflowing(fitted)
    setCut((m) => {
      const had = m[cardRef] ?? []
      if (JSON.stringify(had) === JSON.stringify(over)) return m
      return { ...m, [cardRef]: over }
    })
  }, [])
  const onWarnings = useCallback((cardRef: string, w: Warning[]) => {
    setWarnings((m) => (m[cardRef] === w.length ? m : { ...m, [cardRef]: w.length }))
  }, [])
  const found = deckIssues(doc, { [face]: cut })
  const groups = groupIssues(found)
  const errors = groups.filter((g) => g.severity === 'error')
  const open = groups.find((g) => g.code === openGroup)
  const marked = new Set(open?.cards ?? [])
  const words = issueWords(t)
  // The cards a remark marks are marked for as long as the report stands open (#477): closed,
  // the frames were yellow on a whole deck with nothing on the screen saying why.
  const showPanel = (side: Panel | null) => {
    if (side !== 'checks') setOpenGroup(null)
    setPanel(side)
  }
  const togglePanel = (side: Panel) => showPanel(panel === side ? null : side)
  const closePanel = () => {
    const opener = panel === 'checks' ? checksBox : viewBox
    showPanel(null)
    opener.current?.focus()
  }
  const choose = (next: Size) => {
    setSize(next)
    setUnderOnly(false)
  }
  // A press on the pill is a choice of the free size (L81): the pill is never held by another size,
  // which #701 had to explain with a sentence on each of its buttons.
  const denser = (by: number) => {
    choose('free')
    setStep((now) => {
      const next = Math.min(DENSITY.length - 1, Math.max(0, now + by))
      rememberDensity(next)
      return next
    })
  }
  const named = sizeOf(size)
  const reading = named?.view
  const free = DENSITY[step] ?? DENSITY[DENSITY_DEFAULT] ?? 150
  const px = named ? named.px : free
  const eyeNow = EYES.find((e) => e.key === eye) ?? { key: 'normal', name: 'wall.eye.normal' as const }
  // What the box says is chosen inside the panel (#128): the size, and the eye and the trim when
  // they are on. Where the crown is narrow a named size says only the surface (#1047).
  const extras = [...(eyeNow.key === 'normal' ? [] : [t(eyeNow.name)]), ...(trim ? [t('wall.view.trim')] : [])]
  const viewSaid = [named ? t(named.name) : t('wall.density.px', { px: Math.round(free) }), ...extras].join(' · ')
  const viewShort = named ? [t(named.short), ...extras].join(' · ') : undefined
  // The smallest text of each of the deck's cards in the reading view, as it is shown: rounded, so a
  // text shown at the floor is never said to be under it (K26).
  const floor = reading ? SCREENS[reading.screen].floorPx : 0
  const readPx = (cardRef: string) => {
    const pt = smallest[cardRef]
    return reading && pt !== undefined ? Math.round(textPxOnCard(pt, reading.width) * 10) / 10 : undefined
  }
  const isUnder = (cardRef: string) => {
    const shown = readPx(cardRef)
    return shown !== undefined && shown < floor
  }
  const said = (n: number) => n.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const leastPx = (() => {
    const all = doc.rows.filter((row) => !isGhost(row)).map((row) => readPx(row.id)).filter((n): n is number => n !== undefined)
    return all.length > 0 ? Math.min(...all) : undefined
  })()
  // The wall groups by the column the template already groups by (L3): the deck has said once
  // what its groups are, and the home view reads that answer rather than asking a second time.
  const columns = ['id', ...fieldsOf(doc)]
  const column = grouped ? (byColumn ?? groupColumn(doc)) : null
  const searched = isFiltering(filter) ? filterRows(doc.rows, columns, filter) : doc.rows
  const shown = reading && underOnly ? searched.filter((row) => isUnder(row.id)) : searched
  const shownGhosts = shown.filter(isGhost).length
  // How much of the front there is, which is what the empty wall says is still to be done (#476).
  const frontElements = doc.template.faces['front']?.base.length ?? 0
  const frontless = frontElements === 0
  const bands = bandsOf(doc, shown, column, t('wall.group.without', { column: column ?? '' }))
  // Read off the whole deck and not off what a search left standing: the strip is the deck's own
  // colours, and a band does not change colour because a term narrowed it.
  const paints = useMemo(() => (faceTemplate ? bandPaints(faceTemplate, doc, column) : new Map<string, string>()), [faceTemplate, doc, column])
  // Where in the deck the eye has got to: the band standing at the top of the view. It is the one
  // thing eleven screens of cards never said, and both shapes of the jump column say it.
  const here = atTop === null || !bands.some((b) => (b.value ?? '') === atTop) ? (bands[0] ? (bands[0].value ?? '') : null) : atTop
  // The jump column is one tab stop with the arrows moving inside it (APG), open and folded alike:
  // it is a list of the same eight things in the same order either way, so it is one list.
  const roving = useRoving({ ids: bands.map((band) => band.value ?? ''), selected: here, orientation: 'vertical' })
  // The cards are one tab stop too (#477), in the order the wall draws them, and the arrows walk
  // them in reading order whichever way the grid wraps. Tab lands on the chosen card.
  const drawn = bands.length === 0 ? shown : bands.flatMap((band) => band.cards)
  const cards = useRoving({ ids: drawn.map((row) => row.id), selected: selectedRow, orientation: 'both' })
  // A jump moves the focus to the band's first card and not merely the scroll position: a reader
  // on a keyboard who was only scrolled to would find the next Tab starting over from the deck.
  const jumpTo = (key: string) => {
    const section = sections.current.get(key)
    const deck = deckRef.current
    if (!section || !deck) return
    const top = section.offsetTop - deck.offsetTop
    // Where the scroll will actually come to rest: a band in the tail lies beyond all the room there is.
    const rest = Math.max(0, Math.min(top, deck.scrollHeight - deck.clientHeight))
    jumping.current = Math.abs(deck.scrollTop - rest) < 1 ? null : rest
    if (typeof deck.scrollTo === 'function') deck.scrollTo({ top, behavior: 'smooth' })
    else deck.scrollTop = top
    setAtTop(key)
    ;(section.querySelector('[data-card-ref]') as HTMLElement | null)?.focus({ preventScroll: true })
  }
  // Which band the view is standing in is read off the same measurement the jump writes, so the
  // mark and the jump can never disagree about where the top of the view is.
  const onDeckScroll = () => {
    const deck = deckRef.current
    if (!deck) return
    scrolled.current = deck.scrollTop
    told.current?.({ filter, eye, size, panel, scrollTop: deck.scrollTop })
    // A jump already said where the view is going. Read per frame on the way there, the mark fell
    // back to where the view had been and climbed through every band in between, redrawing the
    // wall at each one — so it holds still until the scroll arrives.
    if (jumping.current !== null) {
      if (Math.abs(deck.scrollTop - jumping.current) < 1) letGo()
      return
    }
    // The room left is part of the question: the last bands' tops lie beyond everything the wall
    // can scroll, so without it the mark could never reach them (#179).
    setAtTop(bandAtTop([...sections.current].map(([key, el]) => ({ key, top: el.offsetTop - deck.offsetTop })), deck.scrollTop, deck.scrollHeight - deck.clientHeight, atTop))
  }
  if (!faceTemplate) return <p>{t('template.faceMissing', { face })}</p>
  // One card, drawn the same whether it stands in a band or on an ungrouped wall.
  const card = ({ id: cardRef, fields: row }: ProjectDoc['rows'][number]) => {
    const copies = Number(row['antal'] ?? 1)
    // The badge stays this card's own trouble — an unknown icon, text that will not fit. A
    // physical fault is nearly always the template's, and saying it on every card would be forty
    // red badges for one mistake; the report in the crown says it once.
    const count = warnings[cardRef] ?? 0
    const roves = cards.itemProps(cardRef)
    const ghost = proposed?.has(cardRef) === true
    const cells = changed?.get(cardRef)
    const redrawnOnly = !cells && redrawn?.has(cardRef) === true
    // A proposed card is not the game's: choosing it chooses nothing.
    const choose = (to: string | null) => {
      if (!ghost) onSelectRow(to)
    }
    const option = (
      <div
        key={cardRef}
        // An option in a listbox (#477): the one role in which being chosen is `aria-selected`, and
        // the one a reader expects to walk with the arrows and choose with Enter or Space.
        role="option"
        className="byd-wall-card"
        data-card-ref={cardRef}
        // A jump from the table of contents moves the focus to the band's first card and not only
        // the scroll position, so every card is something focus can be put on; one of them is the
        // wall's tab stop.
        {...roves}
        aria-selected={selectedRow === cardRef && !ghost ? 'true' : 'false'}
        {...(marked.has(cardRef) ? { 'data-marked': 'true' } : {})}
        {...(isUnder(cardRef) ? { 'data-under': 'true' } : {})}
        {...(ghost ? { 'data-proposed': '', 'aria-label': t('ai.proposal.ghost.label', { name: titleOfRow({ id: cardRef, fields: row }) || cardRef }) } : {})}
        {...(cells ? { 'data-changed': '', 'aria-label': t('ai.proposal.changed.label', { name: titleOfRow({ id: cardRef, fields: { ...row, ...Object.fromEntries(cells.map((c) => [c.field, c.from ?? ''])) } }) || cardRef, cells: cells.map((c) => cellLine(c, t)).join(', ') }) } : {})}
        {...(redrawnOnly ? { 'data-changed': '', 'aria-label': t('ai.proposal.redrawn.label', { name: titleOfRow({ id: cardRef, fields: row }) || cardRef }) } : {})}
        // The gesture that chose a card, made again, lets it go (beslut 2026-09-27, #477 fynd 3 C).
        onClick={() => choose(selectedRow === cardRef ? null : cardRef)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            choose(selectedRow === cardRef ? null : cardRef)
            return
          }
          // Escape lets go too, but only of something: with nothing chosen it belongs to whatever
          // door is open further out.
          if (event.key === 'Escape' && selectedRow !== null) {
            event.preventDefault()
            onSelectRow(null)
            return
          }
          roves.onKeyDown(event)
        }}
      >
        {/* The card's paper (#332, L28): the box the corner cuts, the hairline edge is drawn
            round and the light along the top sits inside. It is its own element because the
            badges hang outside the card and must not be cut off with it. */}
        <div className="byd-wall-face">
          <CardPreview
            id={`wall-${cardRef}`}
            face={faceTemplate}
            row={row}
            icons={icons}
            fonts={fonts}
            scale={px / CARD_PX}
            assetBase={assetBase}
            motifs={motifs}
            palette={doc.palette}
            // The card, and then the element in it (#234). Almost the whole of a card is its
            // elements — the front's frame shape alone covers 61 × 86 of its 63 × 88 — so a click on
            // a card is nearly always a click on an element of it, and the preview quite rightly
            // stops that click from travelling on: the element is the more particular answer. But
            // the tile's own `onClick` was the only thing saying which card had been chosen, so it
            // never ran, and what opened was about whichever card had been selected before — the one
            // wearing the ring. The wall knows which card this preview is of; it says so itself.
            onSelectElement={(id) => {
              if (ghost) return
              onSelectRow(cardRef)
              onSelectElement(id)
            }}
            onWarnings={(w) => onWarnings(cardRef, w)}
            onFitted={(sizes) => onFitted(cardRef, sizes)}
            onMeasured={(fitted) => onMeasured(cardRef, fitted)}
          />
        </div>
        {/* Over the card and outside its paper, which is cut to its corners (#808). */}
        <OversetMarks found={oversetOf(faceTemplate, row, cut[cardRef] ?? [])} scale={px / CARD_PX} />
        {/* Under the floor, the card says so to a screen reader too; the panel says it in words to
            everyone, and the frame only repeats it (K26, L81). */}
        {isUnder(cardRef) && <span className="byd-offscreen">{t('wall.read.under', { px: said(readPx(cardRef) ?? 0), floor })}</span>}
        {(ghost || cells || redrawnOnly) && (
          <span className="byd-wall-proposed" aria-hidden="true">
            <span className="byd-ai-spark">✦</span> {t(ghost ? 'ai.proposal.ghost' : 'ai.proposal.changedTag')}
          </span>
        )}
        {copies > 1 && <span className="byd-wall-copies" data-copies>×{copies}</span>}
        {count > 0 && (
          <span className="byd-wall-warnings" data-warnings>
            {count}
          </span>
        )}
      </div>
    )
    if (!cells) return option
    // What the proposal changes on the card, old → new, under it (#1003): the card itself shows only
    // the new. Under the card and outside it, so the ring that says the card is chosen and the badge
    // that says how many copies it has stay the card's — a cell round both, which is nothing to the
    // listbox (`none`), holds the two in the wall's grid.
    return (
      <div key={cardRef} className="byd-wall-cell" role="none">
        {option}
        <ul className="byd-wall-changes" aria-hidden="true">
          {cells.map((cell) => (
            <li key={cell.field}>{cellLine(cell, t)}</li>
          ))}
        </ul>
      </div>
    )
  }
  // The column folds itself (#1019, variant C): the way in and out of the strip stands on the column
  // it folds — in its head beside «Leken», and at the top of the strip — drawn as the AI panel's own
  // ⟩ is drawn on its panel, mirrored on the wall's other side, so the two side panels fold one way.
  // Where it stands says what it folds, which the crown never could without a word it had no room
  // for; and it is always there, never a corner that appears under a pointer (#184). With no column
  // drawn — a search that found nothing — there is nothing to fold and no control (#556).
  const foldButton = (
    <button
      ref={foldRef}
      type="button"
      className="byd-wall-fold"
      aria-expanded={jumpOpen}
      aria-controls={jumpId}
      aria-label={jumpOpen ? t('wall.fold.in') : t('wall.fold.out')}
      title={jumpOpen ? t('wall.fold.in') : t('wall.fold.out')}
      onClick={() => {
        folded.current = true
        setJumpOpen(!jumpOpen)
        rememberJumpOpen(!jumpOpen)
      }}
    >
      <span aria-hidden="true">{jumpOpen ? '⟨' : '⟩'}</span>
    </button>
  )
  return (
    <div className="byd-wall-view">
      <EyeFilters />
      {/* The crown answers the wall's width and not the window's (#1000): something standing
          beside the wall — the AI panel (E4) — leaves it narrower than the window, and the row
          is laid out for the room it has. */}
      <div className="byd-wall-crown">
        {/* The crown (#128, variant B): one row at the desk, and every box says what is chosen inside it. The
            eye the deck is read with is the reason that rule exists — a simulation left on without
            saying so is worse than no simulation at all (E5). */}
        <Crown>
          <input
            type="search"
            className="byd-crown-search"
            aria-label={t('table.search')}
            placeholder={t('table.search.placeholder')}
            value={filter.query}
            onChange={(event) => setFilter({ ...filter, query: event.target.value })}
          />
          <CrownBox
            name={t('wall.groupedBy')}
            state={column ?? t('wall.grouping.off')}
            short={column === null ? t('wall.grouping.off.short') : undefined}
            open={grouping}
            onToggle={() => setGrouping((now) => !now)}
            boxRef={groupingBox}
          />
          {/* How the wall looks and what the check made of it open the same panel beside the wall
              (L81), so they stand together at the row's end: the two things on this surface that
              are not about which cards are shown. */}
          <CrownBox name={t('wall.eyes')} state={viewSaid} short={viewShort} open={panel === 'view'} onToggle={() => togglePanel('view')} boxRef={viewBox} end />
          <CrownBox name={t('wall.checks.title')} count={groups.length} short={t('wall.checks.short')} open={panel === 'checks'} onToggle={() => togglePanel('checks')} boxRef={checksBox} />
        </Crown>
      </div>
      {grouping && (
        <CrownDrawer label={t('wall.groupedBy')} opener={groupingBox} onClose={() => setGrouping(false)}>
          <button
            type="button"
            className="byd-choice"
            aria-pressed={column === null}
            onClick={() => {
              setGrouped(false)
              rememberGrouped(false)
            }}
          >
            {t('wall.grouping.off')}
          </button>
          {groupableColumns(doc, fieldsOf(doc), groupColumn(doc)).map((field) => (
            <button
              key={field}
              type="button"
              className="byd-choice"
              aria-pressed={column === field}
              onClick={() => {
                setGrouped(true)
                rememberGrouped(true)
                setByColumn(field)
              }}
            >
              {field}
            </button>
          ))}
        </CrownDrawer>
      )}
      {/* The wall is the only thing on this surface that scrolls. */}
      <div className="byd-wall-work" data-fold={bands.length === 0 ? 'none' : jumpOpen ? 'open' : 'folded'} {...(panel ? { 'data-panel': panel } : {})}>
        {/* Folded, the column is a 66 px strip and not an edge: the same groups in the same order,
            the name dropped and the count kept. A tile is a button with a readable name of its
            own, never a bare swatch — and "where am I" survives on three channels, because two
            groups may well share a head colour on the wall beside it. */}
        {bands.length > 0 && !jumpOpen && (
          <nav className="byd-wall-rail" id={jumpId} aria-label={t('wall.groups.folded')}>
            {foldButton}
            <div className="byd-wall-rail-scroll">
              {bands.map((band) => {
                const key = band.value ?? ''
                return (
                  <button
                    key={key}
                    type="button"
                    data-tile={key}
                    {...roving.itemProps(key)}
                    aria-current={here === key}
                    aria-label={bandName(band)}
                    title={bandName(band)}
                    // The tile's height is the group's share of the deck, so the strip reads as a
                    // cross-section rather than a menu. `--tap` floors it in CSS: the tail is
                    // pressed flat so it stays hittable, and the top of the strip stays true.
                    style={{ flexGrow: bandCount(band).n, ...tileStyle(paints.get(key)) }}
                    onClick={() => jumpTo(key)}
                  >
                    {bandCount(band).n}
                  </button>
                )
              })}
            </div>
          </nav>
        )}
        {bands.length > 0 && jumpOpen && (
          <nav className="byd-wall-jump" id={jumpId} aria-label={t('wall.groups')}>
            <div className="byd-wall-jump-head">
              <h2>{t('wall.deck')}</h2>
              {foldButton}
            </div>
            <div className="byd-wall-jump-scroll">
              {bands.map((band) => {
                const key = band.value ?? ''
                return (
                  <button
                    key={key}
                    type="button"
                    data-jump={key}
                    {...roving.itemProps(key)}
                    aria-current={here === key}
                    aria-label={bandName(band)}
                    onClick={() => jumpTo(key)}
                  >
                    <span>{band.name}</span>
                    <small>{bandCount(band).n}</small>
                  </button>
                )
              })}
            </div>
          </nav>
        )}
        <div
          className="byd-wall-deck"
          ref={deckRef}
          onScroll={onDeckScroll}
          onScrollEnd={() => {
            if (jumping.current === null) return
            letGo()
            onDeckScroll()
          }}
          onWheel={letGo}
          onTouchStart={letGo}
          onPointerDown={letGo}
          onKeyDown={letGo}
          data-wall
          data-eye={eye}
          // How wide a card is drawn, and — read off the same width — how far in the card is cut
          // at its corners (#332, L28). The corner is a physical length like the width is, so it
          // belongs beside it: a card drawn smaller is a card with a smaller corner, not the same
          // corner on a smaller card.
          style={{ ['--byd-wall-card' as string]: `${px}px`, ['--byd-wall-radius' as string]: `${cornerPx(px)}px` }}
          {...(trim ? { 'data-trim': 'true' } : {})}
          {...(size === 'arm' ? { 'data-arm': 'true' } : {})}
          // A proposal on the wall marks its cards over their top edges and says old → new under
          // them, so the wall leaves room between its cards while one stands on it (#1003).
          {...(proposedKey ? { 'data-proposing': '' } : {})}
        >
          {/* What an empty game is missing, and the doors to it (#476, beslut 2026-09-27, variant A).
              A deck with no cards says so and offers the first card here and the front in Mall;
              a deck whose front is still empty says that over the cards it has. Both doors are
              bordered: the filled button in the view is the header's (L13). */}
          {doc.rows.length === 0 && !isFiltering(filter) && (
            <div className="byd-wall-empty">
              <h2>{t(frontless ? 'wall.empty.title' : 'wall.empty.drawn.title')}</h2>
              <p>{frontless ? t('wall.empty.body') : t(frontElements === 1 ? 'wall.empty.drawn.body.one' : 'wall.empty.drawn.body.other', { n: frontElements })}</p>
              <div className="byd-wall-empty-doors">
                {onAddCard && (
                  <button type="button" className="byd-secondary" onClick={onAddCard}>
                    {t('table.addCard')}
                  </button>
                )}
                {frontless && onOpenTemplate && (
                  <button type="button" className="byd-secondary" onClick={onOpenTemplate}>
                    {t('wall.empty.template')}
                  </button>
                )}
              </div>
            </div>
          )}
          {doc.rows.length > 0 && frontless && onOpenTemplate && (
            <div className="byd-wall-nofront">
              <span>{t('wall.nofront')}</span>
              <button type="button" className="byd-secondary" onClick={onOpenTemplate}>
                {t('wall.empty.template')}
              </button>
            </div>
          )}
          {/* A search that finds nothing says what was looked for and the way back (#477), in the
              same form as the empty game above it (#476, variant A): what is missing, and the door. */}
          {shown.length === 0 && isFiltering(filter) ? (
            <div className="byd-wall-empty" role="status">
              <h2>{t('wall.search.none', { query: filter.query })}</h2>
              <div className="byd-wall-empty-doors">
                <button type="button" className="byd-secondary" onClick={() => setFilter(noFilter)}>
                  {t('wall.search.clear')}
                </button>
              </div>
            </div>
          ) : bands.length === 0 ? (
            <div className="byd-wall" role="listbox" aria-label={t('wall.deck')}>
              {shown.map((row) => card(row))}
            </div>
          ) : (
            bands.map((band) => (
              <section
                key={band.value ?? ''}
                className="byd-wall-band"
                data-band={band.value ?? ''}
                ref={(el) => {
                  const key = band.value ?? ''
                  if (el) sections.current.set(key, el)
                  else sections.current.delete(key)
                }}
              >
                {/* The band's head stays in view while its cards roll past, so the deck never
                    loses its where. */}
                <div className="byd-wall-band-head" data-band-head>
                  <h3>{band.name}</h3>
                  <small>{bandHead(band)}</small>
                  <span className="byd-wall-band-rule" aria-hidden="true" />
                </div>
                <div className="byd-wall" role="listbox" aria-label={band.name}>
                  {band.cards.map((row) => card(row))}
                </div>
              </section>
            ))
          )}
        </div>
        {panel && (
          <WallPanel side={panel} onSide={showPanel} onClose={closePanel} checksCount={groups.length} t={t}>
            {panel === 'view' ? (
              <ViewTab
                size={size}
                onSize={choose}
                eye={eye}
                onEye={setEye}
                trim={trim}
                onTrim={setTrim}
                pill={
                  <StepPill
                    label={t('wall.density')}
                    value={t('wall.density.px', { px: Math.round(free) })}
                    said={t('wall.density.said', { px: Math.round(free) })}
                    less={t('wall.density.more')}
                    more={t('wall.density.less')}
                    onStep={denser}
                  />
                }
                legible={
                  reading && (
                    <Legible
                      floor={floor}
                      least={leastPx}
                      under={doc.rows.filter((row) => !isGhost(row) && isUnder(row.id)).map((row) => ({ name: titleOfRow(row) || row.id, px: readPx(row.id) ?? 0 }))}
                      only={underOnly}
                      onOnly={setUnderOnly}
                      said={said}
                      t={t}
                    />
                  )
                }
                t={t}
              />
            ) : (
              <Checks
                groups={groups}
                errors={errors.length}
                words={words}
                openGroup={openGroup}
                onOpenGroup={setOpenGroup}
                readOnly={readOnly}
                onOpenFonts={onOpenFonts}
                found={found}
                names={(cardRef) => {
                  const row = doc.rows.find((r) => r.id === cardRef)
                  return row ? titleOfRow(row) || cardRef : cardRef
                }}
                // A proposed card has no row to open until it is accepted.
                onOpenRow={onOpenRow && ((cardRef: string) => !proposed?.has(cardRef) && onOpenRow(cardRef))}
                fixes={(code) => (onFixChecks ? fixesFor(doc, { code: code as (typeof groups)[number]['code'] }, found) : [])}
                onFix={(code, what) => {
                  onFixChecks?.(fixesFor(doc, { code: code as (typeof groups)[number]['code'] }, found))
                  say?.('polite', t('wall.checks.fix.said', { what }))
                }}
                t={t}
                printPackage={printPackage}
              />
            )}
          </WallPanel>
        )}
      </div>
      {/* What the wall adds up to, under it rather than over it (#130): how many cards, and what
          the physical check made of them. The width is the pill's since #619. */}
      <CrownFoot>
        {/* Said as it changes, as the table's count is (#556): a search that narrows the wall
            says how many are left. */}
        <span aria-live="polite">
          {isFiltering(filter) ? t(own === 1 ? 'wall.foot.found.one' : 'wall.foot.found.other', { shown: shown.length - shownGhosts, total: own }) : t(own === 1 ? 'wall.foot.cards.one' : 'wall.foot.cards.other', { n: own })}
        </span>
        {/* A proposal on the wall is not the deck's yet, so the deck's count leaves it out and says it
            apart (#1002) — the proposed cards the wall shows, as the bands above count them (#1037). */}
        {shownGhosts > 0 && <span>{proposedSaid(shownGhosts)}</span>}
        {/* An empty deck is not a checked one (#476): «Inga anmärkningar» over nothing reads as
            an approval. */}
        {/* The remarks are a door to the panel's Kontroll (L81): the count is where the eye finds them. */}
        {doc.rows.length === 0 ? (
          <span />
        ) : groups.length === 0 ? (
          <span>{t('wall.foot.checked')}</span>
        ) : (
          <button type="button" className="byd-wall-foot-door" aria-expanded={panel === 'checks'} onClick={() => showPanel('checks')}>
            {t(groups.length === 1 ? 'wall.foot.remarks.one' : 'wall.foot.remarks.other', { n: groups.length })}
          </button>
        )}
        {/* What just happened, after what the wall adds up to (#698, beslut B). */}
        <FootSaid />
      </CrownFoot>
    </div>
  )
}

// The deck's faults, gathered by kind (E5). It used to stand as a dock beside the wall and took
// 320 px of the widest surface in the editor for something read once a session; it is now what the
// crown's last box opens.
function Checks({
  groups,
  errors,
  words,
  openGroup,
  onOpenGroup,
  fixes,
  onFix,
  readOnly,
  onOpenFonts,
  found,
  names,
  onOpenRow,
  t,
  printPackage,
}: {
  groups: ReturnType<typeof groupIssues>
  errors: number
  words: Record<string, string>
  openGroup: string | null
  onOpenGroup(code: string | null): void
  fixes(code: string): Fix[]
  onFix(code: string, what: string): void
  readOnly: boolean
  onOpenFonts: (() => void) | undefined
  found: readonly Found[]
  names(cardRef: string): string
  onOpenRow: ((cardRef: string) => void) | undefined
  t: ReturnType<typeof useT>
  printPackage?: DeckWallProps['printPackage']
}) {
  const { lang } = useLang()
  return (
    <div className="byd-wall-checks">
      {groups.length === 0 ? (
        <p className="byd-wall-ok">{t('wall.checks.ok')}</p>
      ) : (
        <>
          <div className="byd-wall-lead byd-help-row">
            <span>{errors > 0 ? t(errors === 1 ? 'wall.checks.errors.one' : 'wall.checks.errors.other', { n: errors }) : t('wall.checks.warningsOnly')}</span>
            <Help topic={t('wall.checks.help.topic')}>
              <p>{t('wall.checks.help')}</p>
            </Help>
          </div>
          <ul aria-label={t('wall.checks.title')}>
            {groups.map((g) => (
              <li key={g.code} data-severity={g.severity} data-check={g.code}>
                <button type="button" aria-expanded={openGroup === g.code} onClick={() => onOpenGroup(openGroup === g.code ? null : g.code)}>
                  <b>{words[g.code]}</b>
                  <span>{t(g.cards.length === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: g.cards.length })}</span>
                  <small>{t(g.severity === 'error' ? 'wall.severity.error' : 'wall.severity.warning')}</small>
                </button>
                {openGroup === g.code && (
                  <div className="byd-wall-check-detail">
                    <p>{issueDetail(g, t)}</p>
                    <span>
                      {g.elements.join(', ')} · {g.faces.map((face) => faceName(face, t)).join(', ')}
                    </span>
                    {/* A text that does not fit is a card's own words (#808), so the remark says it
                        per card and leads to that card's row, as E6 asks: it is mended in the cell. */}
                    {g.code === 'text-overflow' && (
                      <ul className="byd-wall-check-rows" aria-label={t('wall.checks.rows')}>
                        {found
                          .filter((f) => f.code === 'text-overflow')
                          .map((f) => {
                            const said = oversetWords({ field: String(f.values['field']), sizePt: Number(f.values['sizePt']), hidden: Number(f.values['hidden']), fit: f.values['fit'] === 'fixed' ? 'fixed' : 'shrink' }, t, lang)
                            return (
                              <li key={`${f.cardRef}/${f.face}/${f.element}`}>
                                {onOpenRow ? (
                                  <button type="button" className="byd-secondary" onClick={() => onOpenRow(f.cardRef)}>
                                    {t('wall.checks.row', { card: names(f.cardRef), sentence: said.sentence })}
                                  </button>
                                ) : (
                                  <small>{t('wall.checks.row.read', { card: names(f.cardRef), sentence: said.sentence })}</small>
                                )}
                              </li>
                            )
                          })}
                      </ul>
                    )}
                    {/* The remedy, where the check has one (#233). It is one edit on the template
                        and not one per card — the fault is the template's, which is the whole
                        reason this list is gathered by kind — so a group of forty cards mends in a
                        single step that can be taken back in a single step.
                        Where there is no remedy the reason stands in its place rather than a hole:
                        contrast and colour-alone need a choice of the designer's, and a font needs
                        a file (B3), none of which a patch can invent. */}
                    {readOnly && fixes(g.code).length > 0 ? (
                      <small>{t('wall.checks.fix.readOnly')}</small>
                    ) : fixes(g.code).length > 0 ? (
                      <button type="button" className="byd-secondary" onClick={() => onFix(g.code, words[g.code] ?? g.code)}>
                        {t('wall.checks.fix')}
                      </button>
                    ) : g.code === 'unpinned-font' && onOpenFonts ? (
                      <button type="button" className="byd-secondary" onClick={onOpenFonts}>
                        {t('wall.checks.fix.fonts')}
                      </button>
                    ) : (
                      <small>{t('wall.checks.fix.none')}</small>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {printPackage && (
        <a
          className="byd-wall-print"
          href={printPackage.href}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
            e.preventDefault()
            printPackage.onGo(e.currentTarget)
          }}
        >
          {t('wall.checks.print')}
        </a>
      )}
    </div>
  )
}

// A side of the card in the reader's language (A4): `front` and `back` are the document's keys,
// and the remark said them as they are stored (#737). Any other face is the designer's own name.
function faceName(face: string, t: T): string {
  return face === 'front' ? t('canvas.face.front') : face === 'back' ? t('canvas.face.back') : face
}

// A tile's two grounds and its ink, as the three custom properties the strip is drawn from. A band
// the deck gives no colour at all keeps the strip's own neutral, which the stylesheet declares.
function tileStyle(paint: string | undefined): Record<string, string> {
  if (paint === undefined) return {}
  const { ground, quiet, ink } = tileColours(paint)
  return { '--byd-band-paint': ground, '--byd-band-quiet': quiet, '--byd-band-ink': ink }
}

// The dichromatic simulations as filters, defined once for the page.
function EyeFilters() {
  return (
    <svg className="byd-eye-filters" aria-hidden="true">
      <defs>
        {Object.entries(MATRICES).map(([id, values]) => (
          <filter key={id} id={`byd-eye-${id}`} colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={values} />
          </filter>
        ))}
      </defs>
    </svg>
  )
}

// The wall's panel (L81): how the wall looks and what the check made of it, beside the wall and never
// over the deck's top. Two tabs, because the two boxes in the crown open one side each. It closes
// with its cross, with Escape and with its box again — not with a press on the wall, since what is
// chosen in it is read on the cards while it stands open.
function WallPanel({ side, onSide, onClose, checksCount, t, children }: { side: Panel; onSide(side: Panel): void; onClose(): void; checksCount: number; t: T; children: ReactNode }) {
  const id = useId()
  useDoor('standing', onClose)
  const tabs = useRoving({ ids: ['view', 'checks'], selected: side, orientation: 'horizontal', followFocus: true, onActivate: (to) => onSide(to as Panel) })
  const tab = (which: Panel, label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${which}`}
      aria-selected={side === which}
      aria-controls={`${id}-panel`}
      {...tabs.itemProps(which)}
      onClick={() => onSide(which)}
    >
      {label}
    </button>
  )
  return (
    <aside className="byd-wall-panel" aria-label={t('wall.panel')}>
      <div className="byd-wall-panel-head">
        <div role="tablist" aria-label={t('wall.panel')}>
          {tab('view', t('wall.eyes'))}
          {tab('checks', t('crown.box.count', { name: t('wall.checks.short'), n: checksCount }))}
        </div>
        <button type="button" className="byd-wall-panel-close" aria-label={t('wall.panel.close')} title={t('wall.panel.close')} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="byd-wall-panel-body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${side}`}>
        {children}
      </div>
    </aside>
  )
}

// The panel's Visning (L81): one size, one eye, one guide, and in a reading view what it says about
// the deck's text.
function ViewTab(props: {
  size: Size
  onSize(size: Size): void
  eye: string
  onEye(eye: string): void
  trim: boolean
  onTrim(on: boolean): void
  pill: ReactNode
  legible: ReactNode
  t: T
}) {
  const { size, onSize, eye, onEye, trim, onTrim, pill, legible, t } = props
  const name = useId()
  const sizeHead = useId()
  const eyesHead = useId()
  return (
    <>
      <h3 id={sizeHead}>{t('wall.size')}</h3>
      <div className="byd-wall-sizes" role="radiogroup" aria-labelledby={sizeHead}>
        <div className="byd-wall-size">
          <label>
            <input type="radio" name={name} checked={size === 'free'} onChange={() => onSize('free')} /> {t('wall.size.free')}
          </label>
          {pill}
        </div>
        {SIZES.map((s) => (
          <div key={s.key} className="byd-wall-size">
            <label>
              <input type="radio" name={name} checked={size === s.key} onChange={() => onSize(s.key)} /> {t(s.name)}{' '}
              <small>{t('wall.density.px', { px: Math.round(s.px) })}</small>
            </label>
          </div>
        ))}
      </div>
      {legible}
      <h3 id={eyesHead}>{t('wall.eyes.title')}</h3>
      <div className="byd-wall-eyes" role="group" aria-labelledby={eyesHead}>
        {EYES.map((e) => (
          <button key={e.key} type="button" aria-pressed={eye === e.key} onClick={() => onEye(e.key)}>
            <span className="byd-wall-swatch" data-eye-swatch={e.key} aria-hidden="true">
              {SWATCH.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            {t(e.name)}
          </button>
        ))}
      </div>
      <h3>{t('wall.guides')}</h3>
      <label className="byd-crown-tick">
        <input type="checkbox" checked={trim} onChange={(e) => onTrim(e.target.checked)} /> {t('wall.trim')}
      </label>
    </>
  )
}

// What a reading view says about the deck (#512, L81): its smallest text and the floor, once, and in
// words the cards under it — the frame on each card only repeats this (K26).
function Legible({ floor, least, under, only, onOnly, said, t }: { floor: number; least: number | undefined; under: readonly { name: string; px: number }[]; only: boolean; onOnly(on: boolean): void; said(n: number): string; t: T }) {
  if (least === undefined) return null
  return (
    <div className="byd-wall-legible" data-legible {...(under.length > 0 ? { 'data-under': 'true' } : {})}>
      <p>
        {t('wall.legible', { px: said(least), floor })}
        {under.length === 0 && ` ${t('wall.legible.ok')}`}
      </p>
      {under.length > 0 && (
        <>
          <ul aria-label={t('wall.legible.list')}>
            {under.map((card, i) => (
              <li key={i}>{t('wall.legible.card', { card: card.name, px: said(card.px) })}</li>
            ))}
          </ul>
          <label className="byd-crown-tick">
            <input type="checkbox" checked={only} onChange={(e) => onOnly(e.target.checked)} /> {t(under.length === 1 ? 'wall.legible.only.one' : 'wall.legible.only.other', { n: under.length })}
          </label>
        </>
      )}
    </div>
  )
}
