import type { Intent, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { translate, type Key, type T } from '../i18n/index.js'
import { isCounter, standIn } from '../components.js'
import { CARD_MM, besidePile, type DragTarget } from './drop.js'
import { handName } from './handName.js'
import { compileAction } from './actions.js'
import type { Shortcut } from './ShortcutHelp.js'

// Everything the keyboard says is the tool's own, so it is looked up where the reader is (A4).
// A call from outside React — a test, a label built before a provider is mounted — gets Swedish,
// which is what the catalogue is written in.
const swedish: T = (key, params) => translate('sv', key, params)

// Playing with a keyboard, variant C — "adressen" (#1, #2). Everything on the felt and in the
// hand is a control with a name; Enter opens a panel of what can be done and where it can go.
//
// Every name here comes out of `project` in `packages/engine`, the same filter the wire is
// tested on (B6, D1, D4). A card this view may not see has no `cardRef` to read, so it is
// `Dolt kort` and nothing more — not because this file hides it, but because there is nothing
// here to hide. The keyboard therefore learns exactly what the pointer learns.

// What a keyboard may stand on, in reading order: down the felt, then across. Hands are not
// here — they are destinations with names, not places to stand.
// A counter stands on the felt where a card does and travels the same way, so it carries the same
// fields; what it does not share is the word a reader hears and the verbs a card has (C4, A4).
export type Thing =
  | { key: string; kind: 'card'; id: string; name: string; zone: string }
  | { key: string; kind: 'counter'; id: string; name: string; zone: string; value: number; owner: string | null }
  | { key: string; kind: 'pileTop'; pile: string; name: string }
  | { key: string; kind: 'pile'; pile: string; name: string; count: number }

// The things that are components and move by `move` — a card and a counter — as against the ones
// that are a pile or the top of one.
export const isLoose = (thing: Thing): thing is Extract<Thing, { kind: 'card' | 'counter' }> =>
  thing.kind === 'card' || thing.kind === 'counter'

// A card's own name is the designer's and is never translated (B5); the words for a card this
// view may not see are the tool's.
export const cardName = (c: VisibleComponentState | undefined, t: T = swedish): string => c?.cardRef ?? t('kbd.hidden')
export const zoneName = (view: Snapshot, id: string): string => view.zones.find((z) => z.id === id)?.name ?? id
export const countOf = (z: ZoneView): number => (z.mode === 'count' ? z.count : z.order.length)
const topIdOf = (z: ZoneView): string | undefined => (z.mode === 'order' ? z.order[0] : z.top)
export const topOf = (view: Snapshot, z: ZoneView): VisibleComponentState | undefined =>
  view.components.find((c) => c.id === topIdOf(z))

// Drawing the top card off a pile onto the felt: the ring's «Dra 1». It lands beside the pile,
// clear of its label and on the side the pile itself says (K21, #87). Written once, because the
// ring, the panel and the `D` key all mean the same thing by it and must not drift apart (K16).
export const drawOne = (z: ZoneView): Intent => ({ v: 'split', pile: z.id, at: 1, ...besidePile(z.geometry, 1, z.beside) })

// A card's place on the felt, in table millimetres, for the reading order alone.
function absolute(view: Snapshot, c: VisibleComponentState): { x: number; y: number } {
  const z = view.zones.find((x) => x.id === c.zone)
  return z ? { x: z.geometry.x + c.x, y: z.geometry.y + c.y } : { x: c.x, y: c.y }
}

// Whose a chip is: the seat that owns the zone it lies in, by whoever sits there (K19). A phone
// never has to ask — `CountersRow` only ever shows the seat's own — but the table is everybody's,
// and a chip lifted out of the felt into a ring or a panel loses the one thing that said whose it
// was: where it lay. A chip in a zone nobody owns has no one to be named after.
export function ownerOf(view: Snapshot, c: VisibleComponentState): string | null {
  const z = view.zones.find((x) => x.id === c.zone)
  if (z?.owner === undefined) return null
  return view.seats.find((s) => s.id === z.owner)?.name ?? z.owner
}

export function thingsOn(view: Snapshot, t: T = swedish): Thing[] {
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  const placed = view.components
    .filter((c) => areas.has(c.zone))
    .map((c) => ({
      at: absolute(view, c),
      thing: isCounter(c)
        ? // A counter's name is the designer's word and nothing stands in for it: a chip this view
          // may not read has no name, rather than a card's `Dolt kort` (B5, B6).
          ({ key: `counter:${c.id}`, kind: 'counter', id: c.id, name: c.cardRef ?? '', zone: c.zone, value: c.counter ?? 0, owner: ownerOf(view, c) } satisfies Thing)
        : ({ key: `card:${c.id}`, kind: 'card', id: c.id, name: cardName(c, t), zone: c.zone } satisfies Thing),
    }))
  const piles = view.zones
    .filter((z) => z.kind === 'pile')
    .flatMap((z) => {
      const at = { x: z.geometry.x, y: z.geometry.y }
      return [
        { at, thing: { key: `top:${z.id}`, kind: 'pileTop' as const, pile: z.id, name: cardName(topOf(view, z), t) } },
        { at, thing: { key: `pile:${z.id}`, kind: 'pile' as const, pile: z.id, name: z.name, count: countOf(z) } },
      ]
    })
  return [...placed, ...piles]
    .sort((a, b) => (Math.abs(a.at.y - b.at.y) > 45 ? a.at.y - b.at.y : a.at.x - b.at.x))
    .map((e) => e.thing)
}

// The sentence a reader hears when focus lands on a thing.
export function labelOf(view: Snapshot, thing: Thing, t: T = swedish): string {
  if (thing.kind === 'counter') {
    const said = { zone: zoneName(view, thing.zone), n: thing.value }
    return thing.name === '' ? t('kbd.counter.unnamed', said) : t('kbd.counter', { name: thing.name, ...said })
  }
  if (thing.kind === 'card') {
    const c = view.components.find((x) => x.id === thing.id)
    const turned = c !== undefined && c.rot % 360 !== 0
    return t(turned ? 'kbd.card.rotated' : 'kbd.card', { name: thing.name, zone: zoneName(view, thing.zone) })
  }
  if (thing.kind === 'pileTop') {
    const z = view.zones.find((x) => x.id === thing.pile)
    const zone = zoneName(view, thing.pile)
    return z && countOf(z) === 0 ? t('kbd.pile.empty', { zone }) : t('kbd.pile.top', { zone, name: thing.name })
  }
  return t(thing.count === 1 ? 'kbd.pile.whole.one' : 'kbd.pile.whole.other', { zone: zoneName(view, thing.pile), n: thing.count })
}

// What every node on the felt is called, keyed the way the renderer knows it. The sentence ends
// by saying what Enter does, because a control that opens a panel should say so.
export function feltLabels(view: Snapshot, t: T = swedish): Map<string, string> {
  return new Map(thingsOn(view, t).map((thing) => [thing.key, t('kbd.enter', { label: labelOf(view, thing, t) })]))
}

// ================================================================================================
// The verbs. The vocabulary in `packages/protocol` is closed and physical, so the keyboard says
// exactly the verbs the pointer's ring says and never a new one: `move`, `stack`, `split`,
// `movePile`, `flip`, `rotate`, `shuffle`, `reveal`.

// An action the panel offers. `intents` is null when the table cannot be asked for it right now
// — an empty pile has nothing to shuffle — and `look` is the one entry that sends nothing and
// only opens the card on this screen (K8).
// `look` is the card to hold up: an id the view knows, or the card itself when the view was
// handed none — a face-down bottom card (K23) is only a back the zone described.
export type Act = { key: string; label: string; hint?: string; intents: Intent[] | null; look?: string | VisibleComponentState; set?: string }

// What a counter can be asked to do (C4, #67): one step either way, and a number said outright.
// The same three things the phone's `CountersRow` offers and nothing more — not a step of five,
// which is a game's rule and not the tool's (B5); not a reset, since the projection carries no
// `start` to go back to; not "take the chip away", which K5 says is no verb at all. This is ONE
// list read by the ring the hand opens and by the panel the keyboard opens, so the two cannot
// drift apart. `setCounter` takes an absolute value, so "+1" is arithmetic done before speaking.
// `set` is the one entry that sends nothing and opens the value entry on this screen instead.
export function counterActs(c: VisibleComponentState, t: T = swedish): Act[] {
  const now = c.counter ?? 0
  const to = (value: number): Intent[] => [{ v: 'setCounter', component: c.id, value }]
  return [
    { key: 'minus', label: t('ring.counter.minus'), hint: t('kbd.hint.counter.becomes', { n: now - 1 }), intents: to(now - 1) },
    { key: 'plus', label: t('ring.counter.plus'), hint: t('kbd.hint.counter.becomes', { n: now + 1 }), intents: to(now + 1) },
    { key: 'set', label: t('ring.counter.set'), hint: t('kbd.hint.counter.set'), intents: [], set: c.id },
  ]
}

export function verbsFor(view: Snapshot, thing: Thing, t: T = swedish): Act[] {
  // A card's verbs are not a counter's: a chip has no face to turn, no back to reveal and nothing
  // to look at up close. It has a value, and that is what its verbs are about.
  if (thing.kind === 'counter') {
    const c = view.components.find((x) => x.id === thing.id)
    return c ? counterActs(c, t) : []
  }
  if (thing.kind === 'card') {
    const c = view.components.find((x) => x.id === thing.id)
    if (!c) return []
    return [
      { key: 'flip', label: t('ring.flip'), intents: [{ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' }] },
      { key: 'rotate', label: t('kbd.verb.rotate'), intents: [{ v: 'rotate', component: c.id, rot: (c.rot + 90) % 360 }] },
      { key: 'reveal', label: t('ring.reveal'), hint: t('kbd.hint.reveal'), intents: c.cardRef === null ? [{ v: 'reveal', components: [c.id] }] : null },
      { key: 'look', label: t('ring.look'), hint: t('kbd.hint.look'), intents: [], look: c.id },
    ]
  }
  const z = view.zones.find((x) => x.id === thing.pile)
  if (!z) return []
  const n = countOf(z)
  const top = topOf(view, z)
  if (thing.kind === 'pileTop') {
    return [
      // The top is flipped by naming the pile (K15) — a hidden pile grants no id to say instead.
      { key: 'flipTop', label: t('ring.flipTop'), intents: n > 0 ? [{ v: 'flip', component: { top: z.id }, face: top?.face === 'front' ? 'back' : 'front' }] : null },
      { key: 'look', label: t('kbd.verb.lookTop'), hint: t('kbd.hint.look'), intents: top ? [] : null, ...(top ? { look: top.id } : {}) },
    ]
  }
  return [
    { key: 'shuffle', label: t('ring.shuffle'), intents: n > 1 ? [{ v: 'shuffle', pile: z.id }] : null },
    // The ring's «Dra 1», in the panel and in the ring's own order (#224). It is here because of
    // the caveat the shortcuts were decided under: `D` draws from the pile under the pointer, and
    // a command that needs a pointer cannot be the only way to draw a card. Without this row a
    // seat with no mouse — and the table's own screen, which has no hand to draw into — had the
    // ring's four verbs and the keyboard's three.
    { key: 'draw', label: t('ring.draw'), intents: n > 0 ? [drawOne(z)] : null },
    ...(view.seat === null ? [] : [{ key: 'toHand', label: t('kbd.verb.toHand'), intents: n > 0 ? [{ v: 'split' as const, pile: z.id, at: 1, to: `hand:${view.seat}` }] : null }]),
    { key: 'half', label: t('ring.half'), hint: t('kbd.hint.half'), intents: n > 1 ? [{ v: 'split', pile: z.id, at: Math.ceil(n / 2), ...besidePile(z.geometry, Math.ceil(n / 2), z.beside) }] : null },
    // The pile's bottom card (K23), let out under the pile on the felt and held up from here so
    // the keyboard sees what the pointer sees (K16). Only a pile that has one offers it.
    ...(z.bottom === undefined ? [] : [{ key: 'lookBottom', label: t('kbd.verb.lookBottom'), hint: t('kbd.hint.look'), intents: [], look: z.bottom.id ?? standIn(`bottom:${z.id}`, z.id, z.bottom.back) }]),
    // And what the game itself hangs on this pile (K14, extended), after the tool's own verbs and
    // in the designer's own words. The panel reads the same list the sheet under the ring reads
    // and compiles it the same way, so the hand and the keyboard cannot be offered different
    // things about one pile (K16) — the reason an action cannot be asked for included, in the same
    // words. An action that needs a number typed is not offered here yet; it is offered switched
    // off, saying that it wants one.
    ...(z.actions ?? []).map((a): Act => {
      const made = compileAction(view, z.id, a)
      const hint = made.ok ? undefined : 'asks' in made ? t('kbd.hint.action.asks') : t(`ring.action.why.${made.why}` as Key)
      return { key: `action:${a.id}`, label: a.label, intents: made.ok ? made.intents : null, ...(hint === undefined ? {} : { hint }) }
    }),
  ]
}

// ================================================================================================
// The address itself: the places that have a name at all. Zones by their names, the piles, the
// hands, the floor as "Bordet", and every loose card as "På <kort>", which is `stack` (K1).

export type Place = {
  key: string
  label: string
  hint: string
  zone: string
  kind: 'area' | 'pile' | 'hand' | 'card'
  anchor?: VisibleComponentState
}

export function placesFor(view: Snapshot, moving: ReadonlySet<string>, sourceZone: string | null, t: T = swedish): Place[] {
  // A hand nobody is sitting at is not a place to put a card: it would be handed to no one, and
  // it has no name to be offered under either.
  const seated = new Set(view.seats.filter((s) => s.name !== null).map((s) => s.id))
  // The same two rules the phone's sheet keeps (C4): a seat is never offered another seat's own
  // area — the table itself, which has no seat, sees them all — and a zone that holds nothing
  // but counters is not a place for cards at all.
  const byZone = new Map<string, VisibleComponentState[]>()
  for (const c of view.components) byZone.set(c.zone, [...(byZone.get(c.zone) ?? []), c])
  const countersOnly = (id: string) => {
    const inside = byZone.get(id) ?? []
    return inside.length > 0 && inside.every(isCounter)
  }
  const zones: Place[] = view.zones
    .filter((z) => !(z.kind === 'area' && z.id === view.floor))
    .filter((z) => z.kind !== 'hand' || (z.owner !== undefined && seated.has(z.owner)))
    .filter((z) => view.seat === null || z.kind === 'hand' || z.owner === undefined || z.owner === view.seat)
    .filter((z) => !countersOnly(z.id))
    .map((z): Place => {
      const n = countOf(z)
      const one = n === 1 ? 'one' : 'other'
      return {
        key: `z:${z.id}`,
        // A zone's own name is the designer's (B5); the count beside it is the tool's.
        label: z.kind === 'hand' ? handName(view, z, t) : z.name,
        hint: t(z.kind === 'pile' ? `kbd.place.pile.${one}` : z.kind === 'hand' ? `kbd.place.hand.${one}` : `kbd.place.area.${one}`, { n }),
        zone: z.id,
        kind: z.kind,
      }
    })
  const floor = view.zones.find((z) => z.id === view.floor)
  const onFloor: Place[] = floor ? [{ key: `z:${floor.id}`, label: t('kbd.place.floor'), hint: t('kbd.place.floor.hint'), zone: floor.id, kind: 'area' }] : []
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  // A counter is not something a card stacks on (K1 is about cards).
  const cards: Place[] = view.components
    .filter((c) => areas.has(c.zone) && !moving.has(c.id) && !isCounter(c))
    .map((c): Place => ({
      key: `c:${c.id}`,
      label: t('kbd.place.onCard', { name: cardName(c, t) }),
      hint: t('kbd.place.onCard.hint', { zone: zoneName(view, c.zone) }),
      zone: c.zone,
      kind: 'card',
      anchor: c,
    }))
  return [...zones, ...onFloor, ...cards].filter((p) => p.zone !== sourceZone || p.kind === 'card')
}

// ================================================================================================
// Where a keyboard's card actually lands. The protocol wants a point, and a keyboard has none,
// so the client works one out: the next free slot in a row inside the zone, relative to it (K2).
// Two cards played from a keyboard therefore never land on the same millimetre and cover each
// other. This is the prototype's guess, not a product decision — see the open question in I.
export function slotIn(view: Snapshot, zone: string): { x: number; y: number } {
  const z = view.zones.find((x) => x.id === zone)
  const held = view.components.filter((c) => c.zone === zone)
  const perRow = z ? Math.max(1, Math.floor(z.geometry.w / (CARD_MM.w + SLOT_GAP))) : 6
  const i = held.length
  return { x: SLOT_GAP + (i % perRow) * (CARD_MM.w + SLOT_GAP), y: SLOT_GAP + Math.floor(i / perRow) * (CARD_MM.h + SLOT_GAP) }
}

const SLOT_GAP = 14

// The envelope one row of "Flytta till" sends. Never a new verb: a card goes with `move`, onto
// another card with `stack`, the top of a pile with `split` or `stack`, a whole pile with
// `movePile` — and `movePile` and a `split` without a `to` demand x and y that a keyboard has
// not got, so the client invents the zone's own corner. Also an open question in I.
export function intentsForPlace(view: Snapshot, place: Place, thing: Thing, moving: readonly string[]): Intent[] {
  if (thing.kind === 'pile') {
    const z = view.zones.find((x) => x.id === place.zone)
    return [{ v: 'movePile', pile: thing.pile, to: place.kind === 'area' ? place.zone : view.floor, x: (z?.geometry.x ?? 0) + PILE_CORNER, y: (z?.geometry.y ?? 0) + PILE_CORNER }]
  }
  if (thing.kind === 'pileTop') {
    if (place.kind === 'card' && place.anchor) return [{ v: 'stack', component: { top: thing.pile }, onto: place.anchor.id }]
    return [{ v: 'split', pile: thing.pile, at: 1, to: place.zone }]
  }
  // A chip stacks on nothing — the counter type is `stackable: false`, and the table says so — so
  // where a card would join the one it was sent to, a counter goes to that card's zone instead.
  if (place.kind === 'card' && place.anchor && thing.kind !== 'counter') {
    const onto = place.anchor.id
    return moving.map((id): Intent => ({ v: 'stack', component: id, onto }))
  }
  const z = view.zones.find((x) => x.id === place.zone)
  // A card played into a public area turns face up as a hand would (K11) — the same two verbs
  // the phone's sheet already sends. A counter has one face and no back to turn from: it is
  // `flippable: false`, and the flip sent with the move had the whole envelope refused.
  const isPublic = z?.kind === 'area' && z.mode === 'order' && thing.kind !== 'counter'
  return moving.flatMap((id, i): Intent[] => {
    const slot = z?.kind === 'area' ? slotIn(view, place.zone) : null
    const to: Intent = { v: 'move', component: id, to: place.zone, ...(slot ? { x: slot.x + i * (CARD_MM.w + SLOT_GAP), y: slot.y } : {}) }
    return isPublic ? [to, { v: 'flip', component: id, face: 'front' }] : [to]
  })
}

const PILE_CORNER = 90

// Where the focus should stand once the move has been made: on the card itself while it is still
// on the felt, otherwise on the place that swallowed it — which is where the eye goes too.
export function landedKeyFor(view: Snapshot, place: Place, thing: Thing): string {
  const z = view.zones.find((x) => x.id === place.zone)
  // A chip stacks on nothing: sent onto a card it lands in that card's zone, still itself, so the
  // focus stays on the chip where a card's would follow it into the pile it made.
  if (place.kind === 'card') return thing.kind === 'counter' ? thing.key : `card:${place.anchor?.id ?? ''}`
  if (z?.kind === 'pile') return `top:${z.id}`
  if (z?.kind === 'area' && isLoose(thing)) return thing.key
  return `top:${place.zone}`
}

// A card in this seat's own hand, for a reader. The hand is not on the felt, so it is not a
// `Thing`; the sentence is the same shape all the same, and marking says so out loud (K3).
export function handLabel(c: VisibleComponentState, marked: boolean, t: T = swedish): string {
  return t('kbd.enter', { label: t(marked ? 'kbd.hand.mine.marked' : 'kbd.hand.mine', { name: cardName(c, t) }) })
}

// ================================================================================================
// The felt's shortcuts (#224). Everything below is the same handful of verbs the ring already
// sends, reached in one gesture instead of two. Nothing here invents a verb, and nothing here is
// the only way to anything: the ring and the panel keep every one of these actions, which is what
// makes a shortcut a shortcut and not a path (the caveat in #224).

// Which modifier means «do it to the thing I am pointing at». It cannot be the same key on every
// machine: Ctrl + click on a Mac is the system's own secondary click, and the page is handed
// `contextmenu` and never `click` — measured in Chromium, see the prototype note for 2026-09-18.
// So the Mac reads Cmd and every other machine reads Ctrl.
export const isMac = (platform: string): boolean => /mac|iphone|ipad|ipod/i.test(platform)
export const thisPlatform = (): string => (typeof navigator === 'undefined' ? '' : navigator.platform)

// A modifier press is that one key and nothing beside it: a gesture that fires under any
// combination fires by accident, and the other combinations belong to the browser.
export type Modifiers = { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }
export function modifierHeld(e: Modifiers, platform: string = thisPlatform()): boolean {
  if (e.altKey || e.shiftKey) return false
  return isMac(platform) ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}

// Turning over what the pointer stands on: a card by its own id, the top of a pile by naming the
// pile (K15) — which is the only handle a hidden pile gives out. A chip has no back to turn and
// an empty pile has nothing lying on it, so both answer with nothing.
export function flipUnder(view: Snapshot, target: DragTarget): Intent[] | null {
  if (target.kind === 'card') {
    const c = view.components.find((x) => x.id === target.id)
    return c ? [{ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' }] : null
  }
  if (target.kind !== 'pile' && target.kind !== 'pileTop') return null
  const z = view.zones.find((x) => x.id === target.pile)
  if (!z || countOf(z) === 0) return null
  return [{ v: 'flip', component: { top: z.id }, face: topOf(view, z)?.face === 'front' ? 'back' : 'front' }]
}

// What a bare key asks of the thing the pointer is standing on. `F` turns it over, `D` draws the
// top card off the pile and `S` shuffles it — the modifier click's own flip and the ring's «Dra 1»
// and «Blanda», compiled exactly as they compile them, down to which side of the pile the card is
// laid on (K21). The commands follow the pointer and not a selection: pointing and pressing is the
// fastest a mouse can be, and it is why a pointer is what they need. A key over nothing asks for
// nothing at all, and neither does one over something the command has nothing to say to — `D` and
// `S` over anything that is not a pile, `F` over a chip that has no back to turn.
export function shortcutIntents(view: Snapshot, key: string, at: DragTarget | null): Intent[] | null {
  const letter = key.toLowerCase()
  if (at === null) return null
  // One flip, reached three ways: the modifier click, the double click and this key all ask
  // `flipUnder` and therefore cannot mean different things about the same card (K16).
  if (letter === 'f') return flipUnder(view, at)
  if (letter !== 'd' && letter !== 's') return null
  if (at.kind !== 'pile' && at.kind !== 'pileTop') return null
  const z = view.zones.find((x) => x.id === at.pile)
  if (!z) return null
  const n = countOf(z)
  if (letter === 's') return n > 1 ? [{ v: 'shuffle', pile: z.id }] : null
  return n > 0 ? [drawOne(z)] : null
}

// What the felt's own help says (#224). The list is the surface's and not the button's: `Esc`
// stands in it although it was already there (#142, #152), because a list of commands that leaves
// out the one a reader already knows is not the whole truth about the surface, and the whole
// truth is the only thing worth opening.
export function feltShortcuts(t: T = swedish, platform: string = thisPlatform()): Shortcut[] {
  return [
    // Turning a card over has three grips and is one action: the modifier click, the double click
    // for a hand that cannot hold two keys down, and the bare `F` (#258). They share a row,
    // because they say the same thing, and three rows carrying one sentence is that sentence read
    // three times.
    { press: [t('felt.press.modClick', { mod: isMac(platform) ? 'Cmd' : 'Ctrl' }), t('felt.press.doubleClick'), 'F'], what: t('felt.key.flip') },
    { press: ['D'], what: t('felt.key.draw') },
    { press: ['S'], what: t('felt.key.shuffle') },
    { press: ['Esc'], what: t('felt.key.escape') },
    { press: ['?'], what: t('felt.key.help') },
  ]
}
