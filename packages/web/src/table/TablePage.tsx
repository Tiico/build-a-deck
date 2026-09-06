import { useMemo } from 'react'
import './table.css'
import { TableRenderer, type TableMode } from './TableRenderer.js'
import { TvChrome } from './TvChrome.js'
import { useTableClient } from './useTableClient.js'

// /table?session=…&mode=table|tv&code=…&server=ws://…
// The `table` role: no seat, sees only what is public. `server` defaults to this origin.
export function TablePage() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const mode: TableMode = params.get('mode') === 'tv' ? 'tv' : 'table'
  const roomCode = params.get('code') ?? sessionId ?? ''
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { view, status, activity } = useTableClient(sessionId ? { url, sessionId, seat: null } : null)

  const joinUrl = useMemo(() => {
    if (!sessionId) return undefined
    const q = new URLSearchParams({ session: sessionId })
    const server = params.get('server')
    if (server) q.set('server', server)
    return `${location.origin}/join?${q.toString()}`
  }, [params, sessionId])

  if (!sessionId) return <p>Ingen session angiven.</p>
  if (!view) return <p data-status={status}>{status === 'connecting' ? 'Ansluter…' : status}</p>

  const table = <TableRenderer view={view} mode={mode} faces={url.replace(/^ws/, 'http')} />
  return (
    <div data-page="table" data-status={status} className="byd-fit">
      {mode === 'tv' ? (
        <TvChrome view={view} activity={activity} roomCode={roomCode} joinUrl={joinUrl}>
          {table}
        </TvChrome>
      ) : (
        table
      )}
    </div>
  )
}
