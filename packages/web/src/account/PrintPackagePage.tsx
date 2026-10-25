import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { CARD_STANDARD_63x88, DICE } from '@byd/engine'
import type { PreparedFile, PrintRequirements, Quote } from '@byd/print'
import { titleOfRow } from '@byd/server/doc'
import type { Motif } from '@byd/template'
import { LoginCard } from './LoginCard.js'
import { readPrintPackage, readPrintZip, whoAmI, withCredentials, Unauthorized, type PrintFinding, type PrintPackage } from './api.js'
import { marked } from './marked.js'
import { CardPreview } from '../editor/CardPreview.js'
import { previewIcons, mediaInGame } from '../editor/assets.js'
import { previewFonts } from '../editor/fonts.js'
import { previewMotifs } from '../editor/motifs.js'
import type { ProjectDoc } from '../editor/types.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useSay } from '../status/StatusLive.js'
import { useLang, useT, type Key } from '../i18n/index.js'
import { ArrowGlyph, CheckGlyph, DieGlyph, ImportGlyph } from '../glyphs.js'
import './account.css'
import './print-package.css'

// /print-package?project=<id> — the print package (#1208, beställarens beslut B 2026-10-23, after the
// prototype on `proto/1208-tryckpaketet`): what would be sent to a printer, said so that a designer
// who has never ordered print understands it, and downloadable during the beta (F1).
//
// One page in one sweep, in five numbered parts — how a card is cut, the deck, what is not printed,
// the printer's requirements and the package — with a packing slip beside them that stays: the
// counts, the print checks, what the printer would answer, and the download. On a phone the slip
// comes last, and the download is offered at the top as well.
//
// Everything on it is what the server prepared through the same `PrintProvider` way an order goes
// (F2): the package is asked for as an order to Sweden would be routed, and Testtryckeriet answers.
// The cards are drawn by the one `CardPreview` (E2), with the bleed the printer asks for.

// Where the beta's designers are, and what the slip says the parcel is sent to. There is no address
// to ask for until there is an order (F3).
const TO = 'SE'
// How often the download asks how far the files have come, as the export does.
const POLL_MS = 700
// How wide a card in the deck is drawn, in CSS pixels; the column is reserved from the same number.
export const PRINT_CARD_W = 104
// A card's own width in CSS pixels at a zoom of one, as `CardPreview` lays it out. Said here rather
// than taken from the editor's module, so the page does not split the editor's code into a chunk
// of its own that every other route would name (the phone's scripts are held to an alarm, #760).
const CARD_PX = (CARD_STANDARD_63x88.physical.widthMm / 25.4) * 96
// How many findings the deck lists before it says how many more there are.
const FINDINGS_SHOWN = 3

export type PrintPackagePageProps = { onNavigate?(url: string): void }

type Doc = ProjectDoc & { rev: number }
type Loaded = { doc: Doc; pkg: PrintPackage }
type Refused = { refused: Key }

const save = (zip: Blob, name: string) => {
  const a = document.createElement('a')
  const url = URL.createObjectURL(zip)
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const refusalOf = (status: number, reason?: string): Key =>
  status === 403 ? 'print.refused.forbidden' : status === 404 ? 'print.refused.missing' : status === 409 && reason === 'no-eu-print' ? 'print.refused.noEu' : 'print.refused.unavailable'

async function loadDoc(http: string, project: string): Promise<Doc | Refused> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) return { refused: refusalOf(res.status) }
  const { id: _id, owner: _owner, ...doc } = (await res.json()) as Doc & { id: string; owner?: string }
  return doc
}

