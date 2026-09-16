import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Frame, Motif, Nudge, Warning } from '@byd/template'
import { CardPreview } from './CardPreview.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { deckIssues, groupIssues, issueDetail, issueWords } from './checks.js'
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
  scale?: number
  assetBase?: string | undefined
  // What is drawn inside each picture (E1), keyed by the URL a resolved row carries.
  motifs?: Record<string, Motif> | undefined
  // The deck's measure is the template's (E1), so setting it is a change to an image element;
  // one card's departure from it is the deck's. The wall does neither itself — it is where the
  // whole deck can be seen at once, which is the only place uniformity can be judged.
  onMeasure?(face: string, id: string, frame: Frame): void
  onFraming?(cardRef: string, field: string, framing: Nudge | null): void
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
// A card at arm's length is the cheapest check of all, and needs no validation at all.
const ARM_SCALE = 0.34
// How wide a card is drawn on the wall, in CSS pixels (#128). The default is the width the wall
// always had; the range is one card readable at a glance at the bottom and one whose body text can
// actually be read at the top. At arm's length the wall draws them small whatever the step says,
// which is the whole point of that view, so the two buttons are off while it is on.
const DEFAULT_CARD_PX = 150
const MIN_CARD_PX = 96
const MAX_CARD_PX = 280
const CARD_PX_STEP = 26
const ARM_CARD_PX = 90

