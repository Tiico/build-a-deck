import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import { targetsOf } from '../player/PlaySheet.js'
import { TableRenderer, type FeltFit, type TableHandle } from '../table/TableRenderer.js'
import { previewOf } from '../setup/preview.js'
import { MAX_PLAYERS, type Counter, type Geometry, type Setup, type Zone } from '@byd/server/doc'
import type { ProjectClient } from './ProjectClient.js'
import type { ZonePatch } from '@byd/server/doc'
import { useT, type T } from '../i18n/index.js'
import { recipeWords } from './fields.js'
import { useGesture } from './gesture.js'
import { CardPreview } from './CardPreview.js'
import { ZoneActions } from './ZoneActions.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'

// The setup editor (B5, K2). The table is the designer's: the recipe laid the first one out and
// then let go, so what stands here stands here because they left it standing. The list on the left
// is every zone the table has, which is the only way to reach one that lies under another; the
// felt beside it is the real renderer fed by the setup, so what the designer sees is what the
// screen will show; and the phone's sheet under it shows what a player gets.
//
// What cannot go, and why each one: the felt is the table itself, a seat *is* a hand (C3), and the
// deck has to lie in some pile — which is why the deck is a role a pile carries and not a zone, and
// why moving the role is the way to be rid of the pile the wizard laid out.
export type SetupEditorProps = {
  doc: ProjectDoc
  client: ProjectClient
  // Where the project's images are served from (E1), and what is drawn inside each picture — the
  // same two the wall and the canvas compile a card with. The felt compiles the deck's back, so
  // a back made of a picture is a picture here too and not an empty box.
  assetBase?: string | undefined
  motifs?: Record<string, Motif> | undefined
  // What stands in the third column, beside the felt rather than a screenful under it (#126): the
  // list of tables the game is being played at. The setup owns the tab's layout — it is the one
  // that knows there are three columns — so the list is handed to it rather than dropped after it.
  beside?: ReactNode
}

const PILE_MM = { w: 63, h: 88 }
// What one CSS millimetre is worth in pixels. A compiled card is laid out in millimetres, the
// felt in pixels, and this is the rate between them — so the zoom that makes the back the size of
// the card it lies on is the felt's own millimetre divided by this one.
const CSS_MM_PX = 96 / 25.4
const SNAP_MM = 5
// How far a pasted copy lands from the zone it was copied from, in table millimetres. A copy that
// lay exactly on the original could not be pointed at, and the list would show two rows that
// looked the same for two things in the same place.
const BESIDE_MM = 10

