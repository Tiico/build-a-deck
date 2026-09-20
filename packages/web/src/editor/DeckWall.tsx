import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Frame, Motif, Nudge, Warning } from '@byd/template'
import { CardPreview } from './CardPreview.js'
import { CARD_PX, cornerPx } from './corner.js'
import { Crown, CrownBox, CrownDrawer, CrownFoot } from './Crown.js'
import { DENSITY, DENSITY_DEFAULT, heldDensity, rememberDensity } from './density.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { deckIssues, fixesFor, groupIssues, issueDetail, issueWords, type Fix } from './checks.js'
import { useSay } from '../status/StatusLive.js'
import { groupColumn } from './groups.js'
import { bandAtTop, bandPaints, bandsOf, tileColours } from './bands.js'
import { filterRows, isFiltering, noFilter, type FilterState } from './filtering.js'
import { fieldsOf } from './fields.js'
import { heldGrouped, heldJumpOpen, rememberGrouped, rememberJumpOpen } from './grouping.js'
import { useRoving } from './roving.js'
import { framingOf, measuredSpots, objections } from './framing.js'
import { frameWindow } from '@byd/template'
import { assetUrl, isAssetRef } from './assets.js'
import { useT, type Key } from '../i18n/index.js'

export type DeckWallProps = {
  doc: ProjectDoc
  face: string
  selectedRow: string | null
  onSelectRow(cardRef: string): void
  onSelectElement(id: string): void
  assetBase?: string | undefined
  // What is drawn inside each picture (E1), keyed by the URL a resolved row carries.
  motifs?: Record<string, Motif> | undefined
  // One card's departure from the deck's measure (E1) is the deck's own, so the wall is where it
  // is written: the wall is where the whole deck can be seen at once, which is the only place
  // uniformity can be judged. The measure itself is the template's and is set there (#221).
  onFraming?(cardRef: string, field: string, framing: Nudge | null): void
  // One edit that mends a whole check (#233). The wall works out what to change; applying it is
  // the project's, like every other change the wall judges.
  onFixChecks?(fixes: readonly Fix[]): void
}