// The deck as a wall (C as the home view): every row as a card, copies and faults on each, the
// whole deck visible at once — a balance change on forty cards is seen as one thing. Beside it
// the physical checks (E5), gathered by kind, and the eyes to read the deck with.
export function DeckWall({ doc, face, selectedRow, onSelectRow, onSelectElement, scale = 0.6, assetBase, motifs, onMeasure, onFraming }: DeckWallProps) {
  const t = useT()
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
  // How wide a card is drawn (#128). The wall used to hand a wider screen more columns and never a
  // bigger card, so a deck was the same number of screens on a 1920 monitor as on a 1280 laptop.
  // The step is the size the whole grid is laid out from; at arm's length the wall sets its own.
  const [size, setSize] = useState(DEFAULT_CARD_PX)
  const step = (by: number) => setSize((px) => Math.max(MIN_CARD_PX, Math.min(MAX_CARD_PX, px + by)))
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const onWarnings = useCallback((cardRef: string, w: Warning[]) => {
    setWarnings((m) => (m[cardRef] === w.length ? m : { ...m, [cardRef]: w.length }))
  }, [])
  const found = deckIssues(doc)
  const groups = groupIssues(found)
  const errors = groups.filter((g) => g.severity === 'error')
  const open = groups.find((g) => g.code === openGroup)
  const marked = new Set(open?.cards ?? [])
  const words = issueWords(t)
  if (!faceTemplate) return <p>{t('template.faceMissing', { face })}</p>
  return (
    <div className="byd-wall-view">
      <EyeFilters />
      <div className="byd-wall-tools">
        <div role="group" aria-label={t('wall.eyes')}>
          {EYES.map((e) => (
            <button key={e.key} type="button" className="byd-choice" aria-pressed={eye === e.key} onClick={() => setEye(e.key)}>
              {t(e.name)}
            </button>
          ))}
        </div>
        <label>
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> {t('wall.trim')}
        </label>
        <label>
          <input type="checkbox" checked={arm} onChange={(e) => setArm(e.target.checked)} /> {t('wall.arm')}
        </label>
        <span className="byd-wall-count">{t(doc.rows.length === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: doc.rows.length })}</span>
        <div className="byd-wall-size" role="group" aria-label={t('wall.size')}>
          <button type="button" aria-label={t('wall.size.smaller')} disabled={arm || size <= MIN_CARD_PX} onClick={() => step(-CARD_PX_STEP)}>
            −
          </button>
          <output>{t('wall.size.value', { n: arm ? ARM_CARD_PX : size })}</output>
          <button type="button" aria-label={t('wall.size.bigger')} disabled={arm || size >= MAX_CARD_PX} onClick={() => step(CARD_PX_STEP)}>
            +
          </button>
        </div>
      </div>
      <div
        className="byd-wall"
        role="list"
        data-wall
        data-eye={eye}
        style={{ '--byd-wall-card': `${arm ? ARM_CARD_PX : size}px` } as CSSProperties}
        {...(trim ? { 'data-trim': 'true' } : {})}
        {...(arm ? { 'data-arm': 'true' } : {})}
      >
        {doc.rows.map(({ id: cardRef, fields: row }) => {
          const copies = Number(row['antal'] ?? 1)
          // The badge stays this card's own trouble — an unknown icon, text that will not fit.
          // A physical fault is nearly always the template's, and saying it on every card would
          // be forty red badges for one mistake; the report beside says it once.
          const count = warnings[cardRef] ?? 0
          return (
            <div
              key={cardRef}
              role="listitem"
              className="byd-wall-card"
              data-card-ref={cardRef}
              aria-selected={selectedRow === cardRef ? 'true' : 'false'}
              {...(marked.has(cardRef) ? { 'data-marked': 'true' } : {})}
              onClick={() => onSelectRow(cardRef)}
            >
              <CardPreview
                id={`wall-${cardRef}`}
                face={faceTemplate}
                row={row}
                icons={icons}
                fonts={fonts}
                scale={arm ? ARM_SCALE : scale}
                assetBase={assetBase}
                motifs={motifs}
                palette={doc.palette}
                framing={doc.framing ? framingOf(doc, cardRef) : undefined}
                onSelectElement={onSelectElement}
                onWarnings={(w) => onWarnings(cardRef, w)}
              />
              {copies > 1 && <span className="byd-wall-copies" data-copies>×{copies}</span>}
              {count > 0 && (
                <span className="byd-wall-warnings" data-warnings>
                  {count}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {onMeasure && onFraming && <Measure doc={doc} assetBase={assetBase} motifs={motifs} onMeasure={onMeasure} onFraming={onFraming} />}
      <aside className="byd-wall-checks">
        <h2>{t('wall.checks.title')}</h2>
        {groups.length === 0 ? (
          <p className="byd-wall-ok">{t('wall.checks.ok')}</p>
        ) : (
          <>
            <p className="byd-wall-lead">
              {errors.length > 0 ? t(errors.length === 1 ? 'wall.checks.errors.one' : 'wall.checks.errors.other', { n: errors.length }) : t('wall.checks.warningsOnly')}
            </p>
            <ul aria-label={t('wall.checks.title')}>
              {groups.map((g) => (
                <li key={g.code} data-severity={g.severity} data-check={g.code}>
                  <button type="button" aria-expanded={openGroup === g.code} onClick={() => setOpenGroup(openGroup === g.code ? null : g.code)}>
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
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="byd-wall-lead">{t('wall.checks.note')}</p>
          </>
        )}
      </aside>
    </div>
  )
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

// The deck's measure, and the files that cannot answer it (E1, prototype variant C).
//
// Framing is not a decision per card: nobody frames forty pictures by hand, and what a designer
// actually does is say how the deck should look and then deal with the handful of files that
// cannot get there. So the measure is one control pair per picture area, and the work is the list
// under it — which is meant to empty.
const DEFAULT_MEASURE: Frame = { fill: 0.8, anchor: 'centre' }

function Measure({
  doc,
  assetBase,
  motifs,
  onMeasure,
  onFraming,
}: {
  doc: ProjectDoc
  assetBase: string | undefined
  motifs: Record<string, Motif> | undefined
  onMeasure(face: string, id: string, frame: Frame): void
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
  if (spots.length === 0) return null
  return (
    <section className="byd-wall-measure" role="group" aria-label={t('wall.measure')}>
      <h2>{t('wall.measure')}</h2>
      <p className="byd-wall-lead">{t('wall.measure.lead')}</p>
      {spots.map((spot) => (
        <div key={`${spot.face}-${spot.id}`} className="byd-wall-measure-spot" data-spot={spot.id}>
          <b>{spot.field}</b>
          {spot.frame ? (
            <>
              <label>
                {t('wall.measure.fill', { percent: Math.round(spot.frame.fill * 100) })}
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.01}
                  value={spot.frame.fill}
                  onChange={(e) => onMeasure(spot.face, spot.id, { fill: Number(e.target.value), anchor: spot.frame?.anchor ?? 'centre' })}
                />
              </label>
              <div role="group" aria-label={t('wall.measure.sits')}>
                {(['centre', 'foot'] as const).map((anchor) => (
                  <button
                    key={anchor}
                    type="button"
                    className="byd-choice"
                    aria-pressed={spot.frame?.anchor === anchor}
                    onClick={() => onMeasure(spot.face, spot.id, { fill: spot.frame?.fill ?? DEFAULT_MEASURE.fill, anchor })}
                  >
                    {t(anchor === 'centre' ? 'wall.measure.centred' : 'wall.measure.foot')}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="byd-wall-measure-start" onClick={() => onMeasure(spot.face, spot.id, DEFAULT_MEASURE)}>
              {t('wall.measure.start')}
            </button>
          )}
        </div>
      ))}
      {measured.length > 0 &&
        (cannot.length === 0 ? (
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
        ))}
      {measured.length > 0 && (
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
      )}
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
