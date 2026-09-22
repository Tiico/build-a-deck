import { useEffect, useRef, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { useTextureFailure } from './TextureFailures.js'
import { useT } from '../i18n/index.js'
import { cardWord } from './keyboard.js'
import './texture.css'

// A texture may not exist yet: the server answers 202 while the render job is queued, the browser
// reports that as an error, and this tries again with growing pauses, a bounded number of times.
// `t` only busts the cache; the hash is the identity. `retry=1` is different in kind — it is the
// player asking, and it puts a render the container gave up on back in the queue (#10).
const RETRY_MS = 1500
const RETRY_MAX = 8

type Phase = 'pending' | 'ready' | 'failed'

// One card's face, in whichever state it is in: waiting for the render farm, rendered, or finally
// lost. Every view of a card goes through here, so the three states look the same everywhere and
// there is one place to change them.
//
// The whole component state is the input rather than a URL, and that is the point: what the
// waiting card may say about itself is decided by the projection's own word for it — the row's
// title, or its id behind it (#412) — which is the same filter that decides which face is fetched
// at all. There is no word exactly when this seat may not know the card's identity, so a fallback
// cannot name a card the wire did not name (B6, TUNN-SKIVA §5).
//
// A lost face offers a way back only where `retry` says so: a view that holds the card up large.
// The face is quiet everywhere else, because most cards are controls — the hand card, a felt card
// the keyboard names — and a control cannot hold another (UX-37, #82); a thumbnail could not
// press one either. A small lost card is read by holding it up, and the held-up card retries.
export type TextureProps = { faces: string | undefined; c: VisibleComponentState | undefined; retry?: boolean | undefined }

export function Texture({ faces, c, retry = false }: TextureProps) {
  const src = c && textureUrl(faces, c)
  if (!src || !c) return null
  // Keyed on the face: a card whose texture changes gets a fresh <img> rather than a new `src`
  // on the old one, so the browser has no decoded bitmap left to show for a frame.
  return <TextureFace key={src} src={src} name={cardWord(c)} retry={retry} />
}

// The back a face-down pile wears (#313). It has no component to be read off — a hidden pile hands
// out no id (K15) — so it is drawn from the hash the zone carries, through the same face as every
// other texture: the same waiting, the same ladder of retries, the same one announcement for the
// whole screen. A second <img> written beside this one would be a second answer to «what does a
// texture do while it is not there yet», and there is only ever one.
export function BackTexture({ faces, hash }: { faces: string | undefined; hash: string | undefined }) {
  if (!faces || !hash) return null
  const src = `${faces}/faces/${hash}`
  // Nameless on purpose: what the pile wears says nothing about which card is under it.
  return <TextureFace key={src} src={src} name={null} retry={false} />
}

function TextureFace({ src, name: named, retry }: { src: string; name: string | null; retry: boolean }) {
  const t = useT()
  // `attempt` only busts the cache and never goes backwards; `rung` is where on the ladder of
  // growing pauses we are, and a player asking again starts it over.
  const [attempt, setAttempt] = useState(0)
  // True only for the one request the player asked for, so waiting never queues work.
  const [asked, setAsked] = useState(false)
  const [phase, setPhase] = useState<Phase>('pending')
  const rung = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The failure is announced once for the whole screen, not once per card.
  useTextureFailure(phase === 'failed')
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const onError = () => {
    if (rung.current >= RETRY_MAX) return setPhase('failed')
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      rung.current += 1
      setAsked(false)
      setAttempt((a) => a + 1)
    }, RETRY_MS * (rung.current + 1))
  }
  // Asking again is the only repair a player can make; it starts the ladder over on a fresh URL.
  const again = () => {
    rung.current = 0
    setPhase('pending')
    setAsked(true)
    setAttempt((a) => a + 1)
  }
  // A name only when this seat already knows it; a hidden card says nothing but that it is waiting.
  const name = named
  return (
    <>
      <img
        className="byd-texture"
        data-state={phase}
        src={attempt === 0 ? src : `${src}?${asked ? 'retry=1&' : ''}t=${attempt}`}
        alt=""
        draggable={false}
        onLoad={() => setPhase('ready')}
        onError={onError}
      />
      {phase !== 'ready' && (
        <span className="byd-texture-state" data-texture={phase}>
          {name !== null && <b>{name}</b>}
          <i>{phase === 'pending' ? t('texture.pending') : t('texture.failed')}</i>
          {phase === 'failed' && retry && (
            // The view that holds the card up puts it down on a touch or a click anywhere in
            // it; a press on the way back is neither, so the button keeps both to itself.
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                again()
              }}
            >
              {t('texture.retry')}
            </button>
          )}
        </span>
      )}
    </>
  )
}

// The texture to show: the front when its hash is known (the seat may see it), else the back.
// `faces` is the HTTP origin that serves /faces/:hash; without it there is no texture.
function textureUrl(faces: string | undefined, c: VisibleComponentState): string | undefined {
  if (!faces || !c.faces) return undefined
  const hash = c.cardRef !== null ? c.faces['front'] : c.faces['back']
  return hash ? `${faces}/faces/${hash}` : undefined
}
