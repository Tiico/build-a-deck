// PROTOTYPE — throwaway (#89). One route, four answers to one question: how do two or three
// counters on the same seat each get a 44 x 44 px hit area?
//
//   /prototype/raknarzonen?proto=N|A|B|C&yta=bord|tv&seats=2..8&counters=1..3
//
// #67 gave one chip an invisible, correctly projected 44 x 44 target (`leaningSquare` in
// `table/fit.ts`, `.byd-token-hit` in `TableRenderer`). It landed, and it moved the problem
// rather than solving it: the recipe lays a seat's chips 32 mm apart inside a zone that is
// 110 x 100 mm, and at 1280 in table mode that is a 23 px pitch inside an 80 x 73 px zone while
// two targets need 88 px between them. The zone is narrower than two hit areas.
//
// So the four variants are not settings. Each is a whole position on what a seat's counters are:
//
//   N  Nuläget — the recipe's own millimetres and #67's own target, so the overlap is visible.
//   A  Zonen växer — the zone holds the seat's chips at a pitch that clears 44 px, the seat's
//      500 mm along the rim grows with it, and K18's place setting and felt grow with the seat.
//   B  Glesare i en riktning — the same pitch, but the seat's envelope is not renegotiated: the
//      zone grows along the rim only and the millimetres come out of the area in front.
//   C  Staplade — the chips lie on each other, the felt draws one thing to touch, and the ring
//      is the door to the individual counter.
//
// Nothing here sends an intent. The values are local state, which is what a prototype's mutation
// should be; what the real client would send is `setCounter` with an absolute value, and that is
// what the renderer's own ring hands back through `onAct`.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_PLAYERS } from '@byd/server/doc'
import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { TableRenderer, type FeltFit } from '../../table/TableRenderer.js'
import { TvChrome } from '../../table/TvChrome.js'
import { RadialMenu, type RadialItem } from '../../table/RadialMenu.js'
import { ringCentre } from '../../table/ring.js'
import { counterActs, ownerOf } from '../../table/keyboard.js'
import { isCounter } from '../../components.js'
import { leaningSquare, TOUCH_PX } from '../../table/fit.js'
import type { TiltLayout } from '../../table/geometry.js'
import { CHIP_MM, INSET_MM, STACK_MM, feltOf, layout, planOf, stageOf, type VariantKey } from './stage.js'
import { read, type Reading } from './measure.js'
import { Switcher, type Mode, type Variant } from './Switcher.js'
import '../../table/table.css'
import '../../table/keyboard.css'
import '../../buttons.css'
// The prototype's own rules are carried as text and written into a `<style>` when the route is
// mounted, rather than imported into the bundle. `felt-font.test.ts` weighs the one blocking
// stylesheet the app ships, and a throwaway route has no business making that sheet heavier for
// every reader who never opens it.
import variantsCss from './variants.css?inline'

const VARIANTS: readonly Variant[] = [
  { key: 'N', name: 'Nuläget' },
  { key: 'A', name: 'Zonen växer' },
  { key: 'B', name: 'Glesare i en riktning' },
  { key: 'C', name: 'Staplade' },
]

// The variants that let the renderer draw the target #67 landed. C draws one of its own.
const RENDERER_TARGET = new Set<VariantKey>(['N', 'A', 'B'])

type Ring = { kind: 'stack' | 'chip'; id: string; x: number; y: number }

