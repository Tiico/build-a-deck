// The motif inside a picture (E1). A deck's art arrives as one file per card, drawn by whoever
// drew it, and two files that hold the same motif rarely hold it at the same size: one carries a
// hand's width of transparent air, the next almost none. Fitting the file into a frame therefore
// draws the motif at a different size on every card, which is what nobody wants and what nothing
// in the template can say.
//
// So the air is measured rather than guessed: the uniform border a file carries around what is
// drawn in it, in the file's own pixels. The measurement is pure and it is of the bytes, so it is
// made once per asset hash and never again — the same bytes always give the same answer.

export type Trim = { left: number; top: number; right: number; bottom: number }
export type Motif = { w: number; h: number; trim: Trim }
// One picture's pixels as every source of them has them: four bytes per pixel, row by row.
export type Pixels = { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export const NO_TRIM: Trim = { left: 0, top: 0, right: 0, bottom: 0 }

// How far a pixel may stand from the ground and still be ground. A photograph's flat white is
// never one number — compression leaves it a shade off all over — so an exact match would find a
// border only in a picture drawn by a machine.
const TOLERANCE = 8

export function motifOf(pixels: Pixels): Motif {
  const { width: w, height: h } = pixels
  const whole = { w, h, trim: NO_TRIM }
  if (w <= 0 || h <= 0) return whole

  const at = (x: number, y: number): number => (y * w + x) * 4
  // A channel of a pixel. Outside the buffer is nothing, which no real pixel is within tolerance
  // of, so a short buffer answers "not the ground" rather than reading undefined as a colour.
  const channel = (px: number, c: number): number => pixels.data[px + c] ?? -1000
  const same = (a: number, b: number): boolean => {
    // Transparent is transparent whatever colour is written under it: a file's own air is
    // usually zeroed pixels, but an exporter is free to leave the drawing's colour there.
    if (channel(a, 3) >= 0 && channel(a, 3) <= TOLERANCE && channel(b, 3) <= TOLERANCE) return true
    for (let c = 0; c < 4; c++) if (Math.abs(channel(a, c) - channel(b, c)) > TOLERANCE) return false
    return true
  }

  // The ground is the top left pixel, and only if the other three corners agree with it. A
  // picture whose corners differ has no one ground — it is a gradient, or a drawing that reaches
  // its own edge — and trimming such a picture would eat the drawing.
  const ground = at(0, 0)
  const corners = [at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)]
  if (!corners.every((corner) => same(ground, corner))) return whole

  const rowIsGround = (y: number): boolean => {
    for (let x = 0; x < w; x++) if (!same(ground, at(x, y))) return false
    return true
  }
  const columnIsGround = (x: number): boolean => {
    for (let y = 0; y < h; y++) if (!same(ground, at(x, y))) return false
    return true
  }

  let top = 0
  while (top < h && rowIsGround(top)) top++
  // Nothing but ground: there is no motif to fit, so the picture is left as it is.
  if (top === h) return whole
  let bottom = 0
  while (rowIsGround(h - 1 - bottom)) bottom++
  let left = 0
  while (columnIsGround(left)) left++
  let right = 0
  while (columnIsGround(w - 1 - right)) right++

  return { w, h, trim: { left, top, right, bottom } }
}
