// PROTOTYPE — presence on the shared table (K6), on /prototype/presence?variant=A|B|C.
// Question: how do you see where the others are and what they are doing, without sound (K7)?
// Two simulated players move about, drag cards and point; your own pointer is Ada's.
// The channel is ephemeral: nothing here touches the log.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Intent, Snapshot } from '@byd/protocol'
import { TableRenderer } from '../../table/TableRenderer.js'
import { fitScale } from '../../table/fit.js'
import { seatColor } from '../../table/seatColor.js'
import { hue } from '../../table/hue.js'
import { CARD_MM, absoluteOf } from '../../table/drop.js'
import { Switcher } from './Switcher.js'
import { scripted, type Table } from './engine.js'
import '../../table/table.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Pilar med namn' },
  { key: 'B', name: 'Mjuka markörer + speglade dragningar' },
  { key: 'C', name: 'Inga markörer: bara händer på kort' },
]

// What crosses the ephemeral channel.
type Presence =
  | { kind: 'cursor'; seat: string; x: number; y: number; at: number }
  | { kind: 'drag'; seat: string; component: string; x: number; y: number; at: number }
  | { kind: 'pulse'; seat: string; x: number; y: number; at: number }
type Peer = { seat: string; name: string; index: number; cursor: { x: number; y: number; at: number } | null; drag: { component: string; x: number; y: number } | null }

const NOW = () => Date.now()
const IDLE_MS = 2500

