import { useEffect, useRef, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'

// A texture that may not exist yet: the server answers 202 while the render job is queued, the
// browser reports that as an error, and this tries again with growing pauses, a bounded number
// of times. The query only busts the cache; the hash is the identity.
const RETRY_MS = 1500
const RETRY_MAX = 8
export function Texture({ src }: { src: string }) {
  const [attempt, setAttempt] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const onError = () => {
    if (attempt >= RETRY_MAX || timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      setAttempt((a) => a + 1)
    }, RETRY_MS * (attempt + 1))
  }
  return <img src={attempt === 0 ? src : `${src}?retry=${attempt}`} alt="" draggable={false} onError={onError} />
}

// The texture to show: the front when its hash is known (the seat may see it), else the back.
// `faces` is the HTTP origin that serves /faces/:hash; without it there is no texture.
export function textureUrl(faces: string | undefined, c: VisibleComponentState): string | undefined {
  if (!faces || !c.faces) return undefined
  const hash = c.cardRef !== null ? c.faces['front'] : c.faces['back']
  return hash ? `${faces}/faces/${hash}` : undefined
}
