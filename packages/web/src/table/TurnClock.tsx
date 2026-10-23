import { useEffect, useState } from 'react'

// How long the turn has stood (K30), from the time of the line that gave it, so that every screen
// says the same and a reload does not start it over. A clock a little ahead of the server's reads
// as nought rather than as a turn from the future.
export function TurnClock({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000))
  return (
    <small className="byd-turn-clock">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </small>
  )
}
