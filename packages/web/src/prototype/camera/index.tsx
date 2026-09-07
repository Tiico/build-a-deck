// PROTOTYPE — the camera (C5): /prototype/camera?variant=A|B|C. Question: how does the TV frame
// what is active on a big table, and how does someone zoom for a moment without the view
// staying there? Engine in the browser, the real renderer inside the real TV chrome; Bo and Cy
// play now and then, sometimes far out on the table.
import { useEffect, useRef, useState, type MouseEvent as RMouseEvent, type WheelEvent as RWheelEvent } from 'react'
import type { Intent, Snapshot } from '@byd/protocol'
import { TableRenderer } from '../../table/TableRenderer.js'
import { TvChrome } from '../../table/TvChrome.js'
import type { Point } from '../../table/drop.js'
import { Switcher } from './Switcher.js'
import { scripted, someoneElsePlays, type Table } from './engine.js'
import { activeBounds, around, centre, contains, fitFloor, frameRect, pad, same, scaleOf, tween, whereHappened, type Rect, type Size } from './camera.js'
import '../../table/table.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Kameran följer innehållet' },
  { key: 'B', name: 'Regissören klipper mellan bilder' },
  { key: 'C', name: 'Hela bordet plus en lupp' },
]
const RETURN_MS = 6000
type Happening = { at: number; p: Point; seq: number }
type Ctx = { t: Table; view: Snapshot; floor: Rect; act(intents: Intent[]): void; recent: Happening[]; now: number }

export function CameraPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [t] = useState(scripted)
  const [, bump] = useState(0)
  const [recent, setRecent] = useState<Happening[]>([])
  const [now, setNow] = useState(Date.now())
  const [pace, setPace] = useState<'lugnt' | 'livligt'>('lugnt')
  const rerender = () => bump((n) => n + 1)
  const note = (lines: { seq: number; intent: Intent; by: string | null; at: string; batch: string }[]) => {
    const v = t.view(null)
    const ps = lines.flatMap((l) => {
      const p = whereHappened(l, v)
      return p ? [{ at: Date.now(), p, seq: l.seq }] : []
    })
    if (ps.length > 0) setRecent((r) => [...r.slice(-20), ...ps])
  }
  const act = (intents: Intent[]) => {
    note(t.act(null, ...intents))
    rerender()
  }
  const other = (far: boolean) => {
    note(someoneElsePlays(t, far))
    rerender()
  }
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 250)
    const timer = setInterval(() => other(Math.random() < 0.3), pace === 'lugnt' ? 9000 : 3500)
    return () => {
      clearInterval(clock)
      clearInterval(timer)
    }
  }, [pace])
  const view = t.view(null)
  const floorZone = view.zones.find((z) => z.id === view.floor)!
  const floor: Rect = { x: floorZone.geometry.x, y: floorZone.geometry.y, w: floorZone.geometry.w, h: floorZone.geometry.h }
  const ctx: Ctx = { t, view, floor, act, recent, now }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="pc-stage byd-fit">
      <div className="pc-state">
        <span>seq <b>{t.state.seq}</b></span>
        <span>bordet är <b>140 × 90 cm</b> · TV:n är detta fönster</span>
        {t.lastReason && <span style={{ color: '#ff8a8a' }}>avvisat: {t.lastReason}</span>}
        <span style={{ marginLeft: 'auto' }}>de andra spelar</span>
        <button onClick={() => setPace('lugnt')} style={pace === 'lugnt' ? on : undefined}>lugnt</button>
        <button onClick={() => setPace('livligt')} style={pace === 'livligt' ? on : undefined}>livligt</button>
        <button onClick={() => other(false)}>Bo spelar nu</button>
        <button onClick={() => other(true)}>…långt bort</button>
      </div>
      <TvChrome view={view} activity={t.activity()} roomCode="KAMERA" observers={[]}>
        <V {...ctx} />
      </TvChrome>
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}
const on: React.CSSProperties = { background: '#7dd3a0', color: '#0b2a18' }

// ---------- shared: a viewport that shows a camera rectangle of the table ----------

function useSize(): [React.RefObject<HTMLDivElement | null>, Size | null] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

// The camera glides to its target (or cuts, when `cut`), so the eye can follow.
function useGlide(target: Rect | null, ms: number, cut = false): Rect | null {
  const [cur, setCur] = useState<Rect | null>(target)
  const curRef = useRef<Rect | null>(target)
  const raf = useRef(0)
  const key = target ? `${target.x},${target.y},${target.w},${target.h}` : ''
  useEffect(() => {
    if (!target) return
    const from = curRef.current
    if (cut || !from || same(from, target)) {
      curRef.current = target
      setCur(target)
      return
    }
    const start = performance.now()
    cancelAnimationFrame(raf.current)
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      const next = tween(from, target, e)
      curRef.current = next
      setCur(next)
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cut, ms])
  return cur
}

