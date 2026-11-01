import { seatColourAt } from '@byd/engine'

// Seat colours by index, shared by hands, cursors and the dock. The order is prototypes B and
// C's, which agreed on it: the first four seats are red, blue, green and yellow (K9).
//
// There are as many as the table can seat, because the list wraps: with six of them the seventh
// seat took the first's red and the eighth the second's blue, and two players at one table wearing
// one colour is two players with one identity — on hands, cursors, the dock and the activity feed
// alike. Nothing ever set `players` above six until the panel started offering every count the
// table can hold (K18, K19), which is what brought the wrap out of hiding.
//
// The two new ones are the two hues the first six leave room for. Magenta sits in the gap between
// the purple and the red, lime in the gap between the yellow and the green, and each is put where
// its own rim's other seat is furthest from it: the pink seats beside the green, the lime beside
// the yellow at the other side of the table rather than next to the green it would be mistaken
// for. Both carry `--byd-seat-ink` at 5.91:1 and 8.35:1 and are read against the dark at the same
// numbers, which `seat-contrast.test.ts` holds them to along with the other six (L11).
// The palette itself lives in `@byd/engine` (#1478), since print orders a seat's meeples in it too.
// A seat that is not one (an index below zero, or none) is grey, as it always was.
export function seatColor(index: number): string {
  return Number.isInteger(index) && index >= 0 ? seatColourAt(index).hex : '#666'
}
