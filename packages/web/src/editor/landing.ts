import type { ZoneAction } from '@byd/protocol'
import type { Geometry, Zone } from '@byd/server/doc'
import { besidePile, cardOnFloor, CARD_MM } from '../table/drop.js'

// Where an action lays its cards beside a pile, as the setup's felt draws it (L30, #316): a
// card's outline, in table millimetres, at the point `besidePile` gives — the same point the
// played table lays them at, so the outline stands where the cards *actually* land and not where
// they roughly land.
export type Landing = {
  // The card's top-left corner, its size and its turn, in the floor's own millimetres.
  x: number
  y: number
  w: number
  h: number
  rot: number
  // What the outline is drawn for: a lone card (1) or a pile (2).
  cards: 1 | 2
  // Whether any part of it lies past the floor's edge — an error the felt shows whether or not
  // the picker is held, since a pile that lays its cards off the table does so silently otherwise.
  off: boolean
}

// What the zone's actions lay beside it. `besidePile` places a pile by its centre and a lone
// card by its corner, half a card apart, so the outline has to be drawn for the right one. The
// action knows its count — «Ta 1» and «Ta 3» are different sentences — so this is no guess: a
// lone card only when every action that lays anything beside the pile lays exactly one. A zone
// whose actions lay different counts, or none at all, draws the pile's placement, which is the
// commoner. A search lays a pile however many cards it finds (`actions.ts`, #87), and a count
// that is not a number is not one either.
export function laidBeside(actions: readonly ZoneAction[] | undefined): 1 | 2 {
  const counts = (actions ?? []).flatMap((a) => a.steps.flatMap(laid))
  return counts.length > 0 && counts.every((n) => n === 1) ? 1 : 2
}

// A step that names its own side lays nothing on the pile's (#1203), and a row or an overlap starts
// with one lone card in its corner wherever it ends — that card is what the outline stands for.
function laid(step: ZoneAction['steps'][number]): number[] {
  if (step.v === 'shuffle' || step.v === 'flipTop' || step.to.at !== 'beside' || step.to.side !== undefined) return []
  if ((step.v === 'split' || step.v === 'take') && (step.to.lay === 'row' || step.to.lay === 'overlap')) return [1]
  if (step.v === 'split') return [step.count.of === 'number' ? step.count.n : 2]
  if (step.v === 'take' || step.v === 'movePile') return [2]
  return []
}

export function landingOf(zone: Zone, floor: Geometry, side = zone.beside ?? 'left'): Landing {
  const cards = laidBeside(zone.actions)
  const at = besidePile(zone.geometry, cards, side)
  const box = cards === 1 ? { x: at.x, y: at.y } : { x: at.x - CARD_MM.w / 2, y: at.y - CARD_MM.h / 2 }
  const rot = zone.geometry.rot
  return { ...box, w: CARD_MM.w, h: CARD_MM.h, rot, cards, off: !onFloor(box, rot, floor) }
}

// Whether a card at `box`, turned `rot` degrees about its own centre, lies wholly on the floor.
const onFloor = (box: { x: number; y: number }, rot: number, floor: Geometry): boolean => cardOnFloor({ x: box.x + CARD_MM.w / 2, y: box.y + CARD_MM.h / 2 }, rot, floor)