type StageProps = { ctx: Ctx; cam: Rect | null; size: Size | null; vp: React.RefObject<HTMLDivElement | null>; onWheel?: (e: RWheelEvent) => void; onDoubleClick?: (e: RMouseEvent) => void; children?: React.ReactNode }
function Stage({ ctx, cam, size, vp, onWheel, onDoubleClick, children }: StageProps) {
  const s = cam && size ? scaleOf(cam, size) : 1
  return (
    <div className="pc-viewport" ref={vp} onWheel={onWheel} onDoubleClick={onDoubleClick}>
      {cam && size && (
        <div className="pc-world" style={{ left: -(cam.x - ctx.floor.x) * s, top: -(cam.y - ctx.floor.y) * s, width: ctx.floor.w * s, height: ctx.floor.h * s }}>
          <TableRenderer view={ctx.view} mode="tv" scale={s} onAct={ctx.act} />
        </div>
      )}
      {children}
    </div>
  )
}

// A zoom someone asked for, which the view leaves by itself.
function useManual(): [{ rect: Rect; until: number } | null, (rect: Rect | null, ms?: number) => void, number] {
  const [manual, setManual] = useState<{ rect: Rect; until: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!manual) return
    const id = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= manual.until) setManual(null)
    }, 100)
    return () => clearInterval(id)
  }, [manual])
  const set = (rect: Rect | null, ms = RETURN_MS) => setManual(rect ? { rect, until: Date.now() + ms } : null)
  return [manual, set, manual ? Math.max(0, Math.ceil((manual.until - now) / 1000)) : 0]
}

const toTable = (vp: HTMLDivElement | null, cam: Rect | null, size: Size | null, clientX: number, clientY: number): Point | null => {
  if (!vp || !cam || !size) return null
  const r = vp.getBoundingClientRect()
  const s = scaleOf(cam, size)
  return { x: cam.x + (clientX - r.left) / s, y: cam.y + (clientY - r.top) / s }
}

// ---------- A — the camera follows the content ----------
// The frame is the bounding box of everything in play, padded; it glides when that changes.
// Scroll or double-tap zooms around the pointer; the camera returns after a few seconds.
function VariantA(ctx: Ctx) {
  const [vp, size] = useSize()
  const [manual, setManual, left] = useManual()
  const auto = size ? frameRect(pad(activeBounds(ctx.view) ?? ctx.floor, 60), size, ctx.floor, 520) : null
  const cam = useGlide(manual?.rect ?? auto, 700)
  const whole = size ? fitFloor(ctx.floor, size) : null
  const wheel = (e: RWheelEvent) => {
    const p = toTable(vp.current, cam, size, e.clientX, e.clientY)
    if (!p || !cam || !size || !whole) return
    const w = Math.min(whole.w, Math.max(320, cam.w * Math.exp(e.deltaY * 0.002)))
    setManual(w >= whole.w ? null : around(p, w, size, ctx.floor))
  }
  const dbl = (e: RMouseEvent) => {
    const p = toTable(vp.current, cam, size, e.clientX, e.clientY)
    if (!p || !size || !whole) return
    setManual(manual ? null : around(p, whole.w / 2.6, size, ctx.floor))
  }
  return (
    <Stage ctx={ctx} cam={cam} size={size} vp={vp} onWheel={wheel} onDoubleClick={dbl}>
      {manual && (
        <div className="pc-pill">
          zoomad · återgår om <b>{left}</b> s
        </div>
      )}
      <div className="pc-hint">kameran ramar in allt som är i spel och glider med · scrolla eller dubbelklicka för att zooma, vyn återgår själv</div>
    </Stage>
  )
}

