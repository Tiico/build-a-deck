import { BOX_TYPES, CARD_STANDARD_63x88, TUCKBOX, TypeRegistry, boxFit, type BoxCard, type BoxFit, type BoxTypeDef } from '@byd/engine'
import type { ProjectBox, ProjectDoc } from './projects.js'
import { copiesOf } from './setup.js'

// Spelets låda ur dokumentet (#1412): typen spelet pinnar, leken som bordet delar den (`antal`), och
// designerns lås och luft. Den enda läsningen av lådan, så att editorn, Fysisk kontroll och det som
// ritar lådan senare (#1413, #1414) talar om samma låda. Ren och utan I/O, som `applyEdit`.

const BOXES = new TypeRegistry(BOX_TYPES)

// Lådan ett spel har när det aldrig rört sin: tuckboxen (#1406, beslut 4).
export const DEFAULT_BOX_TYPE = { id: TUCKBOX.id, version: TUCKBOX.version } as const

export type GameBox = BoxFit & { type: BoxTypeDef; card: BoxCard }

export function boxOf(doc: Pick<ProjectDoc, 'rows' | 'box'>): GameBox {
  const box: ProjectBox | undefined = doc.box
  const type = BOXES.box(box?.type ?? DEFAULT_BOX_TYPE)
  const card = CARD_STANDARD_63x88.physical
  const fit = boxFit({ type, card, cards: doc.rows.reduce((n, row) => n + copiesOf(row.fields), 0), clearance: box?.clearance, locked: box?.locked })
  return { ...fit, type, card }
}
