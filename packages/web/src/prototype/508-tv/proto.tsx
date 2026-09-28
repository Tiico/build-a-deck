// PROTOTYPE — throwaway (#508). Ska aldrig till main; bygget grenar från origin/main.
//
// Frågan: hur läser rummet ett kort på TV:n från tre meter (K26: 24 px golv, 28–32 px brödtext
// vid 1920 × 1080), och hur väljer rummet vilket kort det är, utan pekare på TV:n?
//
// ?variant=A  Spalten breddas så att INSPEKTION når golvet, alltid.
// ?variant=B  Spalten som i dag; ett kort kallas fram över filten i läsbar storlek från en telefon
//             («Visa för alla») eller tangentbordet (← → välj, Enter visa), och går av sig självt.
// ?variant=C  Som B, och därtill visar TV:n själv varje nyss spelat publikt kort en stund.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../../client.js'
import { Texture } from '../../table/Texture.js'
import { cardWord } from '../../table/keyboard.js'
import { componentOf } from '../../table/presence.js'
import './proto.css'

export type Variant = 'A' | 'B' | 'C'
export const protoVariant = (): Variant | null => {
  const v = new URLSearchParams(location.search).get('variant')
  return v === 'A' || v === 'B' || v === 'C' ? v : null
}

const SHOW_MS = { called: 15_000, played: 8_000 }
type Shown = { card: VisibleComponentState; why: string; until: number; ms: number }

const publicCards = (view: Snapshot | null): VisibleComponentState[] => {
  if (!view) return []
  const hands = new Set(view.zones.filter((z) => z.kind === 'hand').map((z) => z.id))
  return view.components.filter((c) => c.cardRef !== null && !hands.has(c.zone))
}
const seatName = (view: Snapshot | null, seat: string | null) => (seat === null ? 'Bordet' : (view?.seats.find((s) => s.id === seat)?.name ?? seat))

export function useTvProto(view: Snapshot | null, activity: readonly Activity[], client: TableClient | null, faces: string) {
  const variant = protoVariant()
  const [shown, setShown] = useState<Shown | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const cards = publicCards(view)
  const viewRef = useRef(view)
  viewRef.current = view

  const show = useCallback((card: VisibleComponentState, why: string, ms: number) => setShown({ card, why, ms, until: Date.now() + ms }), [])

  // Går av sig självt.
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), shown.until - Date.now())
    return () => clearTimeout(t)
  }, [shown])

  // C: varje nytt rad om ett publikt kort visas en stund.
  const seen = useRef<number | null>(null)
  useEffect(() => {
    const last = activity.at(-1)
    if (!last) return
    if (seen.current === null) {
      seen.current = last.seq
      return
    }
    if (last.seq <= seen.current) return
    seen.current = last.seq
    if (variant !== 'C') return
    const id = componentOf(last)
    const card = id && publicCards(viewRef.current).find((c) => c.id === id)
    if (card) show(card, `${seatName(viewRef.current, last.by)} spelade`, SHOW_MS.played)
  }, [activity, variant, show])

  // Tangentbordet: ← → väljer bland de publika korten (syns i INSPEKTION), Enter visar, Escape tar ner.
  useEffect(() => {
    if (variant !== 'B' && variant !== 'C') return
    const onKey = (e: KeyboardEvent) => {
      const n = publicCards(viewRef.current).length
      if (e.key === 'Escape') setShown(null)
      else if (n > 0 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault()
        setCursor((c) => (c === null ? 0 : (c + (e.key === 'ArrowRight' ? 1 : n - 1)) % n))
      } else if (e.key === 'Enter') {
        setCursor((c) => {
          const card = c === null ? undefined : publicCards(viewRef.current)[c]
          if (card) show(card, 'Tangentbordet visar', SHOW_MS.called)
          return c
        })
      } else return
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [variant, show])

  const playOne = async () => {
    if (!client) return
    const before = new Set(publicCards(viewRef.current).map((c) => c.id))
    const onTable = new Set(viewRef.current?.components.filter((c) => c.zone === 'table').map((c) => c.id))
    await client.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50))
      const fresh = viewRef.current?.components.find((c) => c.zone === 'table' && !onTable.has(c.id))
      if (fresh) {
        const n = before.size
        await client.send({ v: 'move', component: fresh.id, to: 'table', x: 380 + (n % 5) * 70, y: 540 + (n % 3) * 20, rot: (n % 2 ? 5 : -4) }, { v: 'flip', component: fresh.id, face: 'front' })
        return
      }
    }
  }

  if (variant === null) return { variant, inspecting: null, wrap: (x: ReactNode) => x, extra: null }

  const inspecting = cursor === null ? null : (cards[cursor % Math.max(1, cards.length)] ?? null)
  const wrap = (x: ReactNode) => <div data-proto508={variant}>{x}</div>
  const extra = (
    <>
      {shown && (variant === 'B' || variant === 'C') && (
        <div className="p508-spot" data-proto508-spot onClick={() => setShown(null)}>
          <figure>
            <div className="p508-card" data-proto508-card>
              <Texture faces={faces} c={shown.card} />
            </div>
            <figcaption>
              <b>{shown.why}</b> · {cardWord(shown.card) ?? ''}
              <i key={shown.until} style={{ animationDuration: `${shown.ms}ms` }} />
            </figcaption>
          </figure>
        </div>
      )}
      <aside className="p508-phone" aria-label="Prototyp">
        <header>
          PROTOTYP #508 · variant {variant}{' '}
          {(['A', 'B', 'C'] as const).map((v) => (
            <a key={v} href={`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), variant: v })}`} aria-current={v === variant}>
              {v}
            </a>
          ))}
          <a href={`?${new URLSearchParams([...new URLSearchParams(location.search)].filter(([k]) => k !== 'variant'))}`}>I dag</a>
        </header>
        {variant !== 'A' && (
          <>
            <p>Telefonen (Ada): «Visa för alla» på ett publikt kort</p>
            <div className="p508-list">
              {cards.map((c) => (
                <button key={c.id} type="button" onClick={() => show(c, 'Ada visar', SHOW_MS.called)}>
                  {cardWord(c) ?? c.id}
                </button>
              ))}
            </div>
            <p>Tangentbord: ← → väljer (syns i INSPEKTION), Enter visar, Esc tar ner.</p>
          </>
        )}
        <button type="button" className="p508-play" onClick={() => void playOne()}>
          Simulera: ett kort spelas till filten
        </button>
      </aside>
    </>
  )
  return { variant, inspecting, wrap, extra }
}