// ---------- B — a director cuts between shots ----------
// Fixed shots: the whole table, and one per place (market, piles, each hand's edge). The
// director cuts to the shot where the latest move happened and back to the whole table when
// things go quiet. Anyone can pick a shot from the strip; it holds for a few seconds.
type Shot = { key: string; name: string; rect: Rect }
function VariantB(ctx: Ctx) {
  const [vp, size] = useSize()
  const [manual, setManual, left] = useManual()
  const shots: Shot[] = size ? shotsOf(ctx, size) : []
  const whole = shots[0] ?? null
  const latest = ctx.recent[ctx.recent.length - 1]
  // The tightest shot that holds the latest move; the whole table when nothing happened lately.
  const live = latest && ctx.now - latest.at < RETURN_MS ? [...shots.slice(1)].filter((s) => contains(s.rect, latest.p)).sort((a, b) => a.rect.w - b.rect.w)[0] ?? whole : whole
  const chosen = manual ? shots.find((s) => same(s.rect, manual.rect)) ?? live : live
  const cam = useGlide(chosen?.rect ?? null, 0, true)
  const [flash, setFlash] = useState(0)
  useEffect(() => setFlash(Date.now()), [chosen?.key])
  return (
    <Stage ctx={ctx} cam={cam} size={size} vp={vp}>
      <div className="pc-cut" key={flash} />
      {chosen && (
        <div className="pc-bug">
          <i /> {chosen.name}
          {manual && <span> · återgår om {left} s</span>}
        </div>
      )}
      <div className="pc-shots">
        {shots.map((s) => (
          <button key={s.key} data-live={chosen?.key === s.key ? 'true' : undefined} onClick={() => setManual(manual && same(manual.rect, s.rect) ? null : s.rect, 8000)}>
            {s.name}
          </button>
        ))}
      </div>
      <div className="pc-hint">regissören klipper till platsen där något hände och tillbaka till hela bordet när det blir tyst · välj en bild i remsan för att hålla den</div>
    </Stage>
  )
}
function shotsOf(ctx: Ctx, size: Size): Shot[] {
  const out: Shot[] = [{ key: 'all', name: 'Hela bordet', rect: fitFloor(ctx.floor, size) }]
  const seatName = (id: string | undefined) => ctx.view.seats.find((s) => s.id === id)?.name ?? id ?? ''
  for (const z of ctx.view.zones) {
    if (z.id === ctx.view.floor) continue
    const g = z.geometry
    if (z.kind === 'area') out.push({ key: z.id, name: z.name, rect: frameRect(pad(g, 40), size, ctx.floor, 520) })
    if (z.kind === 'hand') out.push({ key: z.id, name: `${seatName(z.owner)}s kant`, rect: frameRect(pad(g, 120), size, ctx.floor, 640) })
  }
  const piles = ctx.view.zones.filter((z) => z.kind === 'pile' && !z.dynamic)
  const box = piles.length > 0 ? pad({ x: Math.min(...piles.map((p) => p.geometry.x)) - 32, y: Math.min(...piles.map((p) => p.geometry.y)) - 44, w: Math.max(...piles.map((p) => p.geometry.x)) - Math.min(...piles.map((p) => p.geometry.x)) + 64, h: 112 }, 80) : null
  if (box) out.splice(1, 0, { key: 'piles', name: 'Högarna', rect: frameRect(box, size, ctx.floor, 520) })
  out.splice(1, 0, { key: 'middle', name: 'Mitten', rect: frameRect(pad(activeBounds(ctx.view) ?? ctx.floor, 40), size, ctx.floor, 520) })
  return out
}

// ---------- C — the whole table, always, plus a loupe ----------
// The overview never moves, so everyone's sense of where things are stays intact. A loupe in
// the corner shows the latest move enlarged and fades when nothing has happened for a while.
// Double-tap anywhere to point the loupe there for a few seconds.
function VariantC(ctx: Ctx) {
  const [vp, size] = useSize()
  const [manual, setManual, left] = useManual()
  const cam = size ? fitFloor(ctx.floor, size) : null
  const latest = ctx.recent[ctx.recent.length - 1]
  const auto = latest && ctx.now - latest.at < RETURN_MS ? latest.p : null
  const focus = manual ? centre(manual.rect) : auto
  const dbl = (e: RMouseEvent) => {
    const p = toTable(vp.current, cam, size, e.clientX, e.clientY)
    if (!p) return
    setManual(manual ? null : { x: p.x, y: p.y, w: 0, h: 0 })
  }
  const loupe: Size = { w: 380, h: 240 }
  const mmW = 300
  const s = loupe.w / mmW
  const rect: Rect | null = focus ? { x: focus.x - mmW / 2, y: focus.y - (mmW * loupe.h) / loupe.w / 2, w: mmW, h: (mmW * loupe.h) / loupe.w } : null
  const glided = useGlide(rect, 450)
  const overview = cam && size ? scaleOf(cam, size) : 1
  return (
    <Stage ctx={ctx} cam={cam} size={size} vp={vp} onDoubleClick={dbl}>
      {glided && focus && cam && (
        <>
          <div className="pc-loupe-mark" style={{ left: (glided.x - cam.x) * overview, top: (glided.y - cam.y) * overview, width: glided.w * overview, height: glided.h * overview }} />
          <div className="pc-loupe" style={{ width: loupe.w, height: loupe.h }}>
            <div className="pc-world" style={{ left: -(glided.x - ctx.floor.x) * s, top: -(glided.y - ctx.floor.y) * s, width: ctx.floor.w * s, height: ctx.floor.h * s }}>
              <TableRenderer view={ctx.view} mode="tv" scale={s} />
            </div>
            <span>{manual ? `din lupp · ${left} s` : 'senaste draget'}</span>
          </div>
        </>
      )}
      <div className="pc-hint">hela bordet syns alltid · luppen i hörnet visar det senaste draget i förstoring · dubbelklicka för att rikta luppen själv</div>
    </Stage>
  )
}
