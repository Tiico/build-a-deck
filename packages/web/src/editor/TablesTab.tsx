import { useEffect, useRef, useState } from 'react'
import { QrCode } from '../table/QrCode.js'
import { TableRenderer } from '../table/TableRenderer.js'
import { useTableClient } from '../table/useTableClient.js'
import { joinUrl, observeUrl, onlineUrl, tableModeUrl, tableName, tvUrl } from './tableLinks.js'
import type { ProjectClient, TableSummary } from './ProjectClient.js'
import { Question } from './Question.js'
import { useT, type Key, type T } from '../i18n/index.js'

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

  const startTable = async () => {
    setStarting(true)
    try {
      await client.startTable()
      setNotice(null)
      setAsked((n) => n + 1)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
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
      <p className="byd-tables-lead">{t('tables.lead')}</p>
      {tables.length === 0 ? (
        <p className="byd-tables-empty">{t('tables.none')}</p>
      ) : (
        <ul>
          {tables.map((table) => (
            <TableRow key={table.id} table={table} server={server} rev={client.rev} />
          ))}
        </ul>
      )}
      {notice && <p role="alert">{notice}</p>}
      <button type="button" className="byd-tables-new" disabled={starting} onClick={() => void startTable()}>
        {starting ? t('tables.starting') : t('tables.new', { n: client.rev })}
      </button>
    </div>
  )
}

// Variant B, the shortcut: the newest table of this game, from the header, on whichever tab the
// designer is standing (#19). It is the same row as in the Bord tab — not a second telling of
// the same table — and the way on to all of them.
export function TableMenu({ client, server, onShowTables }: { client: ProjectClient; server: string | null; onShowTables(): void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tables, setTables] = useState<TableSummary[] | null>(null)
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
      <button ref={caret} type="button" className="byd-editor-primary byd-editor-caret" aria-label={t('tables.more')} aria-expanded={open} onClick={() => setOpen((on) => !on)}>
        ▾
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
// heap of text. Four times the box it sits in, shrunk to a quarter by .byd-tables-mini-inner.
const THUMBNAIL = { w: 640, h: 384 }

// One table, live: the same connection the TV makes (seatless, sees only what is public), so
// what the row says about the table is what the table itself says.
function TableRow({ table, server, rev }: { table: TableSummary; server: string | null; rev: number }) {
  const t = useT()
  const url = server ? server.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { client, view, observers, room } = useTableClient({ url, sessionId: table.id, seat: null, owner: true })
  // Ending a table is the one thing here that cannot be looked at afterwards (C9), so it is
  // asked about first, and the question gives the focus back to the button that opened it.
  const [asking, setAsking] = useState(false)
  // The QR belongs beside the table it lets a phone into, and only when it is wanted: a wall of
  // codes in a list is unreadable, and the code is meant to be held up to a camera.
  const [showQr, setShowQr] = useState(false)
  const askRef = useRef<HTMLButtonElement>(null)
  const [refocus, setRefocus] = useState(false)
  useEffect(() => {
    if (!refocus) return
    askRef.current?.focus()
    setRefocus(false)
  }, [refocus])
  const name = tableName(table.id)
  // Sitting down from the editor takes the next free seat, as the phone's seat picker does
  // (K12). With every seat taken there is nothing to sit on, and the row says so instead.
  const free = view?.seats.find((s) => s.name === null)?.id ?? null
  // A table the log has been locked on (C9) is over: it is still here to be read, never played.
  const ended = view?.ended === true
  // A table keeps the version it was refreshed to (C7): the project can move on without it, and
  // then the cards on the table are not the cards in the editor. The row has to say so — but not
  // about a table that has ended, which can never be updated again and is not behind anything.
  const stale = !ended && table.version !== `rev-${rev}`

  return (
    <li className="byd-table-row" data-table={table.id} data-stale={stale} data-ended={ended}>
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
          {stale && <em className="byd-tables-stale">{t('tables.stale', { rev })}</em>}
          <span>{ended ? t('tables.ended') : seated(view?.seats ?? null, observers, t)}</span>
          <span>{lastMove(table.lastAt, t)}</span>
        </p>
        <div className="byd-tables-ways">
          <Way href={tvUrl(table.id, server, undefined, true)} label="tables.way.tv" table={name} primary />
          <Way href={tableModeUrl(table.id, server, true)} label="tables.way.tableMode" table={name} />
          {ended ? null : free ? <Way href={onlineUrl(table.id, server, free, true, t)} label="tables.way.play" table={name} /> : <span className="byd-tables-note">{t('tables.full')}</span>}
          <Way href={observeUrl(table.id, server, true, t)} label="tables.way.watch" table={name} />
          <button type="button" aria-expanded={showQr} onClick={() => setShowQr((on) => !on)}>
            {t('tables.qr')} <span className="byd-offscreen">{name}</span>
          </button>
          {!ended && (
            <button type="button" data-kind="quiet" ref={askRef} onClick={() => setAsking(true)}>
              {t('tables.end')} <span className="byd-offscreen">{name}</span>
            </button>
          )}
        </div>
        {showQr && room && (
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
      </div>
    </li>
  )
}

// A way into a table opens beside the editor, never over it: the designer keeps her work open.
// The label on the screen is short; the name a screen reader hears says which table it leads to
// and that a new tab opens, because these four words repeat once per table and the visible row
// is what tells them apart for the eye.
function Way({ href, label, table, primary = false }: { href: string; label: Key; table: string; primary?: boolean }) {
  const t = useT()
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={t('tables.way.aria', { label: t(label), table })} className={primary ? 'byd-editor-primary' : undefined}>
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

// When the table last moved, in the words a designer uses about it. A table nobody has played
// has no moment at all, and saying "inga drag än" is truer than showing when it was started.
function lastMove(at: string | null, t: T): string {
  if (at === null) return t('tables.noMoves')
  return t('tables.lastMove', { at: new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) })
}
