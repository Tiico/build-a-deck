// Seat colours by index, shared by hands, cursors and the dock. The order is prototypes B and
// C's, which agreed on it: the first four seats are red, blue, green and yellow (K9).
const PALETTE = ['#e05a4f', '#3c8ce7', '#3aa76d', '#d99a1f', '#8e6bd9', '#2bb5b5']
export function seatColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? '#666'
}
