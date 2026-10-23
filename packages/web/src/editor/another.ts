import type { T } from '../i18n/index.js'

// What the question before a second table says (#1145, beslut A), in the Bord tab, in the caret's
// menu and on the start page alike: the newest table that already runs, by its name, and how many
// run when it is more than one. With no table running there is nothing to ask.
export function anotherAsk(t: T, table: string, n: number): string {
  return n === 1 ? t('tables.another.one', { table }) : t('tables.another.other', { n, table })
}