// The eyes a card is read with (E5). The simulations are the transforms the check uses, applied
// to the real cards: colour blindness is not something a sentence can convey.
const EYES: readonly { key: string; name: Key }[] = [
  { key: 'normal', name: 'wall.eye.normal' },
  { key: 'deuteranopia', name: 'wall.eye.deuteranopia' },
  { key: 'protanopia', name: 'wall.eye.protanopia' },
  { key: 'tritanopia', name: 'wall.eye.tritanopia' },
  { key: 'gray', name: 'wall.eye.gray' },
]
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
export function DeckWall({ doc, face, selectedRow, onSelectRow, onSelectElement, assetBase, motifs, onFraming, onFixChecks }: DeckWallProps) {
  const t = useT()
  // What was mended is said out loud: an edit that changes the template under a deck of forty
  // cards and says nothing is the silence #32 forbids.
  const say = useSay()
  const faceTemplate = doc.template.faces[face]
  // The fonts the version is pinned to (B3), worked out once per document: a fresh object every
  // render is a fresh compile of every card on the wall, and a card recompiled under the pointer
  // is a card that cannot be clicked.
  const fonts = useMemo(() => previewFonts(doc, assetBase), [doc, assetBase])
  // The project's icons, resolved once for the same reason: `previewIcons` builds a fresh object
  // every call, and a fresh object is a fresh compile of the whole wall (E1).
  const icons = useMemo(() => previewIcons(doc, assetBase), [doc, assetBase])
  const [warnings, setWarnings] = useState<Record<string, number>>({})
  const [eye, setEye] = useState<string>('normal')
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
  const [filter, setFilter] = useState<FilterState>(noFilter)
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
  const sections = useRef(new Map<string, HTMLElement>())
  // A drawer hands the focus back to the box it came from when it closes (#133), so each box has
  // to be findable from the drawer it opened.
  const eyesBox = useRef<HTMLButtonElement>(null)
  const guidesBox = useRef<HTMLButtonElement>(null)
  const groupingBox = useRef<HTMLButtonElement>(null)
  const checksBox = useRef<HTMLButtonElement>(null)
  const onWarnings = useCallback((cardRef: string, w: Warning[]) => {
    setWarnings((m) => (m[cardRef] === w.length ? m : { ...m, [cardRef]: w.length }))
  }, [])
  const found = deckIssues(doc)
  const groups = groupIssues(found)
  const errors = groups.filter((g) => g.severity === 'error')
  const open = groups.find((g) => g.code === openGroup)
  const marked = new Set(open?.cards ?? [])
  const words = issueWords(t)
  const toggle = (which: Box) => setBox((now) => (now === which ? null : which))
  const close = () => setBox(null)
  const denser = (by: number) =>
    setStep((now) => {
      const next = Math.min(DENSITY.length - 1, Math.max(0, now + by))
      rememberDensity(next)
      return next
    })
  const px = arm ? ARM_PX : (DENSITY[step] ?? DENSITY[DENSITY_DEFAULT] ?? 150)
  const eyeNow = EYES.find((e) => e.key === eye) ?? { key: 'normal', name: 'wall.eye.normal' as const }
  // The wall groups by the column the template already groups by (L3): the deck has said once
  // what its groups are, and the home view reads that answer rather than asking a second time.
  const columns = ['id', ...fieldsOf(doc)]
  const column = grouped ? (byColumn ?? groupColumn(doc)) : null
  const shown = isFiltering(filter) ? filterRows(doc.rows, columns, filter) : doc.rows
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
  // A jump moves the focus to the band's first card and not merely the scroll position: a reader
  // on a keyboard who was only scrolled to would find the next Tab starting over from the deck.
  const jumpTo = (key: string) => {
    const section = sections.current.get(key)
    const deck = deckRef.current
    if (!section || !deck) return
    const top = section.offsetTop - deck.offsetTop
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
    return (
      <div
        key={cardRef}
        role="listitem"
        className="byd-wall-card"
        data-card-ref={cardRef}
        // A jump from the table of contents moves the focus to the band's first card and not only
        // the scroll position, so every card has to be something focus can be put on.
        tabIndex={-1}
        aria-selected={selectedRow === cardRef ? 'true' : 'false'}
        {...(marked.has(cardRef) ? { 'data-marked': 'true' } : {})}
        onClick={() => onSelectRow(cardRef)}
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
            framing={doc.framing ? framingOf(doc, cardRef) : undefined}
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
          />
        </div>
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
            every step. What it is set to is read off the wall itself, and said in the foot. */}
        <div className="byd-crown-step" role="group" aria-label={t('wall.density')}>
          <button type="button" onClick={() => denser(-1)} aria-label={t('wall.density.more')}>
            <span aria-hidden="true">&#x2212;</span>
          </button>
          <button type="button" onClick={() => denser(1)} aria-label={t('wall.density.less')}>
            <span aria-hidden="true">+</span>
          </button>
        </div>
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
        {bands.length > 0 && (
          <button
            type="button"
            className="byd-crown-fold"
            aria-expanded={jumpOpen}
            aria-controls={jumpId}
            onClick={() => {
              setJumpOpen(!jumpOpen)
              rememberJumpOpen(!jumpOpen)
            }}
          >
            <span aria-hidden="true">{jumpOpen ? '\u27E8' : '\u27E9'}</span>
            {jumpOpen ? t('wall.fold.in') : t('wall.fold.out')}
          </button>
        )}
        <CrownBox name={t('wall.checks.title')} count={groups.length} open={box === 'checks'} onToggle={() => toggle('checks')} boxRef={checksBox} end />
      </Crown>
      {box === 'eyes' && (
        <CrownDrawer label={t('wall.eyes')} opener={eyesBox} onClose={close}>
          {EYES.map((e) => (
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
          {fieldsOf(doc).map((field) => (
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
                  aria-label={t('wall.tile', { group: band.name, n: band.cards.length })}
                  title={t('wall.tile', { group: band.name, n: band.cards.length })}
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
                    aria-label={t('wall.tile', { group: band.name, n: band.cards.length })}
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
          {bands.length === 0 ? (
            <div className="byd-wall" role="list">
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
                <div className="byd-wall" role="list" aria-label={band.name}>
                  {band.cards.map((row) => card(row))}
                </div>
              </section>
            ))
          )}
          {onFraming && <Measure doc={doc} assetBase={assetBase} motifs={motifs} onFraming={onFraming} />}
        </div>
      </div>
      {/* What the wall adds up to, under it rather than over it (#130): the size it is drawn at,
          which nothing else on the surface says now that density is two bare presses. */}
      <CrownFoot>
        <span>
          {isFiltering(filter)
            ? t('wall.foot.found', { shown: shown.length, total: doc.rows.length, px })
            : t('wall.foot.cards', { n: doc.rows.length, px })}
        </span>
        <span>
          {groups.length === 0
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
  t,
}: {
  groups: ReturnType<typeof groupIssues>
  errors: number
  words: Record<string, string>
  openGroup: string | null
  onOpenGroup(code: string | null): void
  fixes(code: string): Fix[]
  onFix(code: string, what: string): void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="byd-wall-checks">
      {groups.length === 0 ? (
        <p className="byd-wall-ok">{t('wall.checks.ok')}</p>
      ) : (
        <>
          <p className="byd-wall-lead">
            {errors > 0 ? t(errors === 1 ? 'wall.checks.errors.one' : 'wall.checks.errors.other', { n: errors }) : t('wall.checks.warningsOnly')}
          </p>
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
                      {g.elements.join(', ')} · {g.faces.join(', ')}
                    </span>
                    {/* The remedy, where the check has one (#233). It is one edit on the template
                        and not one per card — the fault is the template's, which is the whole
                        reason this list is gathered by kind — so a group of forty cards mends in a
                        single step that can be taken back in a single step.
                        Where there is no remedy the reason stands in its place rather than a hole:
                        contrast and colour-alone need a choice of the designer's, and a font needs
                        a file (B3), none of which a patch can invent. */}
                    {fixes(g.code).length > 0 ? (
                      <button type="button" className="byd-secondary" onClick={() => onFix(g.code, words[g.code] ?? g.code)}>
                        {t('wall.checks.fix')}
                      </button>
                    ) : (
                      <small>{t('wall.checks.fix.none')}</small>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="byd-wall-lead">{t('wall.checks.note')}</p>
        </>
      )}
    </div>
  )
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

// The deck's answer to the measure (E1, prototype variant C).
//
// Framing is not a decision per card: nobody frames forty pictures by hand, and what a designer
// actually does is say how the deck should look and then deal with the handful of files that
// cannot get there. The measure itself moved into the template's image element, which owns the
// frame it is a share of (#221, L22, beslut 3); what is left here is the work it makes — the list
// of files that cannot answer, which is meant to empty, and each card's own exception to it.
function Measure({
  doc,
  assetBase,
  motifs,
  onFraming,
}: {
  doc: ProjectDoc
  assetBase: string | undefined
  motifs: Record<string, Motif> | undefined
  onFraming(cardRef: string, field: string, framing: Nudge | null): void
}) {
  const t = useT()
  const [openSource, setOpenSource] = useState<{ cardRef: string; field: string } | null>(null)
  const spots = measuredSpots(doc)
  // The document keys its cells by `asset:<hash>`; the wall keys its measurements by the URL a
  // resolved row carries. Only here is both known, so the walk from one to the other happens here.
  const motifFor = (value: string): Motif | undefined =>
    assetBase && isAssetRef(value) ? motifs?.[assetUrl(assetBase, value.slice('asset:'.length))] : motifs?.[value]
  const cannot = objections(doc, motifFor)
  const measured = spots.filter((s) => s.frame)
  // How many cards draw their motif at the size the measure asked for. A card that had to be put
  // right is still uniform — it simply says, out loud, the size its file forced.
  const even = doc.rows.length - new Set(cannot.map((o) => o.cardRef)).size
  // A wall with no measure anywhere has nothing to say about one: the switch that gives a picture
  // area its measure stands in the template, beside the frame the measure is a share of.
  if (measured.length === 0) return null
  return (
    <section className="byd-wall-measure" role="group" aria-label={t('wall.measure')}>
      <h2>{t('wall.measure')}</h2>
      <p className="byd-wall-lead">{t('wall.measure.lead', { fields: [...new Set(measured.map((s) => s.field))].join(', ') })}</p>
      {cannot.length === 0 ? (
        <p className="byd-wall-ok">{t('wall.measure.even', { n: even, of: doc.rows.length })}</p>
      ) : (
        <>
          <p className="byd-wall-lead">{t(cannot.length === 1 ? 'wall.measure.cannot.one' : 'wall.measure.cannot.other', { n: cannot.length })}</p>
          <ul aria-label={t('wall.measure.cannot')}>
            {cannot.map((o) => (
              <li key={`${o.cardRef}/${o.field}`} data-card-ref={o.cardRef}>
                <b>{o.cardRef}</b>
                <span>{t('wall.measure.short')}</span>
                <button type="button" onClick={() => onFraming(o.cardRef, o.field, o.to)}>
                  {t('wall.measure.fix', { percent: Math.round(o.drawnAt * 100) })}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="byd-wall-measure-open">
        {doc.rows.map((row) => {
          const spot = measured[0]
          if (!spot) return null
          const open = openSource?.cardRef === row.id && openSource.field === spot.field
          return (
            <button key={row.id} type="button" aria-pressed={open} onClick={() => setOpenSource(open ? null : { cardRef: row.id, field: spot.field })}>
              {t('wall.measure.open', { cardRef: row.id })}
            </button>
          )
        })}
      </div>
      {openSource &&
        (() => {
          const spot = measured.find((m) => m.field === openSource.field)
          const value = doc.rows.find((r) => r.id === openSource.cardRef)?.fields[openSource.field]
          const motif = typeof value === 'string' ? motifFor(value) : undefined
          const url = typeof value === 'string' && assetBase && isAssetRef(value) ? assetUrl(assetBase, value.slice('asset:'.length)) : typeof value === 'string' ? value : ''
          if (!spot?.frame || !motif || !url) return null
          return (
            <Source
              cardRef={openSource.cardRef}
              field={openSource.field}
              url={url}
              motif={motif}
              frame={spot.frame}
              ratio={spot.ratio}
              nudge={framingOf(doc, openSource.cardRef)[openSource.field] ?? {}}
              onFraming={onFraming}
              onClose={() => setOpenSource(null)}
            />
          )
        })()}
      {Object.keys(doc.framing ?? {}).length > 0 && (
        <p className="byd-wall-lead">
          {t('wall.measure.byHand', { n: Object.keys(doc.framing ?? {}).length })}{' '}
          {doc.rows.some((r) => Object.keys(framingOf(doc, r.id)).length > 0) && (
            <button type="button" className="byd-wall-measure-drop" onClick={() => {
              for (const key of Object.keys(doc.framing ?? {})) {
                const cut = key.indexOf('/')
                onFraming(key.slice(0, cut), key.slice(cut + 1), null)
              }
            }}>
              {t('wall.measure.drop')}
            </button>
          )}
        </p>
      )}
    </section>
  )
}

// One file, opened (E1). The file is shown whole and dimmed with the window lit over it, because
// what is being judged is which part of the drawing the card will show — and the measure it is
// being judged against is still on screen above, since the fix is nearly always to the measure
// and not to this one picture.
//
// Nothing here rewrites the file. What the sliders write is this card's departure, and "back to
// the measure" is the way out that does not ask anyone to remember a number.
function Source({
  cardRef,
  field,
  url,
  motif,
  frame,
  ratio,
  nudge,
  onFraming,
  onClose,
}: {
  cardRef: string
  field: string
  url: string
  motif: Motif
  frame: Frame
  ratio: number
  nudge: Nudge
  onFraming(cardRef: string, field: string, framing: Nudge | null): void
  onClose(): void
}) {
  const t = useT()
  const win = frameWindow(motif, frame, ratio, nudge)
  // The file drawn to fit a fixed box; the window is then laid on it in those same screen pixels.
  const view = 320
  const by = Math.min(view / motif.w, view / motif.h)
  const write = (next: Partial<Nudge>) => onFraming(cardRef, field, { zoom: nudge.zoom ?? 1, dx: nudge.dx ?? 0, dy: nudge.dy ?? 0, ...next })
  return (
    <section className="byd-wall-source" role="group" aria-label={t('wall.measure.source', { cardRef })}>
      <div className="byd-wall-source-file" style={{ width: motif.w * by, height: motif.h * by }}>
        <img src={url} alt={t('wall.measure.source', { cardRef })} style={{ width: motif.w * by, height: motif.h * by }} />
        <span data-testid="byd-window" className="byd-wall-source-window" style={{ left: win.x * by, top: win.y * by, width: win.w * by, height: win.h * by }} />
      </div>
      <div className="byd-wall-source-tools">
        <b>{cardRef}</b>
        <p className="byd-wall-lead">{t('wall.measure.source.lead')}</p>
        <label>
          {t('wall.measure.size')}
          <input type="range" min={0.5} max={3} step={0.01} value={nudge.zoom ?? 1} onChange={(e) => write({ zoom: Number(e.target.value) })} />
        </label>
        <label>
          {t('wall.measure.across')}
          <input type="range" min={-0.5} max={0.5} step={0.01} value={nudge.dx ?? 0} onChange={(e) => write({ dx: Number(e.target.value) })} />
        </label>
        <label>
          {t('wall.measure.down')}
          <input type="range" min={-0.5} max={0.5} step={0.01} value={nudge.dy ?? 0} onChange={(e) => write({ dy: Number(e.target.value) })} />
        </label>
        <button type="button" onClick={() => onFraming(cardRef, field, null)}>
          {t('wall.measure.back')}
        </button>
        <button type="button" onClick={onClose}>
          {t('wall.measure.close')}
        </button>
      </div>
    </section>
  )
}
