import { useEffect, useRef, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import './texture.css'

// A texture that may not exist yet: the server answers 202 while the render job is queued, the
// browser reports that as an error, and this tries again with growing pauses, a bounded number
// of times. The query only busts the cache; the hash is the identity.
const RETRY_MS = 1500
const RETRY_MAX = 8
export function Texture({ src, label }: { src: string; label?: string | undefined }) {
  return <TextureRequest key={src} src={src} label={label} />
}

function TextureRequest({ src, label }: { src: string; label?: string | undefined }) {
  const [attempt, setAttempt] = useState(0)
  const [retries, setRetries] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const onError = () => {
    if (retries >= RETRY_MAX) {
      setFailed(true)
      return
    }
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      setAttempt((a) => a + 1)
      setRetries((n) => n + 1)
    }, RETRY_MS * (retries + 1))
  }
  const retry = () => {
    setFailed(false)
    setRetries(0)
    setAttempt((a) => a + 1)
  }
  const url = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`
  return (
    <span className="byd-texture" data-texture-state={loaded ? 'ready' : failed ? 'error' : 'pending'}>
      {!loaded && (
        <span className="byd-texture-fallback">
          {label && <strong aria-hidden="true">{label}</strong>}
          {failed ? (
            <>
              <small role="alert">Texturen kunde inte visas.</small>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  retry()
                }}
              >
                Försök igen
              </button>
            </>
          ) : (
            <small role="status">Kortet renderas…</small>
          )}
        </span>
      )}
      <img src={url} alt="" draggable={false} hidden={!loaded} onLoad={() => setLoaded(true)} onError={onError} />
    </span>
  )
}

// The texture to show: the front when its hash is known (the seat may see it), else the back.
// `faces` is the HTTP origin that serves /faces/:hash; without it there is no texture.
export function textureUrl(faces: string | undefined, c: VisibleComponentState): string | undefined {
  if (!faces || !c.faces) return undefined
  const hash = c.cardRef !== null ? c.faces['front'] : c.faces['back']
  return hash ? `${faces}/faces/${hash}` : undefined
}