// Whether a key press belongs to something being written in rather than to the table. Read off
// the event as well as off the focus: the focus is what a browser moves when a field is typed
// in, and the event's own target is what the press actually landed on — a press dispatched at a
// field that has not taken focus yet is still that field's.
// One rule, read by Delete and by cut/copy/paste, so the two cannot disagree about what a key
// press is for.
function inAField(e: KeyboardEvent): boolean {
  const on = [e.target, document.activeElement].filter((n): n is HTMLElement => n instanceof HTMLElement)
  return on.some((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}
const NUDGE_MM = 10
const MIN_MM = 40

export function SetupEditor({ doc, client, assetBase, motifs, beside }: SetupEditorProps) {
  const t = useT()
  const setup = doc.setup
  const [selected, setSelected] = useState<string | null>(null)
  // What the last step back would take back, said where the removal happened rather than only in
  // the header: a zone that went by mistake is one press from standing again.
  const [undoable, setUndoable] = useState<string | null>(null)
  // What the last key press said, when it was not a removal: a copy taken, or a refusal with its
  // reason. It stands where the removal's own word stands, because it is the same kind of news.
  const [said, setSaid] = useState<string | null>(null)
  // The editor's own clipboard, and what the key handler needs to read without being rebuilt on
  // every keystroke the panel beside it takes.
  const clipboard = useRef<Zone | null>(null)
  const view = previewOf(doc)
  const selectedZone = setup.zones.find((z) => z.id === selected)
  const remove = (zone: Zone) => {
    client.removeZone(zone.id)
    setUndoable(zone.name)
    setSaid(null)
    if (selected === zone.id) setSelected(null)
  }
  const keys = useRef({ selected, setup, client, remove, t })
  keys.current = { selected, setup, client, remove, t }
  const add = (kind: 'area' | 'pile') => {
    setSelected(client.addZone(kind, t))
    setUndoable(null)
  }
  // Cut, copy and paste, bound to the window for the reason Delete already is: a handle on the
  // felt never has the focus, because the pointer that selects it is the pointer that starts a
  // drag. The clipboard is the editor's own and not the machine's — what is copied is a zone with
  // everything it carries, which is not a thing another program could be handed anyway.
  //
  // Copying a zone is the cheap half of an action: the expensive half is writing what the pile
  // can be asked for, and a copy carries that with it, because a step addresses *this pile* and
  // never a zone by name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'c' && key !== 'x' && key !== 'v') return
      if (inAField(e)) return
      const now = keys.current
      if (key === 'v') {
        const held = clipboard.current
        if (!held) return
        e.preventDefault()
        const geometry = { ...held.geometry, x: held.geometry.x + held.geometry.w + BESIDE_MM }
        setSelected(now.client.insertZone({ ...held, name: now.t('zone.copy', { name: held.name }), geometry }))
        setSaid(null)
        return
      }
      const zone = now.setup.zones.find((z) => z.id === now.selected)
      if (!zone) return
      e.preventDefault()
      // A hand is its seat's (C3), so it is never something to lay down a second copy of.
      if (zone.kind === 'hand') {
        setSaid(now.t('setup.fixed.hand'))
        return
      }
      if (key === 'x') {
        const why = fixed(now.setup, zone, now.t)
        if (why !== null) {
          setSaid(why)
          return
        }
        clipboard.current = zone
        now.remove(zone)
        return
      }
      clipboard.current = zone
      setSaid(now.t('setup.copied', { name: zone.name }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="byd-setup" data-setup-editor>
      <div className="byd-setup-side">
        <SeatsPanel client={client} setup={setup} />
        <ZoneList setup={setup} selected={selected} onSelect={setSelected} onRemove={remove} onPatch={(id, patch, gesture) => client.patchZone(id, patch, gesture)} onDeck={(id) => client.setDeck(id)} />
        <div className="byd-setup-tools">
          <button type="button" onClick={() => add('area')}>{t('setup.addArea')}</button>
          <button type="button" onClick={() => add('pile')}>{t('setup.addPile')}</button>
          <button type="button" onClick={() => client.addSeatZone('mine', t)}>{t('setup.addSeatArea')}</button>
          <button type="button" onClick={() => client.addSeatZone('counters', t)}>{t('setup.addSeatCounters')}</button>
        </div>
      </div>
      <div className="byd-setup-canvas">
        <div className="byd-setup-said" data-setup-said>
          {undoable && (
            <span className="byd-setup-undo" role="status">
              {t('setup.removed', { name: undoable })}
              <button
                type="button"
                onClick={() => {
                  client.undo()
                  setUndoable(null)
                }}
              >
                {t('setup.undo')}
              </button>
            </span>
          )}
          {said && (
            <span className="byd-setup-said-word" role="status">
              {said}
            </span>
          )}
          <span>{t('setup.hint')}</span>
        </div>
        {view ? (
          <Felt
            view={view}
            doc={doc}
            assetBase={assetBase}
            motifs={motifs}
            setup={setup}
            selected={selected}
            onSelect={(id) => {
              setSelected(id)
              setUndoable(null)
            }}
            onGeometry={(id, geometry, gesture) => client.patchZone(id, { geometry }, gesture)}
            onRemove={remove}
          />
        ) : (
          <p role="alert" className="byd-setup-invalid">{t('setup.invalid')}</p>
        )}
        {/* What the selected pile starts with and what it can be asked for (B5, K14), written as
            sentences. Only a pile: an area and a hand have no ring to hang an action in, and a
            hand's contents are the seat's and not the designer's (C3). */}
        {selectedZone?.kind === 'pile' && (
          <ZoneActions doc={doc} zone={selectedZone} onPatch={(patch, gesture) => client.patchZone(selectedZone.id, patch, gesture)} />
        )}
      </div>
      {/* The third column: what a player is given, and the tables the game is running at. Both
          were under the felt before, a screenful down, where the designer had to leave the setup
          to reach them (#126). */}
      <div className="byd-setup-beside">
        {view && <SheetPreview view={view} seat={setup.seats[0] ?? null} />}
        {beside}
      </div>
    </div>
  )
}

// Why a zone cannot be taken away, in the words that say what to do instead — or nothing at all,
// which means it can go. One rule, read by the list, by the felt's Delete and by the actor, so the
// three never disagree about what the table cannot be without.
function fixed(setup: Setup, zone: Zone, t: T): string | null {
  if (zone.id === setup.floor) return t('setup.fixed.floor')
  if (zone.kind === 'hand') return t('setup.fixed.hand')
  if (zone.id === setup.deckZone) return t('setup.fixed.deck')
  return null
}

// The knob the recipe still owns: who sits at the table, and what each seat keeps count of.
function SeatsPanel({ client, setup }: { client: ProjectClient; setup: Setup }) {
  const t = useT()
  const recipe = client.recipe
  // The counters are the only knobs written into a letter at a time; the rest are turned once and
  // are a step back each, as they always were (L14).
  const typing = useGesture('counter-field')
  const turn = (patch: Partial<typeof recipe>, gesture?: string) => client.setRecipe({ ...recipe, ...patch }, recipeWords(t), gesture)
  const setCounter = (i: number, patch: Partial<Counter>) => turn({ counters: recipe.counters.map((c, j) => (j === i ? { ...c, ...patch } : c)) }, typing.token())
  // Counters lie in the seats' counters zones (C4). A game whose seats have none draws no chips,
  // however long the list is, so the panel says so where the list is rather than leaving the
  // designer to wonder why the table looks the same.
  const homeless = recipe.counters.length > 0 && !setup.seats.some((s) => setup.zones.some((z) => z.id === `counters:${s}`))
  return (
    <aside className="byd-setup-recipe">
      <section>
        <h2 id="byd-setup-players">{t('setup.players')}</h2>
        <div className="byd-setup-players" role="group" aria-labelledby="byd-setup-players">
          {/* Every seat count the table can actually hold. It stopped at six while `MAX_PLAYERS`
              was eight, so the two counts a designer most needed to look at — the ones where an
              edge first carries two seats (K18) — were the two nobody could reach. */}
          {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className="byd-choice" aria-pressed={recipe.players === n} onClick={() => turn({ players: n })}>
              {n}
            </button>
          ))}
        </div>
        <p className="byd-setup-hint">{t('setup.seats.hint')}</p>
      </section>
      <section>
        <div className="byd-setup-counters">
          <h2>{t('setup.counters')}</h2>
          {recipe.counters.map((c, i) => (
            <div key={i} className="byd-setup-counter">
              <input aria-label={t('setup.counter.name', { n: i + 1 })} value={c.name} {...typing.visit} onChange={(e) => setCounter(i, { name: e.target.value })} />
              <span>{t('setup.counter.from')}</span>
              <input aria-label={t('setup.counter.start', { n: i + 1 })} type="number" value={c.start} {...typing.visit} onChange={(e) => setCounter(i, { start: Math.trunc(Number(e.target.value) || 0) })} />
              <button type="button" aria-label={t('setup.counter.remove', { n: i + 1 })} onClick={() => turn({ counters: recipe.counters.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => turn({ counters: [...recipe.counters, recipe.counters.length === 0 ? { name: t('counter.score'), start: 0 } : { name: t('counter.life'), start: 20 }] })}>
            {t('setup.counter.add')}
          </button>
          {homeless && <p className="byd-setup-note" role="status">{t('setup.counters.homeless')}</p>}
          {/* A seat's counters change shape at the third one (C4, K18, #89): one or two lie side by
              side along the seat's own rim, where a finger can reach each of them and the table can
              read both at three metres; a third stacks them into one pile, because three targets of
              44 px want more room along the rim than a seat has to give without taking it from its
              neighbour. The designer cannot see that coming from the number, so it is said here,
              where the number is chosen, and before the third counter has been added. */}
          <p className="byd-setup-note">{t('setup.counter.stacks')}</p>
        </div>
      </section>
    </aside>
  )
}

// Every zone the table has, in two groups: what stands on the table, and what belongs to a seat.
// The row is the handle a keyboard can reach and the only way to a zone that lies under another;
// opening one shows what the zone is, and the × takes it away — or says, where the × would be, why
// this one stays.
function ZoneList({
  setup,
  selected,
  onSelect,
  onRemove,
  onPatch,
  onDeck,
}: {
  setup: Setup
  selected: string | null
  onSelect(id: string | null): void
  onRemove(zone: Zone): void
  onPatch(id: string, patch: ZonePatch, gesture?: string): void
  onDeck(id: string): void
}) {
  const t = useT()
  const groups: [string, Zone[]][] = [
    [t('setup.group.table'), setup.zones.filter((z) => z.owner === undefined)],
    [t('setup.group.seats'), setup.zones.filter((z) => z.owner !== undefined)],
  ]
  return (
    <div className="byd-setup-zones" data-zone-list>
      {groups.map(([title, zones]) =>
        zones.length === 0 ? null : (
          <section key={title}>
            <h2>{title}</h2>
            <ul aria-label={title}>
              {zones.map((zone) => {
                const why = fixed(setup, zone, t)
                const open = selected === zone.id
                const deck = setup.deckZone === zone.id
                return (
                  <li key={zone.id} data-zone-row={zone.id} data-open={open ? 'true' : undefined}>
                    <div className="byd-setup-row">
                      <button type="button" className="byd-setup-name" aria-expanded={open} onClick={() => onSelect(open ? null : zone.id)}>
                        <i aria-hidden="true" data-kind={zone.kind} />
                        <span>{zone.name}</span>
                        {zone.owner !== undefined && <em>{zone.owner}</em>}
                        {deck && <strong>{t('setup.deck.mark')}</strong>}
                      </button>
                      {why === null ? (
                        <button type="button" className="byd-setup-x" aria-label={t('setup.remove.of', { name: zone.name })} onClick={() => onRemove(zone)}>
                          ×
                        </button>
                      ) : (
                        <span className="byd-setup-fast" title={why} aria-label={why}>
                          {t('setup.fixed')}
                        </span>
                      )}
                    </div>
                    {open && <ZoneProps zone={zone} setup={setup} why={why} onPatch={(patch, gesture) => onPatch(zone.id, patch, gesture)} onDeck={() => onDeck(zone.id)} />}
                  </li>
                )
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  )
}

// B: the felt with a handle on every zone but the floor. Dragging moves, the corner resizes,
// both in whole millimetres snapped to a small grid; the arrow keys nudge the focused one, and
// Delete takes the selected one away.
// A drag carries the token of the grab it belongs to (L14): the pointer reports one pull as a
// patch per frame, and all of those frames are one step back. The token is made where the grab
// begins, so the next grab of the same zone is the next step.
type Drag = { id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; geometry: Geometry; gesture: string }
function Felt({
  view,
  doc,
  assetBase,
  motifs,
  setup,
  selected,
  onSelect,
  onGeometry,
  onRemove,
}: {
  view: NonNullable<ReturnType<typeof previewOf>>
  doc: ProjectDoc
  assetBase?: string | undefined
  motifs?: Record<string, Motif> | undefined
  setup: Setup
  selected: string | null
  onSelect(id: string | null): void
  onGeometry(id: string, geometry: Geometry, gesture?: string): void
  onRemove(zone: Zone): void
}) {
  const t = useT()
  // What the back is compiled from, held by identity and by the parts of the document it is
  // actually made of. The wall can key these on the whole document because nothing redraws the
  // wall but the deck; the felt is dragged, and a zone moved a millimetre is a new document with
  // the same deck in it. Keyed on `doc` the back would be compiled again on every pointer move,
  // under the pile the designer is placing.
  const fonts = useMemo(() => previewFonts({ template: doc.template, fonts: doc.fonts }, assetBase), [doc.template, doc.fonts, assetBase])
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, assetBase), [doc.icons, assetBase])
  // A back that draws nothing is not a back: a game made without the guided start has an empty
  // one, and compiling it would lay a blank white card on the pile — which reads as a fault and
  // not as "no back yet". Until there is something on it the pile keeps the tool's own stand-in.
  const drawn = doc.template.faces['back']
  const backFace = drawn && (drawn.base.length > 0 || Object.keys(drawn.variants).length > 0) ? drawn : null
  // The base back and not any one card's: a pile is shuffled and does not know what is on top, and
  // the base is the back every card of the deck inherits. A deck whose groups each have a back of
  // their own (#14) shows on the felt the one they are all variations of. The row is still handed
  // in, because a back may bind a field — a deck number, an expansion mark — and the first row is
  // what the canvas shows such a back with when the designer has picked no card.
  const row = useMemo(() => doc.rows[0]?.fields ?? {}, [doc.rows])
  const table = useRef<TableHandle | null>(null)
  const drag = useRef<Drag | null>(null)
  const grabs = useGesture('zone')
  const toMm = (e: RPointerEvent) => table.current?.toTable(e.clientX, e.clientY) ?? { x: 0, y: 0 }
  const down = (e: RPointerEvent, z: Zone, mode: Drag['mode']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    drag.current = { id: z.id, mode, start: toMm(e), geometry: { ...z.geometry }, gesture: grabs.begin() }
    onSelect(z.id)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toMm(e)
    const dx = snap(p.x - d.start.x)
    const dy = snap(p.y - d.start.y)
    const g = d.geometry
    onGeometry(d.id, d.mode === 'move' ? { ...g, x: g.x + dx, y: g.y + dy } : { ...g, w: Math.max(MIN_MM, g.w + dx), h: Math.max(MIN_MM, g.h + dy) }, d.gesture)
  }
  const up = () => {
    drag.current = null
  }
  const nudge = (e: RKeyboardEvent, z: Zone) => {
    const step = e.shiftKey ? NUDGE_MM * 5 : NUDGE_MM
    const d = e.key === 'ArrowLeft' ? { x: -step, y: 0 } : e.key === 'ArrowRight' ? { x: step, y: 0 } : e.key === 'ArrowUp' ? { x: 0, y: -step } : e.key === 'ArrowDown' ? { x: 0, y: step } : null
    if (!d) return
    e.preventDefault()
    onGeometry(z.id, { ...z.geometry, x: z.geometry.x + d.x, y: z.geometry.y + d.y })
  }
  // Delete is bound to the window and not to the handle, because a handle never has the focus: the
  // pointer that selects it is the pointer that starts a drag, and the drag takes the default
  // action — focus among it — away. Bound where the focus actually is, a field being typed in is
  // the one place the key means something else.
  const state = useRef({ selected, setup, onRemove })
  state.current = { selected, setup, onRemove }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (inAField(e)) return
      const now = state.current
      const zone = now.setup.zones.find((z) => z.id === now.selected)
      if (!zone || fixed(now.setup, zone, t) !== null) return
      e.preventDefault()
      now.onRemove(zone)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t])
  const overlay = (fit: FeltFit) =>
    setup.zones
      .filter((z) => z.id !== setup.floor)
      .map((z) => {
        const box = boxOf(z)
        return (
          <div
            key={z.id}
            className="byd-setup-handle"
            role="button"
            tabIndex={0}
            aria-label={
              // The handle's whole name, since it draws none (K19): the felt underneath says what
              // the zone is called, and whose it is comes along here rather than being lost with
              // the label that used to be printed in the handle's corner.
              t('setup.zone', { name: z.owner ? `${z.name} · ${z.owner}` : z.name })
            }
            aria-pressed={selected === z.id}
            data-zone-handle={z.id}
            data-kind={z.kind}
            data-deck={z.id === setup.deckZone ? 'true' : undefined}
            style={{ left: fit.left(box.x), top: fit.top(box.y), width: fit.px(box.w), height: fit.px(box.h) }}
            onPointerDown={(e) => down(e, z, 'move')}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onClick={() => onSelect(z.id)}
            onKeyDown={(e) => nudge(e, z)}
            onFocus={() => onSelect(z.id)}
          >
            {z.kind !== 'pile' && <i className="byd-setup-corner" data-resize={z.id} onPointerDown={(e) => down(e, z, 'resize')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />}
          </div>
        )
      })
  return (
    <div className="byd-setup-felt">
      {/* The handles carry no names of their own (K19): the felt underneath already names every
          area and every pile, and `seatNames` asks it for the one name this surface would
          otherwise be missing — whose hand is whose, which the played TV gets from its dock. The
          handle keeps the name in its `aria-label`, so the keyboard and the screen reader lose
          nothing by the name no longer being drawn twice. */}
      <TableRenderer
        ref={table}
        view={view}
        mode="tv"
        overlay={overlay}
        // The deck's own back on every face-down card (L17). It goes through `compile`, the
        // one renderer there is for card templates (K9) — the same code the canvas and the wall
        // draw with — at the scale the felt is drawn in. This surface has no render farm behind
        // it and no saved version to render, so without this the pile wore a weave that belonged
        // to no game and a designer's back reached the table only after it was published.
        back={
          backFace
            ? (fit, at) => (
                <CardPreview
                  face={backFace}
                  row={row}
                  icons={icons}
                  fonts={fonts}
                  id={`byd-setup-back-${at}`}
                  scale={fit.px(1) / CSS_MM_PX}
                  assetBase={assetBase}
                  motifs={motifs}
                />
              )
            : undefined
        }
        seatNames
      />
    </div>
  )
}

// A pile is a point; its handle is a card's outline around it.
function boxOf(z: Zone): { x: number; y: number; w: number; h: number } {
  const g = z.geometry
  return z.kind === 'pile' ? { x: g.x - PILE_MM.w / 2, y: g.y - PILE_MM.h / 2, w: PILE_MM.w, h: PILE_MM.h } : { x: g.x, y: g.y, w: g.w, h: g.h }
}
const snap = (mm: number) => Math.round(mm / SNAP_MM) * SNAP_MM

// What a zone is, opened inside its row. Everything about it is the designer's — its name, its
// verb on the phone, whose it is and who sees into it — because the table is theirs; a hand is the
// exception, and the seat that owns it is the reason.
function ZoneProps({ zone, setup, why, onPatch, onDeck }: { zone: Zone; setup: Setup; why: string | null; onPatch(patch: ZonePatch, gesture?: string): void; onDeck(): void }) {
  const t = useT()
  // The two fields that are written into a letter at a time. What is chosen rather than typed —
  // where a pile is entered, whose the zone is, who may see it — is written once and is its own
  // step back, as it always was (L14).
  const typing = useGesture('zone-field')
  const floor = zone.id === setup.floor
  const hand = zone.kind === 'hand'
  const g = zone.geometry
  return (
    <div className="byd-setup-props" data-zone-props={zone.id}>
      {/* A hand has no name of its own to give. Whoever sits at it names it: the felt lays that
          seat's name card on the hand (K9, K19) and the keyboard's list of places offers it under
          the same name, so a name typed here was a string no surface ever drew — it lived in this
          field and in an `aria-label`, and nowhere else. The field is gone and the reason stands
          in its place, because a hole explains nothing (L4). */}
      {hand ? (
        <p className="byd-setup-hint">{t('setup.name.seat')}</p>
      ) : (
        <label>
          {t('setup.name')}
          <input aria-label={t('setup.name.of', { name: zone.name })} value={zone.name} {...typing.visit} onChange={(e) => onPatch({ name: e.target.value }, typing.token())} />
        </label>
      )}
      {!floor && !hand && (
        <label>
          {t('setup.shortcut')}
          <input aria-label={t('setup.shortcut.of', { name: zone.name })} placeholder={zone.name} value={zone.shortcut?.label ?? ''} {...typing.visit} onChange={(e) => onPatch({ shortcut: e.target.value ? { label: e.target.value, at: zone.shortcut?.at ?? 'top' } : undefined }, typing.token())} />
        </label>
      )}
      {zone.kind === 'pile' && (
        <>
          <label>
            {t('setup.at')}
            <select aria-label={t('setup.at.of', { name: zone.name })} value={zone.shortcut?.at ?? 'top'} onChange={(e) => onPatch({ shortcut: { label: zone.shortcut?.label ?? zone.name, at: e.target.value === 'bottom' ? 'bottom' : 'top' } })}>
              <option value="top">{t('setup.at.top')}</option>
              <option value="bottom">{t('setup.at.bottom')}</option>
            </select>
          </label>
          {/* The deck is a role a pile carries (B5, K10): a designer may call any pile the deck,
              and the cards are dealt from wherever the role is. Moving it is also the only way to
              be rid of the pile it lies in. */}
          {setup.deckZone === zone.id ? (
            <p className="byd-setup-hint">{t('setup.deck.here')}</p>
          ) : (
            <button type="button" onClick={onDeck}>
              {t('setup.deck.move', { name: zone.name })}
            </button>
          )}
        </>
      )}
      {!hand && (
        <>
          <label>
            {t('setup.owner')}
            <select aria-label={t('setup.owner.of', { name: zone.name })} value={zone.owner ?? ''} onChange={(e) => onPatch({ owner: e.target.value || undefined })}>
              <option value="">{t('setup.owner.none')}</option>
              {setup.seats.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('setup.visibility')}
            <select aria-label={t('setup.visibility.of', { name: zone.name })} value={zone.visibility} onChange={(e) => onPatch({ visibility: e.target.value === 'owner' ? 'owner' : e.target.value === 'none' ? 'none' : 'all' })}>
              <option value="all">{t('setup.visible.all')}</option>
              <option value="owner">{t('setup.visible.owner')}</option>
              <option value="none">{t('setup.visible.none')}</option>
            </select>
          </label>
        </>
      )}
      <span className="byd-setup-where" data-zone-where>
        {Math.round(g.x)}, {Math.round(g.y)}
        {zone.kind !== 'pile' ? ` · ${Math.round(g.w)} × ${Math.round(g.h)} mm` : ' mm'}
      </span>
      {why !== null && <p className="byd-setup-why">{why}</p>}
    </div>
  )
}

// What the phone shows (C4), as one seat sees it: every target with its verb, the floor last.
// A sheet belongs to a seat, so the preview is taken for the first one — another seat's own area
// is not a place this player can play to, and a zone that only holds counters is no place for a
// card at all (B6, C4). Asked for the table as a whole it listed every seat's "Framför mig" and
// every counters zone, which is a sheet no phone ever draws.
function SheetPreview({ view, seat }: { view: NonNullable<ReturnType<typeof previewOf>>; seat: string | null }) {
  const t = useT()
  const preview = targetsOf({ ...view, seat }, t)
  return (
    <div className="byd-zones-preview" data-sheet-preview>
      <h2>{t('setup.sheet.title')}</h2>
      <p>{t('setup.sheet.play')} <strong>{t('setup.sheet.oneCard')}</strong> {t('setup.sheet.to')}</p>
      <div className="byd-sheet-targets">
        {preview.map((target) => (
          <div key={target.id} role="presentation">
            <span>{target.label}</span>
            <small>{target.kind === 'pile' ? t(target.at === 'bottom' ? 'setup.sheet.bottomIn' : 'setup.sheet.topIn', { name: target.name }) : t('setup.sheet.free')}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
