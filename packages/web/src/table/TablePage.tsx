import { useMemo } from 'react'
import type { Intent } from '@byd/protocol'
import './table.css'
import { TableRenderer, type TableMode } from './TableRenderer.js'
import { TvChrome } from './TvChrome.js'
import { useTableClient } from './useTableClient.js'
import { previewOf, whereTo, whoDecides } from './rewind.js'

// /table?session=…&mode=table|tv&code=…&server=ws://…
// The `table` role: no seat, sees only what is public. `server` defaults to this origin.
export function TablePage() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const mode: TableMode = params.get('mode') === 'tv' ? 'tv' : 'table'
  const roomCode = params.get('code') ?? sessionId ?? ''
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { client, view, status, activity } = useTableClient(sessionId ? { url, sessionId, seat: null } : null)

  const joinUrl = useMemo(() => {
    if (!sessionId) return undefined
    const q = new URLSearchParams({ session: sessionId })
    const server = params.get('server')
    if (server) q.set('server', server)
    return `${location.origin}/join?${q.toString()}`
  }, [params, sessionId])

  if (!sessionId) return <p>Ingen session angiven.</p>
  if (!view) return <p data-status={status}>{status === 'connecting' ? 'Ansluter…' : status}</p>

  // A proposed rewind (C): the screen shows the table as it was at the target and who is waited
  // on. It has no buttons — the phones decide.
  const proposal = view.rewind
  // The table screen plays as the table itself (seat null): whoever stands at it acts for the group.
  const onAct = client ? (intents: Intent[]) => void client.send(...intents) : undefined
  const rendered = <TableRenderer view={previewOf(view)} mode={mode} faces={url.replace(/^ws/, 'http')} onAct={proposal ? undefined : onAct} />
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
      {mode === 'tv' ? (
        <TvChrome view={previewOf(view)} activity={activity} roomCode={roomCode} joinUrl={joinUrl}>
          {table}
        </TvChrome>
      ) : (
        table
      )}
    </div>
  )
}
