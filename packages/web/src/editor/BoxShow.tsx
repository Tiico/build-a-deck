import { flushSync } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { boxFaceType, type BoxFace } from '@byd/engine'
import type { GameBox } from '@byd/server/doc'
import type { FaceTemplate, Motif } from '@byd/template'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { PX_PER_MM } from './canvas.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { FootSaid } from './said.js'
import { CopyGlyph, PencilGlyph } from '../glyphs.js'
import { useT } from '../i18n/index.js'
import { useMm } from './box-mm.js'
import './box-show.css'
import { DECK_GLOSS, FOLD_MS, GLOSS, REST, lit, netPose, poseTransform, showScene, swayed, turnedBy, type DeckPart, type Plane, type Pose } from './boxScene.js'

// «Visa upp» (#1414, L91, #1406 runda 2, hybriden): nätet viker ihop sig till lådan på sin plats, och
// lådan och leken står i ljus, med lack, slitna vikkanter, kortens randiga kant och en skugga på golvet.
// Lådan vrider sig lugnt och går att vrida. Ett klick på en sida, «Redigera nätet» eller Escape viker ut
// den igen med den sidan vald, och vid `prefers-reduced-motion` byts läget direkt och lådan står still.
//
// Det är samma sex ytor hela vägen: varje plan börjar där dess panel ligger i nätet, i nätets skala, och
// glider och vrids till sin sida. Ytorna är den enda renderarens (E2), ritade av `CardPreview` i sitt
// eget mått och aldrig förstorade; presentationen sätter dem på planen och ritar aldrig en yta eller ett
// kort själv. Kortens kant är lekens sida och inget kort, så den är ett mönster av ränder.
//
// Ingenting här är en avtäckning. Inget glimmar, ingenting kommer fram ur något, och rörelsen är den
// lugna vridningen kring vilovinkeln (beställaren 2026-10-26: «Det ska inte kännas som en case opening»).

// Where the box is in its fold. The tab is on the net with no picture laid over it; `folding` and
// `unfolding` are the 0.9 s between, and `settling` is the picture fading off the net it has landed on.
export type Look = 'net' | 'folding' | 'show' | 'unfolding' | 'settling'

// Drawn large and only ever made smaller to fit: a 3D plane is rasterised at its own size, so one
// that was enlarged would be blurred (#1406, README «Hybriden»). The renderer draws each face at this
// measure itself (`CardPreview`'s scale), so the texture is as sharp as the plane is large.
const DRAWN = 1.25
const PX = PX_PER_MM * DRAWN
// How long the box stays where the hand left it before it starts to turn on its own again.
const HELD_MS = 2500
// How long the picture takes to fade off the net once the faces have landed.
const SETTLE_MS = 250
// How far a press may wander and still be a press on a side rather than a turn.
const PRESS_PX = 4
// How far one press of an arrow key turns the box.
const KEY_DEG = 10
const STILL = '(prefers-reduced-motion: reduce)'
const still = () => typeof matchMedia === 'function' && matchMedia(STILL).matches

const BOX_ORDER: readonly BoxFace[] = ['front', 'back', 'left', 'right', 'lid', 'bottom']
const DECK_ORDER: readonly DeckPart[] = ['face', 'back', 'right', 'left', 'top']

export type BoxShowProps = {
  doc: ProjectDoc
  fit: GameBox
  drawings: Record<BoxFace, { template: FaceTemplate }>
  assetBase?: string | undefined
  motifs?: Record<string, Motif> | undefined
  look: Exclude<Look, 'net'>
  // The net the faces fold up from and back onto: its panels say where each face lies.
  net(): HTMLElement | null
  onFolded(): void
  // A side was pressed, or the designer asked for the net: unfold, with that side chosen.
  onUnfold(face: BoxFace | null): void
  onUnfolded(): void
  onSettled(): void
  onShare?: (() => void) | undefined
}

// Its own chunk, with its stylesheet: nothing of it is fetched until the tab is opened.
export default BoxShow

