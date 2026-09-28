// PROTOTYPE — throwaway (#511). Ska aldrig till main; bygget grenar från origin/main.
//
// Frågan: hur läser observatören ett kort i vilken hand som helst i K26:s golv (skrivbord 12 px,
// brödtext 14–16) med en handling, när filten med alla händer ger 34–43 px kort vid 1280 × 800?
//
// ?variant=A  #509:s lyft på observatörens filt: hover eller tryck lyfter kortet bredvid sig i 0,62
//             av fönstrets höjd. Spalten som i dag.
// ?variant=B  Händerna som läsbara rader: en rad per plats med korten i 294 px (14 px brödtext),
//             filten flyttad till spalten som karta.
// ?variant=C  INSPEKTION i spalten i golvets storlek (294 × 411 px); hovern fyller den som i dag.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { Texture } from '../../table/Texture.js'
import { cardWord } from '../../table/keyboard.js'
import { liftBox } from '../../table/lift.js'
import './proto.css'

export type Variant = 'A' | 'B' | 'C'
export const protoVariant = (): Variant | null => {
  const v = new URLSearchParams(location.search).get('variant')
  return v === 'A' || v === 'B' || v === 'C' ? v : null
}

const READ_PX = 294 // 8,5 pt brödtext = 14 px (K26, skrivbordet)

export function useObserverProto(view: Snapshot | null, faces: string) {
  const variant = protoVariant()
  const [lifted, setLifted] = useState<{ c: VisibleComponentState; x: number; y: number; pinned: boolean } | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const at = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY })
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setLifted(null)
    window.addEventListener('pointermove', at, true)
    window.addEventListener('pointerdown', at, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', at, true)
      window.removeEventListener('pointerdown', at, true)
      window.removeEventListener('keydown', key)
    }
  }, [])

  if (variant === null) return null

  const onInspect =
    variant === 'A'
      ? (c: VisibleComponentState | null) => {
          if (c && c.cardRef !== null) setLifted((l) => (l?.pinned ? l : { c, ...pointer.current, pinned: false }))
          else setLifted((l) => (l?.pinned ? l : null))
        }
      : undefined
  const onPick = variant === 'A' ? (c: VisibleComponentState) => c.cardRef !== null && setLifted({ c, ...pointer.current, pinned: true }) : undefined

  const lift =
    variant === 'A' && lifted
      ? (() => {
          const box = liftBox({ left: lifted.x - 20, right: lifted.x + 20, top: lifted.y - 28, bottom: lifted.y + 28 }, { w: innerWidth, h: innerHeight })
          return (
            <div className="p511-lift" data-proto511-read={lifted.c.id} style={{ left: box.left, top: box.top, width: box.w, height: box.h }} onClick={() => setLifted(null)}>
              <Texture faces={faces} c={lifted.c} />
            </div>
          )
        })()
      : null

  const hands = view ? view.zones.filter((z) => z.kind === 'hand') : []
  const rows =
    variant === 'B' && view ? (
      <div className="p511-rows">
        {hands.map((z) => {
          const seat = view.seats.find((s) => s.id === z.owner)
          const cards = view.components.filter((c) => c.zone === z.id)
          return (
            <section key={z.id}>
              <h3>
                {seat?.name ?? z.owner} · {cards.length} kort
              </h3>
              <div className="p511-row">
                {cards.map((c) => (
                  <div key={c.id} className="p511-card" data-proto511-read={c.id} style={{ width: READ_PX }} title={cardWord(c) ?? ''}>
                    <Texture faces={faces} c={c} />
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    ) : null

  const panel = (
    <aside className="p511-panel" aria-label="Prototyp">
      PROTOTYP #511 · variant {variant}{' '}
      {(['A', 'B', 'C'] as const).map((v) => (
        <a key={v} href={`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), variant: v })}`} aria-current={v === variant}>
          {v}
        </a>
      ))}
      <a href={`?${new URLSearchParams([...new URLSearchParams(location.search)].filter(([k]) => k !== 'variant'))}`}>I dag</a>
    </aside>
  )

  const wrap = (x: ReactNode) => <div data-proto511={variant}>{x}</div>
  return { variant, onInspect, onPick, rows, extra: <>{lift}{panel}</>, wrap }
}