export function PrintPackagePage({ onNavigate = (url) => location.assign(url) }: PrintPackagePageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const project = params.get('project') ?? ''
  const fromEditor = params.get('from') === 'editor'
  const http = server ?? location.origin
  const [loaded, setLoaded] = useState<Loaded | Refused | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [motifs, setMotifs] = useState<Record<string, Motif>>({})
  useEffect(() => {
    let live = true
    setOffline(false)
    void (async (): Promise<Loaded | Refused | null> => {
      if (!(await whoAmI(http))) return null
      const doc = await loadDoc(http, project)
      if ('refused' in doc) return doc
      const read = await readPrintPackage(http, project, TO)
      if (read.state === 'refused') return { refused: refusalOf(read.status, read.reason) }
      return { doc, pkg: read.pkg }
    })().then(
      (state) => live && setLoaded(state),
      (err: unknown) => live && (err instanceof Unauthorized ? setLoaded(null) : setOffline(true)),
    )
    return () => {
      live = false
    }
  }, [http, project, attempt])
  // What is drawn inside the game's pictures (E1), as far as anyone has measured it: a picture no one
  // has is drawn by its file, as it is everywhere before it is measured. Asking may fail quietly.
  const doc = loaded && 'doc' in loaded ? loaded.doc : null
  const pictures = doc ? mediaInGame(doc).map((m) => m.hash).join(',') : ''
  useEffect(() => {
    if (pictures === '') return
    let live = true
    void fetch(`${http}/assets/motifs?of=${pictures}`, withCredentials())
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, Motif>>) : {}))
      .then((found) => live && setMotifs(found))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [http, pictures])
  usePageTitle({ state: offline ? 'offline' : loaded === undefined ? 'loading' : null, route: loaded === null ? 'login' : null, game: doc?.name ?? null, part: doc ? t('print.title') : null })

  const withServer = (path: string, q: URLSearchParams) => {
    if (server) q.set('server', server)
    const query = q.toString()
    return query ? `${path}?${query}` : path
  }
  const go = (url: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onNavigate(url)
  }

  if (offline) return <StatusNotice notice={noticeFor('offline', 'app', t)} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (loaded === undefined) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  if (loaded === null) {
    return (
      <main className="byd-account byd-account-door" data-page="print-package">
        <LoginCard http={http} next={location.pathname + location.search} onNavigate={onNavigate} />
      </main>
    )
  }
  const home = withServer('/', new URLSearchParams())
  const editor = withServer('/editor', new URLSearchParams({ project }))
  const back = fromEditor ? editor : home
  const backLink = (
    <a className="byd-print-back" href={back} onClick={go(back)}>
      <ArrowGlyph to="left" />
      {fromEditor && doc ? t('print.back.game', { game: doc.name }) : t('print.back.home')}
    </a>
  )
  if ('refused' in loaded) {
    return (
      <main className="byd-account byd-account-wide" data-page="print-package">
        <div className="byd-print">
          {backLink}
          <h1 className="byd-print-title">{t('print.title')}</h1>
          <p className="byd-print-refused" role="alert">
            {t(loaded.refused)}
          </p>
        </div>
      </main>
    )
  }
  return (
    <main className="byd-account byd-account-wide" data-page="print-package">
      <Package doc={loaded.doc} pkg={loaded.pkg} http={http} project={project} motifs={motifs} backLink={backLink} editor={editor} go={go} />
    </main>
  )
}

// The deck as the printer gets it: each card once, with how many copies, in the order it was first
// named; and each back once, with how many cards wear it.
type DeckCard = { cardRef: string; title: string; count: number; files: Record<string, string> }
type Back = { file: string; cardRef: string; count: number }
function deckOf(doc: Doc, pkg: PrintPackage): { cards: DeckCard[]; backs: Back[]; total: number } {
  const cards = new Map<string, DeckCard>()
  const backs = new Map<string, Back>()
  for (const card of pkg.order.cards) {
    const seen = cards.get(card.cardRef)
    if (seen) seen.count++
    else {
      const row = doc.rows.find((r) => r.id === card.cardRef)
      cards.set(card.cardRef, { cardRef: card.cardRef, title: row ? titleOfRow(row) : card.cardRef, count: 1, files: card.files })
    }
    const back = card.files['back']
    if (back !== undefined) {
      const had = backs.get(back)
      if (had) had.count++
      else backs.set(back, { file: back, cardRef: card.cardRef, count: 1 })
    }
  }
  return { cards: [...cards.values()], backs: [...backs.values()], total: pkg.order.cards.length }
}

type Chosen = { cardRef: string; face: string; title: string }

