import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { QrCode } from '../table/QrCode.js'
import { TableRenderer } from '../table/TableRenderer.js'
import { useTableClient } from '../table/useTableClient.js'
import { joinUrl, observeUrl, onlineUrl, tableModeUrl, tableName, tvUrl } from './tableLinks.js'
import { groupOf, tableGroups, type TableGroup, type TableGroupId } from './tableRows.js'
import { placedProps, usePlacement } from './placement.js'
import { useRoving } from './roving.js'
import type { ProjectClient, TableSummary } from './ProjectClient.js'
import { Question } from './Question.js'
import { useLang, useT, type Key, type T } from '../i18n/index.js'
import { lastMoveWords } from './when.js'

// The Bord tab (#19): every table this game has, and the ways into it. A table is a session
// started from the project (C9: it survives everyone disconnecting), so the list is the server's
// answer, never a list the editor keeps of its own.
export type TablesTabProps = { client: ProjectClient; server: string | null }

export function TablesTab({ client, server }: TablesTabProps) {
  const t = useT()
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  const [starting, setStarting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Asked again after starting a table: the server owns the list, so the way to show a new table
  // is to ask what tables there are.
  const [asked, setAsked] = useState(0)
  // Which table's QR is up, for the whole column: the code is meant to be held up to a camera,
  // and two of them at once is two tables a phone could land at by mistake.
  const [qrFor, setQrFor] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    client.tables().then(
      (t) => live && setTables(t),
      (err: unknown) => live && setNotice(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      live = false
    }
  }, [client, asked])

  // A start that failed, said beside the button with a way to try again (L31). Its own state,
  // apart from `notice`: the list not arriving and the table not starting are two different
  // things, and only one of them has a retry.
  const [failed, setFailed] = useState<string | null>(null)
  const retry = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (failed !== null) retry.current?.focus()
  }, [failed])
  // `disabled` alone is not the guard against a second table: a keypress can land before the
  // re-render that disables the button, so the handler itself refuses while one start is in
  // flight (L31).
  const inFlight = useRef(false)
  const startTable = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setStarting(true)
    try {
      await client.startTable()
      setFailed(null)
      setAsked((n) => n + 1)
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err))
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
      <p className="byd-tables-lead">{t('tables.lead', { n: client.rev })}</p>
      {/* First in the column, over the list: it is what the tab is for, and everything under it is
          a table that already exists (L31). A second action, never the filled one — the fill
          belongs to «Uppdatera bordet» (L13). The icon turns while the start is under way: a
          button that only goes quiet reads as a button that did nothing (jfr #215). */}
      <button type="button" className="byd-tables-new byd-secondary" disabled={starting} aria-busy={starting} onClick={() => void startTable()}>
        <span className="byd-tables-new-icon">
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M3 1.5 12 7l-9 5.5z" fill="currentColor" />
          </svg>
        </span>
        {starting ? t('tables.starting') : t('tables.new')}
      </button>
      {failed !== null && (
        <p className="byd-tables-failed" role="alert">
          {t('tables.failed', { reason: failed })}{' '}
          <button ref={retry} type="button" className="byd-secondary" onClick={() => void startTable()}>
            {t('tables.retry')}
          </button>
        </p>
      )}
      {tables.length === 0 ? (
        <p className="byd-tables-empty">{t('tables.none')}</p>
      ) : (
        tableGroups(tables, t).map((group) => <TableGroupView key={group.id} group={group} server={server} rev={client.rev} qrFor={qrFor} onQr={setQrFor} />)
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
function TableGroupView({ group, server, rev, qrFor, onQr }: { group: TableGroup; server: string | null; rev: number; qrFor: string | null; onQr(id: string | null): void }) {
  const [open, setOpen] = useState(group.id === 'played')
  const headingId = `byd-tables-group-${group.id}`
  const listId = `byd-tables-list-${group.id}`
  const rows = (
    <ul id={listId} className="byd-tables-list" aria-labelledby={headingId}>
      {group.tables.map((table) => (
        <TableRow key={table.id} table={table} server={server} rev={rev} qrOpen={qrFor === table.id} onQr={(open) => onQr(open ? table.id : null)} />
      ))}
    </ul>
  )
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
          ▸
        </span>
        {group.heading}
      </button>
      {open && rows}
    </section>
  )
}

// Variant B, the shortcut: the newest table of this game, from the header, on whichever tab the
// designer is standing (#19). It is the same row as in the Bord tab — not a second telling of
// the same table — and the way on to all of them.
export function TableMenu({ client, server, onShowTables }: { client: ProjectClient; server: string | null; onShowTables(): void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  // One row, so one QR at most; the shortcut holds its own because it is its own surface.
  const [qrOpen, setQrOpen] = useState(false)
  const caret = useRef<HTMLButtonElement>(null)
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

  const close = () => {
    setOpen(false)
    caret.current?.focus()
  }
  const newest = tables?.[0] ?? null
  return (
    <span
      className="byd-editor-split"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') close()
      }}
    >
      <button ref={caret} type="button" className="byd-editor-primary byd-primary byd-editor-caret" aria-label={t('tables.more')} aria-expanded={open} onClick={() => setOpen((on) => !on)}>
        ▾
      </button>
      {open && (
        <div className="byd-editor-ways" role="group" aria-label={t('tables.group')}>
          {!tables ? (
            <p>{t('tables.loading')}</p>
          ) : newest ? (
            <ul>
              <TableRow table={newest} server={server} rev={client.rev} qrOpen={qrOpen} onQr={setQrOpen} />
            </ul>
          ) : (
            <p>{t('tables.menu.none')}</p>
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
function TableRow({ table, server, rev, qrOpen, onQr }: { table: TableSummary; server: string | null; rev: number; qrOpen: boolean; onQr(open: boolean): void }) {
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
  const name = tableName(table.id)
  // Sitting down from the editor takes the next free seat, as the phone's seat picker does (K12).
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
  // Every seat taken is not a reason to hide the way in; it is a reason to say why it is shut.
  const full = !ended && view !== null && free === null

  // The one way that stands ready — outlined, not filled. It is the row's first action and not
  // the view's: "Uppdatera bordet" in the header is the view's, and L13 allows exactly one filled
  // thing in a view. Four live tables would otherwise be four more.
  //
  // Playing from here, because the designer is usually alone when she playtests and the TV is
  // then an extra step (beslut 2026-09-17) — except on a table that is over, which cannot be
  // played at all and whose one way in is the screen that shows how it ended. While the table has
  // not answered yet there is no seat to take; the word stays where it is rather than swapping
  // under the pointer, and the row's own lines say why it cannot be had.
  const ready = ended ? (
    <Way href={tvUrl(table.id, server, undefined, true)} label="tables.way.tv" table={name} ready />
  ) : free ? (
    <Way href={onlineUrl(table.id, server, free, true, t)} label="tables.way.play" table={name} ready />
  ) : (
    <button type="button" className="byd-tables-ready" disabled>
      {t('tables.way.play')} <span className="byd-offscreen">{name}</span>
    </button>
  )

  // The other five, in the menu (beslut 2026-09-17): the TV view among them. An ended table has
  // no seat to take and nothing left to end, so its menu is the three that are still about
  // something.
  const ways: WayItem[] = [
    ...(ended ? [] : [{ id: 'tv', href: tvUrl(table.id, server, undefined, true), label: 'tables.way.tv' as Key }]),
    { id: 'table', href: tableModeUrl(table.id, server, true), label: 'tables.way.tableMode' as Key },
    { id: 'watch', href: observeUrl(table.id, server, true, t), label: 'tables.way.watch' as Key },
    { id: 'qr', label: 'tables.qr' as Key, expanded: qrOpen, press: () => onQr(!qrOpen) },
    ...(ended ? [] : [{ id: 'end', label: 'tables.end' as Key, apart: true, press: () => setAsking(true) }]),
  ]

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
          <strong>{table.version}</strong>
          <span className="byd-tables-state" data-state={state}>
            {t(STATE_WORD[state])}
          </span>
          {stale && <em className="byd-tables-stale">{t('tables.stale', { rev })}</em>}
        </p>
        {!ended && <p className="byd-tables-line">{seated(view?.seats ?? null, observers, t)}</p>}
        <p className="byd-tables-line">
          {lastMoveWords(table.lastAt, Date.now(), lang, t)}
          {full && ` · ${t('tables.full')}`}
        </p>
      </div>
      <div className="byd-tables-go">
        {ready}
        <RowWays table={name} ways={ways} button={moreRef} />
      </div>
      {/* The QR belongs beside the table it lets a phone into, and only when it is wanted: a wall
          of codes in a list is unreadable, and the code is meant to be held up to a camera. */}
      {qrOpen && room && (
        <div className="byd-tables-qr">
          <QrCode text={joinUrl(room.code, server)} />
          <Way href={joinUrl(room.code, server)} label="tables.way.join" table={name} />
        </div>
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
            void client?.send({ v: 'session.end' })
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
type WayItem = { id: string; label: Key; href?: string; press?(): void; expanded?: boolean; apart?: boolean }

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
  const { itemProps, focus } = useRoving({ ids: ways.map((w) => w.id), selected: null, orientation: 'vertical' })
  // The keys land inside the menu the moment it opens, so the first arrow moves within it rather
  // than from wherever the pointer last was. On opening only: the menu must not take the focus
  // back from what the reader does inside it.
  useEffect(() => {
    if (open) focus(ways[0]?.id)
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
        {...(open ? { 'aria-controls': menuId } : {})}
        aria-label={t('tables.more.of', { table })}
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true">▾</span>
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
              <a key={way.id} {...props} href={way.href} target="_blank" rel="noreferrer" aria-label={t('tables.way.aria', { label: t(way.label), table })} onClick={() => setOpen(false)}>
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
// The label on the screen is short; the name a screen reader hears says which table it leads to
// and that a new tab opens, because these four words repeat once per table and the visible row
// is what tells them apart for the eye.
function Way({ href, label, table, ready = false }: { href: string; label: Key; table: string; ready?: boolean }) {
  const t = useT()
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={t('tables.way.aria', { label: t(label), table })} className={ready ? 'byd-secondary' : undefined}>
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

