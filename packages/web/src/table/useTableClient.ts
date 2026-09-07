import { useEffect, useRef, useState } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { TableClient, type ClientStatus, type ConnectOptions } from '../client.js'

export type TableConnection = { client: TableClient | null; view: Snapshot | null; status: ClientStatus; activity: readonly Activity[]; observers: readonly { id: string; name: string }[]; room: { code: string; expiresAt: string } | null; refused: string | null }

// One client per mounted page; React only sees what the client publishes.
export function useTableClient(opts: ConnectOptions | null): TableConnection {
  const [client, setClient] = useState<TableClient | null>(null)
  const [view, setView] = useState<Snapshot | null>(null)
  const [status, setStatus] = useState<ClientStatus>('connecting')
  const [activity, setActivity] = useState<readonly Activity[]>([])
  const [observers, setObservers] = useState<readonly { id: string; name: string }[]>([])
  const [room, setRoom] = useState<{ code: string; expiresAt: string } | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  // Reconnect only when the address changes, not when the caller re-creates an equal options object.
  const key = opts ? `${opts.url}|${opts.sessionId}|${opts.seat ?? ''}|${opts.observer ?? ''}|${opts.token ?? ''}|${opts.host ?? ''}|${opts.lobby ? 'lobby' : ''}` : ''
  const latest = useRef(opts)
  latest.current = opts

  useEffect(() => {
    const current = latest.current
    if (!current) return
    const c = TableClient.connect(current)
    setClient(c)
    const unsubscribe = c.subscribe((v, s) => {
      setView(v)
      setStatus(s)
      setActivity(c.activity)
      setObservers(c.observers)
      setRoom(c.room)
      setRefused(c.refused)
    })
    void c.ready().then(() => {
      setView(c.view)
      setStatus(c.status)
    })
    return () => {
      unsubscribe()
      c.close()
      setClient(null)
    }
  }, [key])

  return { client, view, status, activity, observers, room, refused }
}
