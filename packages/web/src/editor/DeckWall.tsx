import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Motif, Warning } from '@byd/template'
import { CardPreview } from './CardPreview.js'
import { CARD_PX, cornerPx } from './corner.js'
import { Crown, CrownBox, CrownDrawer, CrownFoot } from './Crown.js'
import { DENSITY, DENSITY_DEFAULT, heldDensity, rememberDensity } from './density.js'
import { StepPill } from './StepPill.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { deckIssues, fixesFor, groupIssues, issueDetail, issueWords, type Fix } from './checks.js'
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
  // Where the wall was left (#477): the search, the eye and how far down it stood. The editor
  // holds it for as long as the project is open, so a tab switch does not throw it away.
  view?: WallView | undefined
  onView?(view: WallView): void
  // A role that may read the deck and not change it (D3): the checks are read, and their remedies
  // are said to be someone else's rather than offered (#477).
  readOnly?: boolean | undefined
}

export type WallView = { filter: FilterState; eye: string; scrollTop: number }

// The eyes a card is read with (E5). The simulations are the transforms the check uses, applied
// to the real cards: colour blindness is not something a sentence can convey.
const EYES: readonly { key: string; name: Key }[] = [
  { key: 'normal', name: 'wall.eye.normal' },
  { key: 'deuteranopia', name: 'wall.eye.deuteranopia' },
  { key: 'protanopia', name: 'wall.eye.protanopia' },
  { key: 'tritanopia', name: 'wall.eye.tritanopia' },
  { key: 'gray', name: 'wall.eye.gray' },
]
// The reading views among the eyes (#512, beslut A): the wall drawn at the width a play surface
// holds a card up at to read it (K26), each card saying the smallest text it carries there. The
// widths are the surfaces' own, read from the one module their measuring tests check them against.
const READS: readonly { key: string; name: Key; view: ReadingView }[] = READING_VIEWS.map((view) => ({ key: `read.${view.key}`, name: `wall.eye.read.${view.key}` as Key, view }))
const MATRICES: Record<string, string> = {
  protanopia: '0.11238 0.88762 0 0 0  0.11238 0.88762 0 0 0  0.00401 -0.00401 1 0 0  0 0 0 1 0',
  deuteranopia: '0.29275 0.70725 0 0 0  0.29275 0.70725 0 0 0  -0.02234 0.02234 1 0 0  0 0 0 1 0',
  tritanopia: '1 0.14461 -0.14461 0 0  0 0.85924 0.14076 0 0  0 0.85924 0.14076 0 0  0 0 0 1 0',
}
// A card at arm's length is the cheapest check of all, and needs no validation at all. It is a
// guide and not a density: it says what the deck looks like across a table, so it names one width
// rather than stepping through the ladder.
const ARM_PX = 90

// What the crown's boxes are, so that only one of them is ever open.
type Box = 'eyes' | 'guides' | 'grouping' | 'checks'

