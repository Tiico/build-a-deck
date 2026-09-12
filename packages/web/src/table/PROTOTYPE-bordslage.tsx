// PROTOTYPE — throwaway. Delete when the question is answered.
//
// Frågan: hur möter filten bordsskärmen (#64), och vad greppar man en hel hög i (#63)?
// Tre varianter på den riktiga rutten `/table?mode=table&variant=A|B|C`, med riktigt bord,
// riktiga kort och riktig täthet. Ingenting här ska folkas in som det står: vinnaren skrivs om
// mot beslutet i DESIGN-BESLUT och byggs med test först.
//
// Kör: pnpm dev:server och pnpm dev:web, seeda ett bord, lägg till &variant=A på bordslänken.
import { useEffect, useState } from 'react'
import { projectTilted, setPrototypeTilt } from './geometry.js'
import { LEAST_AIR_PX } from './fit.js'
import './PROTOTYPE-bordslage.css'

export type ProtoKey = 'A' | 'B' | 'C'
export const PROTO_VARIANTS: { key: ProtoKey; name: string; tilt: number }[] = [
  { key: 'A', name: 'Som i dag — två femtedelar av ytan, 24° lutning, pillret 22 px', tilt: 24 },
  { key: 'B', name: 'Bordet passas in mot den form det ritas i — 24° lutning, pillret 46 px', tilt: 24 },
  { key: 'C', name: 'Samma inpassning med flackare bord — 13° lutning, pillret 46 px', tilt: 13 },
]

// Prototypen är av bara när adressen ber om den, så den riktiga rutten är orörd utan `?variant=`.
export function protoVariant(): ProtoKey | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('variant')
  return v === 'A' || v === 'B' || v === 'C' ? v : null
}

// Lutningen sätts vid import, innan något projiceras, så stilmallen och matten säger samma sak.
const chosen = PROTO_VARIANTS.find((v) => v.key === protoVariant())
if (chosen) setPrototypeTilt(chosen.tilt)

type Size = { w: number; h: number }

// Variant B och C: filten passas in mot den form den faktiskt *ritas* i. Dagens regel mäter den
// oluttade rutan och låter sedan `rotateX` krympa den, vilket är hela poängen i #64. Här
// projiceras hörnen genom samma lutning renderaren använder, och skalan söks fram.
export function protoFeltScale(drawn: Size, frame: Size): number | null {
  const v = protoVariant()
  if (v !== 'B' && v !== 'C') return null
  const RIM = 30
  const fits = (scale: number): boolean => {
    const w = drawn.w * scale
    const h = drawn.h * scale
    const wood = { left: (frame.w - (w + 2 * RIM)) / 2, top: (frame.h - (h + 2 * RIM)) / 2, w: w + 2 * RIM, h: h + 2 * RIM }
    const layout = { frame, wood }
    const corners = [
      { x: -wood.w / 2, y: -wood.h / 2 },
      { x: wood.w / 2, y: -wood.h / 2 },
      { x: -wood.w / 2, y: wood.h / 2 },
      { x: wood.w / 2, y: wood.h / 2 },
    ].map((p) => projectTilted(layout, p))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return (
      Math.min(...xs) >= LEAST_AIR_PX &&
      Math.max(...xs) <= frame.w - LEAST_AIR_PX &&
      Math.min(...ys) >= LEAST_AIR_PX &&
      Math.max(...ys) <= frame.h - LEAST_AIR_PX
    )
  }
  let lo = 0.02
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

// Den flytande listen. Pilar och piltangenter byter variant; adressen bär valet så en omladdning
// och en länk visar samma sak.
export function PrototypeSwitcher() {
  const [key, setKey] = useState<ProtoKey | null>(protoVariant())
  useEffect(() => {
    if (key === null) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      go(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (key === null) return null
  const at = PROTO_VARIANTS.findIndex((v) => v.key === key)
  function go(step: number) {
    const next = PROTO_VARIANTS[(at + step + PROTO_VARIANTS.length) % PROTO_VARIANTS.length]
    if (!next) return
    const q = new URLSearchParams(location.search)
    q.set('variant', next.key)
    history.replaceState(null, '', `${location.pathname}?${q.toString()}`)
    setKey(next.key)
    // Skalan och handtagen läses vid ritning, så vyn ritas om av en omladdning. Prototyp.
    location.reload()
  }
  return (
    <div className="byd-proto-bar" data-proto-bar>
      <button type="button" onClick={() => go(-1)} aria-label="Föregående variant">
        ←
      </button>
      <span>
        <b>{key}</b> — {PROTO_VARIANTS[at]?.name}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Nästa variant">
        →
      </button>
    </div>
  )
}
