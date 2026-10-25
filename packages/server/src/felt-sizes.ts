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
