import { useEffect, useRef, useState, type ReactNode } from 'react'
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

// Vilket bord som har sin meny — eller sin QR-kod — öppen (#176). Den hålls av listan och inte av
// raden, av samma skäl för båda: en spalt full av koder går inte att läsa, och två öppna menyer är
// två svar på en fråga som bara har ett.
function useOneOpen(): [string | null, (id: string, on: boolean) => void] {
  const [open, setOpen] = useState<string | null>(null)
  return [open, (id, on) => setOpen(on ? id : null)]
}

export function TablesTab({ client, server }: TablesTabProps) {
  const t = useT()
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  const [starting, setStarting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Asked again after starting a table: the server owns the list, so the way to show a new table
  // is to ask what tables there are.
  const [asked, setAsked] = useState(0)
  // Vilka av de hopfällbara grupperna som står öppna. Hopfällda är de av sitt eget skäl: en rad som
  // inte ritas kopplar inte upp sig och renderar ingen miniatyr (#176).
  const [unfolded, setUnfolded] = useState<string[]>([])
  const [menuOf, openMenu] = useOneOpen()
  const [qrOf, openQr] = useOneOpen()
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
      // Ett nystartat bord har inga drag och hör därför hemma bland de aldrig spelade. Att fälla
      // ihop det man just bad om vore att svara på knappen med ingenting alls, så gruppen öppnas.
      setUnfolded((open) => (open.includes(COLD) ? open : [...open, COLD]))
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
        <ul aria-label={t('tables.title')}>
          {played(tables).map((table) => (
            <TableRow key={table.id} table={table} server={server} rev={client.rev} menu={menuOf === table.id} qr={qrOf === table.id} onMenu={(on) => openMenu(table.id, on)} onQr={(on) => openQr(table.id, on)} />
          ))}
          {groupsOf(tables).map(([which, group]) => (
            <Fold key={which} label={t(which === COLD ? 'tables.cold' : 'tables.closed')} n={group.length} open={unfolded.includes(which)} onOpen={() => setUnfolded((open) => (open.includes(which) ? open.filter((it) => it !== which) : [...open, which]))}>
              {group.map((table) => (
                <TableRow key={table.id} table={table} server={server} rev={client.rev} menu={menuOf === table.id} qr={qrOf === table.id} onMenu={(on) => openMenu(table.id, on)} onQr={(on) => openQr(table.id, on)} />
              ))}
            </Fold>
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

// De två hopfällbara grupperna (#176). Beställarens beslut: de är två olika fakta — ett avslutat
// bord är färdigt, ett startat och aldrig rört väntar — och en avslutad session är dessutom där
// enkätsvaren finns (G3), så den ska inte ligga bland bord där ingenting hänt.
const COLD = 'cold'
const CLOSED = 'closed'

// Vilket av de tre ett bord är, avgjort på serverns eget svar och ingenting annat: det är det som
// gör att en rad kan placeras utan att kopplas upp. Ett drag i loggen är skillnaden mellan ett bord
// som spelas och ett som bara startats; en låst logg (C9) går före båda.
const played = (tables: TableSummary[]): TableSummary[] => tables.filter((table) => !table.ended && table.lastAt !== null)
const groupsOf = (tables: TableSummary[]): [string, TableSummary[]][] =>
  (
    [
      [COLD, tables.filter((table) => !table.ended && table.lastAt === null)],
      [CLOSED, tables.filter((table) => table.ended)],
    ] as [string, TableSummary[]][]
  ).filter(([, group]) => group.length > 0)

// En hopfällbar grupps rad: vad den samlar och hur många de är. Raden fäller aldrig ut sig själv —
// borden bakom den är de som inte är det man letar efter, och de kostar en anslutning var att visa.
function Fold({ label, n, open, onOpen, children }: { label: string; n: number; open: boolean; onOpen(): void; children: ReactNode }) {
  return (
    <li className="byd-tables-fold" data-open={open ? 'true' : undefined}>
      <button type="button" aria-expanded={open} onClick={onOpen}>
        <i className="byd-tables-caret" aria-hidden="true" />
        {/* Mellanrummet är läsordningen och inte layouten: utan det säger skärmläsaren
            «Startade, aldrig spelade4». */}
        <span>{label}</span> <em>{n}</em>
      </button>
      {open && <ul aria-label={label}>{children}</ul>}
    </li>
  )
}

// Variant B, the shortcut: the newest table of this game, from the header, on whichever tab the
// designer is standing (#19). It is the same row as in the Bord tab — not a second telling of
// the same table — and the way on to all of them.
export function TableMenu({ client, server, onShowTables }: { client: ProjectClient; server: string | null; onShowTables(): void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  const [menuOf, openMenu] = useOneOpen()
  const [qrOf, openQr] = useOneOpen()
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
              <TableRow table={newest} server={server} rev={client.rev} menu={menuOf === newest.id} qr={qrOf === newest.id} onMenu={(on) => openMenu(newest.id, on)} onQr={(on) => openQr(newest.id, on)} />
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
// the finished picture is what makes a table at 80 px wide look like the table and not like a
// heap of text. Eight times the box it sits in, shrunk to an eighth by .byd-tables-mini-inner.
const THUMBNAIL = { w: 640, h: 384 }

// Vägarna in i den ordning de står i radens meny (#176), och var och en som den adress den leder
// till. Ordningen är prototypens; vilken av dem som står framme i raden i stället avgörs av bordet.
const WAYS = ['tables.way.tv', 'tables.way.tableMode', 'tables.way.play', 'tables.way.watch'] as const
type WayOf = (typeof WAYS)[number]

// One table, live: the same connection the TV makes (seatless, sees only what is public), so
// what the row says about the table is what the table itself says.
//
// Raden är bordet på en rad (#176): bilden, versionen, vem som sitter, när det rördes senast, och
// en väg in. De fem andra vägarna ligger i radens meny, som stängs med Escape och lämnar tillbaka
// fokus. Menyn och QR-koden öppnas per bord och aldrig flera samtidigt, så vilket bord som har sin
// öppen är listans att hålla reda på och inte radens.
function TableRow({ table, server, rev, menu, qr, onMenu, onQr }: { table: TableSummary; server: string | null; rev: number; menu: boolean; qr: boolean; onMenu(on: boolean): void; onQr(on: boolean): void }) {
  const t = useT()
  const url = server ? server.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { client, view, observers, room } = useTableClient({ url, sessionId: table.id, seat: null, owner: true })
  // Ending a table is the one thing here that cannot be looked at afterwards (C9), so it is
  // asked about first, and the question gives the focus back to the button that opened it — which
  // since #176 is the menu's button, because the ending is asked for from inside the menu.
  const [asking, setAsking] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [refocus, setRefocus] = useState(false)
  useEffect(() => {
    if (!refocus) return
    moreRef.current?.focus()
    setRefocus(false)
  }, [refocus])
  const name = tableName(table.id)
  // Sitting down from the editor takes the next free seat, as the phone's seat picker does
  // (K12). With every seat taken there is nothing to sit on, and the row says so instead.
  const free = view?.seats.find((s) => s.name === null)?.id ?? null
  // A table the log has been locked on (C9) is over: it is still here to be read, never played.
  // The server says so in the list itself, so a row knows it before it has heard from the table —
  // and goes on knowing it the moment the ending is done over this very connection.
  const ended = table.ended || view?.ended === true
  // A table keeps the version it was refreshed to (C7): the project can move on without it, and
  // then the cards on the table are not the cards in the editor. The row has to say so — but not
  // about a table that has ended, which can never be updated again and is not behind anything.
  const stale = !ended && table.version !== `rev-${rev}`
  // Beställarens beslut (#176): vägen som står framme är att sätta sig vid bordet själv, eftersom
  // designern oftast sitter ensam när hon playtestar. Går det inte — varje plats upptagen, eller
  // ett avslutat bord som bara kan läsas — står TV-vyn där i stället, och `Spela härifrån` faller
  // tillbaka i menyn där de andra ligger.
  const seatFree = !ended && free !== null
  const first: WayOf = seatFree ? 'tables.way.play' : 'tables.way.tv'
  const href = (way: WayOf): string =>
    way === 'tables.way.play'
      ? onlineUrl(table.id, server, free ?? '', true, t)
      : way === 'tables.way.tv'
        ? tvUrl(table.id, server, undefined, true)
        : way === 'tables.way.tableMode'
          ? tableModeUrl(table.id, server, true)
          : observeUrl(table.id, server, true, t)
  const rest = WAYS.filter((way) => way !== first && (way !== 'tables.way.play' || seatFree))
  const close = () => {
    onMenu(false)
    setRefocus(true)
  }

  return (
    <li className="byd-table-row" data-table={table.id} data-stale={stale} data-ended={ended} data-played={table.lastAt !== null}>
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
        </p>
        <p className="byd-tables-who">
          <span>{ended ? t('tables.ended') : seated(view?.seats ?? null, observers, t)}</span>
          <span>{lastMove(table.lastAt, t)}</span>
        </p>
      </div>
      <div
        className="byd-tables-go"
        onKeyDown={(event) => {
          if (menu && event.key === 'Escape') {
            event.stopPropagation()
            close()
          }
        }}
      >
        <Way href={href(first)} label={first} table={name} primary />
        <button ref={moreRef} type="button" className="byd-tables-more" aria-expanded={menu} aria-label={t('tables.more.of', { table: name })} onClick={() => onMenu(!menu)}>
          ▾
        </button>
        {menu && (
          <div className="byd-tables-menu" role="group" aria-label={t('tables.ways', { table: name })}>
            {rest.map((way) => (
              <Way key={way} href={href(way)} label={way} table={name} />
            ))}
            {!ended && free === null && <span className="byd-tables-note">{t('tables.full')}</span>}
            <button
              type="button"
              aria-expanded={qr}
              onClick={() => {
                onQr(!qr)
                close()
              }}
            >
              {t('tables.qr')} <span className="byd-offscreen">{name}</span>
            </button>
            {!ended && (
              <>
                {/* `Avsluta bordet` är inte en väg in (C9): den låser loggen och kan inte tas
                    tillbaka, så den står skild från de andra och sist. */}
                <span role="separator" />
                <button
                  type="button"
                  data-kind="quiet"
                  onClick={() => {
                    onMenu(false)
                    setAsking(true)
                  }}
                >
                  {t('tables.end')} <span className="byd-offscreen">{name}</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {qr && room && (
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

// A way into a table opens beside the editor, never over it: the designer keeps her work open.
// The label on the screen is short; the name a screen reader hears says which table it leads to
// and that a new tab opens, because these four words repeat once per table and the visible row
// is what tells them apart for the eye.
function Way({ href, label, table, primary = false }: { href: string; label: Key; table: string; primary?: boolean }) {
  const t = useT()
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={t('tables.way.aria', { label: t(label), table })} className={primary ? 'byd-editor-primary byd-primary' : undefined}>
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
