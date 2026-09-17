import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'

// How large the code is drawn when it is held up to the whole table (#225).
//
// At 120 px a code is readable by the one phone pressed against the screen. At the start of a game
// there are four people round a table wanting to join at once, and the way they do that is by all
// looking at the same screen from where they happen to be sitting — which is a metre away and at an
// angle. So the code has to be able to get big, and this is how big: as much of the shorter side of
// the window as leaves room for the address under it.
//
// Said here rather than only in the stylesheet, because the size of a QR code is not decoration —
// it is whether the thing works at all from across a table — and the picture carries its own
// `width` and `height` for the same reason it always did.
const BIG_VMIN = 66
const BIG_LEAST = 240

// A QR code as an inline SVG data URL — no canvas, so it renders anywhere, jsdom included.
// The alt text is the URL itself, so a screen reader (or a person without a camera) can type it.
export function QrCode({ text, size = 120, enlarge = true }: { text: string; size?: number; enlarge?: boolean }) {
  const t = useT()
  const [src, setSrc] = useState<string | null>(null)
  const [big, setBig] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let live = true
    void QRCode.toString(text, { type: 'svg', margin: 1 }).then((svg) => {
      if (live) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    })
    return () => {
      live = false
    }
  }, [text])
  if (!src) return <div className="byd-qr" style={{ width: size, height: size }} aria-hidden="true" />
  const picture = <img className="byd-qr" src={src} alt={text} width={size} height={size} />
  // Where a press would mean nothing — the TV's own chrome, where the code is one line of a
  // heading and nobody presses a television — the code stays a picture and nothing more.
  if (!enlarge) return picture
  return (
    <>
      <button ref={opener} type="button" className="byd-qr-open" aria-label={t('qr.enlarge')} aria-expanded={big} onClick={() => setBig(true)}>
        {picture}
      </button>
      {big && (
        <Big
          text={text}
          src={src}
          t={t}
          onClose={() => {
            setBig(false)
            // Back to the code it came from, as every door in the editor hands the focus back to
            // what opened it (#133).
            opener.current?.focus()
          }}
        />
      )}
    </>
  )
}

function Big({ text, src, t, onClose }: { text: string; src: string; t: ReturnType<typeof useT>; onClose(): void }) {
  // Escape goes through the one door in the app, which knows what else is open and in what order
  // (#152). It stands over the work rather than being something the hand has hold of.
  useDoor('standing', onClose)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => panel.current?.focus(), [])
  const px = `min(${BIG_VMIN}vmin, 100%)`
  return (
    // The press that lands beside the code closes it, which is what every other overlay in the app
    // does. The code itself is not that press, so the sheet under it carries the handler and the
    // panel stops it going any further.
    <div className="byd-qr-big" onClick={onClose}>
      <div
        ref={panel}
        className="byd-qr-big-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('qr.title')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <img className="byd-qr" src={src} alt={text} width={BIG_LEAST} height={BIG_LEAST} style={{ width: px, height: px }} />
        {/* The address in words as well: not everyone round a table has a camera to hand, and the
            one who does not is the one who most needs to be able to read it out. */}
        <p className="byd-qr-address">{text}</p>
        <button type="button" onClick={onClose}>
          {t('qr.close')}
        </button>
      </div>
    </div>
  )
}
