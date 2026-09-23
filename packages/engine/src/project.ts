import type { Activity, Applied, RewindProposal, SeatEdge, SeatId, Snapshot, TablePreview, VisibleComponentState, ZoneView } from '@byd/protocol'

import { undoTarget, type History } from './decide.js'
import { bottomOf, componentOf, type ComponentInstance, type TableState, type Zone } from './state.js'
import type { TypeRegistry } from './typedef.js'
import { canSeeFace, canSeeZoneOrder, faceUpAtBottom, faceUpOnTop } from './visibility.js'

// A log line as every view may see it. The outcome never leaves the server: a shuffle's
// re-keying says exactly where each card went, which no one at a physical table knows.
export function projectActivity(line: Applied): Activity {
  const { schemaVersion, seq, batch, at, by, intent } = line
  return { schemaVersion, seq, batch, at, by, intent }
}

// Projects the authoritative state into what one seat is allowed to know.
// This is the only path from state to wire. Nothing else may serialise components.

// Texture hashes per card and face, computed by whoever compiled the deck. Optional: a session
// without textures projects without faces.
export type FaceHashes = Record<string, Record<string, string>>

// What each row of the deck is called, keyed by `cardRef` (#412). A row without a title is not in
// here at all, and the card is then named by its id at the reader, as it always was.
export type CardTitles = Record<string, string>

// Everything the compiled deck knows about a card, in one place because it is filtered in one
// place: both the face a seat may fetch and the word a seat may hear are hidden information and
// follow the zone's visibility together (B6).
export type DeckFacts = { faces?: FaceHashes; titles?: CardTitles }

// With a `history` the view also learns what undo means for its seat, and — while a rewind is
// proposed — how the table looked at the target, projected for this same view (B, C).
// `observer` (C8) sees every hand and every hidden pile; the view is still seatless.
export function project(state: TableState, registry: TypeRegistry, seat: SeatId | null, deck?: DeckFacts, history?: History, observer = false): Snapshot {
  const { zones, components } = projectTable(state, registry, seat, deck, observer)
  const seats = state.setup.seats.map((id) => ({ id, name: state.seats[id]?.name ?? null, edge: seatEdge(state, id) }))
  let rewind: RewindProposal | null = state.rewind
  if (rewind && history) {
    const preview: TablePreview = projectTable(history.stateAt(rewind.toSeq), registry, seat, deck, observer)
    rewind = { ...rewind, preview }
  }
  const undo = seat !== null && history ? undoTarget(history.lines(), seat) : null
  return { seq: state.seq, seat, floor: state.setup.floor, seats, zones, components, rewind, undo, ended: state.ended, played: state.played }
}