export function PresencePrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [t] = useState(scripted)
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)
  const view = t.view(null)
  const frame = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.7)
  const floor = view.zones.find((z) => z.id === view.floor)!
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const update = () => setScale(fitScale({ w: floor.geometry.w, h: floor.geometry.h }, { w: el.clientWidth, h: el.clientHeight }, 44))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [floor.geometry.w, floor.geometry.h])

  // Peers: Bo wanders and points; Cy drags a card around now and then. Ada is you.
  const peers = useRef<Record<string, Peer>>({
    B: { seat: 'B', name: 'Bo', index: 1, cursor: null, drag: null },
    C: { seat: 'C', name: 'Cy', index: 2, cursor: null, drag: null },
  })
  const [pulses, setPulses] = useState<(Presence & { kind: 'pulse' })[]>([])
  const [attr, setAttr] = useState<{ component: string; seat: string; at: number }[]>([])
  const [me, setMe] = useState<{ x: number; y: number; at: number } | null>(null)
  const [simulate, setSimulate] = useState(true)
  const seatIndex = (seat: string) => Math.max(0, view.seats.findIndex((s) => s.id === seat))
  const nameOf = (seat: string) => view.seats.find((s) => s.id === seat)?.name ?? seat
  const colorOf = (seat: string) => seatColor(seatIndex(seat))

  useEffect(() => {
    if (!simulate) return
    let tick = 0
    const timer = setInterval(() => {
      tick++
      const p = peers.current
      const bo = p['B']!
      const cy = p['C']!
      // Bo circles the market, stops for a while, points once in a while.
      if (tick % 90 < 60) bo.cursor = { x: 200 + Math.cos(tick / 12) * 260, y: -120 + Math.sin(tick / 12) * 90, at: NOW() }
      if (tick % 90 === 62 && bo.cursor) setPulses((ps) => [...ps, { kind: 'pulse', seat: 'B', x: bo.cursor!.x, y: bo.cursor!.y, at: NOW() }])
      // Cy picks up a loose card every ~6 s, carries it in an arc and drops it.
      const phase = tick % 150
      const loose = view.components.filter((c) => view.zones.find((z) => z.id === c.zone)?.kind === 'area')
      if (phase === 1 && loose.length > 0) {
        const c = loose[Math.floor(Math.random() * loose.length)]!
        const a = absoluteOf(view, c)
        cy.drag = { component: c.id, x: a.x, y: a.y }
        cy.cursor = { x: a.x + 30, y: a.y + 40, at: NOW() }
      } else if (phase > 1 && phase < 110 && cy.drag) {
        cy.drag = { ...cy.drag, x: cy.drag.x + 1.6, y: cy.drag.y + Math.sin(phase / 10) * 2 }
        cy.cursor = { x: cy.drag.x + 30, y: cy.drag.y + 40, at: NOW() }
      } else if (phase === 110 && cy.drag) {
        const d = cy.drag
        cy.drag = null
        t.act('C', { v: 'move', component: d.component, to: 'table', x: d.x - floor.geometry.x, y: d.y - floor.geometry.y })
        setAttr((as) => [...as, { component: d.component, seat: 'C', at: NOW() }])
      }
      rerender()
    }, 40)
    return () => clearInterval(timer)
  }, [simulate, view.seq])

  // Your own pointer is Ada's cursor; a long press on the felt is a point.
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toMm = (clientX: number, clientY: number) => {
    const el = frame.current?.querySelector('[data-table]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: (clientX - r.left) / scale + floor.geometry.x, y: (clientY - r.top) / scale + floor.geometry.y }
  }
  const onMove = (e: React.PointerEvent) => {
    const p = toMm(e.clientX, e.clientY)
    if (p) setMe({ ...p, at: NOW() })
    if (hold.current) {
      clearTimeout(hold.current)
      hold.current = null
    }
  }
  const onDown = (e: React.PointerEvent) => {
    const p = toMm(e.clientX, e.clientY)
    if (!p) return
    hold.current = setTimeout(() => {
      hold.current = null
      setPulses((ps) => [...ps, { kind: 'pulse', seat: 'A', x: p.x, y: p.y, at: NOW() }])
    }, 450)
  }
  const onUp = () => {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
  }
  const act = (intents: Intent[]) => {
    t.act('A', ...intents)
    for (const it of intents) if (it.v === 'move' || it.v === 'stack') setAttr((as) => [...as, { component: it.component, seat: 'A', at: NOW() }])
    rerender()
  }
  // Housekeeping: pulses live 1.2 s, attributions 1.6 s.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = NOW()
      setPulses((ps) => ps.filter((p) => now - p.at < 1200))
      setAttr((as) => as.filter((a) => now - a.at < 1600))
    }, 200)
    return () => clearInterval(timer)
  }, [])

  // Align the overlay with the table element (tv mode: flat), once the scale is known.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const tbl = frame.current?.querySelector('[data-table]') as HTMLElement | null
    if (!tbl || !frame.current) return
    const r = tbl.getBoundingClientRect()
    const f = frame.current.getBoundingClientRect()
    setOffset({ x: r.left - f.left, y: r.top - f.top })
  }, [scale])
  const px = (mm: number) => mm * scale
  const left = (x: number) => px(x - floor.geometry.x)
  const top = (y: number) => px(y - floor.geometry.y)
  const cursors = [
    ...Object.values(peers.current).filter((p) => p.cursor).map((p) => ({ seat: p.seat, name: p.name, ...p.cursor! })),
    ...(me ? [{ seat: 'A', name: 'Ada', ...me }] : []),
  ]
  const drags = Object.values(peers.current).filter((p) => p.drag).map((p) => ({ seat: p.seat, name: p.name, ...p.drag! }))
  const now = NOW()
  const overlay = (nodes: ReactNode) => (
    <div className="pp-overlay" style={{ left: 0, top: 0 }}>
      <div style={{ position: 'absolute', left: offset.x, top: offset.y }}>{nodes}</div>
    </div>
  )
  const pulseNodes = pulses.map((p) => (
    <div key={`${p.seat}-${p.at}`} className="pp-pulse" style={{ left: left(p.x), top: top(p.y), ['--c' as string]: colorOf(p.seat) }}>
      <i /><i /><i />
      <span>{nameOf(p.seat)}</span>
    </div>
  ))
  const attrNodes = attr.map((a) => {
    const c = view.components.find((x) => x.id === a.component)
    if (!c) return null
    const p = absoluteOf(view, c)
    return <div key={`${a.component}-${a.at}`} className="pp-attr" style={{ left: left(p.x), top: top(p.y), width: px(CARD_MM.w), height: px(CARD_MM.h), transform: `rotate(${c.rot}deg)`, ['--c' as string]: colorOf(a.seat) }} />
  })
  const ghostNodes = drags.map((d) => {
    const c = view.components.find((x) => x.id === d.component)
    return (
      <div key={d.seat} className="pp-ghost" data-face={c?.cardRef ? 'front' : 'back'} style={{ left: left(d.x), top: top(d.y), width: px(CARD_MM.w), height: px(CARD_MM.h), ['--c' as string]: colorOf(d.seat), ...(c?.cardRef ? { ['--hue' as string]: hue(c.cardRef) } : {}) }}>
        {c?.cardRef ?? ''}
        <span>{d.name}</span>
      </div>
    )
  })
  const arrowNodes = cursors.map((c) => (
    <div key={c.seat} className="pp-arrow" style={{ left: left(c.x), top: top(c.y), opacity: now - c.at > IDLE_MS ? 0 : 1, ['--c' as string]: colorOf(c.seat) }}>
      <svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1 L17 9 L10 11 L7 19 Z" fill={colorOf(c.seat)} stroke="#fff" strokeWidth="1.2" /></svg>
      <span>{c.name}</span>
    </div>
  ))
  const dotNodes = cursors.map((c) => (
    <div key={c.seat} className="pp-dot" style={{ left: left(c.x), top: top(c.y), opacity: now - c.at > IDLE_MS ? 0 : 1, ['--c' as string]: colorOf(c.seat) }}>
      <span>{c.name}</span>
    </div>
  ))
  // The dragged card is hidden under the mirrored ghost by the real renderer still showing it
  // in place; in C the ghost is the only sign of the drag. (Peers' cards do not move until dropped.)
  const layer = variant === 'A' ? [arrowNodes, pulseNodes, attrNodes] : variant === 'B' ? [dotNodes, ghostNodes, pulseNodes, attrNodes] : [ghostNodes, pulseNodes, attrNodes]
  const hint = variant === 'A' ? 'pilar med namn som tonar bort · håll på filten = peka · flyttade kort bär färg' : variant === 'B' ? 'mjuka markörer · andras dragningar speglas live · håll = peka' : 'inga markörer · bara andras dragningar och pekningar syns · flyttade kort bär färg'
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="pp-stage">
      <div className="pp-state">
        <span>seq <b>{t.state.seq}</b></span>
        <span>du är <b style={{ color: colorOf('A') }}>Ada</b></span>
        {t.lastReason && <span style={{ color: '#ff8a8a' }}>avvisat: {t.lastReason}</span>}
        <span style={{ marginLeft: 'auto' }}>medspelare</span>
        <button data-on={simulate} onClick={() => setSimulate((s) => !s)}>{simulate ? 'rör sig' : 'stilla'}</button>
      </div>
      <div className="pp-main" ref={frame} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={() => setMe(null)}>
        <TableRenderer view={view} mode="tv" scale={scale} onAct={act} />
        {overlay(layer)}
        <div className="pp-hint">{hint}</div>
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}
