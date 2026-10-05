import { useEffect, useMemo, useState } from 'react'
import type { Intent, VisibleComponentState } from '@byd/protocol'
import './table.css'
import { TableRenderer, type TableMode } from './TableRenderer.js'
import { TvChrome } from './TvChrome.js'
import { useTableClient } from './useTableClient.js'
import { previewOf, standingRewind } from './rewind.js'
import { usePresence, useRecent } from './usePresence.js'
import { useShowing } from './useShowing.js'
import { useShuffles } from './shuffle.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { useFeltKeyboard } from './useFeltKeyboard.js'
import { useActivityLive } from './useActivityLive.js'
import { RewindFrame } from './RewindFrame.js'
import { KEEP_TRYING_MS, DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks } from '../status/links.js'
import { noticeFor, tableShut, unlinked } from '../status/notice.js'
import { logout, whoAmI } from '../account/api.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useT, type Key } from '../i18n/index.js'
import { keepHostKey, takeHostKey } from './hostKey.js'

type SessionRecord = { name?: string }

// /table?session=…&host=…&mode=table|tv&server=ws://…
// The `table` role: no seat, sees only what is public, acts for the group (K14). It is the
// host's screen (DRIFT §9): the host key opens it, and it is told the room code to show.
export type TablePageProps = { timing?: StatusTiming }