export function CounterZonePrototype() {
  const params = new URLSearchParams(location.search)
  const [proto, setProto] = useState<VariantKey>((params.get('proto') as VariantKey) ?? 'N')
  const [mode, setMode] = useState<Mode>((params.get('yta') as Mode) ?? 'bord')
  const [seats, setSeats] = useState(Math.min(MAX_PLAYERS, Math.max(2, Number(params.get('seats')) || 4)))
  const [nCounters, setNCounters] = useState(Math.min(3, Math.max(1, Number(params.get('counters')) || 2)))
  // `?pitch=` dials A's and B's millimetres between two chips' centres. It is there because A's
  // number cannot be trusted without being dialled: every millimetre A adds to the pitch it also
  // adds to the seat, the place setting and the felt, and the felt is drawn at a smaller scale
  // afterwards — so the pitch asks for more millimetres again.
  const dialled = Number(params.get('pitch')) || 0
  const [values, setValues] = useState<Record<string, number>>({})
  const [ring, setRing] = useState<Ring | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [tilt, setTilt] = useState<TiltLayout | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const fitRef = useRef<FeltFit | null>(null)

  const plan = useMemo(() => (dialled > 0 ? planOf(proto, nCounters, dialled, dialled) : planOf(proto, nCounters)), [proto, nCounters, dialled])
  const setup = useMemo(() => layout(plan, seats), [plan, seats])
  const base = useMemo(() => stageOf(setup, plan), [setup, plan])
  const view: Snapshot | null = useMemo(() => {
    if (!base) return null
    return { ...base, components: base.components.map((c) => (values[c.id] === undefined ? c : { ...c, counter: values[c.id] as number })) }
  }, [base, values])

  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('proto', proto)
    url.searchParams.set('yta', mode)
    url.searchParams.set('seats', String(seats))
    url.searchParams.set('counters', String(nCounters))
    history.replaceState(null, '', url)
  }, [proto, mode, seats, nCounters])

  useEffect(() => setRing(null), [proto, mode, seats, nCounters])

  // The felt's tilt, read off the nodes the stylesheet laid out — the same two boxes
  // `TableRenderer` maps a pointer through. C sizes its own target through it, so a pile's target
  // is projected exactly as `.byd-token-hit` is and the two are comparable.
  useEffect(() => {
    const root = stage.current
    const frame = root?.querySelector('.byd-table-frame') as HTMLElement | null
    const wood = root?.querySelector('.byd-table-wood') as HTMLElement | null
    if (mode !== 'bord' || !frame || !wood) {
      setTilt((prev) => (prev === null ? prev : null))
      return
    }
    const fr = frame.getBoundingClientRect()
    const next: TiltLayout = { frame: { w: fr.width, h: fr.height }, wood: { left: wood.offsetLeft, top: wood.offsetTop, w: wood.offsetWidth, h: wood.offsetHeight } }
    setTilt((prev) => (prev && same(prev, next) ? prev : next))
  })

  const felt = view?.zones.find((z) => z.id === view.floor)?.geometry ?? { x: 0, y: 0, w: 0, h: 0 }
  const chips = (view?.components ?? []).filter(isCounter)
  const chipById = (id: string) => chips.find((c) => c.id === id)
  const centreOf = (c: VisibleComponentState) => {
    const z = view?.zones.find((x) => x.id === c.zone)
    return { x: (z?.geometry.x ?? 0) + c.x + CHIP_MM / 2, y: (z?.geometry.y ?? 0) + c.y + CHIP_MM / 2 }
  }

  // The renderer's target, with the prototype's two labels on it. Nothing is redrawn and nothing
  // is resized: `data-proto-target` is only what makes one selector find every variant's target,
  // and `data-proto-mm` is the same square said in the felt's own millimetres, which is the unit
  // the zone question is asked in.
  useEffect(() => {
    const root = stage.current
    const fit = fitRef.current
    if (!root || !fit) return
    // The scale is stamped here and not in the markup: the overlay that knows it runs inside the
    // renderer's own render, which is after this page's, so an attribute written up there is one
    // render behind whenever the felt has just changed size.
    root.dataset['protoScale'] = String(fit.scale)
    if (!RENDERER_TARGET.has(proto)) return
    for (const el of root.querySelectorAll<HTMLElement>('[data-counter-hit]')) {
      const c = chipById(el.dataset['counterHit'] ?? '')
      if (!c) continue
      const p = centreOf(c)
      el.dataset['protoTarget'] = c.id
      el.dataset['protoMm'] = JSON.stringify({ cx: p.x, cy: p.y, side: parseFloat(el.style.width) / fit.scale, zone: c.zone })
    }
  })

  useEffect(() => {
    const id = setTimeout(() => stage.current && setReading(read(stage.current)), 320)
    return () => clearTimeout(id)
  })

  if (!view) return <p style={{ color: '#fff' }}>Setupen går inte att bygga.</p>

  const send = (intents: Intent[]) => {
    for (const i of intents) if (i.v === 'setCounter' && typeof i.component === 'string') setValues((v) => ({ ...v, [i.component as string]: i.value }))
  }

  const openRing = (kind: Ring['kind'], id: string, x: number, y: number) => setRing({ kind, id, ...ringCentre({ x, y }, { w: window.innerWidth, h: window.innerHeight }) })

  // How big the finger's square is at a place on the felt: the renderer's own answer, reached
  // through the renderer's own `leaningSquare`, so C is not measured on an easier projection.
  const sideAt = (fit: FeltFit, cx: number, cy: number): number => {
    const flat = Math.max(fit.px(CHIP_MM), TOUCH_PX)
    if (!tilt) return flat
    return Math.max(fit.px(CHIP_MM), leaningSquare(tilt, { x: fit.px(cx - (felt.x + felt.w / 2)), y: fit.px(cy - (felt.y + felt.h / 2)) }, TOUCH_PX))
  }

  // C's own target: one per seat, over the top chip of the pile. The chips under it are the
  // pile's own thickness and not targets — the target says so itself, in `data-proto-covers`.
  const overlay = (fit: FeltFit) => {
    fitRef.current = fit
    if (proto !== 'C') return null
    return (
      <>
        {view.seats.map((s) => {
          const own = chips.filter((c) => c.zone === `counters:${s.id}`)
          const top = own[own.length - 1]
          if (!top) return null
          const p = centreOf(top)
          const side = sideAt(fit, p.x, p.y)
          return (
            <button
              key={`stack-${s.id}`}
              type="button"
              className="byd-proto-stack"
              data-proto-target={`stack:${s.id}`}
              data-proto-covers={own.map((c) => c.id).join(' ')}
              data-proto-mm={JSON.stringify({ cx: p.x, cy: p.y, side: side / fit.scale, zone: top.zone })}
              aria-label={`${own.length} räknare hos ${s.name ?? s.id}. Öppnar listan.`}
              style={{ left: fit.left(p.x), top: fit.top(p.y), width: side, height: side }}
              onClick={(e) => openRing('stack', s.id, e.clientX, e.clientY)}
            >
              {own.length > 1 && <b className="byd-proto-pile-n">{own.length}</b>}
            </button>
          )
        })}
      </>
    )
  }

  const rendererAct = RENDERER_TARGET.has(proto) ? send : undefined
  const feltView =
    mode === 'tv' ? (
      <div className="byd-fit">
        <TvChrome view={view} activity={[]} roomCode="PROTO" title="Prototyp · räknarzonen" version="rev-0">
          <TableRenderer view={view} mode="tv" camera overlay={overlay} onAct={rendererAct} />
        </TvChrome>
      </div>
    ) : (
      <div className="byd-fit">
        <h1 className="byd-table-plate">Prototyp · räknarzonen · PROTO</h1>
        <TableRenderer view={view} mode="table" overlay={overlay} onAct={rendererAct} />
      </div>
    )

  const stacked = ring?.kind === 'stack' ? chips.filter((c) => c.zone === `counters:${ring.id}`) : []
  const ringChip = ring?.kind === 'chip' ? chipById(ring.id) : undefined

  const zonesMm = view.zones.filter((z) => z.id !== view.floor && z.geometry.w > 0).map((z) => ({ id: z.id, x: z.geometry.x, y: z.geometry.y, w: z.geometry.w, h: z.geometry.h }))
  const note = reading
    ? `träffyta ${reading.target.w}×${reading.target.h} px · ${reading.collisions} överlappande par · minsta glapp ${reading.gap} px · ${reading.outside} utanför sin zon · ${reading.intruding} i grannzon · kort ${reading.cardPx} px · filt ${reading.feltMm.w}×${reading.feltMm.h} mm`
    : ''

  return (
    <div
      ref={stage}
      className="byd-proto-page byd-proto-felt-room"
      data-proto={proto}
      data-proto-mode={mode}
      data-proto-zones={JSON.stringify(zonesMm)}
      data-proto-felt={JSON.stringify(feltOf(plan, view.seats.length))}
    >
      <style>{variantsCss}</style>
      {feltView}

      {/* C — the door to the individual counter. A press on the pile offers the counters by name;
          picking one opens the chip's own ring, which is `counterActs` and therefore exactly the
          verbs the renderer's ring already draws (C4, K14). Two taps instead of one is C's price,
          and it is the whole of it. */}
      {ring?.kind === 'stack' && stacked.length > 0 && (
        <RadialMenu
          id={`stack-${ring.id}`}
          x={ring.x}
          y={ring.y}
          items={stacked.map((c): RadialItem => ({ label: `${c.cardRef ?? 'Räknare'} ${c.counter ?? 0}`, run: () => setRing({ kind: 'chip', id: c.id, x: ring.x, y: ring.y }) }))}
          hub={
            <>
              <b>{stacked.length}</b>
              <span>Räknare</span>
              <i>{view.seats.find((s) => s.id === ring.id)?.name ?? ring.id}</i>
            </>
          }
          /* `RadialMenu` closes itself after running a verb, and this ring's verb is to open the
             next ring — so a plain `setRing(null)` would shut the door it just opened. The close
             only bites while the ring on screen is still this one. */
          onClose={() => setRing((r) => (r?.kind === 'stack' ? null : r))}
        />
      )}
      {ring?.kind === 'chip' && ringChip && (
        <RadialMenu
          id={`chip-${ring.id}`}
          x={ring.x}
          y={ring.y}
          items={counterActs(ringChip).map((a): RadialItem => { const acts = a.intents; return { label: a.label, run: acts && acts.length > 0 ? () => { send(acts); setRing(null) } : null } })}
          hub={
            <>
              <b>{ringChip.counter ?? 0}</b>
              <span>{ringChip.cardRef ?? ''}</span>
              <i>{ownerOf(view, ringChip) ?? ''}</i>
            </>
          }
          onClose={() => setRing(null)}
        />
      )}

      <Switcher variants={VARIANTS} current={proto} onVariant={(k) => setProto(k as VariantKey)} mode={mode} onMode={setMode} seats={seats} onSeats={setSeats} maxSeats={MAX_PLAYERS} counters={nCounters} onCounters={setNCounters} note={note} />
    </div>
  )
}

const same = (a: TiltLayout, b: TiltLayout): boolean =>
  a.frame.w === b.frame.w && a.frame.h === b.frame.h && a.wood.left === b.wood.left && a.wood.top === b.wood.top && a.wood.w === b.wood.w && a.wood.h === b.wood.h

export { INSET_MM, STACK_MM }
