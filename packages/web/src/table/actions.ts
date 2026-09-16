import type { Intent, Snapshot, ZoneAction, ZoneView, ActionAmount, ActionStep, ActionTarget } from '@byd/protocol'
import { besidePile, type Point } from './drop.js'

// Turning a designer's action into the intents it means (B5, K14).
//
// The client does it, for the reason it already works out a coordinate for the keyboard (K16):
// the protocol wants a number, and "one per player" is not a number until somebody is sitting
// down. Nothing is invented here — every step becomes a verb that already existed, in the order
// the designer wrote it, inside one envelope, so an action is as atomic as any other batch (K3).
//
// What it cannot work out, it says. An action that asks for a number asks the reader for it
// rather than guessing one, and an action whose target is not on this table compiles to nothing
// at all — the entry is then offered disabled, the same way a verb with nothing to act on is.

// The numbers the reader has already typed, keyed by which step asked.
export type Asked = Readonly<Record<string, number>>
export const askKey = (i: number): string => `ask:${i}`

export type Compiled = { ok: true; intents: Intent[] } | { ok: false; asks: string } | { ok: false; why: string }

const seated = (view: Snapshot): string[] => view.seats.filter((s) => s.name !== null).map((s) => s.id)
const countOf = (view: Snapshot, id: string): number => {
  const z = view.zones.find((x) => x.id === id)
  return z === undefined ? 0 : z.mode === 'count' ? z.count : z.order.length
}

// Where a step's cards go, as zones this table actually has. An empty list means the target is
// not here — nobody is seated, the zone was taken away — and the action cannot be asked for.
function zonesOf(view: Snapshot, target: ActionTarget): string[] {
  if (target.at === 'zone') return view.zones.some((z) => z.id === target.zone) ? [target.zone] : []
  if (target.at === 'hands') return seated(view).map((s) => `hand:${s}`).filter((id) => view.zones.some((z) => z.id === id))
  if (target.at === 'mine') return view.seat === null ? [] : [`hand:${view.seat}`]
  return []
}

function amountOf(view: Snapshot, amount: ActionAmount, asked: Asked, key: string): number | { asks: string } | { why: string } {
  if (amount.of === 'number') return amount.n
  // "One per player" at a table nobody has sat down at is not a pile that came out empty — it is
  // nobody to count, which is the same reason a step with nowhere to deal to gives. Said as "no
  // cards right now" it reads as if the pile were empty, and the designer goes looking at the
  // deck for a fault that is a seat away.
  if (amount.of === 'seats') {
    const n = seated(view).length
    return n > 0 ? n : { why: 'nowhere' }
  }
  if (amount.of === 'zone') return countOf(view, amount.zone)
  const given = asked[key]
  return given === undefined ? { asks: key } : given
}

const face = (f: string): { face: string } | Record<string, never> => (f === 'keep' ? {} : { face: f })

export function compileAction(view: Snapshot, pile: string, action: ZoneAction, asked: Asked = {}): Compiled {
  const zone = view.zones.find((z) => z.id === pile)
  if (zone === undefined) return { ok: false, why: 'gone' }
  const intents: Intent[] = []
  for (const [i, step] of action.steps.entries()) {
    const made = compileStep(view, zone, pile, step, asked, askKey(i))
    if ('asks' in made) return { ok: false, asks: made.asks }
    if ('why' in made) return { ok: false, why: made.why }
    intents.push(...made.intents)
  }
  return intents.length > 0 ? { ok: true, intents } : { ok: false, why: 'nothing' }
}

type Made = { intents: Intent[] } | { asks: string } | { why: string }

// `beside` is the pile's own side and not the step's (K21): a pile that lies at the felt's left
// edge lays its cards to the right, whoever asked for them and whichever verb did it.
function compileStep(view: Snapshot, zone: ZoneView, pile: string, step: ActionStep, asked: Asked, key: string): Made {
  const beside = (cards: number): Point => besidePile(zone.geometry, cards, zone.beside)
  if (step.v === 'shuffle') return { intents: [{ v: 'shuffle', pile }] }
  if (step.v === 'flipTop') {
    const z = view.zones.find((x) => x.id === pile)
    const topId = z === undefined ? undefined : z.mode === 'order' ? z.order[0] : z.top
    const top = view.components.find((c) => c.id === topId)
    // The top is named by its pile (K15), so a hidden pile can be turned too; `toggle` reads the
    // side it lies on, and an unseen top is by definition not face-up.
    const to = step.face === 'toggle' ? (top?.face === 'front' ? 'back' : 'front') : step.face
    return { intents: [{ v: 'flip', component: { top: pile }, face: to }] }
  }
  const targets = zonesOf(view, step.to)
  if (step.v === 'movePile') {
    const to = targets[0]
    if (to === undefined) return { why: 'nowhere' }
    return { intents: [{ v: 'movePile', pile, to, x: 0, y: 0 }] }
  }
  if (step.v === 'take') {
    const to = step.to.at === 'beside' ? undefined : targets[0]
    if (step.to.at !== 'beside' && to === undefined) return { why: 'nowhere' }
    // Searching a pile is a split that names which cards instead of how many; `at` is then only
    // the fallback a line written before the question existed would have used.
    //
    // Where it lands is placed by a pile's rule and not a single card's (#87), and it has to be:
    // how many cards answer a question inside a hidden pile is the one thing this side cannot
    // know (B6). A pile is placed by its middle and a lone card by its corner, so a search that
    // turns up exactly one card lands half a card off — which is a card lying somewhere slightly
    // else, and can be dragged. Guessing "one" would put a pile of six half a card *over* the
    // pile it came out of, which cannot.
    return { intents: [{ v: 'split', pile, at: 1, which: step.which, ...(to ? { to } : beside(2)), ...face(step.face) }] }
  }
  const n = amountOf(view, step.v === 'deal' ? step.each : step.count, asked, key)
  if (typeof n === 'object') return n
  if (n <= 0) return { why: 'none' }
  if (step.v === 'deal') {
    if (targets.length === 0) return { why: 'nowhere' }
    return { intents: [{ v: 'deal', from: pile, to: targets, each: n, ...face(step.face) }] }
  }
  const to = step.to.at === 'beside' ? undefined : targets[0]
  if (step.to.at !== 'beside' && to === undefined) return { why: 'nowhere' }
  return { intents: [{ v: 'split', pile, at: n, ...(to ? { to } : beside(n)), ...face(step.face) }] }
}
