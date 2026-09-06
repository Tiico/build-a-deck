import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// A QR code as an inline SVG data URL — no canvas, so it renders anywhere, jsdom included.
// The alt text is the URL itself, so a screen reader (or a person without a camera) can type it.
export function QrCode({ text, size = 120 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
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
  return <img className="byd-qr" src={src} alt={text} width={size} height={size} />
}
