import { useEffect, useMemo, useState } from 'react'
import type { Intent, VisibleComponentState } from '@byd/protocol'
import './table.css'
import { TableRenderer, type TableMode } from './TableRenderer.js'
import { TvChrome } from './TvChrome.js'
import { useTableClient } from './useTableClient.js'
import { previewOf, standingRewind, whereTo, whoDecides } from './rewind.js'
import { usePresence, useRecent } from './usePresence.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { useFeltKeyboard } from './useFeltKeyboard.js'
import { useActivityLive } from './useActivityLive.js'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks } from '../status/links.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useT, type Key } from '../i18n/index.js'

type SessionRecord = { name?: string; version?: string }

// /table?session=…&host=…&mode=table|tv&server=ws://…
// The `table` role: no seat, sees only what is public, acts for the group (K14). It is the
// host's screen (DRIFT §9): the host key opens it, and it is told the room code to show.
export type TablePageProps = { timing?: StatusTiming }

export function TablePage({ timing = DEFAULT_TIMING }: TablePageProps = {}) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const mode: TableMode = params.get('mode') === 'tv' ? 'tv' : 'table'
  const host = params.get('host') ?? undefined
  const owner = params.get('owner') === '1'
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const conn = useTableClient(sessionId ? { url, sessionId, seat: null, ...(host ? { host } : {}), ...(owner ? { owner: true } : {}), connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { client, view, status, activity, observers, room, refused } = conn
  const roomCode = room?.code ?? params.get('code') ?? ''
  // The room reads its own state across a room, so a message that lands on top of the felt is a
  // card in the middle of it (#12, #7, variant C).
  const live = useLiveStatus(conn, 'table', timing)
  const links = statusLinks({ server: params.get('server'), code: roomCode })
  usePageTitle({ state: sessionId ? (refused ? 'forbidden' : live.state) : 'missing', room: roomCode || sessionId })
  // The session record: which game this table runs and which version of it (L5, C9). The name
  // titles the screen; the version is also what the log is locked on when the session ends.
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

  // What the screen is pointed at (C): only the TV has a panel to show it in.
  const [inspecting, setInspecting] = useState<VisibleComponentState | null>(null)
  const presence = usePresence(client, view)
  const recent = useRecent(activity)
  // The felt as controls (#2): the table screen plays as the table itself, so what it can reach
  // is what a table may see.
  const playable = view !== null && !view.rewind && !view.ended && client !== null
  const felt = useFeltKeyboard(view, playable, { act: (intents) => (client ? client.send(...intents) : Promise.resolve({ ok: false, reason: 'not connected' })) })
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
  if (!sessionId) return <StatusNotice notice={noticeFor('missing', 'table', t)} surface="page" links={links} />
  // The host key is what opens this screen (DRIFT §9); without it the door is shut, not broken.
  if (refused) return <StatusNotice notice={{ ...noticeFor('forbidden', 'table', t), text: t('play.refused.host') }} surface="page" links={links} />
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
      onPresence={client ? (p) => client.sendPresence(p) : undefined}
      camera={mode === 'tv'}
      onInspect={mode === 'tv' ? setInspecting : undefined}
    />
  )
  const flags = activity.filter((l) => l.intent.v === 'flag').length
  const players = view.seats.filter((s) => s.name !== null).length
  const ended = view.ended && (
    <div className="byd-ended" data-ended>
      <div>
        <h1>{t('ended.title')}</h1>
        <p>{t('ended.locked', { version: record === null ? '…' : (record.version ?? '?') })}</p>
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
  const rules = (placement: 'table' | 'tv') => (sessionId ? <RuleDrawer http={url.replace(/^ws/, 'http')} sessionId={sessionId} placement={placement} /> : null)
  const table = proposal?.preview ? (
    <div className="byd-rewind-preview" data-rewind-preview={proposal.id}>
      {rendered}
      <div className="byd-rewind-label">
        <span>{t('rewind.proposal')}</span>
        <span>{t('rewind.looked', { where: whereTo(view, proposal, activity, t) })}</span>
        <span>{t('rewind.waiting', { who: whoDecides(view, proposal, t) })}</span>
      </div>
    </div>
  ) : (
    rendered
  )
  return (
    <>
      <div
        data-page="table"
        data-status={status}
        className={`byd-fit${live.stale ? ' byd-status-stale' : ''}`}
        {...(live.stale ? { inert: true } : {})}
      >
      {mode === 'table' && (
        // The felt is the whole screen (B); a quiet line along its top says which game this is.
        <h1 className="byd-table-plate">{[record?.name ?? t('play.table'), record?.version, roomCode].filter(Boolean).join(' · ')}</h1>
      )}
      {mode === 'tv' ? (
        // On a TV the rulebook goes into the header, where the way in already is: the two wanted
        // the same corner, and only the header can lay both out (#30).
        <TvChrome view={previewOf(view)} activity={activity} roomCode={roomCode} joinUrl={joinUrl} title={record?.name} version={record?.version} inspecting={inspecting} faces={url.replace(/^ws/, 'http')} observers={observers} rules={rules('tv')}>
          {table}
        </TvChrome>
      ) : (
        table
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