function Package({ doc, pkg, http, project, motifs, backLink, editor, go }: { doc: Doc; pkg: PrintPackage; http: string; project: string; motifs: Record<string, Motif>; backLink: ReactNode; editor: string; go(url: string): (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const t = useT()
  const deck = useMemo(() => deckOf(doc, pkg), [doc, pkg])
  const card = pkg.requirements.find((r): r is Extract<PrintRequirements, { kind: 'printed' }> => r.kind === 'printed') ?? null
  const first = deck.cards[0]
  const [chosen, setChosen] = useState<Chosen | null>(first ? { cardRef: first.cardRef, face: 'front', title: first.title } : null)
  const drawing = useDrawing(doc, http, motifs)
  const errors = pkg.errors
  const dice = pkg.order.hardware.reduce((n, h) => n + h.count, 0)
  const fronts = new Set(Object.values(deck.cards).map((c) => c.files['front']).filter((f) => f !== undefined)).size
  const part = (n: number, id: string, title: string, lead: string, body: ReactNode) => (
    <section className="byd-print-part" aria-labelledby={`byd-print-${id}`}>
      <header>
        <span className="byd-print-nr" aria-hidden="true">
          {n}
        </span>
        <h2 id={`byd-print-${id}`}>{title}</h2>
        <p>{lead}</p>
      </header>
      {body}
    </section>
  )
  const download = <Download http={http} project={project} provider={pkg.provider.id} stopped={errors.length > 0} />
  return (
    <div className="byd-print">
      <div className="byd-print-top">
        {backLink}
        <h1 className="byd-print-title">
          {t('print.title')}
          <small>{t('print.sub', { name: doc.name, rev: doc.rev })}</small>
        </h1>
        <p className="byd-print-lead">{t('print.lead', { name: doc.name })}</p>
        <div className="byd-print-quick">
          <Download http={http} project={project} provider={pkg.provider.id} stopped={errors.length > 0} />
          <span className="byd-muted">{t('print.quick.note')}</span>
        </div>
      </div>
      <div className="byd-print-columns">
        <div className="byd-print-parts">
          {card &&
            chosen &&
            part(1, 'cut', t('print.cut.title'), t('print.cut.lead'), <Cut chosen={chosen} req={card} drawing={drawing} />)}
          {part(
            2,
            'deck',
            t(deck.total === 1 ? 'print.deck.title.one' : 'print.deck.title.other', { n: deck.total }),
            t('print.deck.lead', { cards: deck.total, pairs: deck.cards.length }),
            <DeckPart deck={deck} fronts={fronts} errors={errors} chosen={chosen} onChoose={setChosen} drawing={drawing} editor={editor} go={go} />,
          )}
          {part(3, 'stock', t('print.stock.title'), t('print.stock.lead'), <Stock doc={doc} pkg={pkg} />)}
          {card && part(4, 'needs', t('print.needs.title'), t('print.needs.lead'), <Needs req={card} />)}
          {part(5, 'zip', t('print.zip.title'), t('print.zip.lead'), <ZipTree doc={doc} pkg={pkg} deck={deck} />)}
        </div>
        <aside className="byd-print-slip" aria-label={t('print.slip.label')}>
          <h2>{t('print.slip.title')}</h2>
          <dl>
            <dt>{t('print.slip.cards')}</dt>
            <dd>{deck.total}</dd>
            <dt>{t('print.slip.fronts')}</dt>
            <dd>{fronts}</dd>
            {pkg.order.hardware.map((h) => (
              <Fragment key={`${h.type.id}@${h.type.version}`}>
                <dt>{t('print.slip.dice', { faces: facesOf(h.type.id) })}</dt>
                <dd>{h.count}</dd>
              </Fragment>
            ))}
            <dt>{t('print.slip.checks')}</dt>
            <dd data-ok={errors.length === 0 || undefined} data-bad={errors.length > 0 || undefined}>
              {errors.length === 0 ? t('print.slip.checks.clean') : t(errors.length === 1 ? 'print.slip.checks.errors.one' : 'print.slip.checks.errors.other', { n: errors.length })}
            </dd>
          </dl>
          {pkg.quote && <Answer quote={pkg.quote} cards={deck.total} kinds={deck.cards.length} dice={dice} refused={errors.length > 0} />}
          {download}
          <p className="byd-print-beta">
            <InfoMark />
            <span>
              <b>{t('print.beta')}</b> {t('print.beta.body')}
            </span>
          </p>
          <p className="byd-print-no-order">{marked(t('print.noOrder'), { would: <i>{t('print.noOrder.would')}</i> })}</p>
        </aside>
      </div>
    </div>
  )
}

// The «i» beside the beta's note: the check glyph's circle is not one, so it is drawn from text.
function InfoMark() {
  return (
    <span className="byd-print-info" aria-hidden="true">
      i
    </span>
  )
}

const facesOf = (typeId: string): number => Number(/^die\.d(\d+)$/.exec(typeId)?.[1] ?? 0)

// What it takes to draw the game's cards, resolved once and held by identity: a fresh object is a
// fresh compile of every card on the page (#320).
type Drawing = { icons: Record<string, string>; fonts: Record<string, { stack: string; src?: string }>; motifs: Record<string, Motif>; palette: Record<string, string> | undefined; http: string; doc: Doc }
function useDrawing(doc: Doc, http: string, motifs: Record<string, Motif>): Drawing {
  const icons = useMemo(() => previewIcons(doc, http), [doc, http])
  const fonts = useMemo(() => previewFonts(doc, http), [doc, http])
  const drawnMotifs = useMemo(() => previewMotifs(motifs, http, doc.pictures), [motifs, http, doc.pictures])
  return useMemo(() => ({ icons, fonts, motifs: drawnMotifs, palette: doc.palette, http, doc }), [icons, fonts, drawnMotifs, doc, http])
}

// One side of one card through the one renderer (E2), at a width in CSS pixels, with or without the
// bleed the printer asks for.
function Side({ id, drawing, cardRef, face, width, bleed = 0 }: { id: string; drawing: Drawing; cardRef: string; face: string; width: number; bleed?: number }) {
  const template = drawing.doc.template.faces[face]
  const row = drawing.doc.rows.find((r) => r.id === cardRef)
  if (!template || !row) return null
  const mm = CARD_STANDARD_63x88.physical.widthMm
  const scale = (width * mm) / (mm + 2 * bleed) / CARD_PX
  return <CardPreview id={id} face={template} row={row.fields} icons={drawing.icons} fonts={drawing.fonts} assetBase={drawing.http} motifs={drawing.motifs} palette={drawing.palette} scale={scale} {...(bleed > 0 ? { bleed } : {})} />
}

// How wide an element is, followed as it changes; `fallback` where nothing lays anything out.
function useWidth<E extends HTMLElement>(fallback: number): [RefObject<E | null>, number] {
  const ref = useRef<E>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    const watching = new ResizeObserver(measure)
    watching.observe(el)
    return () => watching.disconnect()
  }, [])
  return [ref, width]
}

