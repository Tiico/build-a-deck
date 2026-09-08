import { useEffect, useMemo, useState } from 'react'
import type { Intent, VisibleComponentState } from '@byd/protocol'
import './table.css'
import { TableRenderer, type TableMode } from './TableRenderer.js'
import { TvChrome } from './TvChrome.js'
import { useTableClient } from './useTableClient.js'
import { previewOf, whereTo, whoDecides } from './rewind.js'
import { usePresence, useRecent } from './usePresence.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'

type SessionRecord = { name?: string; version?: string }

// /table?session=…&host=…&mode=table|tv&server=ws://…
// The `table` role: no seat, sees only what is public, acts for the group (K14). It is the
// host's screen (DRIFT §9): the host key opens it, and it is told the room code to show.
export function TablePage() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const mode: TableMode = params.get('mode') === 'tv' ? 'tv' : 'table'
  const host = params.get('host') ?? undefined
  const owner = params.get('owner') === '1'
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { client, view, status, activity, observers, room, refused } = useTableClient(sessionId ? { url, sessionId, seat: null, ...(host ? { host } : {}), ...(owner ? { owner: true } : {}) } : null)
  const roomCode = room?.code ?? params.get('code') ?? ''
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

  const joinUrl = useMemo(() => {
    if (!roomCode) return undefined
    const q = new URLSearchParams({ code: roomCode })
    const server = params.get('server')
    if (server) q.set('server', server)
    return `${location.origin}/join?${q.toString()}`
  }, [params, roomCode])

  if (!sessionId) return <p>Ingen session angiven.</p>
  if (refused) return <p role="alert" data-refused={refused}>Bordsvyn öppnas med värdens länk från editorn.</p>
  if (!view) return <p data-status={status}>{status === 'connecting' ? 'Ansluter…' : status}</p>

  // A proposed rewind (C): the screen shows the table as it was at the target and who is waited
  // on. It has no buttons — the phones decide.
  const proposal = view.rewind
  // The table screen plays as the table itself (seat null): whoever stands at it acts for the group.
  const onAct = client ? (intents: Intent[]) => void client.send(...intents) : undefined
  const rendered = (
    <TableRenderer
      view={previewOf(view)}
      mode={mode}
      faces={url.replace(/^ws/, 'http')}
      onAct={proposal || view.ended ? undefined : onAct}
      peers={Object.values(presence.peers)}
      pulses={presence.pulses}
      recent={recent}
      onPresence={client ? (p) => client.sendPresence(p) : undefined}
      camera={mode === 'tv'}
      onInspect={mode === 'tv' ? setInspecting : undefined}
    />
  )
  const ended = view.ended && (
    <div className="byd-ended" data-ended>
      <div>
        <h1>Sessionen är avslutad</h1>
        <p>Loggen är låst på {record === null ? '…' : (record.version ?? '?')}. Enkäten finns på telefonerna.</p>
        <div className="byd-ended-summary">
          <span>
            <b>{view.seq}</b> rader
          </span>
          <span>
            <b>{activity.filter((l) => l.intent.v === 'flag').length}</b> flaggade ögonblick
          </span>
          <span>
            <b>{view.seats.filter((s) => s.name !== null).length}</b> spelare
          </span>
        </div>
      </div>
    </div>
  )
  const table = proposal?.preview ? (
    <div className="byd-rewind-preview" data-rewind-preview={proposal.id}>
      {rendered}
      <div className="byd-rewind-label">
        <span>Förslag</span>
        <span>så här såg bordet ut {whereTo(view, proposal, activity)}</span>
        <span>· väntar på {whoDecides(view, proposal)}</span>
      </div>
    </div>
  ) : (
    rendered
  )
  return (
    <div data-page="table" data-status={status} className="byd-fit">
      {mode === 'table' && (
        // The felt is the whole screen (B); a quiet line along its top says which game this is.
        <h1 className="byd-table-plate">{[record?.name ?? 'Bordet', record?.version, roomCode].filter(Boolean).join(' · ')}</h1>
      )}
      {mode === 'tv' ? (
        <TvChrome view={previewOf(view)} activity={activity} roomCode={roomCode} joinUrl={joinUrl} title={record?.name} version={record?.version} inspecting={inspecting} faces={url.replace(/^ws/, 'http')} observers={observers}>
          {table}
        </TvChrome>
      ) : (
        table
      )}
      {/* The rules this table plays by (B7), one press away on either screen. */}
      {sessionId && <RuleDrawer http={url.replace(/^ws/, 'http')} sessionId={sessionId} placement="table" />}
      {ended}
    </div>
  )
}
