export type Size = { w: number; h: number }

// Scale (px per mm) that fits the whole table inside the container with `margin` px around
// it, without ever enlarging past 1:1 — a bigger screen shows a bigger table only up to life size.
export function fitScale(table: Size, container: Size, margin = 0): number {
  const w = Math.max(0, container.w - 2 * margin)
  const h = Math.max(0, container.h - 2 * margin)
  return Math.min(1, w / table.w, h / table.h)
}

// The least air the felt ever leaves between itself and the frame that holds it. The table's
// wooden rim is drawn in the frame's own pixels, outside the millimetres the fit measures, so a
// felt that came closer would have its own frame cut; the TV's chrome leaves the same air (K9).
export const LEAST_AIR_PX = 44

// How much of the frame the felt covers when the frame has room to give it (K9): prototype B's
// proportion, read as a share of the frame's *area* rather than as a margin on its shorter side.
// Two fifths is what 0.16 of the shorter side came to on the 1600 × 1000 screen B was approved
// on, and it is the same answer on a screen the table's own shape.
export const FELT_AREA = 0.4

// Scale (px per mm) for the felt in table mode (K9, K17). A margin taken off the frame's shorter
// side spends a third of that side whichever side it happens to be, so a landscape table in a
// short, wide row lost a third of the one dimension it was short of and the surplus on the other
// axis turned into a dead band. Weighing the two axes together instead — the felt covers a
// decided share of the frame's *area* — asks both what they have: in a frame close to the
// table's own shape it is the proportion #4/#5/#6 tuned, and in a frame far from it the table
// grows into the room that is actually there. It never passes what the frame can hold, nor
// life size; `fitScale` answers both of those.
export function feltScale(table: Size, container: Size): number {
  const area = table.w * table.h
  const byArea = area > 0 ? Math.sqrt((FELT_AREA * container.w * container.h) / area) : 0
  return Math.min(byArea, fitScale(table, container, LEAST_AIR_PX))
}
