import { useEffect, useRef } from 'react'
import type { Snapshot } from '@byd/protocol'
import type { TableClient } from '../client.js'

// Sitting down, for every screen that has a seat: the phone (C2) and distance mode alike.
//
// Once, and only once. A seat that falls empty later fell empty because somebody emptied it —
// the player's own way out, or the designer's kick — and sitting straight back down would undo
// it (#31). But "once" is once the table has said yes, not once the page has spoken: `send`
// answers a socket that is not open without throwing, and an envelope in flight when the line
// drops is failed and let go. A latch set on the attempt turns one lost frame into a phone
// standing beside a seat it never took, with its own name in the link, until somebody thinks to
// reload. So the latch is set by the answer, and an unanswered claim is asked again — on the
// next thing the table says, which after a drop is the snapshot the reconnection brings.
type Sitting = 'no' | 'asking' | 'yes'

export function useSitDown(client: TableClient | null, view: Snapshot | null, seat: string | null, name: string | null): void {
  const seatFree = view?.seats.find((s) => s.id === seat)?.name === null
  const sat = useRef<Sitting>('no')
  useEffect(() => {
    if (!client || !view || !seat || !name || !seatFree || sat.current !== 'no') return
    sat.current = 'asking'
    void client.send({ v: 'seat.claim', seat, name }).then((result) => {
      sat.current = result.ok ? 'yes' : 'no'
    })
  }, [client, view, seat, name, seatFree])
}
