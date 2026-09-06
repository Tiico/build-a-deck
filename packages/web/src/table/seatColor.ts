// Seat colours by index, shared by hands, cursors and the dock.
const PALETTE = ['#3aa76d', '#3c8ce7', '#e05a4f', '#d99a1f', '#8e6bd9', '#2bb5b5']
export function seatColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? '#666'
}