const decimal = (n: number, lang: string) => (lang === 'sv' ? String(n).replace('.', ',') : String(n))

// 1 · How a card is cut. The card drawn as its file, with the bleed, the trim and the safe margin
// over it in millimetres, and a knife that can be tried: it slips up to 1,4 mm as a real one does,
// and «Utan utfall» shows the white edge left when the background stops at the trim.
type Knife = { view: 'file' | 'cut'; bleed: boolean; dx: number; dy: number }
function Cut({ chosen, req, drawing }: { chosen: Chosen; req: Extract<PrintRequirements, { kind: 'printed' }>; drawing: Drawing }) {
  const t = useT()
  const { lang } = useLang()
  const [knife, setKnife] = useState<Knife>({ view: 'file', bleed: true, dx: 0, dy: 0 })
  // Another card starts at its file, as the prototype does.
  const shown = `${chosen.cardRef}:${chosen.face}`
  const [was, setWas] = useState(shown)
  if (was !== shown) {
    setWas(shown)
    setKnife((k) => ({ ...k, view: 'file', dx: 0, dy: 0 }))
  }
  const slip = (): Knife => {
    const a = Math.random() * Math.PI * 2
    const r = 0.5 + Math.random() * 0.9
    return { ...knife, view: 'cut', dx: Math.round(Math.cos(a) * r * 10) / 10, dy: Math.round(Math.sin(a) * r * 10) / 10 }
  }
  const { widthMm: w, heightMm: h } = req.trim
  const b = req.bleedMm
  const s = req.safeMm
  const r = CARD_STANDARD_63x88.physical.cornerRadiusMm ?? 0
  const W = w + 2 * b
  const H = h + 2 * b
  const [box, width] = useWidth<HTMLDivElement>(300)
  const cut = knife.view === 'cut'
  const pct = (n: number, of: number) => `${(n / of) * 100}%`
  const clip = cut ? `inset(${pct(b + knife.dy, H)} ${pct(b - knife.dx, W)} ${pct(b - knife.dy, H)} ${pct(b + knife.dx, W)} round ${pct(r, W)} / ${pct(r, H)})` : undefined
  const said = (() => {
    if (!cut) return t('print.cut.press')
    const mm = Math.hypot(knife.dx, knife.dy)
    if (mm < 0.1) return t('print.cut.exact')
    const sideways = knife.dx > 0.2 ? t('print.cut.right') : knife.dx < -0.2 ? t('print.cut.left') : null
    const upways = knife.dy > 0.2 ? t('print.cut.down') : knife.dy < -0.2 ? t('print.cut.up') : null
    const where = sideways && upways ? t('print.cut.and', { a: sideways, b: upways }) : (sideways ?? upways ?? '')
    return `${t('print.cut.slipped', { mm: lang === 'sv' ? mm.toFixed(1).replace('.', ',') : mm.toFixed(1), where })} ${knife.bleed ? t('print.cut.filled') : t('print.cut.white')} ${t('print.cut.inside')}`
  })()
  // The cut path, rounded at the corners, in the file's millimetres.
  const trim = `M${b + r} ${b}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  return (
    <div className="byd-print-cut">
      <div className="byd-print-sheet" ref={box} role="img" aria-label={t(cut ? 'print.cut.picture.cut' : 'print.cut.picture.file', { card: chosen.title })} style={{ aspectRatio: `${W} / ${H}` }} data-view={knife.view}>
        <div className="byd-print-sheet-card" style={clip ? { clipPath: clip } : undefined}>
          <Side id="byd-print-knife" drawing={drawing} cardRef={chosen.cardRef} face={chosen.face} width={width} bleed={b} />
          <svg className="byd-print-marks" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <defs>
              <pattern id="byd-print-hatch" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="0.55" height="1.4" />
              </pattern>
            </defs>
            {!knife.bleed && <path className="byd-print-paper" fillRule="evenodd" d={`M0 0h${W}v${H}H0z M${b} ${b}h${w}v${h}h${-w}z`} />}
            {!cut && (
              <>
                <path className="byd-print-bleed" fill="url(#byd-print-hatch)" fillRule="evenodd" d={`M0 0h${W}v${H}H0z ${trim}`} data-faint={!knife.bleed || undefined} />
                <rect className="byd-print-edge" x="0" y="0" width={W} height={H} />
                <rect className="byd-print-safe-ground" x={b + s} y={b + s} width={w - 2 * s} height={h - 2 * s} />
                <rect className="byd-print-safe" x={b + s} y={b + s} width={w - 2 * s} height={h - 2 * s} />
                <path className="byd-print-trim" d={trim} />
              </>
            )}
          </svg>
        </div>
        {!cut && (
          <>
            <span className="byd-print-tag" data-tag="bleed">
              {t('print.cut.tag.bleed', { mm: decimal(b, lang) })}
            </span>
            <span className="byd-print-tag" data-tag="trim">
              {t('print.cut.tag.trim', { w: decimal(w, lang), h: decimal(h, lang) })}
            </span>
            <span className="byd-print-tag" data-tag="safe" style={{ right: pct(b + s, W), bottom: pct(b + s, H) }}>
              {t('print.cut.tag.safe')}
            </span>
          </>
        )}
      </div>
      <div className="byd-print-knife">
        <div className="byd-print-controls">
          <div className="byd-print-seg" role="group" aria-label={t('print.cut.view')}>
            <button type="button" aria-pressed={!cut} onClick={() => setKnife({ ...knife, view: 'file', dx: 0, dy: 0 })}>
              {t('print.cut.file')}
            </button>
            <button type="button" aria-pressed={cut} onClick={() => setKnife(cut ? knife : slip())}>
              {t('print.cut.cut')}
            </button>
          </div>
          <button type="button" className="byd-secondary byd-print-button" onClick={() => setKnife(slip())}>
            {t(cut ? 'print.cut.again' : 'print.cut.knife')}
          </button>
          <label className="byd-print-toggle">
            <input type="checkbox" checked={!knife.bleed} onChange={(e) => setKnife({ ...knife, bleed: !e.target.checked })} />
            {t('print.cut.noBleed')}
          </label>
        </div>
        <p className="byd-print-said" aria-live="polite">
          {said}
        </p>
        <ul className="byd-print-legend">
          <li>
            <span className="byd-print-swatch" data-swatch="bleed" aria-hidden="true" />
            <span>
              <b>{t('print.cut.bleed', { mm: decimal(b, lang) })}</b> {t('print.cut.bleed.body')}
            </span>
          </li>
          <li>
            <span className="byd-print-swatch" data-swatch="trim" aria-hidden="true" />
            <span>
              <b>{t('print.cut.trim', { w: decimal(w, lang), h: decimal(h, lang) })}</b> {t('print.cut.trim.body', { r: decimal(r, lang) })}
            </span>
          </li>
          <li>
            <span className="byd-print-swatch" data-swatch="safe" aria-hidden="true" />
            <span>
              <b>{t('print.cut.safe', { mm: decimal(s, lang) })}</b> {t('print.cut.safe.body')}
            </span>
          </li>
        </ul>
        <p className="byd-muted">{marked(t('print.cut.showing'), { card: <b className="byd-print-strong">{chosen.title}</b> })}</p>
      </div>
    </div>
  )
}

// 2 · The deck: what is sent, counted, with what the print checks found and the cards to choose
// from for the knife.
function DeckPart({ deck, fronts, errors, chosen, onChoose, drawing, editor, go }: { deck: ReturnType<typeof deckOf>; fronts: number; errors: PrintFinding[]; chosen: Chosen | null; onChoose(c: Chosen): void; drawing: Drawing; editor: string; go(url: string): (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const t = useT()
  // A finding marks the side it is on: a card's front on its own tile, a back on the back's tile.
  const faulty = new Set(errors.map((e) => `${e.cardRef}:${e.face}`))
  const backFaulty = (file: string) => deck.cards.some((c) => c.files['back'] === file && faulty.has(`${c.cardRef}:back`))
  const files = deck.cards.reduce((n, c) => n + Object.keys(c.files).filter((f) => f !== 'back').length, 0) + deck.backs.length
  const titleOf = (cardRef: string) => deck.cards.find((c) => c.cardRef === cardRef)?.title ?? cardRef
  return (
    <>
      <p className="byd-print-sums">
        <span>{marked(t(deck.total === 1 ? 'print.deck.cards.one' : 'print.deck.cards.other'), { n: <b>{deck.total}</b> })}</span>
        <span>{marked(t('print.deck.fronts'), { n: <b>{fronts}</b> })}</span>
        <span>{marked(t(deck.backs.length === 1 ? 'print.deck.backs.one' : 'print.deck.backs.other'), { n: <b>{deck.backs.length}</b> })}</span>
        <span>{marked(t(files === 1 ? 'print.deck.files.one' : 'print.deck.files.other'), { n: <b>{files}</b> })}</span>
      </p>
      {errors.length === 0 ? (
        <p className="byd-print-clean">
          <CheckGlyph />
          {t('print.checks.clean')}
        </p>
      ) : (
        <div className="byd-print-findings" role="note">
          <b>{t(errors.length === 1 ? 'print.checks.stop.one' : 'print.checks.stop.other', { n: errors.length })}</b>
          {errors.slice(0, FINDINGS_SHOWN).map((e, i) => (
            <span key={i}>{t('print.checks.line', { card: titleOf(e.cardRef), face: t(e.face === 'back' ? 'print.face.back' : 'print.face.front'), issue: t(`wall.issue.${e.code}` as Key) })}</span>
          ))}
          {errors.length > FINDINGS_SHOWN && <span>{t('print.checks.more', { n: errors.length - FINDINGS_SHOWN })}</span>}
          <span>{t('print.checks.left')}</span>
          <a className="byd-print-fix" href={editor} onClick={go(editor)}>
            {t('print.checks.fix')}
          </a>
        </div>
      )}
      <div className="byd-print-deck" role="group" aria-label={t('print.deck.grid')}>
        {deck.cards.map((c, i) => (
          <button key={c.cardRef} type="button" className="byd-print-card" aria-pressed={chosen?.cardRef === c.cardRef && chosen.face === 'front'} data-error={faulty.has(`${c.cardRef}:front`) || undefined} onClick={() => onChoose({ cardRef: c.cardRef, face: 'front', title: c.title })}>
            <span className="byd-print-card-face" aria-hidden="true">
              <Side id={`byd-print-card-${i}`} drawing={drawing} cardRef={c.cardRef} face="front" width={PRINT_CARD_W} />
            </span>
            {/* The space keeps the name and the count two words when they are read as one name. */}
            <span className="byd-print-card-name">{c.title}</span>{' '}
            <span className="byd-print-card-count">
              <b>{t('print.deck.count', { n: c.count })}</b> · {t('print.deck.sides')}
            </span>
          </button>
        ))}
        {deck.backs.map((back, i) => {
          const name = deck.backs.length === 1 ? t('print.deck.back') : t('print.deck.back.nth', { n: i + 1 })
          return (
            <button key={back.file} type="button" className="byd-print-card" aria-pressed={chosen?.cardRef === back.cardRef && chosen.face === 'back'} data-error={backFaulty(back.file) || undefined} onClick={() => onChoose({ cardRef: back.cardRef, face: 'back', title: name })}>
              <span className="byd-print-card-face" aria-hidden="true">
                <Side id={`byd-print-back-${i}`} drawing={drawing} cardRef={back.cardRef} face="back" width={PRINT_CARD_W} />
              </span>
              <span className="byd-print-card-name">{name}</span>{' '}
              <span className="byd-print-card-count">{deck.backs.length === 1 ? t('print.deck.back.all', { n: back.count }) : t(back.count === 1 ? 'print.deck.back.some.one' : 'print.deck.back.some.other', { n: back.count })}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

// 3 · What is not printed: the dice the printer packs (#1140), those it does not, and the counters
// that exist only on the table (C4).
function Stock({ doc, pkg }: { doc: Doc; pkg: PrintPackage }) {
  const t = useT()
  const counters = doc.setup.seats.length > 0 ? (doc.setup.counters ?? []) : []
  const die = (typeId: string, count: number, body: string) => {
    const faces = facesOf(typeId)
    const size = DICE.find((d) => d.id === typeId)?.physical.widthMm
    return (
      <div key={typeId} className="byd-print-item">
        {/* The tool's own die, the one the editor's dice are chosen under; the felt's drawing of each
            kind lives with the table and would be split out of it for this one picture. */}
        <span className="byd-print-die" aria-hidden="true">
          <DieGlyph />
        </span>
        <div>
          <b>{t('print.stock.die', { n: count, kind: t(`print.stock.die.${faces}` as Key) })}</b> {size !== undefined && t('print.stock.die.size', { faces, mm: size })}
          <p className="byd-muted">{body}</p>
        </div>
      </div>
    )
  }
  const none = pkg.order.hardware.length === 0 && pkg.order.omitted.length === 0 && counters.length === 0
  return (
    <div className="byd-print-stock">
      {pkg.order.hardware.map((h) => die(h.type.id, h.count, t('print.stock.packed')))}
      {pkg.order.omitted.map((h) => die(h.type.id, h.count, t('print.stock.omitted', { provider: t('print.provider') })))}
      {counters.map((c) => (
        <div key={c.name} className="byd-print-item" data-left="">
          <span className="byd-print-counter" aria-hidden="true">
            {c.start}
          </span>
          <div>
            <b>{t('print.stock.counter', { name: c.name })}</b>
            <p className="byd-muted">{t('print.stock.counter.body')}</p>
          </div>
        </div>
      ))}
      {none && <p className="byd-muted">{t('print.stock.none')}</p>}
    </div>
  )
}

// 4 · The printer's requirements, in words, from its `requirements()`.
function Needs({ req }: { req: Extract<PrintRequirements, { kind: 'printed' }> }) {
  const t = useT()
  const { lang } = useLang()
  const d = (n: number) => decimal(n, lang)
  const { widthMm: w, heightMm: h } = req.trim
  const r = CARD_STANDARD_63x88.physical.cornerRadiusMm ?? 0
  const files = req.file.kind === 'vector' ? t('print.needs.files.vector', { dpi: CARD_STANDARD_63x88.print.dpi }) : t('print.needs.files.raster', { format: req.file.format.toUpperCase(), w: req.file.widthPx, h: req.file.heightPx, dpi: req.file.dpi })
  const rows: [Key, string][] = [
    ['print.needs.trim', t('print.needs.trim.value', { w: d(w), h: d(h), r: d(r) })],
    ['print.needs.bleed', t('print.needs.bleed.value', { mm: d(req.bleedMm), w: d(w + 2 * req.bleedMm), h: d(h + 2 * req.bleedMm) })],
    ['print.needs.safe', t('print.needs.safe.value', { mm: d(req.safeMm) })],
    ['print.needs.files', files],
    ['print.needs.colour', t(`print.needs.colour.${req.colorSpace}` as Key)],
    ['print.needs.marks', t('print.needs.marks.value')],
  ]
  return (
    <>
      <table className="byd-print-needs">
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name}>
              <th scope="row">{t(name)}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="byd-muted">{t('print.needs.note')}</p>
    </>
  )
}

// 5 · The package as the tree of the zip: its real file names, the first card's pair of them and how
// many more, and what is not in it yet, said rather than pretended (#1207: no box, no CMYK).
function ZipTree({ doc, pkg, deck }: { doc: Doc; pkg: PrintPackage; deck: ReturnType<typeof deckOf> }) {
  const t = useT()
  const stopped = pkg.errors.length > 0
  const named = (file: PreparedFile) => t('print.zip.file', { card: deck.cards.find((c) => c.cardRef === file.cardRef)?.title ?? file.cardRef, face: t(file.face === 'back' ? 'print.face.back' : 'print.face.front') })
  const shown = pkg.order.files.slice(0, 2)
  const more = pkg.order.files.length - shown.length
  const line = (path: string, what: string) => (
    <span className="byd-print-zip-line" key={path}>
      <b>{path}</b>
      <i>{what}</i>
    </span>
  )
  return (
    <>
      <div className="byd-print-zip">
        <b>{t('print.zip.name', { name: doc.name, rev: doc.rev })}</b>
        {line('LASMIG.md', t('print.zip.readme'))}
        {line('manifest.json', t(stopped ? 'print.zip.manifest.errors' : 'print.zip.manifest'))}
        {stopped ? (
          line('tryck/', t('print.zip.left'))
        ) : (
          <>
            {shown.map((f) => line(`tryck/${f.name}`, named(f)))}
            {more > 0 && (
              <span className="byd-print-zip-line">
                <i>{t('print.zip.more', { n: more })}</i>
              </span>
            )}
          </>
        )}
        {pkg.rulebook && line(`tryck/${pkg.rulebook.name}`, t('print.zip.rulebook'))}
      </div>
      <p className="byd-muted">{t('print.zip.missing')}</p>
    </>
  )
}

// What the printer would answer (F3's cost answer, for a printer that does not exist): stamped as an
// example, every amount «≈», and a total only when every part of it is known.
function Answer({ quote, cards, kinds, dice, refused }: { quote: Quote; cards: number; kinds: number; dice: number; refused: boolean }) {
  const t = useT()
  const { lang } = useLang()
  const money = (minor: number, currency: string) => t('print.answer.about', { amount: new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(minor / 100) })
  const duties = quote.duties
  const total = duties === 'unknown' ? null : quote.unitPrice.amountMinor + quote.shipping.amountMinor + duties.amountMinor
  return (
    <div className="byd-print-answer">
      <span className="byd-print-stamp">{t('print.answer.stamp')}</span>
      <p>{t('print.answer.says')}</p>
      {refused ? (
        <p className="byd-print-refusal">
          <b>{t('print.answer.refused')}</b> {t('print.answer.refused.why')}
        </p>
      ) : (
        <p>{t('print.answer.taken', { cards, kinds, dice: dice > 0 ? t('print.answer.taken.dice', { n: dice }) : '' })}</p>
      )}
      <div className="byd-print-answer-rows">
        <div className="byd-print-answer-row">
          <span>{dice > 0 ? t('print.answer.copy.dice', { cards, n: dice }) : t('print.answer.copy', { cards })}</span>
          <span>{money(quote.unitPrice.amountMinor, quote.unitPrice.currency)}</span>
        </div>
        <div className="byd-print-answer-row">
          <span>{t('print.answer.shipping')}</span>
          <span>{money(quote.shipping.amountMinor, quote.shipping.currency)}</span>
        </div>
        {/* Inside the EU there is no duty to say (beslut 2026-10-23, punkt 4); a partner outside it
            says it is not known, and the total then cannot be said either. */}
        {duties === 'unknown' ? (
          <div className="byd-print-answer-row">
            <span>{t('print.answer.duties')}</span>
            <span className="byd-print-unknown">{t('print.answer.unknown')}</span>
          </div>
        ) : (
          duties.amountMinor > 0 && (
            <div className="byd-print-answer-row">
              <span>{t('print.answer.duties')}</span>
              <span>{money(duties.amountMinor, duties.currency)}</span>
            </div>
          )
        )}
        <div className="byd-print-answer-row" data-total="">
          <span>{t('print.answer.total')}</span>
          {total === null ? <span className="byd-print-unknown">{t('print.answer.total.unknown')}</span> : <span>{money(total, quote.unitPrice.currency)}</span>}
        </div>
      </div>
      {duties !== 'unknown' && duties.amountMinor === 0 && <p className="byd-print-eu">{t('print.answer.eu')}</p>}
      <p className="byd-print-answer-note">{t('print.answer.note')}</p>
    </div>
  )
}

// The download: the zip is asked for until every file of it is drawn, with how far they have come,
// and saved under the name the server gives it.
type Getting = { state: 'idle' } | { state: 'preparing'; done: number; total: number } | { state: 'failed' }
function Download({ http, project, provider, stopped }: { http: string; project: string; provider: string; stopped: boolean }) {
  const t = useT()
  const say = useSay()
  const [getting, setGetting] = useState<Getting>({ state: 'idle' })
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const get = async () => {
    setGetting({ state: 'preparing', done: 0, total: 0 })
    for (;;) {
      let now
      try {
        now = await readPrintZip(http, project, provider)
      } catch {
        now = { state: 'refused' as const, status: 0 }
      }
      if (!live.current) return
      if (now.state === 'ready') {
        save(now.zip, now.name)
        setGetting({ state: 'idle' })
        say?.('polite', t('print.download.done'))
        return
      }
      if (now.state === 'refused') {
        setGetting({ state: 'failed' })
        return
      }
      setGetting({ state: 'preparing', done: now.done, total: now.total })
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
  }
  const busy = getting.state === 'preparing'
  return (
    <div className="byd-print-download">
      <button type="button" className="byd-primary byd-print-button" aria-disabled={busy || undefined} onClick={() => !busy && void get()}>
        <ImportGlyph />
        {t('print.download')}
      </button>
      {/* Beside the button too, so the reader who only downloads is told what is not in it (beslut punkt 2). */}
      {stopped && <p className="byd-print-without">{t('print.download.withoutCards')}</p>}
      <p className="byd-print-progress" aria-live="polite">
        {getting.state === 'preparing' && getting.total > 0 ? t('print.download.preparing', { done: getting.done, total: getting.total }) : getting.state === 'failed' ? t('print.download.failed') : ''}
      </p>
    </div>
  )
}