// Which edge of the table a seat sits at (K12), from where its hand lies relative to the middle
// of the floor. Derived here and nowhere else, and carried in the seat's own view: a view that
// answers the question itself is a second path to the same fact, and two paths can disagree.
// It is also what lets a lobby draw the ring of seats while it is shown no zones at all — the
// edge says where you will sit, not what lies on the felt. A seat the table gives no hand has no
// edge, and says so rather than quietly picking one.
function seatEdge(state: TableState, seat: SeatId): SeatEdge | null {
  const floor = state.zones[state.setup.floor]
  const hands = Object.values(state.zones)
    .filter((z) => z.kind === 'hand' && z.owner === seat)
    .sort((a, b) => a.id.localeCompare(b.id))
  const hand = hands[0]
  if (!floor || !hand) return null
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

function projectTable(state: TableState, registry: TypeRegistry, seat: SeatId | null, deck?: DeckFacts, observer = false): TablePreview {
  const zones: ZoneView[] = []
  const components: VisibleComponentState[] = []

  const sortedZones = Object.values(state.zones).sort((a, b) => a.id.localeCompare(b.id))
  for (const z of sortedZones) {
    // The pile's bottom card, while it lies under something (K23): a lone card is the top.
    const bottomId = z.order.length >= 2 ? bottomOf(state, z) : undefined
    const bottom = bottomId === undefined ? undefined : componentOf(state, bottomId)
    if (canSeeZoneOrder(z, seat, observer)) {
      zones.push({ mode: 'order', ...zoneBase(z), order: [...z.order], ...(bottom ? { bottom: { id: bottom.id } } : {}) })
      for (const id of z.order) components.push(view(state, registry, componentOf(state, id), seat, deck, observer))
    } else {
      const top = z.order[0] === undefined ? undefined : componentOf(state, z.order[0])
      const shownTop = top !== undefined && faceUpOnTop(state, registry, top)
      // The bottom card's edge sticks out under the pile: face-up it is public like a face-up
      // top (K15) and named; face-down the zone says only that it is there and what back it
      // wears, and the component itself stays out with the rest of the pile.
      const shownBottom = bottom !== undefined && faceUpAtBottom(state, registry, bottom)
      const bottomView = bottom === undefined ? {} : { bottom: shownBottom ? { id: bottom.id } : backOf(registry, bottom, deck?.faces) }
      // What the pile wears on the side everybody can see (#313). A deck whose cards carry their
      // own back (#14) has to show it from the first frame rather than the deck's default until
      // somebody has drawn — and saying it here is what keeps `project` the only way from state to
      // thread, instead of the client guessing from a deck-wide prop.
      //
      // The back is the face that is not the one the card's content is on, read the same way
      // `view` decides what it may hand out, so a type with some other pair of faces is answered
      // by its own definition rather than by the word "back".
      zones.push({ mode: 'count', ...zoneBase(z), count: z.order.length, ...(shownTop ? { top: top.id } : {}), ...(top !== undefined ? backOf(registry, top, deck?.faces) : {}), ...bottomView })
      // A component the seat was explicitly granted knowledge of still appears, even though its
      // position inside the zone does not; so does the face-up top of a pile (K15), whose position
      // the zone view names.
      for (const id of z.order) {
        const c = componentOf(state, id)
        if (grantedTo(c, seat) || (shownTop && c === top) || (shownBottom && c === bottom)) components.push(view(state, registry, c, seat, deck, observer))
      }
    }
  }
  return { zones, components }
}

function zoneBase(z: Zone) {
  return {
    id: z.id,
    kind: z.kind,
    name: z.name,
    geometry: { ...z.geometry },
    dynamic: z.dynamic,
    ...(z.owner !== undefined ? { owner: z.owner } : {}),
    ...(z.shortcut !== undefined ? { shortcut: { ...z.shortcut } } : {}),
    ...(z.beside !== undefined ? { beside: z.beside } : {}),
    ...(z.actions !== undefined && z.actions.length > 0 ? { actions: z.actions } : {}),
  }
}

// The hidden side of a component, for a zone that may say what it wears without saying what it is.
function backOf(registry: TypeRegistry, c: ComponentInstance, faces?: FaceHashes): { back?: string } {
  const hashes = faces?.[c.cardRef]
  if (!hashes) return {}
  const content = registry.get(c.type).contentFace
  const back = Object.entries(hashes).find(([face]) => face !== content)?.[1]
  return back === undefined ? {} : { back }
}

function grantedTo(c: ComponentInstance, seat: SeatId | null): boolean {
  if (c.publicOverride) return true
  return seat !== null && (c.shownTo.includes(seat) || c.peekedBy.includes(seat))
}

function view(state: TableState, registry: TypeRegistry, c: ComponentInstance, seat: SeatId | null, deck?: DeckFacts, observer = false): VisibleComponentState {
  const visible = canSeeFace(state, registry, c, seat, observer)
  const v: VisibleComponentState = {
    id: c.id,
    type: c.type,
    zone: c.zone,
    face: c.face,
    x: c.x,
    y: c.y,
    rot: c.rot,
    cardRef: visible ? c.cardRef : null,
  }
  // The word the card is called by (#412) is read off the same `visible` the face is: one
  // derivation, so the name cannot come apart from the picture. A row with no title says
  // nothing here, and the reader falls back to the id as it always did.
  const title = visible ? deck?.titles?.[c.cardRef] : undefined
  if (title !== undefined) v.title = title
  if (c.counter !== undefined) v.counter = c.counter
  const hashes = deck?.faces?.[c.cardRef]
  if (hashes) {
    const def = registry.get(c.type)
    const out: Record<string, string> = {}
    for (const [face, hash] of Object.entries(hashes)) {
      if (face === def.contentFace && !visible) continue
      out[face] = hash
    }
    v.faces = out
  }
  return v
}