export function TablePage({ timing = DEFAULT_TIMING }: TablePageProps = {}) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const mode: TableMode = params.get('mode') === 'tv' ? 'tv' : 'table'
  // Read once and out of the address at once (#758): the key never stands in the address bar.
  const [host] = useState(() => takeHostKey(sessionId))
  const owner = params.get('owner') === '1'
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const conn = useTableClient(sessionId ? { url, sessionId, seat: null, ...(host ? { host } : {}), ...(owner ? { owner: true } : {}), connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs, keepTryingMs: timing.keepTryingMs ?? KEEP_TRYING_MS } : null)
  const { client, view, status, activity, observers, room, refused } = conn
  // «Ny kod» changes the key too (#820), and the key this tab was opened with opens nothing after
  // it: the one the rotation handed the screen is what a reload must find.
  useEffect(() => {
    if (sessionId && conn.hostKey) keepHostKey(sessionId, conn.hostKey)
  }, [sessionId, conn.hostKey])
  const roomCode = room?.code ?? params.get('code') ?? ''
  // The room reads its own state across a room, so a message that lands on top of the felt is a
  // card in the middle of it (#12, #7, variant C).
  const live = useLiveStatus(conn, 'table', timing)
  const links = statusLinks({ server: params.get('server'), code: roomCode })
  // The session record: which game this table runs (L5). The name titles the screen. Which version
  // it runs is the view's (C7, #677): «Uppdatera» moves it mid-game, and the title, the book and
  // the ended screen follow it in the patch that carries the line.
  const [record, setRecord] = useState<SessionRecord | null>(null)
  useEffect(() => {
    if (!sessionId) return
    let live = true
    void fetch(`${url.replace(/^ws/, 'http')}/sessions/${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SessionRecord>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => live && setRecord(s))
      .catch(() => live && setRecord({}))
    return () => {
      live = false
    }
  }, [sessionId, url])
  // Without a code — an owner who opened their own table — the game's name names it (#759).
  // A table whose game was taken away (#676) is not there, which is not the same as shut.
  const gameDeleted = refused === 'the game was deleted'
  // Who stands at a shut table (#748): signed out, or in an account that may not open it. The
  // server would have let the owner in, so a signed-in reader here is someone else's account.
  const http = url.replace(/^ws/, 'http')
  const [account, setAccount] = useState<string | null | undefined>(undefined)
  const shut = refused !== null && !gameDeleted
  useEffect(() => {
    if (!shut) return
    let live = true
    // A service that cannot say who is here has nobody signed in to name.
    void whoAmI(http).then(
      (email) => live && setAccount(email),
      () => live && setAccount(null),
    )
    return () => {
      live = false
    }
  }, [shut, http])
  const switchAccount = () => {
    if (links.login === undefined) return
    const login = links.login
    void logout(http).then(() => location.assign(login))
  }
  usePageTitle({ state: sessionId ? (gameDeleted ? 'missing' : refused ? 'forbidden' : live.state) : 'missing', room: roomCode || null, game: record?.name ?? null, part: view?.ended ? t('title.play.ended') : null })

  // What the screen is pointed at (C): only the TV has a panel to show it in.
  const [inspecting, setInspecting] = useState<VisibleComponentState | null>(null)
  const presence = usePresence(client, view)
  const recent = useRecent(activity)
  // Which piles are being shuffled right now (L35): played by the line, on this screen as on
  // every other that sees the pile, and never for the lines the snapshot brought.
  const shuffles = useShuffles(activity, view !== null)
  // The felt as controls (#2): the table screen plays as the table itself, so what it can reach
  // is what a table may see.
  const playable = view !== null && !view.rewind && !view.ended && client !== null
  // What the room's screen holds up for everyone (#508): a phone's «Visa för alla», or the table's
  // own «Titta». Only the TV has the room in front of it; the felt's own screen keeps K8's view.
  const shown = useShowing(view, mode === 'tv' ? presence.shown : null)
  const felt = useFeltKeyboard(view, playable, {
    act: (intents) => (client ? client.send(...intents) : Promise.resolve({ ok: false, reason: 'not connected' })),
    look: mode === 'tv' ? shown.show : undefined,
  })
  const showing = shown.showing
  const dismiss = shown.dismiss
  useEffect(() => {
    if (!showing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showing, dismiss])
  // The table screen acts as the table itself, so a line with no seat on it is its own (K14).
  useActivityLive(activity, view, null)

  const joinUrl = useMemo(() => {
    if (!roomCode) return undefined
    const q = new URLSearchParams({ code: roomCode })
    const server = params.get('server')
    if (server) q.set('server', server)
    return `${location.origin}/join?${q.toString()}`
  }, [params, roomCode])

  // A link with no room in it is a link to a room that does not exist.
  if (!sessionId) return <StatusNotice notice={unlinked('table', t)} surface="page" links={links} />
  // The host key is what opens this screen (DRIFT §9); without it the door is shut, not broken.
  // A table whose game was taken away (#676) is gone with it: the code that stood here is spent,
  // which is D5's «saknas», said as what happened — never «another account's», which it is not.
  if (gameDeleted) return <StatusNotice notice={{ ...noticeFor('missing', 'table', t), heading: t('status.deleted.table.heading'), text: t('status.deleted.table.text') }} surface="page" links={links} />
  if (refused) return <StatusNotice notice={tableShut(account, t)} surface="page" links={links} onSwitch={switchAccount} />
  // Nothing behind worth protecting: the message is the whole screen, in the room's own words.
  if (!view) return <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />

  // A proposed rewind (C): the screen shows the table as it was at the target and who is waited
  // on. It has no buttons — the phones decide, and an ended table has nobody left to decide.
  const proposal = standingRewind(view)
  // The table screen plays as the table itself (seat null): whoever stands at it acts for the group.
  const onAct = client ? (intents: Intent[]) => void client.send(...intents) : undefined
  const rendered = (
    <TableRenderer
      view={previewOf(view)}
      mode={mode}
      faces={url.replace(/^ws/, 'http')}
      onAct={proposal || view.ended ? undefined : onAct}
      keyboard={felt.keyboard}
      peers={Object.values(presence.peers)}
      pulses={presence.pulses}
      recent={recent}
      shuffles={shuffles}
      onPresence={client ? (p) => client.sendPresence(p) : undefined}
      camera={mode === 'tv' ? 'follow' : undefined}
      forTheRoom={mode === 'tv'}
      {...(sessionId ? { remember: `table:${sessionId}` } : {})}
      onInspect={mode === 'tv' ? setInspecting : undefined}
      onShow={mode === 'tv' ? shown.show : undefined}
    />
  )
  const version = view.version
  const flags = activity.filter((l) => l.intent.v === 'flag').length
  const players = view.seats.filter((s) => s.name !== null).length
  const ended = view.ended && (
    <div className="byd-ended" data-ended>
      <div>
        <h1>{t('ended.title')}</h1>
        <p>{t('ended.locked', { version })}</p>
        <div className="byd-ended-summary">
          <Count n={view.seq} one="ended.rows.one" other="ended.rows.other" />
          <Count n={flags} one="ended.flags.one" other="ended.flags.other" />
          <Count n={players} one="ended.players.one" other="ended.players.other" />
        </div>
      </div>
    </div>
  )
  // The rules this table plays by (B7), one press away on either screen; where the press lives is
  // the screen's business.
  // The living number in the book (#226) reads this screen's own view of the table, so the badge
  // beside a tagged zone can say only what this screen was already told — and says it again on
  // every patch, without the drawer fetching anything a second time.
  const rules = (placement: 'table' | 'tv') => (sessionId ? <RuleDrawer http={url.replace(/^ws/, 'http')} sessionId={sessionId} placement={placement} live={view} /> : null)
  const table = (
    <RewindFrame view={view} activity={activity}>
      {rendered}
    </RewindFrame>
  )
  return (
    <>
      <div
        data-page="table"
        data-status={status}
        // The table screen is a room of the button language (L13, #67): the sheet that keeps a
        // counter's value stands in it, and its two ways out are the room's first and second action.
        className={`byd-fit byd-table${live.stale ? ' byd-status-stale' : ''}`}
        {...(live.stale ? { inert: true } : {})}
      >
      {mode === 'table' && (
        // The felt is the whole screen (B); a quiet line along its top says which game this is.
        <h1 className="byd-table-plate">{[record?.name ?? t('play.table'), version, roomCode].filter(Boolean).join(' · ')}</h1>
      )}
      {mode === 'tv' ? (
        // On a TV the rulebook goes into the header, where the way in already is: the two wanted
        // the same corner, and only the header can lay both out (#30).
        <TvChrome view={previewOf(view)} activity={activity} roomCode={roomCode} joinUrl={joinUrl} title={record?.name} version={version} inspecting={inspecting} faces={url.replace(/^ws/, 'http')} showing={showing} onDismiss={dismiss} observers={observers} rules={rules('tv')} room>
          {table}
        </TvChrome>
      ) : (
        // The felt is the page's main content (#560 P-20); the TV's chrome marks its own.
        <main className="byd-table-main">{table}</main>
      )}
        {/* The felt's own screen has no header, so the drawer stands over the felt as it did. */}
        {mode !== 'tv' && rules('table')}
        {felt.panel}
        {ended}
      </div>
      <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />
    </>
  )
}

// A number and the word for what it counts: the number is the big one on the ended screen, so
// the two stay separate elements rather than one sentence.
function Count({ n, one, other }: { n: number; one: Key; other: Key }) {
  const t = useT()
  return (
    <span>
      <b>{n}</b> {t(n === 1 ? one : other, { n })}
    </span>
  )
}