// The deck as a wall (C as the home view): every row as a card, copies and faults on each, the
// whole deck visible at once — a balance change on forty cards is seen as one thing. Beside it
// the physical checks (E5), gathered by kind, and the eyes to read the deck with.
export function DeckWall({ doc, face, selectedRow, onSelectRow, onSelectElement, assetBase, motifs, onFixChecks, onAddCard, onOpenTemplate, onOpenFonts, view, onView, readOnly = false }: DeckWallProps) {
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
  // The smallest text each card carries once E6 has fitted it, in pt (#512).
  const [smallest, setSmallest] = useState<Record<string, number>>({})
  const { lang } = useLang()
  const [eye, setEye] = useState<string>(view?.eye ?? 'normal')
  const [trim, setTrim] = useState(false)
  const [arm, setArm] = useState(false)
  // How close the deck is packed is this browser's and not this project's (#128), so it is read
  // from where it was left rather than started afresh on every mount.
  const [step, setStep] = useState(heldDensity)
  const [box, setBox] = useState<Box | null>(null)
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
  const deckRef = useRef<HTMLDivElement>(null)
  // What the wall tells the editor about where it stands. The scroll goes by a ref, because a
  // re-render per scrolled pixel is the price of nothing.
  const scrolled = useRef(view?.scrollTop ?? 0)
  const told = useRef(onView)
  told.current = onView
  useEffect(() => {
    told.current?.({ filter, eye, scrollTop: scrolled.current })
  }, [filter, eye])
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
  const sections = useRef(new Map<string, HTMLElement>())
  // Where a jump from the table of contents will come to rest, for as long as it is on its way.
  // The reader's own hand on the wall — a wheel, a finger, the scrollbar, a key — lets go of it,
  // and so does a scroll that stops short of it.
  const jumping = useRef<number | null>(null)
  const letGo = () => {
    jumping.current = null
  }
  // A drawer hands the focus back to the box it came from when it closes (#133), so each box has
  // to be findable from the drawer it opened.
  const eyesBox = useRef<HTMLButtonElement>(null)
  const guidesBox = useRef<HTMLButtonElement>(null)
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
  const onWarnings = useCallback((cardRef: string, w: Warning[]) => {
    setWarnings((m) => (m[cardRef] === w.length ? m : { ...m, [cardRef]: w.length }))
  }, [])
  const found = deckIssues(doc)
  const groups = groupIssues(found)
  const errors = groups.filter((g) => g.severity === 'error')
  const open = groups.find((g) => g.code === openGroup)
  const marked = new Set(open?.cards ?? [])
  const words = issueWords(t)
  // The cards a remark marks are marked for as long as the report stands open (#477): closed,
  // the frames were yellow on a whole deck with nothing on the screen saying why.
  const toggle = (which: Box) => {
    if (box === 'checks') setOpenGroup(null)
    setBox((now) => (now === which ? null : which))
  }
  const close = () => {
    if (box === 'checks') setOpenGroup(null)
    setBox(null)
  }
  const denser = (by: number) =>
    setStep((now) => {
      const next = Math.min(DENSITY.length - 1, Math.max(0, now + by))
      rememberDensity(next)
      return next
    })
  const reading = READS.find((r) => r.key === eye)
  // A reading view draws the card at its own width: it is the size the eye is about, so it wins
  // over the density and over arm's length alike.
  const px = reading ? reading.view.width : arm ? ARM_PX : (DENSITY[step] ?? DENSITY[DENSITY_DEFAULT] ?? 150)
  const eyeNow = reading ?? EYES.find((e) => e.key === eye) ?? { key: 'normal', name: 'wall.eye.normal' as const }
  // The wall groups by the column the template already groups by (L3): the deck has said once
  // what its groups are, and the home view reads that answer rather than asking a second time.
  const columns = ['id', ...fieldsOf(doc)]
  const column = grouped ? (byColumn ?? groupColumn(doc)) : null
  const shown = isFiltering(filter) ? filterRows(doc.rows, columns, filter) : doc.rows
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
    told.current?.({ filter, eye, scrollTop: deck.scrollTop })
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
    return (
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
        aria-selected={selectedRow === cardRef ? 'true' : 'false'}
        {...(marked.has(cardRef) ? { 'data-marked': 'true' } : {})}
        // The gesture that chose a card, made again, lets it go (beslut 2026-09-27, #477 fynd 3 C).
        onClick={() => onSelectRow(selectedRow === cardRef ? null : cardRef)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelectRow(selectedRow === cardRef ? null : cardRef)
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
              onSelectRow(cardRef)
              onSelectElement(id)
            }}
            onWarnings={(w) => onWarnings(cardRef, w)}
            onFitted={(sizes) => onFitted(cardRef, sizes)}
          />
        </div>
        {reading && smallest[cardRef] !== undefined && <ReadOut sizePt={smallest[cardRef]} view={reading.view} lang={lang} t={t} />}
        {copies > 1 && <span className="byd-wall-copies" data-copies>×{copies}</span>}
        {count > 0 && (
          <span className="byd-wall-warnings" data-warnings>
            {count}
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="byd-wall-view">
      <EyeFilters />
      {/* The crown (#128, variant B): one row, and every box says what is chosen inside it. The
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
        <CrownBox name={t('wall.eyes')} state={t(eyeNow.name)} open={box === 'eyes'} onToggle={() => toggle('eyes')} boxRef={eyesBox} />
        <CrownBox
          name={t('wall.guides')}
          count={(trim ? 1 : 0) + (arm ? 1 : 0)}
          open={box === 'guides'}
          onToggle={() => toggle('guides')}
          boxRef={guidesBox}
        />
        {/* Density is two presses and no box: it is the one control on this surface that is used
            over and over while looking at something else, and a box would put a door in front of
            every step. It is the canvas' zoom pill (#619) with the width between the two presses,
            where the number used to be said in the foot, half a screen from the control. */}
        <StepPill
          label={t('wall.density')}
          value={t('wall.density.px', { px: Math.round(px) })}
          said={t('wall.density.said', { px: Math.round(px) })}
          less={t('wall.density.more')}
          more={t('wall.density.less')}
          onStep={denser}
          held={reading ? t('wall.density.heldByReading') : arm ? t('wall.density.heldByGuide') : undefined}
        />
        <CrownBox
          name={t('wall.groupedBy')}
          state={column ?? t('wall.grouping.off')}
          open={box === 'grouping'}
          onToggle={() => toggle('grouping')}
          boxRef={groupingBox}
        />
        {/* The way in and out of the strip is a word in the crown and not a corner that appears
            under a pointer: a reader who has never folded anything has no way of guessing that the
            column to the left is foldable, and a hover-only door is the very thing #184 is taking
            out of the editor elsewhere. */}
        {/* Read off the deck and not off what a search left standing (#477): a search that finds
            nothing took the button with it, and every box after it moved. */}
        {column !== null && doc.rows.length > 0 && (
          <button
            type="button"
            className="byd-crown-fold"
            // With no column drawn — a search that found nothing — it opens and controls nothing
            // (#556), so it says neither; it stays in the crown so nothing after it moves (#477).
            {...(bands.length > 0 ? { 'aria-expanded': jumpOpen, 'aria-controls': jumpId } : {})}
            aria-label={jumpOpen ? t('wall.fold.in') : t('wall.fold.out')}
            title={jumpOpen ? t('wall.fold.in') : t('wall.fold.out')}
            onClick={() => {
              setJumpOpen(!jumpOpen)
              rememberJumpOpen(!jumpOpen)
            }}
          >
            <span aria-hidden="true">{jumpOpen ? '\u27E8' : '\u27E9'}</span>
            <span className="byd-crown-name">{jumpOpen ? t('wall.fold.in') : t('wall.fold.out')}</span>
          </button>
        )}
        <CrownBox name={t('wall.checks.title')} count={groups.length} open={box === 'checks'} onToggle={() => toggle('checks')} boxRef={checksBox} end />
      </Crown>
      {box === 'eyes' && (
        <CrownDrawer label={t('wall.eyes')} opener={eyesBox} onClose={close}>
          {[...EYES, ...READS].map((e) => (
            <button key={e.key} type="button" className="byd-choice" aria-pressed={eye === e.key} onClick={() => setEye(e.key)}>
              {t(e.name)}
            </button>
          ))}
        </CrownDrawer>
      )}
      {box === 'guides' && (
        <CrownDrawer label={t('wall.guides')} opener={guidesBox} onClose={close}>
          <label className="byd-crown-tick">
            <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> {t('wall.trim')}
          </label>
          <label className="byd-crown-tick">
            <input type="checkbox" checked={arm} onChange={(e) => setArm(e.target.checked)} /> {t('wall.arm')}
          </label>
        </CrownDrawer>
      )}
      {box === 'grouping' && (
        <CrownDrawer label={t('wall.groupedBy')} opener={groupingBox} onClose={close}>
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
      {box === 'checks' && (
        <CrownDrawer label={t('wall.checks.title')} opener={checksBox} onClose={close}>
          <Checks
            groups={groups}
            errors={errors.length}
            words={words}
            openGroup={openGroup}
            onOpenGroup={setOpenGroup}
            readOnly={readOnly}
            onOpenFonts={onOpenFonts}
            fixes={(code) => (onFixChecks ? fixesFor(doc, { code: code as (typeof groups)[number]['code'] }, found) : [])}
            onFix={(code, what) => {
              onFixChecks?.(fixesFor(doc, { code: code as (typeof groups)[number]['code'] }, found))
              say?.('polite', t('wall.checks.fix.said', { what }))
            }}
            t={t}
          />
        </CrownDrawer>
      )}
      {/* The wall is the only thing on this surface that scrolls. */}
      <div className="byd-wall-work" data-fold={bands.length === 0 ? 'none' : jumpOpen ? 'open' : 'folded'}>
        {/* Folded, the column is a 66 px strip and not an edge: the same groups in the same order,
            the name dropped and the count kept. A tile is a button with a readable name of its
            own, never a bare swatch — and "where am I" survives on three channels, because two
            groups may well share a head colour on the wall beside it. */}
        {bands.length > 0 && !jumpOpen && (
          <nav className="byd-wall-rail" id={jumpId} aria-label={t('wall.groups.folded')}>
            {bands.map((band) => {
              const key = band.value ?? ''
              return (
                <button
                  key={key}
                  type="button"
                  data-tile={key}
                  {...roving.itemProps(key)}
                  aria-current={here === key}
                  aria-label={t(band.cards.length === 1 ? 'wall.tile.one' : 'wall.tile.other', { group: band.name, n: band.cards.length })}
                  title={t(band.cards.length === 1 ? 'wall.tile.one' : 'wall.tile.other', { group: band.name, n: band.cards.length })}
                  // The tile's height is the group's share of the deck, so the strip reads as a
                  // cross-section rather than a menu. `--tap` floors it in CSS: the tail is
                  // pressed flat so it stays hittable, and the top of the strip stays true.
                  style={{ flexGrow: band.cards.length, ...tileStyle(paints.get(key)) }}
                  onClick={() => jumpTo(key)}
                >
                  {band.cards.length}
                </button>
              )
            })}
          </nav>
        )}
        {bands.length > 0 && jumpOpen && (
          <nav className="byd-wall-jump" id={jumpId} aria-label={t('wall.groups')}>
            <h2>{t('wall.deck')}</h2>
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
                    aria-label={t(band.cards.length === 1 ? 'wall.tile.one' : 'wall.tile.other', { group: band.name, n: band.cards.length })}
                    onClick={() => jumpTo(key)}
                  >
                    <span>{band.name}</span>
                    <small>{band.cards.length}</small>
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
          {...(arm ? { 'data-arm': 'true' } : {})}
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
                  <small>{t(band.cards.length === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: band.cards.length })}</small>
                  <span className="byd-wall-band-rule" aria-hidden="true" />
                </div>
                <div className="byd-wall" role="listbox" aria-label={band.name}>
                  {band.cards.map((row) => card(row))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
      {/* What the wall adds up to, under it rather than over it (#130): how many cards, and what
          the physical check made of them. The width is the pill's since #619. */}
      <CrownFoot>
        {/* Said as it changes, as the table's count is (#556): a search that narrows the wall
            says how many are left. */}
        <span aria-live="polite">
          {isFiltering(filter) ? t(doc.rows.length === 1 ? 'wall.foot.found.one' : 'wall.foot.found.other', { shown: shown.length, total: doc.rows.length }) : t(doc.rows.length === 1 ? 'wall.foot.cards.one' : 'wall.foot.cards.other', { n: doc.rows.length })}
        </span>
        {/* An empty deck is not a checked one (#476): «Inga anmärkningar» over nothing reads as
            an approval. */}
        <span>
          {doc.rows.length === 0
            ? null
            : groups.length === 0
            ? t('wall.foot.checked')
            : t(groups.length === 1 ? 'wall.foot.remarks.one' : 'wall.foot.remarks.other', { n: groups.length })}
        </span>
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
  t,
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
  t: ReturnType<typeof useT>
}) {
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

// What a card carries in a reading view (#512): its smallest text in px there, and in words — not
// by colour alone — when that is under the screen's floor for all text (K26).
function ReadOut({ sizePt, view, lang, t }: { sizePt: number; view: ReadingView; lang: string; t: T }) {
  const px = textPxOnCard(sizePt, view.width)
  const floor = SCREENS[view.screen].floorPx
  // Rounded as it is shown, so a text shown at the floor is never said to be under it.
  const shown = Math.round(px * 10) / 10
  const said = shown.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const under = shown < floor
  return (
    <p className="byd-wall-read" data-read {...(under ? { 'data-under': 'true' } : {})}>
      {under ? t('wall.read.under', { px: said, floor }) : t('wall.read', { px: said })}
    </p>
  )
}
