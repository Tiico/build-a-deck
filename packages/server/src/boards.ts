import { BOARDS, type ComponentTypeDef } from '@byd/engine'
import { validateCard, type Issue } from '@byd/template'
import type { ProjectDoc } from './projects.js'

// Spelets bräden ur dokumentet (#1481), rena och utan I/O som `box.ts`: editorn och servern frågar
// här, så att det är samma dom på båda ställena.

// The board type a board in the document pins (B3), or nothing for a type the registry does not know.
export const boardTypeOf = (type: { id: string; version: number }): ComponentTypeDef | undefined => BOARDS.find((b) => b.id === type.id && b.version === type.version)

// Fysisk kontroll på brädet (#1481, E5, L91): varje sida designern har ritat prövas med samma regler
// som ett kort, med brädtypens egen `print` — utfall, skyddsmarginal och textgolv per skrift — och i
// brädets eget mått. En sida som inte är ritad har ingenting att pröva. En sida binder ingen kolumn,
// så raden är tom.
export type BoardFound = Issue & { board: string; face: string }

export function boardIssues(doc: Pick<ProjectDoc, 'setup' | 'fonts'>): BoardFound[] {
  const found: BoardFound[] = []
  for (const board of doc.setup.boards ?? []) {
    const type = boardTypeOf(board.type)
    if (!type) continue
    for (const [face, template] of Object.entries(board.faces ?? {})) {
      for (const issue of validateCard({ type, face: template, row: {}, ...(doc.fonts ? { fonts: doc.fonts } : {}) })) found.push({ ...issue, board: board.id, face })
    }
  }
  return found
}
