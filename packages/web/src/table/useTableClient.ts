import { useCallback, useEffect, useRef, useState } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { TableClient, type ClientStatus, type ClientTrouble, type ConnectOptions } from '../client.js'
import type { RetrySchedule } from '../status/connection.js'

export type TableConnection = {
  client: TableClient | null
  view: Snapshot | null
  status: ClientStatus
  activity: readonly Activity[]
  observers: readonly { id: string; name: string }[]
  // The room code (DRIFT §9), told to the host's screens only.
  room: { code: string; expiresAt: string } | null
  // Why the server would not have this connection (DRIFT §9): not admitted, or kicked.
  refused: string | null
  // Why the client has stopped trying, and when it will try next (#7). A status alone cannot
  // tell a view whether anything is still going to happen.
  trouble: ClientTrouble | null
  schedule: RetrySchedule
  retry(): void
}

const NO_RETRY: RetrySchedule = { nextRetryAt: null, made: 0, of: 0 }

// One client per mounted page; React only sees what the client publishes.
export function useTableClient(opts: ConnectOptions | null): TableConnection {
  const [client, setClient] = useState<TableClient | null>(null)
  const [view, setView] = useState<Snapshot | null>(null)
  const [status, setStatus] = useState<ClientStatus>('connecting')
  const [activity, setActivity] = useState<readonly Activity[]>([])
  const [observers, setObservers] = useState<readonly { id: string; name: string }[]>([])
  const [room, setRoom] = useState<{ code: string; expiresAt: string } | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [trouble, setTrouble] = useState<ClientTrouble | null>(null)
  const [schedule, setSchedule] = useState<RetrySchedule>(NO_RETRY)
  // Reconnect only when the address changes, not when the caller re-creates an equal options object.
  const key = opts ? `${opts.url}|${opts.sessionId}|${opts.seat ?? ''}|${opts.observer ?? ''}|${opts.token ?? ''}|${opts.host ?? ''}|${opts.lobby ? 'lobby' : ''}|${opts.owner ? 'owner' : ''}` : ''
  const latest = useRef(opts)
  latest.current = opts

  useEffect(() => {
    const current = latest.current
    if (!current) return
    const c = TableClient.connect(current)
    setClient(c)
    const publish = () => {
      setActivity(c.activity)
      setObservers(c.observers)
      setRoom(c.room)
      setRefused(c.refused)
      setTrouble(c.trouble)
      // A fresh object each time on purpose: the schedule changes without the status changing,
      // and a view that shows a countdown has to hear about it.
      setSchedule({ nextRetryAt: c.nextRetryAt, made: c.attempts.made, of: c.attempts.of })
    }
    const unsubscribe = c.subscribe((v, s) => {
      setView(v)
      setStatus(s)
      publish()
    })
    void c.ready().then(() => {
      setView(c.view)
      setStatus(c.status)
      publish()
    })
    return () => {
      unsubscribe()
      c.close()
      setClient(null)
    }
  }, [key])

  const retry = useCallback(() => client?.retry(), [client])
  return { client, view, status, activity, observers, room, refused, trouble, schedule, retry }
}
