// PROTOTYPE — throwaway (#90). One route, four answers to one question: what is the felt in the
// button language?
//
//   /prototype/filtens-knappar?proto=N|A|B|C&yta=bord|tv&seats=2..8&scen=filt|ark
//
// L13 (2026-09-11) bound three roles — primary, secondary, chosen — on five surface roots, and
// the felt is none of them, so a `.byd-primary` laid on the felt used to resolve to nothing and
// the browser drew its own grey `buttonface`. #67 (950fcdd) has since bound `.byd-table` to the
// same green as `.byd-account`/`.byd-join`, because it needed one button — `Sätt värdet` in the
// numpad sheet — while the ring's discs in `table.css` still speak their own dialect. That
// binding was made by whoever needed it first rather than as a considered surface in the
// language, which is the thing #90 says must not happen.
//
// So the four variants are not settings. Each is a whole position on what the felt IS:
//
//   N  Nuläget — main exactly as it stands: `.byd-table` borrowing the account's green, the
//      ring's discs in their own dialect. The baseline, with the inconsistency in the picture.
//   A  Filten är ett rum med egen accent — the felt binds all three roles to an accent it owns,
//      out of K9's own palette, and the ring's discs come into the same three roles.
//   B  Filten lånar spelarens rum — the felt binds the player's accent, so a verb looks the same
//      in the hand and on the table.
//   C  Filten står utanför språket — like `status.css`: the felt's controls are a dialect of
//      their own, L13 gains a sentence saying so, and nothing on the felt wears a role class.
//
// Nothing here sends an intent to a server. The value is local state, which is what a prototype's
// mutation should be; what the real client sends is `setCounter` with an absolute value.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_PLAYERS } from '@byd/server/doc'
import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { TableRenderer } from '../../table/TableRenderer.js'
import { TvChrome } from '../../table/TvChrome.js'
import { CounterEntry } from '../../table/CounterEntry.js'
import { RadialMenu, type RadialItem } from '../../table/RadialMenu.js'
import { ringCentre } from '../../table/ring.js'
import { counterActs, ownerOf, verbsFor } from '../../table/keyboard.js'
import { isCounter } from '../../components.js'
import { layout, seatNameOf, stageOf, type VariantKey } from './stage.js'
import { read, type Reading, type Sample } from './measure.js'
import { Switcher, type Mode, type Scene, type Variant } from './Switcher.js'
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
  { key: 'A', name: 'Filten är ett rum med egen accent' },
  { key: 'B', name: 'Filten lånar spelarens rum' },
  { key: 'C', name: 'Filten står utanför språket' },
]

// N, A and B are rooms in the language and their root says so. C is not, which is the position:
// a role class inside C resolves to nothing, exactly as the felt did before #67.
const IN_THE_LANGUAGE = new Set<VariantKey>(['N', 'A', 'B'])

type Anchor = { x: number; y: number }
type Anchors = { chip: Anchor; card: Anchor; felt: Anchor }

