import { useEffect, useState } from 'react'

// Whether a room code still opens its room (#679): a seat that was kicked is offered to sit down
// again only while it does, since a host who changed the code in the same breath as the kick has
// closed that door on purpose. Null until it is known, and then the way back is not offered.
export function useRoomOpen(http: string, code: string | null, when: boolean): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => {
    if (!when || !code) return
    let live = true
    void fetch(`${http}/rooms/${encodeURIComponent(code)}`)
      .then((res) => live && setOpen(res.ok))
      .catch(() => live && setOpen(false))
    return () => {
      live = false
    }
  }, [http, code, when])
  return open
}
