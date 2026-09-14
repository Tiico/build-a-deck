// PROTOTYPE — throwaway (#90). The floating bar: which position, which surface, how many seats,
// and which of the two scenes is on screen. Visibly not part of the design being judged, and
// hidden in a production build so a stray merge cannot ship it.
import { useEffect } from 'react'

export type Variant = { key: string; name: string }
export type Mode = 'bord' | 'tv'
export type Scene = 'filt' | 'ark'

const MODES: { key: Mode; name: string }[] = [
  { key: 'bord', name: 'Bordsläge' },
  { key: 'tv', name: 'TV-läge' },
]

const SCENES: { key: Scene; name: string }[] = [
  { key: 'filt', name: 'Ringarna' },
  { key: 'ark', name: 'Arket' },
]

export function Switcher({
  variants,
  current,
  onVariant,
  mode,
  onMode,
  scene,
  onScene,
  seats,
  onSeats,
  maxSeats,
  note,
}: {
  variants: readonly Variant[]
  current: string
  onVariant(key: string): void
  mode: Mode
  onMode(m: Mode): void
  scene: Scene
  onScene(s: Scene): void
  seats: number
  onSeats(n: number): void
  maxSeats: number
  note: string
}) {
  const i = Math.max(0, variants.findIndex((v) => v.key === current))
  const step = (d: number) => onVariant((variants[(i + d + variants.length) % variants.length] as Variant).key)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (import.meta.env.PROD) return null
  return (
    <div className="byd-proto-bar">
      <button type="button" onClick={() => step(-1)} aria-label="Föregående variant">
        ←
      </button>
      <strong>
        {current} — {variants[i]?.name}
      </strong>
      <button type="button" onClick={() => step(1)} aria-label="Nästa variant">
        →
      </button>
      <span className="byd-proto-sep" />
      {MODES.map((m) => (
        <button key={m.key} type="button" aria-pressed={mode === m.key} onClick={() => onMode(m.key)}>
          {m.name}
        </button>
      ))}
      <span className="byd-proto-sep" />
      {SCENES.map((s) => (
        <button key={s.key} type="button" aria-pressed={scene === s.key} onClick={() => onScene(s.key)}>
          {s.name}
        </button>
      ))}
      <span className="byd-proto-sep" />
      <span>Platser</span>
      {Array.from({ length: maxSeats - 1 }, (_, k) => k + 2).map((n) => (
        <button key={n} type="button" aria-pressed={seats === n} onClick={() => onSeats(n)}>
          {n}
        </button>
      ))}
      <span className="byd-proto-sep" />
      <em>{note}</em>
    </div>
  )
}
