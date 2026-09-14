import { CARD_STANDARD_63x88, TOKEN_COUNTER, type SetupDef } from '@byd/engine'
import { counterSpots } from './recipe.js'
import type { ProjectDoc } from './projects.js'

// Imported by the editor as well as the server, so this module stays free of anything Node.
// The table setup a project plays with (L5): every row becomes `antal` copies (default 1) of the
// standard card, face down in the deck zone (L4). Row order is deck order until the first shuffle.
// The editor's preview of the table is built from the same function, so the deck the designer
// sees counted is the deck the players are dealt (#85).
export function setupFromProject(doc: Pick<ProjectDoc, 'rows' | 'setup'>): SetupDef {
  const type = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
  const components: SetupDef['components'] = []
  for (const { id: cardRef, fields } of doc.rows) {
    const copies = Math.max(0, Math.floor(Number(fields['antal'] ?? 1)) || 0)
    for (let i = 0; i < copies; i++) components.push({ type, cardRef, zone: doc.setup.deckZone, face: 'back' })
  }
  // A seat's counters (C4) live in its counters zone, when the setup has one, and where in that
  // zone is the recipe's answer and not this function's (#89): one chip to a slot along the rim
  // while there are one or two, one pile once there is a third.
  const token = { id: TOKEN_COUNTER.id, version: TOKEN_COUNTER.version }
  for (const seat of doc.setup.seats) {
    const zone = doc.setup.zones.find((z) => z.id === `counters:${seat}`)
    if (!zone) continue
    const counters = doc.setup.counters ?? []
    const spots = counterSpots(zone.geometry, counters.length)
    counters.forEach((c, i) => components.push({ type: token, cardRef: c.name, zone: zone.id, face: 'front', counter: c.start, ...(spots[i] ?? { x: 0, y: 0 }) }))
  }
  // Optional keys that are present but undefined are dropped: the engine's types are exact.
  const zones: SetupDef['zones'] = doc.setup.zones.map((z) => ({
    id: z.id,
    kind: z.kind,
    name: z.name,
    visibility: z.visibility,
    geometry: z.geometry,
    ...(z.owner !== undefined ? { owner: z.owner } : {}),
    ...(z.returnTo !== undefined ? { returnTo: z.returnTo } : {}),
    ...(z.shortcut !== undefined ? { shortcut: z.shortcut } : {}),
  }))
  return { zones, seats: doc.setup.seats, floor: doc.setup.floor, components }
}
