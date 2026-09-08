// PROTOTYPE — the floating variant switcher. Hidden in production builds.
import { useEffect } from 'react'

export type Variant = { key: string; name: string }

export function Switcher({ variants, current, onChange }: { variants: Variant[]; current: string; onChange(key: string): void }) {
  const idx = Math.max(0, variants.findIndex((v) => v.key === current))
  const go = (d: number) => onChange(variants[(idx + d + variants.length) % variants.length]!.key)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // The scene owns its own arrows: every variant's hand is a roving list, and a left arrow
      // inside it means the card beside this one, never the next variant.
      if (t && t.closest('.byd-bp-stage')) return
      if (new URLSearchParams(location.search).has('bare')) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (new URLSearchParams(location.search).has('bare')) return null
  if (import.meta.env.PROD) return null
  const v = variants[idx]!
  return (
    <div
      style={{
        // Top right, never over the bottom of the screen: the bottom band is the whole subject
        // here, and a pill there would cover exactly what is being judged.
        position: 'fixed', top: 5, right: 10, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999,
        background: '#111', color: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,.4)', fontSize: 12,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <button onClick={() => go(-1)} style={btn}>←</button>
      <span>PROTOTYP · {v.key} — {v.name}</span>
      <button onClick={() => go(1)} style={btn}>→</button>
    </div>
  )
}
const btn: React.CSSProperties = { background: '#333', color: '#fff', border: 0, borderRadius: 999, width: 28, height: 28, cursor: 'pointer' }