export function BoxShow({ doc, fit, drawings, assetBase, motifs, look, net, onFolded, onUnfold, onUnfolded, onSettled, onShare }: BoxShowProps) {
  const t = useT()
  const mm = useMm()
  const scene = useMemo(() => showScene(fit.size, fit.card, fit.deckMm, PX), [fit])
  // The first card of the deck, front and back, as the wall draws it.
  const first = doc.rows[0]?.fields ?? {}
  const cardFront = doc.template.faces['front']
  const cardBack = doc.template.faces['back']
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, assetBase), [doc.icons, assetBase])
  const fonts = useMemo(() => {
    const faces: Record<string, FaceTemplate> = Object.fromEntries(BOX_ORDER.map((f) => [`box.${f}`, drawings[f].template]))
    if (cardFront) faces['front'] = cardFront
    if (cardBack) faces['back'] = cardBack
    return previewFonts({ template: { faces }, fonts: doc.fonts }, assetBase)
  }, [drawings, cardFront, cardBack, doc.fonts, assetBase])

  const root = useRef<HTMLDivElement | null>(null)
  const middle = useRef<HTMLDivElement | null>(null)
  const turning = useRef<HTMLDivElement | null>(null)
  const room = useRef<HTMLDivElement | null>(null)
  // Where each face lies on the net, measured as the fold starts and again as it ends.
  const [flat, setFlat] = useState<Record<BoxFace, Pose> | null>(null)
  // Which of the two places the planes are in: the net or the box. The fold is the CSS transition
  // between them, so this changes once per fold and never per frame.
  const [pose, setPose] = useState<'net' | 'show'>(look === 'folding' ? 'net' : 'show')
  // Laid on the net without moving there: until the planes have been drawn once where the net is,
  // a change of place is a jump and not a fold.
  const [instant, setInstant] = useState(look === 'folding')
  const fitted = useFit(room, scene)

  // The angle, and the turning of its own, held outside React: they change every frame and only
  // ever write a transform and two opacities.
  const angle = useRef({ rx: REST.rx as number, ry: REST.ry as number, base: REST.ry as number, since: null as number | null, heldUntil: 0 })
  const lights = useRef(new Map<string, { plane: Plane; gloss: number; shade: HTMLElement | null; shine: HTMLElement | null }>())
  const apply = () => {
    const a = angle.current
    if (turning.current) turning.current.style.transform = `rotateX(${a.rx}deg) rotateY(${a.ry}deg)`
    for (const l of lights.current.values()) {
      const { shadow, shine, shift } = lit(l.plane.normal, a.rx, a.ry, l.gloss)
      if (l.shade) l.shade.style.opacity = String(shadow)
      if (l.shine) {
        l.shine.style.opacity = String(shine)
        l.shine.style.transform = `translateX(${shift}%)`
      }
    }
  }
  const flatten = () => {
    if (turning.current) turning.current.style.transform = 'rotateX(0deg) rotateY(0deg)'
  }

  // Where the faces lie on the net, relative to the middle of the picture.
  const measure = (): Record<BoxFace, Pose> | null => {
    const sheet = net()
    const centre = middle.current?.getBoundingClientRect()
    if (!sheet || !centre) return null
    const out = {} as Record<BoxFace, Pose>
    for (const f of BOX_ORDER) {
      const panel = sheet.querySelector<HTMLElement>(`.byd-box-panel[data-face="${f}"]`)
      const r = panel?.getBoundingClientRect()
      const plane = scene.box[f]
      if (!panel || !r || r.width <= 0 || plane.width <= 0) return null
      out[f] = netPose({ x: r.left + r.width / 2 - centre.left, y: r.top + r.height / 2 - centre.top }, r.width / plane.width, f, panel.hasAttribute('data-turned'))
    }
    return out
  }

  // Folding up: the planes are laid on the net before the first paint, so the picture takes over
  // from the net without a seam; two frames later they are sent to their sides.
  useLayoutEffect(() => {
    if (look !== 'folding') return
    setInstant(true)
    setFlat(measure())
    setPose('net')
    flatten()
    let raf = requestAnimationFrame(() => {
      flushSync(() => setInstant(false))
      // The planes' place on the net is made the browser's before they are sent anywhere.
      void root.current?.getBoundingClientRect()
      raf = requestAnimationFrame(() => {
        angle.current = { ...angle.current, rx: REST.rx, ry: REST.ry, since: null }
        setPose('show')
      })
    })
    const done = setTimeout(onFolded, still() ? 0 : FOLD_MS + 32)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(done)
    }
    // Once per fold; what it reads is read at the moment it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look])

  // Unfolding: measured again, since the chosen side changed, and sent back flat.
  useLayoutEffect(() => {
    if (look !== 'unfolding') return
    setFlat(measure())
    setPose('net')
    const done = setTimeout(onUnfolded, still() ? 0 : FOLD_MS)
    return () => clearTimeout(done)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look])

  // Shown, whichever way it got there: under `prefers-reduced-motion` the fold is over before its
  // frames have come, and arriving from Mina spel there was no fold at all.
  useLayoutEffect(() => {
    if (look !== 'show') return
    setInstant(false)
    setPose('show')
    // The button that folded it is under the picture now, out of reach; the keys go to the box,
    // which the arrows turn and Escape unfolds.
    room.current?.focus({ preventScroll: true })
  }, [look])

  useEffect(() => {
    if (look !== 'settling') return
    const done = setTimeout(onSettled, still() ? 0 : SETTLE_MS)
    return () => clearTimeout(done)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look])

  // The turn and the light follow the pose: up on its angle and lit, or flat and unlit.
  useLayoutEffect(() => {
    if (pose === 'show') apply()
    else flatten()
  }, [pose])

  // The calm turn of its own. It runs only while the box is shown, is seen, and nobody holds it,
  // and never under `prefers-reduced-motion`; it starts from wherever the box stands.
  useEffect(() => {
    if (look !== 'show' || still()) return
    let raf = 0
    let seen = true
    const frame = (now: number) => {
      raf = 0
      const a = angle.current
      if (document.hidden || !seen) {
        a.since = null
        return
      }
      if (now >= a.heldUntil) {
        if (a.since === null) {
          a.since = now
          a.base = a.ry
        }
        a.ry = swayed(a.base, now - a.since)
        apply()
      }
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (raf === 0) raf = requestAnimationFrame(frame)
    }
    const watch = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => {
      seen = e?.isIntersecting ?? true
      if (seen) wake()
    })
    if (root.current) watch?.observe(root.current)
    document.addEventListener('visibilitychange', wake)
    wake()
    return () => {
      cancelAnimationFrame(raf)
      watch?.disconnect()
      document.removeEventListener('visibilitychange', wake)
    }
  }, [look])

  // Escape goes back to the net, from wherever the focus is in the picture.
  useEffect(() => {
    if (look !== 'show') return
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onUnfold(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [look, onUnfold])

  // Taken hold of by the pointer: a drag turns the box, and a press that did not move is a press on
  // the side under it.
  const hold = useRef<{ x: number; y: number; from: { rx: number; ry: number }; face: BoxFace | null; moved: boolean } | null>(null)
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (look !== 'show' || event.button !== 0) return
    const face = (event.target as HTMLElement).closest<HTMLElement>('[data-show-face]')?.dataset['showFace'] as BoxFace | undefined
    hold.current = { x: event.clientX, y: event.clientY, from: { rx: angle.current.rx, ry: angle.current.ry }, face: face ?? null, moved: false }
    angle.current.heldUntil = Infinity
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const h = hold.current
    if (!h) return
    const dx = event.clientX - h.x
    const dy = event.clientY - h.y
    if (!h.moved && Math.abs(dx) + Math.abs(dy) <= PRESS_PX) return
    h.moved = true
    const to = turnedBy(h.from, dx, dy)
    angle.current.rx = to.rx
    angle.current.ry = to.ry
    angle.current.since = null
    apply()
  }
  const up = () => {
    const h = hold.current
    hold.current = null
    angle.current.heldUntil = performance.now() + HELD_MS
    if (h && !h.moved && h.face) onUnfold(h.face)
  }
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    // Degrees up and across a press; the turn is said in the pointer's pixels, half a degree across
    // and four tenths up a pixel.
    const by: Record<string, { up: number; across: number }> = { ArrowLeft: { up: 0, across: -KEY_DEG }, ArrowRight: { up: 0, across: KEY_DEG }, ArrowUp: { up: KEY_DEG, across: 0 }, ArrowDown: { up: -KEY_DEG, across: 0 } }
    const step = by[event.key]
    if (!step || look !== 'show') return
    event.preventDefault()
    const to = turnedBy({ rx: angle.current.rx, ry: angle.current.ry }, step.across / 0.5, -step.up / 0.4)
    angle.current = { ...angle.current, rx: to.rx, ry: to.ry, since: null, heldUntil: performance.now() + HELD_MS }
    apply()
  }

  const planeAt = (f: BoxFace): Pose => (pose === 'net' && flat ? flat[f] : scene.box[f].pose)
  const lightOf = (key: string, plane: Plane, gloss: number) => (el: HTMLElement | null, part: 'shade' | 'shine') => {
    const l = lights.current.get(key) ?? { plane, gloss, shade: null, shine: null }
    l.plane = plane
    l[part] = el
    lights.current.set(key, l)
  }
  const lighting = (key: string, plane: Plane, gloss: number) => {
    const ref = lightOf(key, plane, gloss)
    return (
      <span className="byd-box-show-lit" aria-hidden="true">
        <i className="byd-box-show-shade" ref={(el) => ref(el, 'shade')} />
        {gloss > 0 && <i className="byd-box-show-shine" ref={(el) => ref(el, 'shine')} />}
        <i className="byd-box-show-wear" />
      </span>
    )
  }
  const placed = (plane: Plane, p: Pose): CSSProperties => ({ width: `${plane.width}px`, height: `${plane.height}px`, left: `${-plane.width / 2}px`, top: `${-plane.height / 2}px`, transform: poseTransform(p) })

  const cards = Math.round(fit.deckMm / fit.card.thicknessMm)
  const cardsWord = t(cards === 0 ? 'box.cards.none' : cards === 1 ? 'box.cards.one' : 'box.cards.other', { n: cards })
  // A face of the box, at the renderer's own measure; the net's panel is the same drawing made smaller.
  const face = (f: BoxFace): ReactNode => (
    <div key={f} className="byd-box-show-plane" data-show-face={f} style={placed(scene.box[f], planeAt(f))}>
      <CardPreview id={`box-show-${f}`} type={boxFaceType(fit.type, f, fit.size)} face={drawings[f].template} row={{}} icons={icons} fonts={fonts} scale={DRAWN} assetBase={assetBase} motifs={motifs} palette={doc.palette} />
      {lighting(f, scene.box[f], GLOSS[f])}
    </div>
  )
  const deckPart = (part: DeckPart, plane: Plane): ReactNode => {
    const drawn = part === 'face' ? cardFront : part === 'back' ? cardBack : undefined
    return (
      <div key={part} className="byd-box-show-plane" data-deck={part} style={{ ...placed(plane, plane.pose), ['--byd-edge' as string]: `${Math.max(1.6, fit.card.thicknessMm * PX)}px` }}>
        {drawn && <CardPreview id={`box-show-card-${part}`} face={drawn} row={first} icons={icons} fonts={fonts} scale={DRAWN} assetBase={assetBase} motifs={motifs} palette={doc.palette} />}
        {lighting(`deck-${part}`, plane, DECK_GLOSS[part])}
      </div>
    )
  }

  return (
    <div ref={root} className="byd-box-show" data-look={look} data-pose={pose} {...(flat || pose === 'show' ? {} : { 'data-unplaced': '' })} {...(instant ? { 'data-instant': '' } : {})}>
      <div className="byd-box-show-ground" aria-hidden="true" />
      <p className="byd-box-show-tip">{t('box.show.tip')}</p>
      <div
        ref={room}
        className="byd-box-show-scene"
        role="group"
        aria-label={t('box.show.scene')}
        tabIndex={look === 'show' ? 0 : -1}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={keys}
      >
        <div ref={middle} className="byd-box-show-middle">
          <div className="byd-box-show-fit" style={{ transform: `scale(${pose === 'show' ? fitted : 1})` }}>
            <div ref={turning} className="byd-box-show-turn">
              <div className="byd-box-show-floor" style={placed({ ...scene.floor, normal: [0, -1, 0] }, scene.floor.pose)} />
              {BOX_ORDER.map(face)}
              {scene.deck && DECK_ORDER.map((part) => deckPart(part, (scene.deck as Record<DeckPart, Plane>)[part]))}
            </div>
          </div>
        </div>
      </div>
      <p className="byd-box-show-name">
        <b>{doc.name}</b>
        <span>
          {cardsWord}
          {' · '}
          {t('box.show.line', { w: mm(fit.size.width), h: mm(fit.size.height), d: mm(fit.size.depth), deck: mm(fit.deckMm) })}
        </span>
      </p>
      <div className="byd-box-foot byd-box-show-foot">
        {/* Quiet, as every button but the one that puts the work on the table (#1083's language). */}
        <button type="button" className="byd-secondary" onClick={() => onUnfold(null)}>
          <PencilGlyph />
          {t('box.show.back')}
        </button>
        {onShare && (
          <button type="button" className="byd-secondary" onClick={onShare}>
            <CopyGlyph />
            {t('box.show.share')}
          </button>
        )}
        <FootSaid>
          <p className="byd-box-foot-line">
            <span className="byd-box-foot-size">
              <b>{t('box.size.line', { w: mm(fit.size.width), h: mm(fit.size.height), d: mm(fit.size.depth) })}</b>
              {' · '}
              {cardsWord}
              {' · '}
              {t(Object.values(fit.locked).some(Boolean) ? 'box.state.locked' : 'box.state.follows')}
            </span>
          </p>
        </FootSaid>
      </div>
    </div>
  )
}

// How much smaller the picture is drawn to fit its room, never larger than its own measure.
const ROOM_SHARE = 0.86
function useFit(room: RefObject<HTMLElement | null>, scene: { width: number; height: number }): number {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = room.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      const next = Math.min(1, (r.width * ROOM_SHARE) / scene.width, (r.height * ROOM_SHARE) / scene.height)
      setScale(Math.round(next * 1000) / 1000)
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watching = new ResizeObserver(fit)
    watching.observe(el)
    return () => watching.disconnect()
  }, [room, scene])
  return scale
}
