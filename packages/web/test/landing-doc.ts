import type { ProjectDoc } from '@byd/server'
import { projectDoc } from './project-doc.js'

// The case L30 was decided on (#316): Krönikan at 838, 500 on a table of 900 × 600 lays its
// cards off the table on two of the four sides — to its right and below it. The hands hang past
// the rim as they do in the fixture; only the floor and the two piles are moved.
type Zone = ProjectDoc['setup']['zones'][number]
export function edgeDoc(side: 'left' | 'right' | 'above' | 'below' = 'right'): ProjectDoc {
  const doc = projectDoc()
  const at = (z: Zone, x: number, y: number, w = 0, h = 0): Zone => ({ ...z, geometry: { x, y, w, h, rot: 0 } })
  const zones = doc.setup.zones.map((z) =>
    z.id === 'table'
      ? at(z, 0, 0, 900, 600)
      : z.id === 'discard'
        ? { ...at(z, 838, 500), name: 'Krönikan', beside: side }
        : z.id === 'draw'
          ? at(z, 300, 300)
          : z.id === 'hand:A'
            ? at(z, 150, 620, 600, 100)
            : z.id === 'hand:B'
              ? at(z, 150, -120, 600, 100)
              : z,
  )
  return { ...doc, setup: { ...doc.setup, zones } }
}
