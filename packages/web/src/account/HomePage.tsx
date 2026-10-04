import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { canDelete, canEdit, canStartTables, type CardFace, type Role } from '@byd/server/doc'
import { LoginCard } from './LoginCard.js'
import { Help } from '../editor/HelpDrawer.js'
import { Question } from '../editor/Question.js'
import { CardPreview } from '../editor/CardPreview.js'
import { CARD_PX } from '../editor/corner.js'
import { previewIcons } from '../editor/assets.js'
import { previewFonts } from '../editor/fonts.js'
import { logout, myCards, myPlayed, myProjects, removeProject, startTable, whoAmI, type Played, type ProjectSummary } from './api.js'
import { ExportDialog, ImportDialog } from './GameDialogs.js'
import { GameMenu } from './GameMenu.js'
import { seatColor } from '../table/seatColor.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { useSay } from '../status/StatusLive.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { LanguagePicker, useLang, useT, type Lang, type T } from '../i18n/index.js'
import './account.css'

// /  — "Mina spel" (G1, prototype A): the account's projects as a grid of game cards, and a new
// one as a dashed card. Not logged in, the login card stands here instead.
export type HomePageProps = { onNavigate?(url: string): void }

// What a game's ⋯ offers is asked of the same rules the server keeps (roles.ts, D3, #689), so the
// menu cannot offer what the server would refuse. A list that names no role is from a server that
// listed only the account's own games.
const roleOf = (p: ProjectSummary): Role => p.role ?? 'owner'
const mayDoAny = (role: Role): boolean => canStartTables(role) || canEdit(role) || canDelete(role)

