import { Fragment, lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { TableRenderer } from '../table/TableRenderer.js'
import { useTableClient } from '../table/useTableClient.js'
import { stillRendering, useTextures, type Textures } from '../table/textures.js'
import { tvUrl } from './tableLinks.js'
import { tableTab } from '../ways.js'
import { roomAddress } from '../table/roomAddress.js'
import { rememberedStart, type StartAnswer } from './startAnswer.js'
import { startInTab, tableWay, type Started } from '../startWay.js'
import type { Seating } from '@byd/protocol'
import { groupOf, tableGroups, type TableGroup, type TableGroupId } from './tableRows.js'
import { placedProps, usePlacement } from './placement.js'
import { useRoving } from './roving.js'
import { TableEnded, type ProjectClient, type TableSummary } from './ProjectClient.js'
import { Question } from './Question.js'
import { anotherAsk } from './another.js'
import { useLang, useT, type Key, type T } from '../i18n/index.js'
import { saidOr } from '../i18n/said.js'
import { QuotaReached } from '../account/quota.js'
import { quotaWords, type QuotaWords } from '../account/quota-words.js'
import { Help } from './HelpDrawer.js'
import { usePressAway } from '../doors.js'
import { lastMoveWords } from './when.js'
import { versionWord } from '../i18n/version.js'
import { rowSummary } from './playtestReading.js'
import type { PlaytestTable } from '@byd/server/doc'
import { ChevronGlyph, PlayGlyph } from '../glyphs.js'

// The Bord tab (#19): every table this game has, and the ways into it. A table is a session
// started from the project (C9: it survives everyone disconnecting), so the list is the server's
// answer, never a list the editor keeps of its own.
//
// `started` is the table the header's «Starta bord» last started (#704): the column shows it the
// way it shows one of its own, its group open, whether the column stood open at the start or is
// opened afterwards.
//
// `onResults` opens the tab's Resultat view on a table (#1010): an ended table's row says what came
// of it in one line, and the line is the way there.
// «Hur sitter ni?» (L77, #1286), loaded with its stylesheet when a table is about to start, as the
// header loads it: the editor's first frame weighs its own sheet and nothing else (#186).
const StartQuestion = lazy(() => import('./StartQuestion.js').then((m) => ({ default: m.StartQuestion })))

export type TablesTabProps = { client: ProjectClient; server: string | null; started?: string | null; onResults?: ((id: string) => void) | undefined }

export function TablesTab({ client, server, started = null, onResults }: TablesTabProps) {
  const t = useT()
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  const [starting, setStarting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Asked again after starting a table: the server owns the list, so the way to show a new table
  // is to ask what tables there are.
  const [asked, setAsked] = useState(0)
  // The table this column just started or ended (#480): its group opens so its row is there to be
  // seen, the start is said in the status line, and an ended table's row takes the focus again
  // once the list has filed it under its new group — the row it had was taken down with the move.
  // A table the header started (#704) only opens its group: the header's band already says it.
  const [revealed, setRevealed] = useState<{ id: string; why: 'started' | 'ended' | 'header'; code?: string } | null>(started ? { id: started, why: 'header' } : null)
  // A start from the header while the column stands open asks the server again; one made before
  // the column opened is already in the list it asks for when it mounts.
  const shown = useRef(started)
  useEffect(() => {
    if (!started || started === shown.current) return
    shown.current = started
    setRevealed({ id: started, why: 'header' })
    setAsked((n) => n + 1)
  }, [started])
  useEffect(() => {
    let live = true
    client.tables().then(
      (t) => live && setTables(t),
      (err: unknown) => live && setNotice(saidOr(err, t('tables.error.list'))),
    )
    return () => {
      live = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new language is no reason to ask for the tables again
  }, [client, asked])
  // What came of each ended table (#1010), for the one line its row says it in. Asked beside the
  // list and with it, and only by someone who may read it (#524): a viewer's rows say nothing more.
  const [results, setResults] = useState<Record<string, PlaytestTable>>({})
  const reads = onResults !== undefined && client.mayStartTables
  useEffect(() => {
    if (!reads) return
    let live = true
    client.playtest().then(
      (read) => live && setResults(Object.fromEntries(read.tables.map((x) => [x.id, x]))),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [client, asked, reads])
  // After the list has come back and the group has opened — a frame later, because the group opens
  // in an effect of its own — the ended table's row takes the focus again, on its one way in: an
  // ended table has no menu left (#1286).
  useEffect(() => {
    if (revealed?.why !== 'ended' || !tables) return
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-table="${CSS.escape(revealed.id)}"] .byd-tables-go > a`)?.focus())
    return () => cancelAnimationFrame(frame)
  }, [tables, revealed])

  // A start that failed, said beside the button with a way to try again (L31). Its own state,
  // apart from `notice`: the list not arriving and the table not starting are two different
  // things, and only one of them has a retry.
  // A met ceiling (#1196) is said in its three parts (#1198, variant A), in the same line.
  const [failed, setFailed] = useState<string | QuotaWords | null>(null)
  const retry = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (failed !== null) retry.current?.focus()
  }, [failed])
  // `disabled` alone is not the guard against a second table: a keypress can land before the
  // re-render that disables the button, so the handler itself refuses while one start is in
  // flight (L31).
  const inFlight = useRef(false)
  // A press while a table of the game runs asks first (#1145, beslut A): the button stands over
  // that table, and whoever came to open it met a button that started another.
  const { lang } = useLang()
  const [another, setAnother] = useState(false)
  const newButton = useRef<HTMLButtonElement>(null)
  const running = (tables ?? []).filter((table) => !table.ended)
  const newest = running[0]
  const newestName = newest ? (newest.code ?? versionWord(newest.version, t, 'short')) : ''
  const answered = () => {
    setAnother(false)
    newButton.current?.focus()
  }
  const startTable = async (seating: Seating): Promise<Started | null> => {
    try {
      const made = await client.startTable(seating)
      setFailed(null)
      setRevealed({ id: made.id, why: 'started', code: made.code })
      setAsked((n) => n + 1)
      return made
    } catch (err) {
      setFailed(err instanceof QuotaReached ? quotaWords(err.quota, { kind: 'table', rev: client.rev, here: running.filter((one) => one.code !== undefined).length }, t) : saidOr(err, t('tables.failed')))
      return null
    }
  }
  // Every start asks how you sit (#1286), here as in the header: the table keeps the answer, and the
  // screen it gives the host opens beside the editor. «Försök igen» starts again on the same answer.
  const [asking, setAsking] = useState(false)
  const lastAnswer = useRef<StartAnswer | null>(null)
  const startAs = async (answer: StartAnswer) => {
    setAsking(false)
    newButton.current?.focus()
    if (inFlight.current) return
    inFlight.current = true
    lastAnswer.current = answer
    setStarting(true)
    try {
      await startInTab(answer, startTable, server, lang)
    } finally {
      inFlight.current = false
      setStarting(false)
    }
  }

  // A list that never arrived is not a list that is still coming: when the server could not
  // answer, the tab says what happened instead of waiting for ever on something that will not
  // come.
  if (!tables)
    return notice ? (
      <p className="byd-tables-empty" role="alert">
        {notice}
      </p>
    ) : (
      <p className="byd-tables-empty">{t('tables.loading')}</p>
    )
  return (
    <div className="byd-tables">
      <div className="byd-tables-lead byd-help-row">
        <span>{t('tables.lead', { n: client.rev })}</span>
        <Help topic={t('tables.help.topic')}>
          <p>{t('tables.help.life')}</p>
        </Help>
      </div>
      {/* First in the column, over the list: it is what the tab is for, and everything under it is
          a table that already exists (L31). A second action, never the filled one — the fill
          belongs to the header's own action, whichever of its two names it wears (L13, #417). The
          icon turns while the start is under way: a button that only goes quiet reads as a button
          that did nothing (jfr #215). */}
      {/* `aria-disabled` and not `disabled` (#480): the button keeps the focus while it starts the
          table, and the handler refuses a second start itself. */}
      <button ref={newButton} type="button" className="byd-tables-new byd-secondary" aria-disabled={starting} aria-busy={starting} onClick={() => (newest ? setAnother(true) : !inFlight.current && setAsking(true))}>
        <span className="byd-tables-new-icon">
          <PlayGlyph />
        </span>
        {starting ? t('tables.starting') : t('tables.new')}
      </button>
      {another && newest && (
        <Question
          className="byd-tables-question"
          label={t('tables.another.label')}
          confirm={t('tables.another.start')}
          keep={{
            label: t('tables.another.open', { table: newestName }),
            onChoose: () => {
              const way = tableWay(newest, server, lang)
              window.open(way.href, way.target)
              answered()
            },
          }}
          onCancel={answered}
          onConfirm={() => {
            setAnother(false)
            setAsking(true)
          }}
        >
          {anotherAsk(t, newestName, running.length)}
        </Question>
      )}
      {asking && (
        <Suspense fallback={null}>
          <StartQuestion
            onStart={(answer) => void startAs(answer)}
            onCancel={() => {
              setAsking(false)
              newButton.current?.focus()
            }}
          />
        </Suspense>
      )}
      {/* A table started from a deck with no cards has nothing to deal and nothing to draw (#751).
          The button stays — the deck may be filled in a minute — but the tab says so, and where
          cards are added. */}
      {deckIsEmpty(client.doc) && <p className="byd-tables-empty">{t('tables.noCards')}</p>}
      {revealed?.why === 'started' && failed === null && (
        <p className="byd-tables-started" role="status">
          {t('tables.started', { table: revealed.code ?? '' })}
        </p>
      )}
      {failed !== null && (
        <p className="byd-tables-failed" role="alert" {...(typeof failed === 'string' ? {} : { 'data-quota': '' })}>
          {typeof failed === 'string' ? (
            t('tables.failed', { reason: failed })
          ) : (
            <span>
              <b>{failed.what}</b> {failed.why} {failed.way}
            </span>
          )}{' '}
          <button ref={retry} type="button" className="byd-secondary" onClick={() => void startAs(lastAnswer.current ?? rememberedStart())}>
            {t('tables.retry')}
          </button>
        </p>
      )}
      {tables.length === 0 ? (
        <p className="byd-tables-empty">{t('tables.none')}</p>
      ) : (
        tableGroups(tables, t).map((group) => (
          <TableGroupView
            key={group.id}
            group={group}
            server={server}
            rev={client.rev}
            revealed={revealed?.id ?? null}
            results={results}
            {...(reads ? { onResults } : {})}
            onEnded={(id) => {
              setRevealed({ id, why: 'ended' })
              setAsked((n) => n + 1)
            }}
            onUpdate={async (id) => {
              // An update the log refuses is a table that has ended meanwhile (#705): the list is
              // asked again either way, and files it where it now belongs.
              try {
                await client.refreshTable(id)
              } catch (err) {
                if (!(err instanceof TableEnded)) throw err
              } finally {
                setAsked((n) => n + 1)
              }
            }}
          />
        ))
      )}
      {notice && <p role="alert">{notice}</p>}
    </div>
  )
}

// One of the three groups the column is made of (#176). The tables being played stand open under
// a heading, because they are what the designer opened the tab to find; the two that are about
// something rather than about now — started and never touched, and over (C9, G3) — lie behind a
// row that says what they are and how many they are.
//
// A folded group draws nothing at all, which is the whole point: a row that is not drawn opens no
// WebSocket and renders no thumbnail, so what the list costs follows what is on the screen rather
// than what the game has ever started.
function TableGroupView({ group, server, rev, revealed, onEnded, onUpdate, results, onResults }: { group: TableGroup; server: string | null; rev: number; revealed: string | null; onEnded(id: string): void; onUpdate(id: string): Promise<void>; results: Record<string, PlaytestTable>; onResults?: (id: string) => void }) {
  const [chosen, setChosen] = useState(group.id === 'played')
  // A table this column just started or ended opens the group it is filed under (#480) — in the
  // same render that first draws it, so there is no folded frame for a click to land in, and a
  // designer who folds it again has folded it until the next table is revealed.
  const holds = revealed !== null && group.tables.some((table) => table.id === revealed)
  const [foldedFor, setFoldedFor] = useState<string | null>(null)
  // A table that was started and never played may still be drawing its cards, and the count that
  // says so is on its row (#765) — which a folded group does not draw. So the group asks after the
  // cards of its tables itself, and stands open while any of them is still on its way (#939,
  // beslut 2026-10-07): the count is there without a click, and the group folds again when the
  // cards are done, unless the designer opened it herself. One who folds it while it renders has
  // folded it for those tables; another table that starts rendering opens it again.
  const watches = group.id === 'untouched'
  const [textures, setTextures] = useState<Record<string, Textures>>({})
  const rendering = watches ? group.tables.filter((table) => stillRendering(textures[table.id] ?? null)).map((table) => table.id) : []
  const [foldedWhile, setFoldedWhile] = useState<readonly string[]>([])
  const drawing = rendering.some((id) => !foldedWhile.includes(id))
  const open = chosen || (holds && foldedFor !== revealed) || drawing
  const setOpen = (next: (was: boolean) => boolean) => {
    const now = next(open)
    setChosen(now)
    if (!now && holds) setFoldedFor(revealed)
    if (!now) setFoldedWhile((was) => [...was, ...rendering])
  }
  const headingId = `byd-tables-group-${group.id}`
  const listId = `byd-tables-list-${group.id}`
  const rows = (
    <ul id={listId} className="byd-tables-list" aria-labelledby={headingId}>
      {group.tables.map((table) => (
        <TableRow key={table.id} table={table} server={server} rev={rev} onEnded={() => onEnded(table.id)} onUpdate={() => onUpdate(table.id)} {...(watches ? { textures: textures[table.id] ?? null } : {})} {...(results[table.id] && onResults ? { result: results[table.id], onResults: () => onResults(table.id) } : {})} />
      ))}
    </ul>
  )
  const watchers = watches && group.tables.map((table) => <TexturesWatch key={table.id} http={httpOf(server)} sessionId={table.ended ? null : table.id} onTextures={(t) => setTextures((was) => ({ ...was, [table.id]: t }))} />)
  if (group.id === 'played')
    return (
      <section className="byd-tables-group" data-group={group.id}>
        <h3 id={headingId} className="byd-tables-heading">
          {group.heading}
        </h3>
        {rows}
      </section>
    )
  return (
    <section className="byd-tables-group" data-group={group.id}>
      <button id={headingId} type="button" className="byd-tables-fold" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((was) => !was)}>
        <span className="byd-tables-caret" aria-hidden="true">
          <ChevronGlyph to="right" />
        </span>
        {group.heading}
      </button>
      {watchers}
      {open && rows}
    </section>
  )
}

// The server a table's HTTP questions go to: the one named, or the page's own.
const httpOf = (server: string | null): string => server ?? location.origin

// One table's cards, asked after by its group whether or not its row is drawn (#939). It draws
// nothing; the polling stops by itself once every card is done (#765).
function TexturesWatch({ http, sessionId, onTextures }: { http: string; sessionId: string | null; onTextures(t: Textures): void }) {
  const textures = useTextures(sessionId ? http : null, sessionId)
  useEffect(() => {
    if (textures) onTextures(textures)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new callback each render is no new answer
  }, [textures])
  return null
}

// Variant B, the shortcut: the newest table of this game, from the header, on whichever tab the
// designer is standing (#19). It is the same row as in the Bord tab — not a second telling of
// the same table — and the way on to all of them.
//
// `onNewTable` is «Nytt bord» once a table runs. It stands here and not beside the primary
// (beslut 2026-09-27, #477 fynd 4): at 1024 the header had no room for it, and the button that
// gave way was «Uppdatera bordet».
export function TableMenu({ client, server, onShowTables, onNewTable }: { client: ProjectClient; server: string | null; onShowTables(): void; onNewTable?: (() => void) | undefined }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  const caret = useRef<HTMLButtonElement>(null)
  const split = useRef<HTMLSpanElement>(null)
  // A press in the work closes it (#1144): it used to stand through anything but Escape and its caret.
  usePressAway(open, () => [split.current], () => setOpen(false))
  useEffect(() => {
    if (!open) return
    let live = true
    client.tables().then(
      (t) => live && setTables(t),
      () => live && setTables([]),
    )
    return () => {
      live = false
    }
  }, [open, client])

  // «Nytt bord» asks first while a table runs (#1145, beslut A), in the menu itself: it stood one
  // line under the running table's row. Taking the question back puts «Nytt bord» where it was and
  // the focus on it.
  const { lang } = useLang()
  const [another, setAnother] = useState(false)
  const backToNew = useRef(false)
  const close = () => {
    setOpen(false)
    setAnother(false)
    caret.current?.focus()
  }
  const newest = tables?.[0] ?? null
  const running = (tables ?? []).filter((table) => !table.ended)
  const live = running[0]
  const liveName = live ? (live.code ?? versionWord(live.version, t, 'short')) : ''
  return (
    <span
      ref={split}
      className="byd-editor-split"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') close()
      }}
    >
      <button
        ref={caret}
        type="button"
        className="byd-editor-primary byd-primary byd-editor-caret"
        aria-label={t('tables.more')}
        aria-expanded={open}
        data-drop
        onClick={() => {
          setOpen((on) => !on)
          setAnother(false)
        }}
      >
        <ChevronGlyph to="down" />
      </button>
      {open && (
        <div className="byd-editor-ways" role="group" aria-label={t('tables.group')}>
          {!tables ? (
            <p>{t('tables.loading')}</p>
          ) : newest ? (
            <ul>
              <TableRow table={newest} server={server} rev={client.rev} />
            </ul>
          ) : (
            <p>{t('tables.menu.none')}</p>
          )}
          {onNewTable && another && live ? (
            <Question
              className="byd-tables-question"
              label={t('tables.another.label')}
              confirm={t('tables.another.start')}
              keep={{
                label: t('tables.another.open', { table: liveName }),
                onChoose: () => {
                  const way = tableWay(live, server, lang)
                  window.open(way.href, way.target)
                  close()
                },
              }}
              onCancel={() => {
                backToNew.current = true
                setAnother(false)
              }}
              onConfirm={() => {
                close()
                onNewTable()
              }}
            >
              {anotherAsk(t, liveName, running.length)}
            </Question>
          ) : (
            onNewTable && (
              <button
                ref={(el) => {
                  if (!el || !backToNew.current) return
                  backToNew.current = false
                  el.focus()
                }}
                type="button"
                className="byd-editor-ways-new"
                onClick={() => {
                  if (live) return setAnother(true)
                  close()
                  onNewTable()
                }}
              >
                {t('editor.newTable')}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onShowTables()
            }}
          >
            {t('tables.all')}
          </button>
        </div>
      )}
    </span>
  )
}

// The thumbnail is the whole table drawn at full size and then shrunk by CSS, not a small
// drawing: the renderer places cards by millimetre but writes its labels in pixels, so scaling
// the finished picture is what makes a table at 160 px wide look like the table and not like a
// heap of text. Eight times the box it sits in, shrunk to an eighth by .byd-tables-mini-inner.
const THUMBNAIL = { w: 640, h: 384 }

// One table, one row (#176). A card with six ways stacked under it was 470 px of column, so
// four tables nobody had touched pushed the one being played off the screen. The row is the
// picture, the facts, and **one** way standing ready; the rest are one press away in its menu.
//
// Live, as before: the same connection the TV makes (seatless, sees only what is public), so what
// the row says about the table is what the table itself says. A row that is not drawn — a folded
// group — makes no connection at all, which is what keeps the cost with what is on the screen.
function TableRow({ table, server, rev, onEnded, onUpdate, textures: watched, result, onResults }: { table: TableSummary; server: string | null; rev: number; onEnded?: () => void; onUpdate?: () => Promise<void>; textures?: Textures | null; result?: PlaytestTable | undefined; onResults?: () => void }) {
  const t = useT()
  // The day and the clock a last move is said in are the reader's, not `sv-SE`'s (#228).
  const { lang } = useLang()
  const url = server ? server.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { client, view, observers, room } = useTableClient({ url, sessionId: table.id, seat: null, owner: true })
  // Ending a table is the one thing here that cannot be looked at afterwards (C9), so it is
  // asked about first, and the question gives the focus back to what is still on the screen when
  // it closes — the menu is gone by then, so that is the button the menu hangs from.
  const [asking, setAsking] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [refocus, setRefocus] = useState(false)
  useEffect(() => {
    if (!refocus) return
    moreRef.current?.focus()
    setRefocus(false)
  }, [refocus])
  // A table is called by its room code, as the band and the TV call it (#706, beslut A): the list
  // has it for whoever may start tables while it still admits, and the table's own connection
  // says it too, also once it has ended. Until either has answered it is called by its version.
  const code = table.code ?? room?.code ?? null
  const name = code ?? versionWord(table.version, t, 'short')
  // The update of a row behind the project, from the row itself (#706): a press that takes a
  // moment says so, and one that fails says so in a sentence of the tab's own.
  const [updating, setUpdating] = useState(false)
  const [updateFailed, setUpdateFailed] = useState(false)
  const update = async () => {
    if (!onUpdate || updating) return
    setUpdating(true)
    setUpdateFailed(false)
    try {
      await onUpdate()
    } catch {
      setUpdateFailed(true)
    } finally {
      setUpdating(false)
    }
  }
  // A seat nobody sits at, which a row only needs to say when there is none (K12).
  const free = view?.seats.find((s) => s.name === null)?.id ?? null
  // A table the log has been locked on (C9) is over: it is still here to be read, never played.
  // The list already knows it before anything connects — which is how an ended table can be filed
  // under its own fold without a socket — and the table itself says so the moment it is ended.
  const ended = table.ended || view?.ended === true
  // Which of the three this row is, said as a word and not only as a place in the column: a
  // reader who lands on the row itself never saw the heading it came under.
  const state: TableGroupId = ended ? 'ended' : groupOf(table)
  // A table keeps the version it was refreshed to (C7): the project can move on without it, and
  // then the cards on the table are not the cards in the editor. The row has to say so — but not
  // about a table that has ended, which can never be updated again and is not behind anything.
  const stale = !ended && table.version !== `rev-${rev}`
  // The cards still on their way, in the band's own words (#765, beslut B): the row says what the
  // band says, so one state reads the same wherever the designer looks. An ended table is not asked.
  // A row whose group already asks after its cards (#939) is told them rather than asking twice.
  const own = useTextures(ended || watched !== undefined ? null : url.replace(/^ws/, 'http'), table.id)
  const textures = ended ? null : watched === undefined ? own : watched
  // Every seat taken is not a reason to hide the way in; it is a reason to say why it is shut.
  const full = !ended && view !== null && free === null

  // The one way in, outlined and not filled (L13: the filled action is the header's): «Öppna bordet»,
  // which opens what the table is (#1286, variant B) — its screen at a table around a TV, the host's
  // own seat at a table of computers. The shortcuts that stood here, playing from here, the table
  // mode, watching and the QR, are gone: the designer comes in the way everyone does, and a table
  // that is over opens at the screen that shows how it ended.
  const way = ended ? { href: tvUrl(table.id, server, undefined, true, lang), target: tableTab(table.id, 'tv') } : tableWay({ ...table, code: code ?? undefined }, server, lang)
  const ready = <Way {...way} label="tables.way.open" aria="tables.way.open.aria" table={name} ready />

  // The menu holds what the row does rather than other ways in (#1286): the room's address to send,
  // and ending the table. An ended table lets nobody in and has nothing left to end.
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (!code) return
    void navigator.clipboard?.writeText(roomAddress(code, server ? server.replace(/^http/, 'ws') : null).url).then(() => setCopied(true), () => undefined)
  }
  const ways: WayItem[] = ended
    ? []
    : [...(code ? [{ id: 'copy', label: 'tables.copy' as Key, press: copy }] : []), { id: 'end', label: 'tables.end' as Key, apart: true, press: () => setAsking(true) }]

  return (
    <li className="byd-table-row" data-table={table.id} data-state={state} data-stale={stale} data-ended={ended}>
      {/* The table itself, small: the very snapshot the TV is drawing from, through the one
          renderer for tables (K9). A picture of a live game says "this is being played" faster
          than any word, and the words beside it carry the same facts for a screen reader. */}
      <div className="byd-tables-mini" aria-hidden="true">
        <div className="byd-tables-mini-inner">
          {view ? <TableRenderer view={view} mode="table" size={THUMBNAIL} faces={url.replace(/^ws/, 'http')} /> : null}
        </div>
      </div>
      <div className="byd-tables-info">
        <p className="byd-tables-head">
          {code && <strong className="byd-tables-name">{code}</strong>}
          <span className="byd-tables-version">{versionWord(table.version, t, 'short')}</span>
          <span className="byd-tables-state" data-state={state}>
            {t(STATE_WORD[state])}
          </span>
          {stillRendering(textures) && <span className="byd-tables-render">{t('editor.table.rendering', { done: textures.done, total: textures.total })}</span>}
          {stale && <em className="byd-tables-stale">{t('tables.stale', { version: versionWord(table.version, t, 'name'), rev })}</em>}
        </p>
        {!ended && <p className="byd-tables-line">{seated(view?.seats ?? null, observers, t)}</p>}
        <p className="byd-tables-line">
          {lastMoveWords(table.lastAt, Date.now(), lang, t)}
          {full && ` · ${t('tables.full')}`}
        </p>
        {/* What came of an ended table, in one line, and the way to all of it (#1010, A:s rad). */}
        {ended && result && onResults && (
          <button type="button" className="byd-tables-results" aria-label={t('results.row.aria', { table: name, summary: rowSummary(result, t) })} onClick={onResults}>
            {rowSummary(result, t)}
          </button>
        )}
      </div>
      <div className="byd-tables-go">
        {stale && onUpdate && (
          <button type="button" className="byd-secondary byd-tables-update" aria-busy={updating} aria-label={t('tables.update.of', { table: name, rev })} onClick={() => void update()}>
            {updating ? t('tables.update.busy') : t('tables.update', { rev })}
          </button>
        )}
        {ready}
        {ways.length > 0 && <RowWays table={name} ways={ways} button={moreRef} />}
      </div>
      {updateFailed && (
        <p className="byd-tables-failed" role="alert">
          {t('tables.update.failed')}
        </p>
      )}
      {copied && (
        <p className="byd-tables-started" role="status">
          {t('tables.copied')}
        </p>
      )}
      {asking && (
        <Question
          className="byd-tables-question"
          label={t('tables.end.of', { table: name })}
          confirm={t('tables.end.yes')}
          cancel={t('editor.cancel')}
          onConfirm={() => {
            // The same connection the row is already listening on, as the table itself: this is
            // the path every other end goes through (C9), not a second one.
            // Once the log is locked the list is asked again, so the row moves to its group now and
            // not whenever the tab is next opened (#480).
            void client?.send({ v: 'session.end' }).then(() => onEnded?.())
            setAsking(false)
            setRefocus(true)
          }}
          onCancel={() => {
            setAsking(false)
            setRefocus(true)
          }}
        >
          {t('tables.end.question', { table: name })}
        </Question>
      )}
    </li>
  )
}

// What the row says it is, in a word. The group heading says the same thing over the whole
// group, and the word says it again on the row, because a state carried by nothing but a place
// in the column — or by a coloured edge — is a state a reader can miss (L12).
const STATE_WORD: Record<TableGroupId, Key> = { played: 'tables.state.played', untouched: 'tables.state.untouched', ended: 'tables.ended' }

// One entry in the row's menu: a way into the table, or something the row does to itself.
type WayItem = { id: string; label: Key; href?: string; target?: string; press?(): void; expanded?: boolean; apart?: boolean }

// The five other ways, behind one press (#176). A real menu (APG): the button says what it opens
// and whether it is open, the arrows move inside it, Enter and Space take the item under them —
// Space with the default taken away, or the page scrolls out from under the menu — and Escape
// closes it and gives the focus back to the button it came from.
//
// It is drawn only while it is open, and the button that opens it is drawn always: a control that
// appears when a pointer rests on a row is not there at all for a thumb or a keyboard (#184).
function RowWays({ table, ways, button }: { table: string; ways: WayItem[]; button: RefObject<HTMLButtonElement | null> }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  // The ways hang under a row that may be the last one on the page, so the menu opens where there
  // is room rather than always downward (#229).
  const menu = useRef<HTMLDivElement>(null)
  const place = usePlacement(open, menu)
  // A press anywhere else closes it too (#1144): the blur below hears only a press that takes the focus.
  usePressAway(open, () => [button.current, menu.current], () => setOpen(false))
  const { itemProps, focus } = useRoving({ ids: ways.map((w) => w.id), selected: null, orientation: 'vertical' })
  // The keys land inside the menu the moment it opens, so the first arrow moves within it rather
  // than from wherever the pointer last was. On opening only: the menu must not take the focus
  // back from what the reader does inside it.
  useEffect(() => {
    if (open) focus(ways[0]?.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on opening only: the menu must not take the focus back
  }, [open])
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="byd-tables-more"
        aria-haspopup="menu"
        aria-expanded={open}
        data-drop
        {...(open ? { 'aria-controls': menuId } : {})}
        aria-label={t('tables.more.of', { table })}
        onClick={() => setOpen((was) => !was)}
      >
        <ChevronGlyph to="down" />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="byd-tables-menu"
          {...placedProps(place)}
          role="menu"
          aria-label={t('tables.ways.of', { table })}
          // The focus leaving the menu takes the menu with it: a list of ways hanging over a row
          // nobody is on is a list about nothing. The button it hangs from is the one place that
          // does not count — pressing it while the menu is open moves the focus there *and*
          // toggles, and a menu that closed on the move would open again on the toggle and never
          // shut at all.
          onBlur={(event) => {
            if (event.relatedTarget !== button.current && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            event.preventDefault()
            close()
          }}
        >
          {ways.map((way) => {
            const roving = itemProps(way.id)
            const take = (el: HTMLElement | null) => {
              close()
              if (way.href) el?.click()
              else way.press?.()
            }
            const props = {
              ...roving,
              role: 'menuitem',
              className: way.apart ? 'byd-tables-way byd-tables-way-apart' : 'byd-tables-way',
              onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  // Space is the browser's scroll key until something says otherwise, and a menu
                  // that scrolls the column away under itself is worse than one that does nothing.
                  event.preventDefault()
                  take(event.currentTarget)
                  return
                }
                roving.onKeyDown(event)
              },
            }
            const item = way.href ? (
              <a key={way.id} {...props} href={way.href} target={way.target} aria-label={t('tables.way.aria', { label: t(way.label), table })} onClick={() => setOpen(false)}>
                {t(way.label)}
              </a>
            ) : (
              <button key={way.id} {...props} type="button" {...(way.expanded === undefined ? {} : { 'aria-expanded': way.expanded })} onClick={() => take(null)}>
                {t(way.label)} <span className="byd-offscreen">{table}</span>
              </button>
            )
            // Ending a table is not a way into it (C9): it is set apart by a line of its own, and
            // it is the last thing in the menu rather than one more entry in the same run.
            return way.apart ? (
              <Fragment key={way.id}>
                <hr className="byd-tables-cut" />
                {item}
              </Fragment>
            ) : (
              item
            )
          })}
        </div>
      )}
    </>
  )
}

// A way into a table opens beside the editor, never over it: the designer keeps her work open.
// It opens in the table's own tab for that view (#1217, `ways.ts`), so the same way taken twice
// brings that tab out instead of opening another. `target` absent is a page that is not a table's
// — the phones' join page — which opens in a tab of its own as before.
// The label on the screen is short; the name a screen reader hears says which table it leads to
// and where it opens, because these four words repeat once per table and the visible row is what
// tells them apart for the eye.
function Way({ href, target, label, aria = 'tables.way.aria', table, ready = false }: { href: string; target?: string; label: Key; aria?: Key; table: string; ready?: boolean }) {
  const t = useT()
  return (
    <a href={href} {...(target ? { target } : { target: '_blank', rel: 'noreferrer' })} aria-label={t(aria, { label: t(label), table })} className={ready ? 'byd-secondary' : undefined}>
      {t(label)}
    </a>
  )
}

// Who is at the table right now, from the table's own answer: the seats that carry a name, and
// the observers the server announces to everyone (C8). Before the first snapshot nothing is
// known, and saying nothing is better than saying "ingen".
function seated(seats: readonly { id: string; name: string | null }[] | null, observers: readonly { name: string }[], t: T): string {
  if (!seats) return t('tables.connecting')
  const players = seats.filter((s) => s.name !== null).map((s) => s.name)
  const watching = observers.map((o) => o.name)
  const who = players.length === 0 ? t('tables.nobody') : t('tables.playing', { names: players.join(', ') })
  return watching.length === 0 ? who : t('tables.watching', { who, names: watching.join(', ') })
}

// How many cards the deck holds: every row, as many times as its `antal` says (C7).
function deckIsEmpty(doc: { rows: readonly { fields: Record<string, unknown> }[] }): boolean {
  return doc.rows.every((row) => {
    const n = Number(row.fields['antal'] ?? 1)
    return Number.isFinite(n) && n <= 0
  })
}
