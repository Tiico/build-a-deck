import { forgetMe } from '../player/forget.js'
import { ForgottenPage } from '../player/SessionSheets.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Intent, VisibleComponentState } from '@byd/protocol'
import '../table/table.css'
import '../player/player.css'
import './online.css'
import { TableRenderer, type FeltRoom, type TableHandle } from '../table/TableRenderer.js'
import { useCardsPending } from '../table/textures.js'
import { useTableClient } from '../table/useTableClient.js'
import { usePresence, useRecent } from '../table/usePresence.js'
import { useShuffles } from '../table/shuffle.js'
import { useRolls } from '../table/Die.js'
import { previewOf } from '../table/rewind.js'
import { seatColor } from '../table/seatColor.js'
import { playIntents } from '../player/play.js'
import { DockedFlag, SeatSurvey, SessionButtons, SessionOverlays, useSessionVersion, useToast, refusedText, type Sheet } from '../player/SessionOverlays.js'
import { PlayerSurface, useHandMarks } from '../player/PlayerSurface.js'
import { useSeatTurned } from '../player/turned.js'
import { useSitDown } from '../player/useSitDown.js'
import { claimUrl } from '../account/session.js'
import { takeGuestToken } from '../guestAddress.js'
import { hostSeatAt } from '../hostSeat.js'
import { SeatLine } from './SeatLine.js'
import { LastMove } from './LastMove.js'
import { NOTES_OPEN_PX, NOTES_RAIL_PX, NotesColumn } from './NotesColumn.js'
import { CARD_CONTROL_PX } from '../legibility.js'
import { HandFan } from './HandFan.js'
import { HandColumn } from './HandColumn.js'
import { HandSpread } from './HandSpread.js'
import { playedAt, seatTurn, withoutHand } from './seat.js'
import { useFeltKeyboard } from '../table/useFeltKeyboard.js'
import { useRoom } from '../table/useRoom.js'
import { useActivityLive } from '../table/useActivityLive.js'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks, wayBack } from '../status/links.js'
import { guestNotice, kickedNotice, refusalText, towardSeat } from '../status/notice.js'
import { useRoomOpen } from '../status/useRoomOpen.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useSessionRecord } from '../status/sessionName.js'
import { EditorWayBack } from '../table/EditorWayBack.js'
import { editorWay } from '../ways.js'
import { useT } from '../i18n/index.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { useStartFocus } from '../table/StartButton.js'
import { WaitingRoom } from './WaitingRoom.js'
import { BOARD_FLOOR, UPRIGHT_BOARD_FLOOR } from '../player/desk.js'

// /online?session=…&seat=A&code=…&server=ws://…#token=…  — and the owner's own seat from the editor,
// /online?session=…&seat=A&owner=1, which has no token and no name (#1306).
// Fully online (C2): both roles in one window. The table, the way round the window and the seat
// agree on (#76, #77), playable as the table screen is; the seat's own hand beside it or under it,
// depending on which way the window is; the phone's controls in the corner.
//
// The hand is drawn once and once only. Where the window is landscape it stands in a column at the
// window's inline end, and the felt folds this seat's own fan of backs to its count — the same
// hand drawn twice in one window is not a picture, it is a second thing for the fit to make room
// for on the axis that binds it (K9, K17, #77).
// `onLeave` is where the way out (#31) sends the browser; a test hands it somewhere it can read.
export type OnlinePageProps = { timing?: StatusTiming & { renderStalledAfterMs?: number }; onLeave?(url: string): void }

// Which windows get a board at all (C2, #99, #484 fynd 9): `BOARD_FLOOR` and `UPRIGHT_BOARD_FLOOR`,
// in `player/desk.ts` since `/play` draws its desk in exactly those windows (#1310).