export function HomePage({ onNavigate = (url) => location.assign(url) }: HomePageProps) {
  const t = useT()
  const { lang } = useLang()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  // The game being exported, and whether a game is being brought in (G5, #529).
  const [exporting, setExporting] = useState<ProjectSummary | null>(null)
  const [importing, setImporting] = useState(false)
  const listed = useRef<ProjectSummary[] | null>(null)
  listed.current = projects
  const [played, setPlayed] = useState<Played[] | null>(null)
  // What it takes to draw each game's first card (G1, #231). It is asked for apart from the list
  // and lands after it, so the first screen is drawn on the list's own answer and never waits for
  // a single template, font or picture. Until it lands the tile holds the card's place.
  const [cards, setCards] = useState<Record<string, CardFace | null> | null>(null)
  // The cards could not be had (#475): the places stop promising one rather than shimmer for ever.
  const [cardsLost, setCardsLost] = useState(false)
  // Landing here from the claim page (G1): which session was just saved. Said once (#475): the
  // address stops carrying it as soon as it has been read, so a reload does not say it again.
  const claimed = params.get('claimed')
  useEffect(() => {
    if (!claimed) return
    const rest = new URLSearchParams(location.search)
    rest.delete('claimed')
    const q = rest.toString()
    history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`)
  }, [claimed])
  // The start page is where every other route's way home leads, so it is the last place that
  // may answer with a sentence written for a developer (#12). A page that could not be read at
  // all is one thing; an action that failed is another, and the second must never take the games
  // off the screen.
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  // A game's own menu (G1): which card has it open, which one is being asked about, and what the
  // last table started from here was, so the code can be read off.
  const [menu, setMenu] = useState<string | null>(null)
  const [asking, setAsking] = useState<ProjectSummary | null>(null)
  const [started, setStarted] = useState<{ project: string; code: string; id: string; hostKey: string } | null>(null)
  // Where the focus goes once whatever had it has gone away (#475): back to a game's ⋯ when its
  // menu or its question closes, or to the heading once the game itself is gone — never to
  // <body>, which is where a keyboard is left with no idea where it is.
  const mores = useRef(new Map<string, HTMLButtonElement>())
  const heading = useRef<HTMLHeadingElement>(null)
  const [refocus, setRefocus] = useState<{ to: string } | null>(null)
  useEffect(() => {
    if (!refocus) return
    ;(refocus.to === HEADING ? heading.current : mores.current.get(refocus.to))?.focus()
  }, [refocus])
  const say = useSay()
  useEffect(() => {
    setOffline(false)
    void whoAmI(http)
      .then((e) => {
        setEmail(e)
        if (!e) return undefined
        // The cards are asked for beside the list rather than after it: they are a second answer,
        // not a second screen. A card that never arrives takes nothing off the page — the games
        // are the page, and the card is what one of them wears — and its place stops waiting.
        void myCards(http).then(setCards, () => setCardsLost(true))
        return Promise.all([myProjects(http).then(setProjects), myPlayed(http).then(setPlayed)])
      })
      .catch(() => setOffline(true))
  }, [http, attempt])
  // Logged out, `/` is the login card and the tab says so rather than promising games (#12).
  usePageTitle({ state: offline ? 'offline' : email === undefined ? 'loading' : null, route: email === null ? 'login' : null })
  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const justSaved = claimed ? played?.find((p) => p.session === claimed) : undefined
  // The banner is drawn with its text, so it is said once in the page's live region (4.1.3, #555).
  const savedLine = justSaved ? t('home.claimed', { game: justSaved.game ?? t('home.claimed.some-table'), name: justSaved.name }) : null
  useEffect(() => {
    if (savedLine) say?.('polite', savedLine)
  }, [savedLine, say])
  if (offline) return <StatusNotice notice={noticeFor('offline', 'app', t)} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (email === undefined) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  if (email === null) {
    return (
      <div className="byd-account" data-page="home">
        <LoginCard http={http} next={location.pathname + location.search} onNavigate={onNavigate} />
      </div>
    )
  }
  return (
    <div className="byd-account byd-account-wide" data-page="home">
      <div className="byd-home">
        {justSaved && (
          <div className="byd-home-claimed">
            <span>
              {marked(t('home.claimed'), {
                game: <b>{justSaved.game ?? t('home.claimed.some-table')}</b>,
                name: <b>{justSaved.name}</b>,
              })}
            </span>
          </div>
        )}
        <header>
          <h1 ref={heading} tabIndex={-1}>
            {t('home.title')}
          </h1>
          <button type="button" className="byd-secondary byd-home-import" onClick={() => setImporting(true)}>
            {t('home.import.open')}
          </button>
          {/* The dots between the parts are drawn by the stylesheet at the start of the part they
              lead, so a wrapped line never ends on one (#555). */}
          <span className="byd-who">
            <span title={email}>{email}</span>
            <span>
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault()
                  void logout(http).then(() => setEmail(null))
                }}
              >
                {t('home.logout')}
              </a>
            </span>
            <span>
              <label className="byd-lang">
                {t('account.language')}
                <LanguagePicker />
              </label>
            </span>
          </span>
        </header>
        {notice && (
          <p className="byd-home-notice" role="alert">
            {notice}
          </p>
        )}
        {started && (
          <div className="byd-home-started">
            {/* One flex item, so the gap between the banner's parts never opens inside the sentence. */}
            <span>{marked(t('home.started'), { code: <strong>{started.code}</strong> })}</span>
            <a href={tableUrl(started.id, started.hostKey, server)} target="_blank" rel="noreferrer" aria-label={t('home.started.open.aria')}>
              {t('home.started.open')}
            </a>
          </div>
        )}
        {asking && (
          <Question
            className="byd-home-asking"
            label={t('home.remove.title')}
            confirm={t('home.remove.confirm')}
            cancel={t('home.remove.keep')}
            onCancel={() => {
              setAsking(null)
              setRefocus({ to: asking.id })
            }}
            onConfirm={() => {
              const gone = asking
              setAsking(null)
              // The game's own ⋯ holds the focus while the server is asked, and the heading takes
              // it once there is no game left to hold it.
              setRefocus({ to: gone.id })
              void removeProject(http, gone.id, t).then(
                () => {
                  setProjects((list) => (list ?? []).filter((x) => x.id !== gone.id))
                  say?.('polite', t('home.removed', { name: gone.name }))
                  setRefocus({ to: HEADING })
                },
                (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)),
              )
            }}
          >
            {marked(t('home.remove.ask'), { name: <b>{asking.name}</b> })}
          </Question>
        )}
        {/* An account with nothing in it (UX-16): one line, and what a game is and what the one
            card on it does behind the question mark beside it (L36) — it was the longest string
            in the catalogue. It waits until the games are actually known, so it never flashes
            past a slow answer. */}
        {projects !== null && projects.length === 0 && (
          // «＋ Nytt spel» stands under this line, and the box never lands on it (#726).
          <div className="byd-home-empty byd-help-row" data-help-explains="[data-new]">
            <span>{t('home.empty')}</span>
            <Help topic={t('home.help.topic')}>
              <p>{t('home.help.game')}</p>
              <p>{t('home.help.new')}</p>
            </Help>
          </div>
        )}
        {/* Until the games are known there is nowhere to put a tile (#475): «＋ Nytt spel» alone in
            the first column jumped to the third when they arrived. How tall the card on a tile is
            is written down once (#231): the stylesheet reserves the place from the very number the
            drawing is scaled by, so the box and the card in it cannot drift apart. */}
        {projects === null ? (
          <p className="byd-muted" role="status">
            {t('home.loading')}
          </p>
        ) : (
          <div className="byd-home-grid" data-projects style={{ ['--byd-home-card-h' as string]: `${HOME_CARD_H}px` }}>
            {projects.map((p) => (
              <div key={p.id} className="byd-home-game" data-project={p.id}>
                {/* The game's name leads the link's name, and the card on the tile comes last (#555):
                    going through the page's links, the game is what is heard first. */}
                <a
                  className="byd-home-open"
                  aria-labelledby={`home-${p.id}-name home-${p.id}-line home-${p.id}-card`}
                  href={`/editor?${suffix(new URLSearchParams({ project: p.id }))}`}
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate(`/editor?${suffix(new URLSearchParams({ project: p.id }))}`)
                  }}
                >
                  <GameCard project={p.id} peek={p.card ?? null} face={cards?.[p.id] ?? null} lost={cardsLost} assetBase={http} t={t} />
                  <strong id={`home-${p.id}-name`}>{p.name}</strong>
                  <span id={`home-${p.id}-line`} className="byd-muted">
                    {t('home.card.line', { rev: p.rev, played: playedLine(t, lang, p) })}
                  </span>
                </a>
                {/* What the ⋯ offers is what the role may do (D3, #689), and a role that may do
                    none of it has no ⋯ to open. */}
                {mayDoAny(roleOf(p)) && (
                  <button
                    ref={(el) => {
                      if (el) mores.current.set(p.id, el)
                      else mores.current.delete(p.id)
                    }}
                    type="button"
                    className="byd-home-more"
                    aria-label={t('home.menu.more', { name: p.name })}
                    aria-expanded={menu === p.id}
                    onClick={() => setMenu(menu === p.id ? null : p.id)}
                  >
                    ⋯
                  </button>
                )}
                {menu === p.id && (
                  <GameMenu
                    label={t('home.menu.label', { name: p.name })}
                    more={mores.current.get(p.id) ?? null}
                    onClose={(back) => {
                      setMenu(null)
                      if (back) setRefocus({ to: p.id })
                    }}
                  >
                    {canStartTables(roleOf(p)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null)
                          setRefocus({ to: p.id })
                          void startTable(http, p.id, t).then(
                            (table) => {
                              setStarted({ project: p.id, ...table })
                              say?.('polite', t('home.started', { code: table.code }))
                              setProjects((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, tables: (x.tables ?? 0) + 1 } : x)))
                            },
                            (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)),
                          )
                        }}
                      >
                        {t('home.menu.start')}
                      </button>
                    )}
                    {/* A game is the owner's and the co-editors' to take away with them (G5, #527);
                        the others see no control the server would refuse them. */}
                    {canEdit(roleOf(p)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null)
                          setExporting(p)
                        }}
                      >
                        {t('home.menu.export')}
                      </button>
                    )}
                    {canDelete(roleOf(p)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null)
                          setAsking(p)
                        }}
                      >
                        {t('home.menu.remove')}
                      </button>
                    )}
                  </GameMenu>
                )}
              </div>
            ))}
            <a className="byd-home-game" data-new href={`/new?${suffix(new URLSearchParams())}`} onClick={(e) => { e.preventDefault(); onNavigate(`/new?${suffix(new URLSearchParams())}`) }}>
              {t('home.new')}
            </a>
          </div>
        )}
        {played && played.length > 0 && (
          <>
            <h2 className="byd-home-h2">{t('home.played.title')}</h2>
            <div className="byd-home-grid" data-played-tables>
              {played.map((p) => (
                <div key={p.session} className="byd-home-game byd-home-played" data-played={p.session}>
                  <div className="byd-home-played-top">
                    <i className="byd-home-seat" role="img" aria-label={p.seat === null ? t('home.played.watched') : t('home.played.seat', { seat: p.seat })} style={{ ['--seat' as string]: p.seat === null ? '#7d8597' : seatColor(seatIndexOf(p.seat)) }}><span aria-hidden="true">{p.seat ?? '👁'}</span></i>
                    <span className="byd-muted">{when(t, lang, p.at)}</span>
                  </div>
                  <strong>{p.deleted ? t('home.played.deleted') : (p.game ?? t('home.played.some-table'))}</strong>
                  <span className="byd-muted">{t('home.played.you', { version: p.version, name: p.name })}</span>
                  <span className="byd-home-facts">
                    {p.ended ? (p.surveyed ? t('home.played.surveyed') : t('home.played.unsurveyed')) : t('home.played.running')}
                    {p.flags > 0 && ` · ${t('home.played.flags', { n: p.flags })}`}
                  </span>
                  {p.code && (
                    <a className="byd-home-action" href={`/join?${suffix(new URLSearchParams({ code: p.code }))}`} onClick={(e) => { e.preventDefault(); onNavigate(`/join?${suffix(new URLSearchParams({ code: p.code ?? '' }))}`) }}>
                      {t('home.played.back')}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {exporting && (
        <ExportDialog
          http={http}
          game={exporting}
          onClose={() => {
            setRefocus({ to: exporting.id })
            setExporting(null)
          }}
        />
      )}
      {importing && (
        <ImportDialog
          http={http}
          onClose={() => setImporting(false)}
          onImported={async () => setProjects(await myProjects(http))}
          nameOf={(id) => listed.current?.find((p) => p.id === id)?.name}
          onOpen={(id) => onNavigate(`/editor?${suffix(new URLSearchParams({ project: id }))}`)}
        />
      )}
    </div>
  )
}

// The heading, as a place the focus can be sent to (#475).
const HEADING = '#heading'

// How wide the tile's card is drawn, in CSS pixels. The stylesheet reserves the place from the
// same number, so the box and the drawing in it cannot drift apart: 132 px tall is the height the
// prototype's variant B was chosen at, and the card's own 63 × 88 gives the width.
export const HOME_CARD_H = 132
export const HOME_CARD_W = (HOME_CARD_H * 63) / 88

// A sentence stays one sentence in the catalogue even when part of it is the reader's own — a
// game, a person, a room code. The catalogue holds the whole message; only the parts it names
// are handed over as nodes, so no language has to be glued together from halves.
function marked(message: string, parts: Record<string, ReactNode>): ReactNode[] {
  return message.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1]
    return name && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece
  })
}

// The card on a game's tile (G1, #231, variant B): the game's own first card, over the name and
// drawn by the one `CardPreview` that draws a card anywhere in the tool — so what the shelf shows
// is what the deck wall shows, at another size and in nothing else different.
//
// Three states, all of them the same box, because the box is the card's reserved place: the card
// itself, the place waiting for what it takes to draw it, and the deliberate empty state of a game
// with no cards yet. Nothing moves when a card lands, because nothing was ever missing.
//
// To a screen reader it is one image with one name — "Första kortet: Drake" — and not the fourteen
// loose words the template happens to print on it. `role="img"` is what makes the drawing inside
// one thing rather than fourteen.
function GameCard({ project, peek, face, lost, assetBase, t }: { project: string; peek: { id: string; title: string } | null; face: CardFace | null; lost: boolean; assetBase: string; t: T }) {
  // Resolved once per card and held by identity: `previewIcons` and `previewFonts` build a fresh
  // object every call, and a fresh object is a fresh compile of the card on every render (#320).
  const icons = useMemo(() => (face ? previewIcons({ icons: face.icons }, assetBase) : {}), [face, assetBase])
  const fonts = useMemo(() => (face ? previewFonts({ template: { faces: { front: face.face } }, ...(face.fonts ? { fonts: face.fonts } : {}) }, assetBase) : {}), [face, assetBase])
  const id = `home-${project}-card`
  if (!peek) return <div id={id} className="byd-home-card" data-empty>{t('home.card.nocards')}</div>
  if (!face) return <div id={id} className="byd-home-card" {...(lost ? { 'data-lost': '' } : { 'data-waiting': '' })} aria-hidden="true" />
  return (
    <div id={id} className="byd-home-card" role="img" aria-label={t('home.card.first', { title: face.title })}>
      <CardPreview
        id={`home-${project}`}
        face={face.face}
        row={face.row}
        icons={icons}
        fonts={fonts}
        assetBase={assetBase}
        palette={face.palette}
        scale={HOME_CARD_W / CARD_PX}
      />
    </div>
  )
}

// What a game says about itself before it is opened (G1): how many tables it has, and when one
// was last played at. A game nobody has sat down to says so plainly.
function playedLine(t: T, lang: Lang, p: ProjectSummary): string {
  const tables = p.tables ?? 0
  if (tables === 0) return t('home.card.never')
  const at = p.lastPlayed ? t('home.card.last', { when: when(t, lang, p.lastPlayed) }) : t('home.card.nothing')
  return t(tables === 1 ? 'home.card.tables.one' : 'home.card.tables.other', { n: tables, at })
}

// The table's own screen, opened with the host key it was just handed (DRIFT §9).
function tableUrl(session: string, hostKey: string, server: string | null): string {
  const q = new URLSearchParams({ session, mode: 'tv', host: hostKey })
  if (server) q.set('server', server.replace(/^http/, 'ws'))
  return `/table?${q.toString()}`
}

// Seats are lettered from A; the colour follows the letter, as it does on the table.
const seatIndexOf = (seat: string): number => Math.max(0, seat.charCodeAt(0) - 65)
// When a table was sat at, in a word or two. A date older than a week is written the way the
// reader's own language writes dates.
function when(t: T, lang: Lang, iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400_000)
  if (days <= 0) return t('home.when.today')
  if (days === 1) return t('home.when.yesterday')
  if (days < 7) return t('home.when.days', { n: days })
  return new Date(iso).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB')
}
