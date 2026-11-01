// Seat colours by index (L11, K9): the colour a seat's hand, cursor and dock wear on the table, and
// since the wooden pieces (#1478) the colour its meeples are packed in. The table draws them and
// print orders them, so the list lives here, where both read it, and not in either surface.
//
// The order is prototypes B and C's: the first four seats are red, blue, green and yellow. There
// are as many as the table can seat, eight; magenta and lime are the two hues the first six leave
// room for. `name` is the colour said in a word, for a partner's part number and the print page.
export const SEAT_COLOURS = [
  { name: 'red', hex: '#e05a4f' },
  { name: 'blue', hex: '#3c8ce7' },
  { name: 'green', hex: '#3aa76d' },
  { name: 'yellow', hex: '#d99a1f' },
  { name: 'purple', hex: '#8e6bd9' },
  { name: 'teal', hex: '#2bb5b5' },
  { name: 'pink', hex: '#d9699f' },
  { name: 'lime', hex: '#9bb63c' },
] as const
export type SeatColourName = (typeof SEAT_COLOURS)[number]['name']

// The colour of the seat at `index`, wrapping past the eighth.
export const seatColourAt = (index: number): (typeof SEAT_COLOURS)[number] => SEAT_COLOURS[((index % SEAT_COLOURS.length) + SEAT_COLOURS.length) % SEAT_COLOURS.length] ?? SEAT_COLOURS[0]

// The colour of a seat of the setup, by its place among the seats; none for a word that is no seat.
export function seatColourOf(seats: readonly string[], seat: string): string | undefined {
  const i = seats.indexOf(seat)
  return i < 0 ? undefined : seatColourAt(i).hex
}
