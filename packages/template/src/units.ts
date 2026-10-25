// Type's units, and nothing else: no import, no schema. The phone sizes its hand's text and its rule
// drawer's pictures with these, and reaches them through `@byd/template/units` rather than the
// package's index, whose schemas, parser and compiler would ride along with three numbers (#1304,
// `packages/web/test/phone-reach.test.ts`).

// A typographic point in millimetres.
export const PT_TO_MM = 25.4 / 72

// The rulebook's type as a screen reads it: millimetres in `em` of the book's own 10.5 pt.
// `rules.ts` says why the book's frame is given in `em` at all.
const BOOKLET_PT = 10.5
export const MM_PER_EM = (BOOKLET_PT * 25.4) / 72
export const round = (n: number): number => Math.round(n * 10) / 10
// Millimetres as the book's own type reads them, which is what a screen can be held to.
export const ruleEm = (mm: number): number => round(mm / MM_PER_EM)