export function OnlinePage({ timing = DEFAULT_TIMING, onLeave = (url) => location.assign(url) }: OnlinePageProps = {}) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const seat = params.get('seat')
  const owner = params.get('owner') === '1'
  // A guest's token, from the fragment (#1278); the owner's own seat has none.
  const token = useMemo(() => (owner ? undefined : takeGuestToken()), [owner])
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  const conn = useTableClient(sessionId && seat ? { url, sessionId, seat, ...(token ? { token } : {}), ...(owner ? { owner: true } : {}), connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { client, view, status, activity, observers, refused } = conn
  // A guest sits down as the name her token was bought with, which the table tells her (#1278). The
  // owner's own seat has no token and no name in its address (#1306): she sits down under the name
  // she gave «Hur sitter ni?» in this browser (L77), else under her account's, which the table tells
  // her, else as the designer.
  const [kept] = useState(() => {
    if (!owner) return null
    return sessionId ? (hostSeatAt(sessionId)?.name ?? null) : null
  })
  const name = token === undefined ? (owner ? (kept ?? client?.admitted ?? (view ? t('online.designer') : null)) : null) : (client?.admitted ?? null)
  // A whole table on a whole screen: the message stands on the felt, like the TV's.
  const live = useLiveStatus(conn, 'table', timing)
  const links = statusLinks({ server: params.get('server'), code: params.get('code') })
  const roomOpen = useRoomOpen(http, params.get('code'), refused === 'kicked')
  // A seat whose line is gone is offered the room's seat picker before the way home (#484 fynd 14).
  const said = links.rescan && live.notice ? { ...live, notice: towardSeat(live.notice, t) } : live
  // The session record: the game's name for a tab given no room code (#759), and for the owner the
  // project the way back leads to (#1217).
  const record = useSessionRecord(http, sessionId, owner || !params.get('code'))
  const game = params.get('code') ? null : (record?.name ?? null)
  // The owner's ways to the game's editor (#1217, L80): in the head, in the exit sheet with the
  // seat kept, under the thanks once the table has ended — and where giving the seat up leads.
  const server = params.get('server')
  const back = owner ? <EditorWayBack game={record} server={server} /> : null
  const editor = owner && record?.project && record.name ? { ...editorWay(record.project, server), name: record.name } : null
  const stay = editor ? (
    <>
      <a data-kind="stay" href={editor.href} target={editor.target}>
        {t('exit.sheet.editor', { game: editor.name })}
      </a>
      <p>{t('exit.sheet.editor.body')}</p>
    </>
  ) : undefined
  const left = () => onLeave(editor ? editor.href.replace(/#$/, '') : wayBack(links))
  usePageTitle({ state: sessionId && seat ? (refused ? 'forbidden' : live.state) : 'missing', room: params.get('code'), game, turn: seat !== null && view?.turn?.seat === seat && !view.ended })
  // The window this seat is playing in: it is half of which way round the felt is drawn (#77).
  const room = useRoom()
  const presence = usePresence(client, view)
  const recent = useRecent(activity)
  // The shuffle fanned on the phone's felt too (L35): every screen that sees the pile plays it.
  const shuffles = useShuffles(activity, view !== null)
  const rolls = useRolls(activity, view !== null)
  const table = useRef<TableHandle>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  // The hand's second mode (#24): the fan at rest, the whole hand as a grid when it is asked for.
  const [spread, setSpread] = useState(false)
  // A card carried out of the hand, and where (#484 fynd 4): the felt is asked what lies under it.
  const [carried, setCarried] = useState<{ card: VisibleComponentState; x: number; y: number } | null>(null)
  const showAll = useRef<HTMLButtonElement>(null)
  // What the felt says about its frame, and whether the notepad stands open (#1131): together they
  // answer whether the column may stand open by default and keep K9's floor on every card.
  const [felt, setFelt] = useState<FeltRoom | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [toast, setToast] = useToast()
  const marks = useHandMarks()
  const turned = useSeatTurned(sessionId, seat, view)
  const version = useSessionVersion(http, sessionId, view?.ended === true)
  // Whether this window gets a board at all (#99). Off a browser there is no window to ask, and a
  // missing answer must never take the board away — the same reading `column` below makes.
  const board = !(room.w > 0 && room.h > 0) || (Math.min(room.w, room.h) >= BOARD_FLOOR && (room.w > room.h || room.w >= UPRIGHT_BOARD_FLOOR))
  // The felt and the fan, both as controls, both opening the same address panel (#1, #2). Where
  // there is no felt the keyboard is the hand and the panel alone, exactly as on `/play`.
  const kbd = useFeltKeyboard(view, board && view !== null && !view.rewind && !view.ended && client !== null, {
    act: (intents) => (client ? client.send(...intents) : Promise.resolve({ ok: false as const, reason: 'not connected' })),
    // A card played out of «Visa alla» closes it (#484 fynd 6): the grid was raised to choose a
    // card, and the focus is on its way to where the card now lies.
    onPlayed: () => {
      marks.clear()
      setSpread(false)
    },
    faces: http,
    turned,
  })
  useActivityLive(activity, view, seat)
  // The start waits for the cards here too (#765, beslut B): a seat at a distance deals the same
  // faceless cards a TV would.
  const startWait = useCardsPending(http, sessionId, view, timing.renderStalledAfterMs)
  // A proposed rewind shows the table as it was (C, K13), and «Visa alla» stood over exactly that
  // table (#747): the grid closes the moment a proposal stands, whoever made it.
  const proposing = view?.rewind != null
  useEffect(() => {
    if (proposing) setSpread(false)
  }, [proposing])

  // Distance mode has a seat like any other screen with one, and sits down the same way.
  useSitDown(client, view, seat, name)
  // The waiting room (L77, #1130) lies over the felt until something has happened at the table. A
  // game with no start has nothing to wait for but the people, and its room is put away by hand.
  const [begun, setBegun] = useState(false)
  const startFocus = useStartFocus(view?.played === true)
  // Put away by hand, the room hands its start to the felt's tile, and the focus goes with it.
  useEffect(() => {
    if (!begun) return
    const felt = (selector: string) => document.querySelector<HTMLElement>(`.byd-online-felt ${selector}`)
    ;(felt('.byd-table-start') ?? felt('[tabindex="0"]'))?.focus()
  }, [begun])
  // The room's code: the one the server tells this connection — the owner's own seat is told it,
  // and told the new one after «Ny kod» — or else the one a guest arrived with.
  const code = conn.room?.code ?? params.get('code')
  // She left with her name removed (#1281), ahead of the door the release shut behind her.
  const [forgotten, setForgotten] = useState(false)

  if (forgotten) return <ForgottenPage home={links.home ?? '/'} />
  if (!sessionId || !seat) return <StatusNotice notice={guestNotice('missing', t)} surface="page" links={links} />
  // Not admitted, or kicked (DRIFT §9): a shut door rather than a broken line.
  if (refused === 'kicked') return <StatusNotice notice={kickedNotice(roomOpen === true, t)} surface="page" links={links} />
  if (refused) return <StatusNotice notice={{ ...guestNotice('forbidden', t), text: refusedText(refused, t) }} surface="page" links={links} />
  if (!view || !client) return <RouteStatus status={live.state === 'missing' ? { ...live, notice: guestNotice('missing', t) } : said} over="card" links={links} onRetry={conn.retry} />

  const me = view.seats.find((s) => s.id === seat)
  // A guest's way to leave with her name removed (#1281); the owner's own seat is her account's (#1280).
  const forget = token ? { name: me?.name ?? name ?? seat, run: () => forgetMe(http, sessionId, token) } : undefined
  // Which shape the hand takes (K17's revision of 2026-09-14, #77). In a landscape window it is a
  // column at the window's inline end and the felt keeps the height; in a portrait one the band
  // under the felt stands exactly as it was — there the window's short side is the width, the
  // felt's fit is bound by it, and a column would take the felt's room rather than find it.
  const column = room.w > 0 && room.h > 0 && room.w > room.h
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  const shown = withoutHand(previewOf(view), seat)
  const playable = !view.rewind && !view.ended
  const waiting = playable && !view.played && !begun
  const up = spread && hand.length > 0
  // Folded where it costs (beställarens beslut 2026-10-22, K29): open by default only where a card
  // at rest keeps K9's 45 px with the column open — measured by the felt's own fit, in the frame the
  // open column would leave it. A portrait window lays the column over the felt instead and never
  // opens it unasked. Until the felt has been fitted the answer is no.
  const openFrame = felt ? { w: felt.frame.w - (notesOpen ? 0 : NOTES_OPEN_PX - NOTES_RAIL_PX), h: felt.frame.h } : null
  const notesByDefault = column && felt !== null && openFrame !== null && felt.cardPxAt(openFrame) >= CARD_CONTROL_PX
  // The answer goes back to the felt, which says a refusal beside the drop (#682).
  const onAct = (intents: Intent[]) => client.send(...intents)
  // A card out of the fan lands where it is dropped, centred on the pointer, in what the felt
  // shows there (K2, K11, #65). Let go anywhere but over the table's picture — back over the hand,
  // over the top bar, in the dark around the table — it was not played at all, and goes back into
  // the hand (#484 fynd 1). The wooden frame is the table's, and there it lies on the felt (#66).
  // Where a card let go at this point would land: the one reading both the release and the felt's
  // answer while it is carried make (#484 fynd 4), so what is promised is what happens.
  const landing = (clientX: number, clientY: number) => {
    if (!table.current?.onTable(clientX, clientY)) return null
    const p = table.current.toTable(clientX, clientY)
    return p ? playedAt(shown, seat, p) : null
  }
  const play = (card: (typeof hand)[number], clientX: number, clientY: number) => {
    if (!playable) return
    const dest = landing(clientX, clientY)
    if (!dest) return
    // A card the table refuses is said beside where it was let go, as a drop on the felt is (#682).
    const sent = client.send(...playIntents(view, [card], dest.zone, { x: dest.x, y: dest.y }, 'top', turned.turned))
    table.current?.answer(sent, clientX, clientY)
  }
  // While it is carried the felt says where it will land (beslut C, prototyp 23): the zone or hand
  // under it is marked, the ghost is the card it will become, and off the table the hand says the
  // card goes back to it.
  const over = carried ? table.current?.onTable(carried.x, carried.y) === true : false
  const dest = carried && over ? landing(carried.x, carried.y) : null
  const aimed = dest ? { zone: dest.zone, cards: 1 } : null
  const aim = carried ? { size: over ? { w: table.current?.cardPx() ?? 0 } : null, back: !over } : undefined

  return (
    <>
      {/* An ended table is one more state of D5's kind: the picture behind the survey is not to be
          acted on, so it is out of reach the same way a stale one is (UX-38, #83). */}
      {board ? (
      <div data-page="online" data-status={status} className={`byd-fit byd-online${live.stale ? ' byd-status-stale' : ''}`} {...(live.stale || view.ended ? { inert: true } : {})} style={{ ['--seat' as string]: seatColor(Math.max(0, view.seats.findIndex((s) => s.id === seat))) }}>
      {/* The seat's own line and the session's tools leave the bottom band altogether (#25):
          at 390 the band is 358 px, which holds eight forty-four pixel targets and no more, so
          the hand and the tools cannot both live there. C4's thumb pays for it; see C4's own
          revision of 2026-09-08. */}
      <header className="byd-online-top">
        {/* The page's heading, for a screen reader (#560 P-20): the seat's line says who, the felt says
            what, and neither is a heading. It opens the banner, so the landmarks hold everything (#762). */}
        <h1 className="byd-offscreen">{t('play.table')}</h1>
        {back}
        <SeatLine name={me?.name ?? seat} hand={hand.length} observers={observers.map((o) => o.name)} t={t} />
        {hand.length > 0 && (
          <button type="button" className="byd-online-showall" ref={showAll} aria-expanded={spread ? 'true' : 'false'} onClick={() => setSpread(!spread)}>
            {t('online.showall')}
          </button>
        )}
        <LastMove view={view} activity={activity} seat={seat} />
        <div className="byd-online-tools">
          {/* Regelboken bland sätets verktyg (B7, #709), som på telefonen där den rider i raden vid
              handen: en distansspelare vid en laptop har varken TV eller telefon att läsa den på.
              Raden lägger ut knappen och ger den sina grannars form; boken hänger i fönstrets kant. */}
          {!view.ended && !view.rewind && <RuleDrawer http={http} sessionId={sessionId} placement="tv" live={view} />}
          <SessionButtons client={client} view={view} sheet={sheet} onSheet={setSheet} />
        </div>
      </header>
      <main className="byd-online-play" data-hand={column ? 'column' : 'band'}>
        {/* The table's notepad (#1131, beslut B · Spalten) at the felt's inline start, across from
            the hand; open by default only where the felt can spare it (`notesByDefault`). */}
        <NotesColumn view={view} activity={activity} seat={seat} send={(...intents) => client.send(...intents)} defaultOpen={notesByDefault} onOpen={setNotesOpen} />
        <div className="byd-online-felt">
          {waiting && (
            <WaitingRoom
              view={view}
              seat={seat}
              code={code}
              server={params.get('server')}
              startWait={startWait}
              onStart={(intents, hadFocus) => {
                startFocus(hadFocus)
                // A start the table refuses is said, as the felt says a refused drop (#682).
                void client.send(...intents).then((sent) => {
                  if (!sent.ok) setToast(refusalText(sent.reason, t))
                })
              }}
              onBegin={() => setBegun(true)}
            />
          )}
          <TableRenderer
            ref={table}
            view={shown}
            mode="table"
            rotate={seatTurn(view, seat, room)}
            me={seat}
            foldHand={column ? seat : null}
            faces={http}
            onAct={playable ? onAct : undefined}
            keyboard={kbd.keyboard}
            aimed={aimed}
            // A lens on the felt (#502, beslut B): K9's 45 px one step in, at any table and window.
            lens
            peers={Object.values(presence.peers)}
            pulses={presence.pulses}
            recent={recent}
            shuffles={shuffles}
            rolls={rolls}
            onPresence={(p) => client.sendPresence(p)}
            startWait={startWait}
            onFit={setFelt}
            startTile={!waiting}
          />
        </div>
        {/* Beside the felt and not over it (#1255): the felt gives up the panel's width while it stands. */}
        {sheet === 'flag' && <DockedFlag client={client} view={view} faces={http} onSheet={setSheet} onToast={setToast} />}
        {/* One hand, one copy of it. While the grid stands the band is still drawn — dimmed,
            under it — but it is out of the tab order and out of the accessibility tree, the way
            the page behind any raised surface is. Two live copies of the same twenty-one
            controls would be two of every card to a screen reader (L10). */}
        <div className="byd-hand-under" {...(up ? { inert: true, 'aria-hidden': true } : {})}>
          {/* Off the table a carried card goes back into the hand, and the hand says so (#484). */}
          {aim?.back && (
            <p className="byd-hand-back" aria-hidden="true">
              {t('online.hand.back')}
            </p>
          )}
          {column ? (
            <HandColumn cards={hand} faces={http} turned={turned.turned} onTurn={(c) => turned.toggle(c.id)} locked={!playable} onCarry={setCarried} aim={aim} onPlay={play} onOpen={(c) => kbd.openHand(c, [])} />
          ) : (
            <HandFan cards={hand} faces={http} turned={turned.turned} onTurn={(c) => turned.toggle(c.id)} locked={!playable} onCarry={setCarried} aim={aim} onPlay={play} onOpen={(c) => kbd.openHand(c, [])} />
          )}
        </div>
        {up && (
          <HandSpread
            cards={hand}
            faces={http}
            turned={turned.turned}
            onTurn={(c) => turned.toggle(c.id)}
            onOpen={(c) => kbd.openHand(c, [])}
            onClose={() => {
              setSpread(false)
              showAll.current?.focus()
            }}
          />
        )}
      </main>
      {kbd.panel}
      <SessionOverlays client={client} view={view} seat={seat} sheet={sheet} onSheet={setSheet} onLeft={left} toast={toast} onToast={setToast} version={version} faces={http} stay={stay} flagDocked forget={forget} onForgotten={() => setForgotten(true)} />
      </div>
      ) : (
        /* A window too small to carry a board gets the player's own surface instead (#99): the
           hand as K10's strip, the counters, the zones in front of this seat, and the table as
           names and counts. Nothing a seat may do is taken away — only the felt, which at this
           size was 16 px of card and no use to anybody. */
        <div data-page="online" data-status={status} className={`byd-player${live.stale ? ' byd-status-stale' : ''}`} {...(live.stale || view.ended ? { inert: true } : {})}>
          <PlayerSurface
            client={client}
            view={view}
            activity={activity}
            seat={seat}
            name={me?.name ?? seat}
            sessionId={sessionId}
            faces={http}
            version={version}
            marks={marks}
            turnedHand={turned}
            openHand={kbd.openHand}
            onLeft={left}
            stay={stay}
            forget={forget}
            onForgotten={() => setForgotten(true)}
            away
          />
          {kbd.panel}
        </div>
      )}
      <SeatSurvey view={view} seat={seat} name={me?.name ?? seat} http={http} sessionId={sessionId} version={version} token={token} saveUrl={token ? claimUrl(token, params.get('server')) : null} saved={params.get('saved') === '1'} onward={back} />
      <RouteStatus status={live.state === 'missing' ? { ...live, notice: guestNotice('missing', t) } : said} over="card" links={links} onRetry={conn.retry} />
    </>
  )
}
