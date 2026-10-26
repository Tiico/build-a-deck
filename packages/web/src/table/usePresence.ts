import { useEffect, useRef, useState } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { RECENT_MS, componentOf, emptyPresence, prunePresence, reducePresence, type PresenceState, type Recent } from './presence.js'
import { useT } from '../i18n/index.js'

// Presence (K6) for a screen that shows the table: the others' cursors and carried cards, pruned
// as they go idle; and which cards just moved, stamped when their lines arrive so no clocks have
// to agree. Shared by the table screen and the online player's screen (C2).
export function usePresence(client: TableClient | null, view: Snapshot | null): PresenceState {
  const t = useT()
  const [presence, setPresence] = useState<PresenceState>(emptyPresence)
  const nameRef = useRef<(seat: string | null) => string>(() => '')
  nameRef.current = (seat) => (seat === null ? t('play.peer.table') : view?.seats.find((s) => s.id === seat)?.name ?? seat)
  useEffect(() => {
    if (!client) return
    const off = client.onPresence((from, p) => setPresence((s) => reducePresence(s, from, p, Date.now(), nameRef.current)))
    const timer = setInterval(() => setPresence((s) => prunePresence(s, Date.now())), 250)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [client])
  // Named as the table names them now (#1390). A pointer travels apart from the table's state and
  // can arrive before the name a seat sat down with; the name it was folded in under then stood on
  // the cursor, the seat's bare letter, until the pointer happened to move again.
  const name = nameRef.current
  const peers: PresenceState['peers'] = {}
  for (const [id, peer] of Object.entries(presence.peers)) peers[id] = { ...peer, name: name(peer.seat) }
  return {
    peers,
    pulses: presence.pulses.map((p) => ({ ...p, name: name(p.seat) })),
    shown: presence.shown && { ...presence.shown, name: name(presence.shown.seat) },
  }
}

export function useRecent(activity: readonly Activity[]): Recent[] {
  const [recent, setRecent] = useState<Recent[]>([])
  const seenLines = useRef(0)
  useEffect(() => {
    const fresh = activity.slice(seenLines.current)
    seenLines.current = activity.length
    const now = Date.now()
    const moved = fresh.flatMap((l): Recent[] => {
      const component = componentOf(l)
      return component === null ? [] : [{ component, seat: l.by, at: now }]
    })
    if (moved.length === 0) return
    setRecent((r) => [...r.filter((x) => now - x.at < RECENT_MS), ...moved])
    const timer = setTimeout(() => setRecent((r) => r.filter((x) => Date.now() - x.at < RECENT_MS)), RECENT_MS + 50)
    return () => clearTimeout(timer)
  }, [activity])
  return recent
}
