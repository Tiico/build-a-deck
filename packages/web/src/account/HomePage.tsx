import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { canDelete, canEdit, canStartTables, type CardFace, type Role } from '@byd/server/doc'
import { LandingPage } from './LandingPage.js'
import { Help } from '../editor/HelpDrawer.js'
import { Question } from '../editor/Question.js'
import { CardPreview } from '../editor/CardPreview.js'
import { CARD_PX } from '../editor/corner.js'
import { previewIcons } from '../editor/assets.js'
import { previewFonts } from '../editor/fonts.js'
import { duplicateProject, gameFan, logout, myCards, myPlayed, myProjects, myUsage, myWaiting, removeProject, renameProject, returnToTable, runningTables, startTable, whoAmI, type GameWaiting, type Played, type ProjectSummary, type RunningTable } from './api.js'
import { QuotaReached } from './quota.js'
import { quotaWords, type QuotaWords } from './quota-words.js'
import { tvUrl } from '../editor/tableLinks.js'
import { tableTab } from '../ways.js'
import { anotherAsk } from '../editor/another.js'
import { GameMenu } from './GameMenu.js'
import { useWide } from '../join/wide.js'
import { guestAddress } from '../guestAddress.js'
import { marked } from './marked.js'
import { seatColor } from '../table/seatColor.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { useSay } from '../status/StatusLive.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useLang, useT, type Lang, type T } from '../i18n/index.js'
import { CheckGlyph, ChevronGlyph, ExitGlyph, FlagGlyph, ImportGlyph, MoreGlyph, PeopleGlyph, PencilGlyph, PersonGlyph } from '../glyphs.js'
import './account.css'
import { AboutLine } from './AboutLine.js'
import { PasskeyOffer } from './PasskeyOffer.js'
import { CodeRow } from './CodeRow.js'
import { DecksterMark } from '../brand/DecksterMark.js'
import { WOOD_EDGE } from '../brand/mark.js'
import { versionWord } from '../i18n/version.js'

// The three dialogs a game's ⋯ and «Importera» open are drawn on a press and never on the first
// frame, so they are fetched when one is opened, with their own sheet, and not carried in the sheet
// every first painting blocks on (#366, L40). That sheet's alarm in `felt-font.spec.ts` bound when
// the start page grew its code row (#675); this is the answer the alarm asks for.
const ExportDialog = lazy(() => import('./GameDialogs.js').then((m) => ({ default: m.ExportDialog })))
const RenameDialog = lazy(() => import('./GameDialogs.js').then((m) => ({ default: m.RenameDialog })))
const ImportDialog = lazy(() => import('./GameDialogs.js').then((m) => ({ default: m.ImportDialog })))

