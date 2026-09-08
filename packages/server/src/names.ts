// Imported by the editor as well as the server, so this module stays free of anything Node:
// types only from the project document, and no imports that reach the database or the network.
import type { ProjectDoc } from './projects.js'
import type { Names } from '@byd/template'

// What the rulebook's references stand for right now (B7): zones by the name the table shows,
// cards by their title. A card without a title falls back to its id, so a reference is never
// empty on the page.
export function namesOfProject(doc: ProjectDoc): Names {
  const zones: Record<string, string> = {}
  for (const zone of doc.setup.zones) zones[zone.id] = zone.name
  const cards: Record<string, string> = {}
  for (const row of doc.rows) cards[row.id] = String(row.fields['title'] ?? '').trim() || row.id
  return { zones, cards }
}
