import { matches } from '@byd/protocol'
import { CARD_STANDARD_63x88, DICE, TOKEN_COUNTER, type SetupDef } from '@byd/engine'
import { counterSpots, diceSpots } from './recipe.js'
import type { ProjectDoc } from './projects.js'

// Imported by the editor as well as the server, so this module stays free of anything Node.
// The table setup a project plays with (L5): every row becomes `antal` copies (default 1) of the
// standard card, face down in the deck zone (L4). Row order is deck order until the first shuffle.
// The editor's preview of the table is built from the same function, so the deck the designer
// sees counted is the deck the players are dealt (#85).
export function setupFromProject(doc: Pick<ProjectDoc, 'rows' | 'setup'>): SetupDef {
  const type = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
  const components: SetupDef['components'] = []
  // Where a row starts is the designer's question and not this function's opinion (B5): the
  // first zone whose question the row answers takes it, in the document's own order, and a row
  // no zone asks for lies in the deck's pile as every row used to.
  const asked = doc.setup.zones.filter((z) => z.fill !== undefined && z.fill.length > 0)
  for (const { id: cardRef, fields } of doc.rows) {
    const copies = Math.max(0, Math.floor(Number(fields['antal'] ?? 1)) || 0)
    const zone = asked.find((z) => matches(z.fill ?? [], fields))?.id ?? doc.setup.deckZone
    for (let i = 0; i < copies; i++) components.push({ type, cardRef, zone, face: 'back' })
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
  // The game's dice (K5, #1136), side by side in the area each is put in and clear of what stands
  // in it (the floor's piles, #1137), one side up. The side is
  // the document's and not a roll: a table is laid the same way every time, and the first roll is
  // a line in the log like every other (D4). A die put in a zone that is gone lies nowhere.
  const byZone = new Map<string, number[]>()
  const put = (zone: string, faces: number, count: number) => byZone.set(zone, [...(byZone.get(zone) ?? []), ...Array<number>(count).fill(faces)])
  for (const d of doc.setup.dice ?? []) {
    if (d.role !== undefined) for (const seat of doc.setup.seats) put(`${d.role}:${seat}`, d.faces, d.count)
    else if (d.zone !== undefined) put(d.zone, d.faces, d.perSeat ? d.count * doc.setup.seats.length : d.count)
  }
  for (const [zoneId, kinds] of byZone) {
    const zone = doc.setup.zones.find((z) => z.id === zoneId)
    if (!zone) continue
    const spots = diceSpots(zone.geometry, kinds.length, doc.setup.zones.filter((z) => z.id !== zoneId))
    kinds.forEach((faces, i) => {
      const def = DICE.find((t) => t.behaviours.rollable !== false && t.behaviours.rollable.faces === faces)
      const at = spots[i] ?? { x: 0, y: 0 }
      if (def) components.push({ type: { id: def.id, version: def.version }, cardRef: `d${faces}`, zone: zoneId, face: 'front', counter: 1, ...at })
    })
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
    ...(z.beside !== undefined ? { beside: z.beside } : {}),
    ...(z.actions !== undefined && z.actions.length > 0 ? { actions: z.actions } : {}),
    // The pile's bottom card (K23): where in the pile it lies, and on which side, is the
    // engine's to settle when the table is built, so it is passed on and not placed here.
    ...(z.bottom !== undefined && z.kind === 'pile' ? { bottom: { ...z.bottom } } : {}),
  }))
  // What each row says in its own columns, so a question can be asked of the deck at the table
  // and not only when it is laid out (B5). Written as the designer reads a cell — the same
  // reading the table's own chips do — because that is what a question is written against. It is
  // as secret as the row's identity: nothing projects it (B6).
  const cards: NonNullable<SetupDef['cards']> = {}
  for (const { id, fields } of doc.rows) {
    cards[id] = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v).trim()]))
  }
  return { zones, seats: doc.setup.seats, floor: doc.setup.floor, components, cards }
}