// /  — "Mina spel" (G1; Arbetsbänken since #1204, beslut B): the game last saved large, the others as
// rows, and a new one as a dashed row; beside them, what is happening. Not logged in, the landing page stands here instead (#1009), and the login
// card is `/login`'s.
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
  // The game being renamed (#909): its name is changed in its log, as the editor changes it.
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null)
  const listed = useRef<ProjectSummary[] | null>(null)
  listed.current = projects
  const [played, setPlayed] = useState<Played[] | null>(null)
  // What it takes to draw each game's first card (G1, #231). It is asked for apart from the list
  // and lands after it, so the first screen is drawn on the list's own answer and never waits for
  // a single template, font or picture. Until it lands the tile holds the card's place.
  const [cards, setCards] = useState<Record<string, CardFace | null> | null>(null)
  // The cards could not be had (#475): the places stop promising one rather than shimmer for ever.
  const [cardsLost, setCardsLost] = useState(false)
  // What waits for the account, game by game (#1225): asked for beside the cards and landing after
  // the list, since it reads every table of every game. Until it lands the hero's two last numbers
  // hold their places, and «Väntar på dig» is not drawn.
  const [waiting, setWaiting] = useState<Record<string, GameWaiting> | null>(null)
  const askWaiting = () => void myWaiting(http).then(setWaiting, () => undefined)
  // The tables that are running, game by game (#724, beslut C + B): asked for every game that has
  // tables and whose role may start one, and asked again whenever a game's count of tables changes,
  // so a table started from here is in the list the moment the server has it.
  const [running, setRunning] = useState<Record<string, RunningTable[]>>({})
  const askedAbout = (projects ?? []).filter((p) => (p.tables ?? 0) > 0 && canStartTables(roleOf(p))).map((p) => `${p.id}:${p.tables}`).join(',')
  useEffect(() => {
    if (!askedAbout) return
    let live = true
    const ids = askedAbout.split(',').map((one) => one.slice(0, one.lastIndexOf(':')))
    void Promise.all(ids.map(async (id) => [id, await runningTables(http, id).catch(() => [])] as const)).then((all) => {
      if (live) setRunning(Object.fromEntries(all))
    })
    return () => {
      live = false
    }
  }, [askedAbout, http])
  // A game's running tables, newest first, as the server lists them.
  const runningOf = (p: ProjectSummary) => running[p.id] ?? []
  const runningList = (projects ?? []).flatMap((p) => runningOf(p).map((table) => ({ ...table, name: p.name, project: p.id })))
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
  // What could not happen, in the box under the heading: a sentence, or a met ceiling in its three
  // parts (#1198, variant A), which takes the focus so a keyboard hears it where the press was.
  const [notice, setNotice] = useState<string | QuotaWords | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (notice !== null && typeof notice !== 'string') noticeRef.current?.focus()
  }, [notice])
  // A game's own menu (G1): which card has it open, which one is being asked about, and what the
  // last table started from here was, so the code can be read off.
  const [menu, setMenu] = useState<string | null>(null)
  const [asking, setAsking] = useState<ProjectSummary | null>(null)
  // A game whose «Starta nytt bord» was pressed while a table of it runs (#1145, beslut A): the
  // press asks first, because it stood one line under «Öppna bordet KOD» and was taken for it.
  const [another, setAnother] = useState<ProjectSummary | null>(null)
  // The newest table of that game, which the question names and opens.
  const anotherTable = another ? runningOf(another)[0] : undefined
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
  // A table from a game's ⋯, said by its code once the server has it.
  const start = (p: ProjectSummary) =>
    void startTable(http, p.id, t).then(
      (table) => {
        say?.('polite', t('home.started', { code: table.code }))
        setProjects((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, tables: (x.tables ?? 0) + 1 } : x)))
      },
      (err: unknown) => setNotice(err instanceof QuotaReached ? quotaWords(err.quota, { kind: 'table', rev: p.rev, here: runningOf(p).length }, t) : err instanceof Error ? err.message : String(err)),
    )
  // «＋ Nytt spel» asks what the account holds before the guide opens (#1198): the guide makes the
  // game only in its last step, so a ceiling met there would be met after every step had been walked.
  // A question that gets no answer opens the guide as before, and the server still asks at the end.
  const newGame = async () => {
    const games = (await myUsage(http))?.measures['projects']
    if (games && games.limit !== null && games.used >= games.limit) return setNotice(quotaWords({ measure: 'projects', limit: games.limit, used: games.used, bearer: 'you' }, { kind: 'newGame' }, t))
    onNavigate(`/new?${suffix(new URLSearchParams())}`)
  }
  // «Starta bord» from a game's ⋯ or its hero (#1145, beslut A): asked first while a table of it runs.
  const startFrom = (p: ProjectSummary) => {
    if (runningOf(p).length > 0) return setAnother(p)
    setRefocus({ to: p.id })
    start(p)
  }
  // The hero's fan (#1204, beslut B): three of its cards, asked for once the list has said which game
  // leads, and held with the game it is for, so a fan never stands behind another game's card.
  const [fan, setFan] = useState<{ project: string; faces: CardFace[] } | null>(null)
  const leading = projects?.reduce<ProjectSummary | null>((a, b) => (a && (a.savedAt ?? '') >= (b.savedAt ?? '') ? a : b), null)?.id
  useEffect(() => {
    if (!leading) return
    let live = true
    void gameFan(http, leading).then((faces) => {
      if (live) setFan({ project: leading, faces })
    }, () => undefined)
    return () => {
      live = false
    }
  }, [leading, http])
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
        void myWaiting(http).then(setWaiting, () => undefined)
        return Promise.all([myProjects(http).then(setProjects), myPlayed(http).then(setPlayed)])
      })
      .catch(() => setOffline(true))
  }, [http, attempt])
  // Logged out, `/` is the landing page and the tab says so rather than promising games (#12).
  usePageTitle({ state: offline ? 'offline' : email === undefined ? 'loading' : null, route: email === null ? 'landing' : null })
  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const suffixed = () => {
    const q = suffix(new URLSearchParams())
    return q ? `?${q}` : ''
  }
  // «Tillbaka till bordet» (#690, beslut 2026-10-06): to her own seat and hand, with a token the
  // server hands the account for it, on the screen the picker would have suggested (#675). The
  // picker is where it goes only when there is no seat left to go back to, and the link's own
  // address stays the picker's for a press that never runs this.
  const wide = useWide()
  const backTo = async (p: Played) => {
    const picker = `/join?${suffix(new URLSearchParams({ code: p.code ?? '' }))}`
    const seat = await returnToTable(http, p.session).catch(() => null)
    if (!seat) return onNavigate(picker)
    // The token in the fragment and her name in no address (#1278), as from the picker.
    const q = new URLSearchParams({ session: p.session, code: p.code ?? '', ...(seat.seat === null ? {} : { seat: seat.seat }) })
    if (server) q.set('server', server.replace(/^http/, 'ws'))
    onNavigate(guestAddress(seat.kind === 'observer' ? '/observe' : wide ? '/online' : '/play', q, seat.token))
  }
  const justSaved = claimed ? played?.find((p) => p.session === claimed) : undefined
  // The banner is drawn with its text, so it is said once in the page's live region (4.1.3, #555).
  const savedLine = justSaved ? t('home.claimed', { game: justSaved.game ?? t('home.claimed.some-table'), name: justSaved.name }) : null
  useEffect(() => {
    if (savedLine) say?.('polite', savedLine)
  }, [savedLine, say])
  if (offline) return <StatusNotice notice={noticeFor('offline', 'app', t)} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (email === undefined) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  if (email === null) return <LandingPage http={http} server={server} onNavigate={onNavigate} />
  // A game's ⋯ and the menu it opens (G1), the same on the hero and on a row.
  const moreOf = (p: ProjectSummary) => (
    <>
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
          <MoreGlyph />
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
          {/* The tables already running come first (#724, beslut B), so a second press to see the
              code again opens the table it was for rather than starting another. */}
          {runningOf(p).map((table) => (
            <a key={table.id} href={tvUrl(table.id, server, undefined, true, lang)} target={tableTab(table.id, 'tv')} onClick={() => setMenu(null)}>
              {t('home.menu.open', { code: table.code })}
            </a>
          ))}
          {canStartTables(roleOf(p)) && (
            <button
              type="button"
              onClick={() => {
                setMenu(null)
                startFrom(p)
              }}
            >
              {t(runningOf(p).length > 0 ? 'home.menu.start.new' : 'home.menu.start')}
            </button>
          )}
          {/* The editor's own choices for the whole game (#738, #909): its name, a copy of
              it and taking it with you are the owner's and the co-editors' (G5, #527);
              the others see no control the server would refuse them. */}
          {canEdit(roleOf(p)) && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenu(null)
                  setRenaming(p)
                }}
              >
                {t('home.menu.rename')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null)
                  setRefocus({ to: p.id })
                  void duplicateProject(http, p.id, t).then(
                    async (copy) => {
                      // The cards with the list, as after an import (#725), so the copy's
                      // tile is drawn whole and not left waiting for its card.
                      const [projects, cards] = await Promise.all([myProjects(http), myCards(http)])
                      setProjects(projects)
                      setCards(cards)
                      askWaiting()
                      // The copy is the game saved last and leads the page (#1204), so the original's
                      // ⋯ is drawn anew in the rows: the focus follows it there.
                      setRefocus({ to: p.id })
                      say?.('polite', t('home.duplicated', { name: copy.name }))
                    },
                    (err: unknown) => setNotice(err instanceof QuotaReached ? quotaWords(err.quota, { kind: 'duplicate', game: p.name }, t) : err instanceof Error ? err.message : String(err)),
                  )
                }}
              >
                {t('home.menu.duplicate')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null)
                  setExporting(p)
                }}
              >
                {t('home.menu.export')}
              </button>
              {/* What would be sent to a printer, on a page of its own (#1208, beslut B). */}
              <button
                type="button"
                onClick={() => {
                  setMenu(null)
                  onNavigate(`/print-package?${suffix(new URLSearchParams({ project: p.id }))}`)
                }}
              >
                {t('home.menu.print')}
              </button>
            </>
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
    </>
  )
  const editorOf = (p: ProjectSummary) => `/editor?${suffix(new URLSearchParams({ project: p.id }))}`
  const toEditor = (p: ProjectSummary) => (e: React.MouseEvent) => {
    e.preventDefault()
    onNavigate(editorOf(p))
  }
  // The games newest saved first (#1204): the one in front is the one the designer was last at.
  const ordered = projects === null ? null : [...projects].sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''))
  const hero = ordered?.[0]
  const rest = ordered?.slice(1) ?? []
  const heroTable = hero ? runningOf(hero)[0] : undefined
  const heroWaiting = hero ? waiting?.[hero.id]?.playtest : undefined
  // «Väntar på dig» (#1225, #1204 beslut B), in the prototype's order: the games with new flags,
  // the flags raised last first; the surveys the account has left to answer at tables that are over
  // (#1143); and the games whose newest version someone else saved, the newest first.
  const flagged = (projects ?? [])
    .flatMap((p) => {
      const w = waiting?.[p.id]
      return w?.playtest && w.playtest.flags > 0 ? [{ game: p, rev: w.rev, ...w.playtest }] : []
    })
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  const unanswered = (played ?? []).filter((p) => p.ended && !p.surveyed && !p.deleted)
  const savedByOthers = (projects ?? [])
    .flatMap((p) => {
      const w = waiting?.[p.id]
      return w?.other ? [{ game: p, rev: w.rev, ...w.other }] : []
    })
    .sort((a, b) => b.at.localeCompare(a.at))
  // It stands only once both of its sources have answered: drawn on `waiting` alone, the surveys
  // left to answer arrived a moment later and the rows jumped down under the reader.
  const waits = waiting !== null && played !== null && flagged.length + unanswered.length + savedByOthers.length > 0
  // A row of it is a link, and a plain press goes through the page's own way of leaving.
  const go = (url: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onNavigate(url)
  }
  return (
    <main className="byd-account byd-account-wide" data-page="home">
      <div className="byd-home">
        {/* The page's own bar (#1204, beslut B): the mark, and what is done to the page rather than
            to one game — bringing a game in, making one, and the account. */}
        <div className="byd-home-bar">
          <span className="byd-home-mark">
            <DecksterMark className="byd-home-logo" edge={WOOD_EDGE} />
            <span>Deckster</span>
          </span>
          {/* The word is the start of the name, so what is read out begins with what is written (2.5.3). */}
          <button type="button" className="byd-secondary byd-home-import" title={t('home.import.open')} aria-label={t('home.import.open')} onClick={() => setImporting(true)}>
            <ImportGlyph />
            <span className="byd-home-import-word">{t('home.import.word')}</span>
          </button>
          {/* The page's one fill is the hero's «Öppna editorn» (#44), so making a game is the outline. */}
          <a className="byd-secondary byd-home-make" href={`/new?${suffix(new URLSearchParams())}`} onClick={(e) => { e.preventDefault(); void newGame() }}>
            {t('home.new')}
          </a>
          {/* The dots between the parts are drawn by the stylesheet at the start of the part they
              lead, so a wrapped line never ends on one (#555). */}
          <span className="byd-who">
            <span title={email}>{email}</span>
            {/* The way to the profile (#999, #998 variant A): a word in the line, where the language
                picker stood before it moved there. */}
            <span className="byd-who-icon">
              <a
                className="byd-who-profile"
                title={t('home.profile')}
                href={`/profile${suffixed()}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                  e.preventDefault()
                  onNavigate(`/profile${suffixed()}`)
                }}
              >
                <PersonGlyph />
                <span className="byd-offscreen">{t('home.profile')}</span>
              </a>
            </span>
            <span className="byd-who-icon">
              <a
                href="/login"
                title={t('home.logout')}
                onClick={(e) => {
                  e.preventDefault()
                  void logout(http).then(() => setEmail(null))
                }}
              >
                <ExitGlyph />
                <span className="byd-offscreen">{t('home.logout')}</span>
              </a>
            </span>
          </span>
        </div>
        <div className="byd-home-main">
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
          </header>
          {/* The offer after the link (#1180, beslut A): under the heading, once per browser. */}
          <PasskeyOffer http={http} />
          {typeof notice === 'string' && (
            <p className="byd-home-notice" role="alert">
              {notice}
            </p>
          )}
          {notice !== null && typeof notice !== 'string' && (
            <p ref={noticeRef} className="byd-home-notice" role="alert" tabIndex={-1}>
              <b>{notice.what}</b> {notice.why} {notice.way}
            </p>
          )}
          {another && anotherTable && (
            <Question
              className="byd-home-asking"
              label={t('tables.another.label')}
              confirm={t('tables.another.start')}
              keep={{
                label: t('tables.another.open', { table: anotherTable.code }),
                onChoose: () => {
                  window.open(tvUrl(anotherTable.id, server, undefined, true, lang), tableTab(anotherTable.id, 'tv'))
                  setAnother(null)
                  setRefocus({ to: another.id })
                },
              }}
              onCancel={() => {
                setAnother(null)
                setRefocus({ to: another.id })
              }}
              onConfirm={() => {
                setAnother(null)
                setRefocus({ to: another.id })
                start(another)
              }}
            >
              {anotherAsk(t, anotherTable.code, runningOf(another).length)}
            </Question>
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
          {/* The game the designer was last at (#1204, beslut B), large, with what it is and its two
              things to do — the editor, and its table. The fan behind its card lands after the
              list and the first cards, so the first screen waits for nothing more than before. */}
          {hero && (
            <section className="byd-home-hero" aria-labelledby="byd-home-hero">
              <div className="byd-home-game" data-project={hero.id} data-hero="">
                {/* The fan opens the editor under the pointer; the keyboard has «Öppna editorn» beside it,
                    so the fan is not a second stop on the way through the page. */}
                <a className="byd-home-open" aria-labelledby={`home-${hero.id}-name home-${hero.id}-line home-${hero.id}-card`} href={editorOf(hero)} onClick={toEditor(hero)} tabIndex={-1}>
                  <span className="byd-home-fan">
                    {(fan?.project === hero.id ? fan.faces.slice(1) : []).map((face, i) => (
                      <span key={face.id} className="byd-home-fan-back" data-back={i}>
                        <CardFaceDrawing project={`${hero.id}-fan-${i}`} face={face} assetBase={http} h={HOME_HERO_H} />
                      </span>
                    ))}
                    <GameCard project={hero.id} peek={hero.card ?? null} face={cards?.[hero.id] ?? null} lost={cardsLost} assetBase={http} t={t} h={HOME_HERO_H} />
                  </span>
                </a>
                <div className="byd-home-hero-text">
                  <h2 id="byd-home-hero" className="byd-home-h2">{t('home.hero.title')}</h2>
                  <strong id={`home-${hero.id}-name`}>{hero.name}</strong>
                  {/* When the version was saved and the seats it is set for, as the prototype has them (#1225). */}
                  <span id={`home-${hero.id}-line`} className="byd-muted">
                    {t('home.hero.line', { saved: hero.savedAt ? t('home.hero.saved', { rev: hero.rev, when: when(t, lang, hero.savedAt) }) : versionWord(hero.rev, t, 'name'), players: playersWord(t, hero.players ?? 0) })}
                  </span>
                  {/* The cards and the tables, and — for whoever may read the playtest (#524) — the
                      players' survey answers and the flags new on this version (#1225). Those two
                      hold their places until what is waiting has been read. */}
                  <dl className="byd-home-stats">
                    <div><dt>{t('home.stat.cards')}</dt><dd>{hero.cards ?? 0}</dd></div>
                    <div><dt>{t('home.stat.tables')}</dt><dd>{hero.tables ?? 0}</dd></div>
                    {canStartTables(roleOf(hero)) && (
                      <>
                        <div><dt>{t('home.stat.answers')}</dt><dd>{heroWaiting?.answers ?? '–'}</dd></div>
                        <div data-new-flags={(heroWaiting?.flags ?? 0) > 0 || undefined}><dt>{t('home.stat.flags')}</dt><dd>{heroWaiting?.flags ?? '–'}</dd></div>
                      </>
                    )}
                  </dl>
                  <div className="byd-home-hero-actions">
                    <a className="byd-primary" href={editorOf(hero)} onClick={toEditor(hero)}>
                      {t('home.hero.edit')}
                    </a>
                    {heroTable ? (
                      <a className="byd-secondary" href={tvUrl(heroTable.id, server, undefined, true, lang)} target={tableTab(heroTable.id, 'tv')} aria-label={t('home.running.open.aria', { code: heroTable.code, name: hero.name })}>
                        {t('home.menu.open', { code: heroTable.code })}
                      </a>
                    ) : (
                      canStartTables(roleOf(hero)) && (
                        <button type="button" className="byd-secondary" onClick={() => startFrom(hero)}>
                          {t('home.menu.start')}
                        </button>
                      )
                    )}
                  </div>
                </div>
                {moreOf(hero)}
              </div>
            </section>
          )}
          {/* Until the games are known there is nowhere to put a row (#475). How tall the card on a
              row is is written down once (#231): the stylesheet reserves the place from the very
              number the drawing is scaled by, so the box and the card in it cannot drift apart. */}
          {ordered === null ? (
            <p className="byd-muted" role="status">
              {t('home.loading')}
            </p>
          ) : (
            <section className="byd-home-all" aria-labelledby={hero ? 'byd-home-all' : undefined}>
              {hero && <h2 id="byd-home-all" className="byd-home-h2">{t('home.all.title')}</h2>}
              <div className="byd-home-grid" data-projects style={{ ['--byd-home-card-h' as string]: `${HOME_CARD_H}px` }}>
                {rest.map((p) => (
                  <div key={p.id} className="byd-home-game" data-project={p.id}>
                    {/* The game's name leads the link's name, and the card comes last (#555): going
                        through the page's links, the game is what is heard first. */}
                    <a className="byd-home-open" aria-labelledby={`home-${p.id}-name home-${p.id}-line home-${p.id}-played home-${p.id}-card`} href={editorOf(p)} onClick={toEditor(p)}>
                      <GameCard project={p.id} peek={p.card ?? null} face={cards?.[p.id] ?? null} lost={cardsLost} assetBase={http} t={t} />
                      <span className="byd-home-row">
                        <strong id={`home-${p.id}-name`}>{p.name}</strong>
                        <span id={`home-${p.id}-line`} className="byd-muted">
                          {factsLine(t, p)}
                        </span>
                        <span id={`home-${p.id}-played`} className="byd-muted">
                          {playedLine(t, lang, p)}
                        </span>
                        {runningOf(p).slice(0, 1).map((table) => (
                          <span key={table.id} className="byd-home-live">
                            {t('home.row.live', { code: table.code })}
                          </span>
                        ))}
                      </span>
                    </a>
                    {moreOf(p)}
                  </div>
                ))}
                <a className="byd-home-game" data-new href={`/new?${suffix(new URLSearchParams())}`} onClick={(e) => { e.preventDefault(); void newGame() }}>
                  {t('home.new')}
                </a>
              </div>
            </section>
          )}
        </div>
        {/* «Pågår nu» (#724, beslut C): every table that is running, by its game and its room code,
            with the way to its screen as the game's own — in the column of what is happening
            (#1204), and first of everything on a phone. */}
        {runningList.length > 0 && (
          <section className="byd-home-running" aria-labelledby="byd-home-running">
            <h2 id="byd-home-running" className="byd-home-h2">{t('home.running.title')}</h2>
            {runningList.map((table) => (
              <div key={table.id} className="byd-home-running-row" data-running={table.id}>
                <b>{table.name}</b>
                <strong>{table.code}</strong>
                {/* The way to the game the table runs (#1217): «Pågår nu» led only to the table. */}
                <a
                  className="byd-home-running-game"
                  href={`/editor?${suffix(new URLSearchParams({ project: table.project }))}`}
                  aria-label={t('home.running.game.aria', { name: table.name })}
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate(`/editor?${suffix(new URLSearchParams({ project: table.project }))}`)
                  }}
                >
                  {t('home.running.game')}
                </a>
                <a href={tvUrl(table.id, server, undefined, true, lang)} target={tableTab(table.id, 'tv')} aria-label={t('home.running.open.aria', { code: table.code, name: table.name })}>
                  {t('home.running.open')}
                </a>
              </div>
            ))}
          </section>
        )}
        {/* «Väntar på dig» (#1225, #1204 beslut B): what is left for the account to deal with, each a
            row with its icon, what it is, where it comes from and an arrow, leading to where it is
            dealt with. Not drawn until what is waiting has been read, nor when nothing is. */}
        {waits && (
          <section className="byd-home-waiting" aria-labelledby="byd-home-waiting">
            <h2 id="byd-home-waiting" className="byd-home-h2">{t('home.waiting.title')}</h2>
            <div className="byd-home-waiting-list">
              {flagged.map((f) => {
                const to = `/editor?${suffix(new URLSearchParams({ project: f.game.id, results: `rev-${f.rev}` }))}`
                const at = f.at ? when(t, lang, f.at) : ''
                return (
                  <a key={`flags-${f.game.id}`} href={to} onClick={go(to)} data-waiting="flags">
                    <span className="byd-home-waiting-icon"><FlagGlyph /></span>
                    <span className="byd-home-waiting-text">
                      <b>{t(f.flags === 1 ? 'home.waiting.flags.one' : 'home.waiting.flags.other', { n: f.flags })}</b>
                      <small>{f.tables === 1 ? t('home.waiting.flags.table', { game: f.game.name, rev: f.rev, when: at }) : t('home.waiting.flags.tables', { game: f.game.name, rev: f.rev, n: f.tables, when: at })}</small>
                    </span>
                    <span className="byd-home-waiting-arrow"><ChevronGlyph to="right" /></span>
                  </a>
                )
              })}
              {unanswered.map((p) => {
                const to = `/survey?${suffix(new URLSearchParams({ session: p.session }))}`
                return (
                  <a key={`survey-${p.session}`} href={to} onClick={go(to)} data-waiting="survey">
                    <span className="byd-home-waiting-icon"><PencilGlyph /></span>
                    <span className="byd-home-waiting-text">
                      <b>{t('home.played.answer')}</b>
                      <small>{t('home.waiting.survey.line', { game: p.game ?? t('home.played.some-table'), name: p.name })}</small>
                    </span>
                    <span className="byd-home-waiting-arrow"><ChevronGlyph to="right" /></span>
                  </a>
                )
              })}
              {savedByOthers.map((v) => {
                const to = editorOf(v.game)
                return (
                  <a key={`version-${v.game.id}`} href={to} onClick={go(to)} data-waiting="version">
                    <span className="byd-home-waiting-icon"><PeopleGlyph /></span>
                    <span className="byd-home-waiting-text">
                      <b>{v.name === null ? t('home.waiting.version.someone', { rev: v.rev }) : t('home.waiting.version', { name: v.name, rev: v.rev })}</b>
                      <small>{t('home.waiting.version.line', { game: v.game.name, when: when(t, lang, v.at) })}</small>
                    </span>
                    <span className="byd-home-waiting-arrow"><ChevronGlyph to="right" /></span>
                  </a>
                )
              })}
            </div>
          </section>
        )}
        {played && played.length > 0 && (
          <section className="byd-home-sat" aria-labelledby="byd-home-sat">
            <h2 id="byd-home-sat" className="byd-home-h2">{t('home.played.title')}</h2>
            <div className="byd-home-grid" data-played-tables>
              {played.map((p) => (
                <div key={p.session} className="byd-home-game byd-home-played" data-played={p.session}>
                  <div className="byd-home-played-top">
                    <i className="byd-home-seat" role="img" aria-label={p.seat === null ? t('home.played.watched') : t('home.played.seat', { seat: p.seat })} style={{ ['--seat' as string]: p.seat === null ? '#7d8597' : seatColor(seatIndexOf(p.seat)) }}><span aria-hidden="true">{p.seat ?? '👁'}</span></i>
                    <span className="byd-muted">{when(t, lang, p.at)}</span>
                  </div>
                  <strong>{p.deleted ? t('home.played.deleted') : (p.game ?? t('home.played.some-table'))}</strong>
                  <span className="byd-muted">{t('home.played.you', { version: versionWord(p.version, t, 'short'), name: p.name })}</span>
                  {/* What the player can do with the table (#1143, variant B): open it while it runs,
                      answer its survey once it is over, and otherwise nothing but a quiet tick. A
                      game taken away has no survey worth answering (#676). */}
                  {p.ended && p.surveyed ? (
                    <span className="byd-home-answered">
                      <CheckGlyph />
                      {t('home.played.surveyed')}
                    </span>
                  ) : (
                    <span className="byd-home-facts">{p.ended ? t('home.played.ended') : t('home.played.running')}</span>
                  )}
                  {p.ended && !p.surveyed && !p.deleted && (
                    <a className="byd-home-survey" href={`/survey?${suffix(new URLSearchParams({ session: p.session }))}`} onClick={(e) => { e.preventDefault(); onNavigate(`/survey?${suffix(new URLSearchParams({ session: p.session }))}`) }}>
                      {t('home.played.answer')}
                    </a>
                  )}
                  {p.code && (
                    <a className="byd-home-action" href={`/join?${suffix(new URLSearchParams({ code: p.code }))}`} onClick={(e) => { e.preventDefault(); void backTo(p) }}>
                      {t('home.played.back')}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {/* The player's door (#675), for the creator who came to play someone else's game. */}
        <section className="byd-home-door">
          <CodeRow server={server} onNavigate={onNavigate} />
        </section>
        <AboutLine http={http} />
      </div>
      <Suspense fallback={null}>
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
      {renaming && (
        <RenameDialog
          game={renaming}
          onRename={(name) => {
            const game = renaming
            setRenaming(null)
            setRefocus({ to: game.id })
            void renameProject(http, game.id, name, t).then(
              () => setProjects((list) => (list ?? []).map((x) => (x.id === game.id ? { ...x, name } : x))),
              (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)),
            )
          }}
          onClose={() => {
            setRefocus({ to: renaming.id })
            setRenaming(null)
          }}
        />
      )}
      {importing && (
        <ImportDialog
          http={http}
          onClose={() => setImporting(false)}
          // The cards with the list (#725): read alone, the list put the new game's card place up and
          // nothing ever came to fill it, so it shimmered until the page was reloaded.
          onImported={async () => {
            const [projects, cards] = await Promise.all([myProjects(http), myCards(http)])
            setProjects(projects)
            setCards(cards)
            setCardsLost(false)
            askWaiting()
          }}
          nameOf={(id) => listed.current?.find((p) => p.id === id)?.name}
          onOpen={(id) => onNavigate(`/editor?${suffix(new URLSearchParams({ project: id }))}`)}
        />
      )}
      </Suspense>
    </main>
  )
}

// The heading, as a place the focus can be sent to (#475).
const HEADING = '#heading'

// How tall a row's card is drawn, in CSS pixels. The stylesheet reserves the place from the same
// number, so the box and the drawing in it cannot drift apart: 92 px is the height the workbench's
// rows were chosen at (#1204), and the card's own 63 × 88 gives the width. The hero's card is
// drawn at its own height, and its place is reserved from that one.
export const HOME_CARD_H = 92
export const HOME_HERO_H = 200


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
function GameCard({ project, peek, face, lost, assetBase, t, h = HOME_CARD_H }: { project: string; peek: { id: string; title: string } | null; face: CardFace | null; lost: boolean; assetBase: string; t: T; h?: number }) {
  const id = `home-${project}-card`
  const size = { ['--byd-home-card-h' as string]: `${h}px` }
  if (!peek) return <div id={id} className="byd-home-card" style={size} data-empty>{t('home.card.nocards')}</div>
  if (!face) return <div id={id} className="byd-home-card" style={size} {...(lost ? { 'data-lost': '' } : { 'data-waiting': '' })} aria-hidden="true" />
  return (
    <div id={id} className="byd-home-card" style={size} role="img" aria-label={t('home.card.first', { title: face.title })}>
      <CardFaceDrawing project={project} face={face} assetBase={assetBase} h={h} />
    </div>
  )
}

// A card's face drawn at a height (G1, #231): by the one `CardPreview` that draws a card anywhere in
// the tool, scaled so the card's own 63 × 88 fills the place reserved for it.
function CardFaceDrawing({ project, face, assetBase, h }: { project: string; face: CardFace; assetBase: string; h: number }) {
  // Resolved once per card and held by identity: `previewIcons` and `previewFonts` build a fresh
  // object every call, and a fresh object is a fresh compile of the card on every render (#320).
  const icons = useMemo(() => previewIcons({ icons: face.icons }, assetBase), [face, assetBase])
  const fonts = useMemo(() => previewFonts({ template: { faces: { front: face.face } }, ...(face.fonts ? { fonts: face.fonts } : {}) }, assetBase), [face, assetBase])
  return <CardPreview id={`home-${project}`} face={face.face} row={face.row} icons={icons} fonts={fonts} assetBase={assetBase} palette={face.palette} scale={(h * 63) / 88 / CARD_PX} />
}

// What a game is, in a line (#1204): its version, the cards its table deals and the seats it is set for.
function factsLine(t: T, p: ProjectSummary): string {
  const cards = p.cards ?? 0
  return t('home.row.facts', {
    rev: p.rev,
    cards: t(cards === 1 ? 'home.row.cards.one' : 'home.row.cards.other', { n: cards }),
    players: playersWord(t, p.players ?? 0),
  })
}
const playersWord = (t: T, n: number): string => t(n === 1 ? 'home.row.players.one' : 'home.row.players.other', { n })

// What a game says about itself before it is opened (G1): how many tables it has, and when one
// was last played at. A game nobody has sat down to says so plainly.
function playedLine(t: T, lang: Lang, p: ProjectSummary): string {
  const tables = p.tables ?? 0
  if (tables === 0) return t('home.card.never')
  const at = p.lastPlayed ? t('home.card.last', { when: when(t, lang, p.lastPlayed) }) : t('home.card.nothing')
  return t(tables === 1 ? 'home.card.tables.one' : 'home.card.tables.other', { n: tables, at })
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
