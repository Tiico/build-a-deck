// A number that is dragged instead of typed (L25). The panel's grip is the whole of this file:
// the pointer reports a pixel or two at a time, and each report has to say what the number became
// and what travel is still owed to the next one.
//
// It is framework-free for the same reason the rest of the editor's arithmetic is: a drag is one
// doing reported a hundred times, and none of those hundred should need a document to be tested.

// What one step of a number costs in pixels. Measured in the prototype: a pull across the panel's
// own 280 px is a useful range for a millimetre, and a hand resting on a trackpad moves nothing.
export const SCRUB_PX = 2

export type Scrub = {
  // How far the pointer has travelled since the last time travel was spent, in pixels.
  travel: number
  // What one step of this number is: half a millimetre for a measurement, a tenth for a line.
  step: number
  // Ten steps at a time, which is what Shift means everywhere in the panel (L25).
  shift?: boolean
  min?: number | undefined
  max?: number | undefined
}

// A measurement is shown in millimetres to a tenth, so two decimals is one more than any number
// in the panel can show — enough to keep a tenth a tenth, and not enough to invent a digit.
const shown = (value: number) => Number(value.toFixed(2))

// Where the number lands, and what travel the drag keeps for its next report.
export function scrubbed(value: number, { travel, step, shift, min, max }: Scrub): { value: number; rest: number } {
  const steps = Math.trunc(travel / SCRUB_PX)
  const rest = travel - steps * SCRUB_PX
  let next = shown(value + steps * step * (shift ? 10 : 1))
  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)
  return { value: next, rest }
}