export function FeltButtonsPrototype() {
  const params = new URLSearchParams(location.search)
  const [proto, setProto] = useState<VariantKey>((params.get('proto') as VariantKey) ?? 'N')
  const [mode, setMode] = useState<Mode>((params.get('yta') as Mode) ?? 'bord')
  const [scene, setScene] = useState<Scene>((params.get('scen') as Scene) ?? 'filt')
  const [seats, setSeats] = useState(Math.min(MAX_PLAYERS, Math.max(2, Number(params.get('seats')) || 4)))
  const [values, setValues] = useState<Record<string, number>>({})
  const [anchors, setAnchors] = useState<Anchors | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [sheet, setSheet] = useState<HTMLElement | null>(null)
  // The invented chosen control: whether the keys say the value outright or say how much to
  // change it by. The felt has no two-way choice of its own yet, so there is nothing real to hang
  // the third role on; this pair exists so that all three roles stand in one view, and NOTES says
  // it is an invention.
  const [writing, setWriting] = useState<'satt' | 'andra'>('satt')
  // The probe (`byd-proto-probe`): the three roles laid straight on the felt's green. Nothing on
  // the felt wears a role today — the only primary in the product is inside the sheet, on the
  // sheet's own dark — so without this the accent would never be measured as a FILL on the felt,
  // which is the whole of #90. `button-language.test.tsx` uses the same trick for the opposite
  // reason: a probe is how a surface is asked what it binds. It is the prototype's instrument and
  // NOTES says so.
  const [showing, setShowing] = useState(true)
  const stage = useRef<HTMLDivElement | null>(null)

  const setup = useMemo(() => layout(seats), [seats])
  const base = useMemo(() => stageOf(setup), [setup])
  const view: Snapshot | null = useMemo(() => {
    if (!base) return null
    return { ...base, components: base.components.map((c) => (values[c.id] === undefined ? c : { ...c, counter: values[c.id] as number })) }
  }, [base, values])

  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('proto', proto)
    url.searchParams.set('yta', mode)
    url.searchParams.set('seats', String(seats))
    url.searchParams.set('scen', scene)
    history.replaceState(null, '', url)
  }, [proto, mode, seats, scene])

  // Where the two rings open. Not a guess and not a fixed pair of coordinates: the felt is laid
  // out by the renderer and fitted to the window, so the anchors are read off the nodes it drew.
  //
  // The counter's ring opens on the HIGHEST chip on the screen — the seat at the far rim — where
  // every disc lands on the felt's green. The card's ring opens on the LOWEST card, at the near
  // rim, where the discs reach off the felt, over the wooden rim and onto the dark beyond it.
  // Three grounds in one shot is the point: L13 asks for the ratio against the surface a thing
  // actually lands on, and taking both rings at the middle of the felt would answer for one
  // ground and quietly claim the other two. Far rim and near rim also keeps the two rings from
  // lying on each other at every seat count.
  useEffect(() => {
    const root = stage.current
    if (!root) return
    const mid = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom }
    }
    const table = root.querySelector('[data-table]')
    const tokens = [...root.querySelectorAll('.byd-token')].map(mid)
    const cards = [...root.querySelectorAll('.byd-card')].map(mid)
    if (!table || tokens.length === 0 || cards.length === 0) return
    const chip = tokens.reduce((a, b) => (b.y < a.y ? b : a))
    const card = cards.reduce((a, b) => (b.bottom > a.bottom ? b : a))
    const next: Anchors = {
      chip: ringCentre({ x: chip.x, y: chip.y }, { w: window.innerWidth, h: window.innerHeight }),
      card: ringCentre({ x: card.x, y: card.y }, { w: window.innerWidth, h: window.innerHeight }),
      felt: mid(table),
    }
    setAnchors((prev) => (prev && near(prev, next) ? prev : next))
  })

  // The sheet is the product's own `CounterEntry` and takes no children, so the invented choice is
  // portalled into the node it draws. A prototype may reach into a component it is judging; the
  // real change would be a control the component itself owns.
  useEffect(() => {
    const found = scene === 'ark' ? ((stage.current?.querySelector('[data-set-value]') as HTMLElement | null) ?? null) : null
    setSheet((prev) => (prev === found ? prev : found))
  })

  useEffect(() => {
    const id = setTimeout(() => stage.current && setReading(read(stage.current)), 320)
    return () => clearTimeout(id)
  })

  // One implementation of the measurement, used by the note at the bottom of the screen and by
  // `shots.mjs`, which hands in a sampler built out of a real screenshot.
  useEffect(() => {
    const w = window as unknown as { proto90?: (sample?: Sample) => Reading | null }
    w.proto90 = (sample?: Sample) => (stage.current ? read(stage.current, sample) : null)
    return () => {
      delete w.proto90
    }
  })

  if (!view) return <p style={{ color: '#fff' }}>Setupen går inte att bygga.</p>

  const send = (intents: Intent[]) => {
    for (const i of intents) if (i.v === 'setCounter' && typeof i.component === 'string') setValues((v) => ({ ...v, [i.component as string]: i.value }))
  }

  const chips = view.components.filter(isCounter)
  const chip: VisibleComponentState | undefined = chips[0]
  const card = view.components.find((c) => !isCounter(c) && c.zone.startsWith('mine:'))

  const counterItems: RadialItem[] = chip
    ? counterActs(chip).map((a): RadialItem => {
        const acts = a.intents
        // `Sätt värde…` is the door to the sheet, here as in the product.
        if (a.set) return { label: a.label, run: () => setScene('ark') }
        return { label: a.label, run: acts !== null && acts.length > 0 ? () => send(acts) : null }
      })
    : []
  const cardItems: RadialItem[] = card
    ? verbsFor(view, { key: `card:${card.id}`, kind: 'card', id: card.id, name: card.cardRef ?? 'Kort', zone: card.zone }).map((a): RadialItem => ({ label: a.label, run: a.intents === null ? null : () => undefined }))
    : []

  const inLanguage = IN_THE_LANGUAGE.has(proto)
  const felt =
    mode === 'tv' ? (
      <div className="byd-fit">
        <TvChrome view={view} activity={[]} roomCode="PROTO" title="Prototyp · filtens knappar" version="rev-0">
          <TableRenderer view={view} mode="tv" camera onAct={send} />
        </TvChrome>
      </div>
    ) : (
      <div className="byd-fit">
        <h1 className="byd-table-plate">Prototyp · filtens knappar · PROTO</h1>
        <TableRenderer view={view} mode="table" onAct={send} />
      </div>
    )

  const note = reading
    ? `${reading.count} knappar · svagast text ${reading.worstText ?? '–'}:1 · svagast linje/stapel ${reading.worstLine ?? '–'}:1 · ${reading.failures.length} under gränsen${reading.sampled ? '' : ' (~ beräknad grund)'}`
    : ''

  return (
    <div ref={stage} className={`byd-proto-page ${inLanguage ? 'byd-table' : 'byd-felt-dialect'}`} data-proto={proto} data-proto-mode={mode} data-proto-scene={scene}>
      <style>{variantsCss}</style>
      {felt}

      {/* The probe: the three roles laid on the felt's own green, in the middle of the floor. In C
          they carry no role class at all — that is C's position — and the dialect draws them from
          an attribute instead. */}
      {scene === 'filt' && anchors && (
        <div className="byd-proto-probe" style={{ left: anchors.felt.x, top: anchors.felt.y }}>
          <button type="button" className={inLanguage ? 'byd-primary' : undefined} data-felt-role="primar">
            Dela ut
          </button>
          <button type="button" className={inLanguage ? 'byd-secondary' : undefined} data-felt-role="sekundar">
            Blanda
          </button>
          <button type="button" className={inLanguage ? 'byd-choice' : undefined} data-felt-role="valt" aria-pressed={showing} onClick={() => setShowing((v) => !v)}>
            Visa värden
          </button>
        </div>
      )}

      {/* The two rings, both held open at once. Their backdrops are made to let the pointer
          through, because two of them stacked would otherwise swallow the ring underneath — a
          prototype's own doing and nothing the product does. */}
      {scene === 'filt' && anchors && chip && (
        <RadialMenu
          id="raknare"
          x={anchors.chip.x}
          y={anchors.chip.y}
          items={counterItems}
          hub={
            <>
              <b>{chip.counter ?? 0}</b>
              <span>{chip.cardRef ?? ''}</span>
              <i>{ownerOf(view, chip) ?? ''}</i>
            </>
          }
          onClose={() => undefined}
        />
      )}
      {scene === 'filt' && anchors && card && (
        <RadialMenu id="kort" x={anchors.card.x} y={anchors.card.y} items={cardItems} onClose={() => undefined} />
      )}

      {scene === 'ark' && chip && <CounterEntry view={view} c={chip} onSet={(value) => send([{ v: 'setCounter', component: chip.id, value }])} onClose={() => setScene('filt')} />}
      {sheet !== null &&
        createPortal(
          <div className="byd-proto-choice" role="group" aria-label="Hur värdet skrivs">
            <button type="button" className="byd-choice" aria-pressed={writing === 'satt'} onClick={() => setWriting('satt')}>
              Sätt till
            </button>
            <button type="button" className="byd-choice" aria-pressed={writing === 'andra'} onClick={() => setWriting('andra')}>
              Ändra med
            </button>
          </div>,
          sheet,
        )}

      <Switcher variants={VARIANTS} current={proto} onVariant={(k) => setProto(k as VariantKey)} mode={mode} onMode={setMode} scene={scene} onScene={setScene} seats={seats} onSeats={setSeats} maxSeats={MAX_PLAYERS} note={note} />
    </div>
  )
}

const near = (a: Anchors, b: Anchors): boolean =>
  (['chip', 'card', 'felt'] as const).every((k) => Math.abs(a[k].x - b[k].x) < 0.5 && Math.abs(a[k].y - b[k].y) < 0.5)

export { seatNameOf }
