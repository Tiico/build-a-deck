// The felt's own sizes, in its millimetres, and nothing else: no import, no schema. The recipe lays
// the table with them and the felt and the phone draw with them, and the phone reaches them through
// `@byd/server/felt-sizes` rather than `@byd/server/doc`, whose every schema would ride along with
// two numbers (#1304, `packages/web/test/phone-reach.test.ts`).

// The chip a counter is drawn as. The renderer re-exports this as `TOKEN_MM` rather than keeping a
// second 24 beside it: where a chip lies and how wide a chip is are the same question asked from
// two rooms (C4).
export const CHIP_MM = 24
// The felt draws a die larger than life, and this is what it reserves; the recipe spaces a zone's
// dice for it (#1136).
export const DIE_MM = 30
// How large the felt draws a wooden piece (#1475, prototype #1472 B), by its kind. Larger than life,
// as the die is: a real meeple is 16 mm and would be 12 px at 1280, so it is drawn on the die's
// room; a cube and a disc keep their proportion to it. The kinds are spelled out here because this
// file imports nothing; `@byd/engine`'s `PIECES` is the list they must match.
export const PIECE_MM = { meeple: DIE_MM, cube: 20, disc: 24 } as const
// What has not been moved yet (#1472 B): a seat's pieces of one kind lie on one spot, and the felt
// draws them as one chip with the figure and the count, the way a pile of counters is one thing.
// The chip is this wide, and the recipe reserves this much for it when it lays the table.
export const PIECE_PILE_MM = 44
