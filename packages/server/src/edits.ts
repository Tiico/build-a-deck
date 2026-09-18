import type { AssetCrop as Crop, CardQuery, ZoneAction, ZoneBeside } from '@byd/protocol'
import type { Element, FaceTemplate, Variant } from '@byd/template'
import { showsWholePicture } from '@byd/protocol'
import { AssetCrop, ProjectFraming } from './projects.js'
import type { Cell, Picture, ProjectCredit, ProjectDoc, ProjectFont, ProjectRow, RuleDoc } from './projects.js'
import { applyRecipe, point, rect, seatZones, type Geometry, type Recipe, type RecipeWords, type SeatRole, type Shortcut, type Zone } from './recipe.js'

// An edit is a thing that happened to a project (D3). A project is structurally the same as a
// table — shared state several people change at once, which belongs in the history — so it gets
// the same shape: a closed vocabulary of intents, applied by one pure function. The editor
// applies them to what it holds, the actor applies them to the truth, and both get the same
// document out. Nothing here touches the network or the database.
//
// Imported by the editor as well as the server, so this module stays free of anything Node.
// A departure is filed under the card and the column the picture sits in, and that spelling is
// written in exactly one place so nothing can disagree about it.
export const framingKey = (cardRef: string, field: string): string => `${cardRef}/${field}`
const framingWithout = (doc: ProjectDoc, key: string) => (doc.framing?.[key] === undefined ? {} : { framing: without(doc.framing, key) })
const framingOfCards = (doc: ProjectDoc, keep: (cardRef: string) => boolean) => {
  if (!doc.framing) return {}
  const left = Object.fromEntries(Object.entries(doc.framing).filter(([key]) => keep(key.slice(0, key.indexOf('/')))))
  return Object.keys(left).length === Object.keys(doc.framing).length ? {} : { framing: left }
}

// Every `{namn|roll}` in a card's text that named the old meaning, named as the new one. The
// symbol's own name is left alone: only what stands after the bar is the meaning.
function renamedRole(fields: Record<string, Cell>, from: string, to: string): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  const wanted = new RegExp(`\\{([\\p{L}\\p{N}_-]+)\\|${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'gu')
  for (const [key, value] of Object.entries(fields)) out[key] = typeof value === 'string' ? value.replace(wanted, `{$1|${to}}`) : value
  return out
}

export type ZonePatch = {
  name?: string
  geometry?: Geometry
  visibility?: Zone['visibility']
  shortcut?: { label: string; at: 'top' | 'bottom' } | undefined
  owner?: string | undefined
  // Which side of the pile is "beside it" (K21). Away again means the left the pile always had.
  beside?: ZoneBeside | undefined
  // Which cards start here, and what the zone can be asked for (B5, K14). Both are lists that
  // change as a whole rather than item by item: what the designer edits is the question and the
  // action, and a patch that could only add or remove one clause would need an edit per shape.
  // An empty list means none, and is stored as no property at all.
  fill?: CardQuery | undefined
  actions?: ZoneAction[] | undefined
}

// The properties a patch may take away again (L15, L17). Each one means something by its own
// absence, which a patch cannot otherwise say: `undefined` does not survive JSON, so "this layer
// has no shadow any more" would arrive at the actor as a patch that changes nothing. Every other
// property of an element either has a value or does not exist for that kind.
export type Clearable = 'name' | 'locked' | 'shadow' | 'pattern'

export type EditIntent =
  | { v: 'rename'; name: string }
  // The deck (L4)
  | { v: 'setCell'; cardRef: string; field: string; value: Cell }
  | { v: 'addRow'; cardRef: string; fields: Record<string, Cell> }
  | { v: 'removeRow'; cardRef: string }
  | { v: 'replaceRows'; rows: ProjectRow[] }
  // A column of the deck (#32). One edit and not a rewritten table: that is what makes a new
  // column one version and one step back (B4), and it keeps a log entry for an empty column from
  // carrying every card in the game. `field` is the key as it stands in the document — an
  // identifier, never a translated word (A4, #27).
  // `bind` is the canvas door (#32): the designer went to say which column an element shows,
  // found the column missing and made it there, which is one thing she did and must be one edit.
  // Sending the column and the binding separately would be two versions and two steps back, and
  // the first step back would leave a state nobody asked for — the new column standing in the
  // table with the element bound to the field it had before.
  | { v: 'addField'; field: string; bind?: { face: string; id: string; group?: string | null } }
  | { v: 'removeField'; field: string }
  // Where a column stands in the table (#46). The order is the document's and not the reader's:
  // everyone with the project open sees it, the CSV export writes it, and a step back takes it
  // back — which a view in one browser could do none of. `before` is the column it comes to
  // stand in front of, and `null` is the far end: last of all.
  | { v: 'moveField'; field: string; before: string | null }
  // The template (L1, #13, #18)
  // `clear` takes properties off the element rather than setting them, which a patch cannot do:
  // `undefined` does not survive JSON, so a patch that means "this layer has no name any more"
  // arrives at the actor as a patch that says nothing at all. The list is closed to the two
  // properties whose absence is their meaning (L15) — every other property of an element either
  // has a value or does not exist for that kind.
  | { v: 'patchElement'; face: string; id: string; patch: Partial<Element>; clear?: Clearable[]; group?: string | null }
  // `icon` is the canvas's other door (#33), and it is the field door's twin: the designer asked
  // for an icon on the card, and an icon on the card is two things at once — a symbol the game did
  // not have, and an element that shows it. She did one thing, so it is one edit. Sent separately
  // they would be two versions and two steps back (B4), and between the two presses the card would
  // carry an element pointing at a name the icon set does not answer to.
  | { v: 'addElement'; face: string; element: Element; group?: string | null; icon?: { name: string; url: string; credit?: ProjectCredit } }
  | { v: 'removeElement'; face: string; id: string; group?: string | null }
  | { v: 'moveElement'; face: string; id: string; to: number }
  // A whole face at once (L17). Choosing one of the ready-made backs is one thing the designer
  // did, so it is one edit — the same reason `replaceRows` exists rather than a removal and an
  // addition per card. Sent as a removal and an addition per layer it would be a dozen versions
  // and a dozen steps back (B4), with a half-built back standing at every one of them.
  | { v: 'replaceFace'; face: string; base: Element[] }
  | { v: 'resetElement'; face: string; id: string; group: string }
  | { v: 'setGroupColumn'; column: string | null }
  // The table (B5, K2)
  // The words come with the edit, so the actor writes the same zone names the editor showed the
  // designer — their own language, not the tool's home one (A4).
  | { v: 'setRecipe'; recipe: Recipe; words?: RecipeWords }
  | { v: 'addZone'; id: string; kind: 'area' | 'pile'; name: string }
  | { v: 'removeZone'; id: string }
  // The same zone for every seat (B5, reviderat): an area in front of each player, or the strip
  // its counters lie on. One thing the designer did, so one edit and one step back (B4) — eight
  // separate additions would be eight versions, with a half-laid table at every one of them.
  // `name` may carry `{seat}`, which becomes the seat's letter, and it is written in the language
  // the designer is building the game in (A4), like every other word the tool suggests.
  | { v: 'addSeatZone'; role: SeatRole; name: string; shortcut?: Shortcut }
  // A whole zone laid down as it stands: what a paste is. `addZone` makes a blank one, which a
  // copy is not — the copy carries the question it asks, what it can be asked for, its shortcut,
  // its owner and its size, and those are the whole reason to copy a zone rather than build a
  // second one by hand.
  | { v: 'insertZone'; zone: Zone }
  // Where the deck lies (B5, K10). The deck is a role a pile carries and not a zone of its own:
  // a designer may call any pile the deck, and moving the role is what lets the pile the wizard
  // laid out be taken away like any other.
  | { v: 'setDeck'; id: string }
  | { v: 'patchZone'; id: string; patch: ZonePatch }
  // The symbols (E4) and the rulebook (B7)
  | { v: 'setIcon'; name: string; url: string; credit?: ProjectCredit }
  | { v: 'renameIcon'; from: string; to: string }
  | { v: 'removeIcon'; name: string }
  | { v: 'setRules'; rules: RuleDoc }
  // The game's meanings and what they are painted in (E4). The cards write the meaning and never
  // the colour, so repainting a deck is one edit here and renaming one rewrites every card that
  // says it — which is exactly what `renameIcon` already does for a symbol's name.
  | { v: 'setRole'; role: string; colour: string }
  | { v: 'renameRole'; from: string; to: string }
  | { v: 'removeRole'; role: string }
  // What one card asks of its template's measure (E1), under the card and the column the picture
  // sits in. `null` is the card going back to the measure the deck gave it.
  | { v: 'setFraming'; cardRef: string; field: string; framing: ProjectFraming | null }
  // The window a picture is looked at through (#222, L22, beslut 2), under the hash of its own
  // bytes. It is said once and every card drawn from the picture obeys it — which is why the
  // intent names no card: there is no card to name. `null` is the picture going back to whole.
  | { v: 'setCrop'; hash: string; crop: Crop | null }
  // The type the game is set in (B3). A family the project names carries the file it is drawn
  // from, so a version prints as it was designed rather than as the printer's machine guesses.
  | { v: 'setFont'; family: string; font: ProjectFont }
  | { v: 'removeFont'; family: string }
  // Taking an older version back (B4) is an edit like any other: it lands in the log, everyone
  // with the project open sees it, and it becomes the next version when saved.
  | { v: 'restore'; doc: ProjectDoc }

export function applyEdit(doc: ProjectDoc, intent: EditIntent): ProjectDoc {
  switch (intent.v) {
    case 'rename':
      return { ...doc, name: intent.name }

    case 'setCell': {
      if (!doc.rows.some((r) => r.id === intent.cardRef)) throw new Error(`no row ${intent.cardRef}`)
      const rows = doc.rows.map((r) => (r.id === intent.cardRef ? { ...r, fields: { ...r.fields, [intent.field]: intent.value } } : r))
      // A departure from the measure was chosen while looking at one picture (E1). Kept across a
      // change of picture it is a crop written by mistake — numbers picked for someone else's art
      // framing this one — so the cell taking a new value drops it.
      return { ...doc, rows, ...framingWithout(doc, framingKey(intent.cardRef, intent.field)) }
    }
    // New cards go to the end of the deck, which is the order it is dealt in.
    case 'addRow': {
      if (doc.rows.some((r) => r.id === intent.cardRef)) throw new Error(`row ${intent.cardRef} already exists`)
      return { ...doc, rows: [...doc.rows, { id: intent.cardRef, fields: intent.fields }] }
    }
    case 'removeRow':
      return { ...doc, rows: doc.rows.filter((r) => r.id !== intent.cardRef), ...framingOfCards(doc, (id) => id !== intent.cardRef) }
    case 'replaceRows': {
      const kept = new Set(intent.rows.map((r) => r.id))
      return { ...doc, rows: intent.rows, ...framingOfCards(doc, (id) => kept.has(id)) }
    }

    // A column exists because the cards carry the key or because the template draws it, so a new
    // one is written onto every card, empty, and a name either of those already answers to is a
    // collision rather than a second column.
    case 'addField': {
      if (intent.field === ANTAL) throw new Error(`field ${ANTAL} is the deck's own`)
      if (columnsOf(doc).includes(intent.field)) throw new Error(`field ${intent.field} already exists`)
      const written = { ...doc, rows: doc.rows.map((r) => ({ ...r, fields: { ...r.fields, [intent.field]: '' } })) }
      if (!intent.bind) return written
      // The element that went looking for the column is bound to it here rather than by a second
      // edit, and by the verb that already knows how to write a binding — into the base or into
      // the open group's own override, exactly as `patchElement` would have done it alone.
      const { face, id, group } = intent.bind
      // Half a composite edit is the same silence a whole one would be, so the column goes with
      // the refusal — and it is `patchElement`'s own refusal that takes it, now that the verb
      // looks the id up instead of mapping over the base (#41). What is thrown away when it
      // refuses is this document, the column written on every card and all.
      return applyEdit(written, { v: 'patchElement', face, id, patch: { bind: { field: intent.field } }, ...(group !== undefined ? { group } : {}) })
    }
    // And a column that goes takes with it everything that pointed at it: the value on every
    // card, the elements that drew it — a condition on it takes what it was guarding with it, so
    // no card is left showing what was only meant to appear sometimes — and the grouping, if the
    // deck was grouped by that column (#13). `antal` is the engine's and is not the designer's
    // to take away (L4).
    case 'removeField': {
      if (intent.field === ANTAL) throw new Error(`field ${ANTAL} cannot be removed`)
      const faces = Object.fromEntries(
        Object.entries(doc.template.faces).map(([id, face]) => {
          const next: FaceTemplate = {
            base: withoutField(face.base, intent.field),
            variants: Object.fromEntries(
              Object.entries(face.variants).map(([name, v]) => [name, { ...v, ...(v.override ? { override: withoutField(v.override, intent.field) } : {}) }]),
            ),
            ...(face.variantBy && face.variantBy !== intent.field ? { variantBy: face.variantBy } : {}),
          }
          return [id, next]
        }),
      )
      // The order goes with it as well, or the document would keep an order about a column
      // nothing answers to any more. `columnsOf` would step over the name either way; what is
      // avoided is writing it down for ever.
      const order = doc.columns?.filter((f) => f !== intent.field)
      return {
        ...doc,
        rows: doc.rows.map((r) => ({ ...r, fields: without(r.fields, intent.field) })),
        template: { ...doc.template, faces },
        ...(order ? { columns: order } : {}),
      }
    }

    // A column moved to another place in the table (#46). What is written down is the whole
    // order and not the one move: read back, an order is a list to lay over the derivation, and
    // half an order would leave every column the designer has not touched to the derivation's
    // own mind about where it goes.
    case 'moveField': {
      if (intent.field === ANTAL) throw new Error(`field ${ANTAL} stands last and is not moved`)
      const columns = columnsOf(doc)
      if (!columns.includes(intent.field)) throw new Error(`no field ${intent.field}`)
      if (intent.before !== null && !columns.includes(intent.before)) throw new Error(`no field ${intent.before}`)
      if (intent.before === intent.field) throw new Error(`field ${intent.field} cannot stand before itself`)
      const rest = columns.filter((f) => f !== intent.field)
      const at = intent.before === null ? rest.length : rest.indexOf(intent.before)
      return { ...doc, columns: [...rest.slice(0, at), intent.field, ...rest.slice(at)] }
    }

    // Replaces fields of one element by id (L1). Without a group that is the face's base, and the
    // change reaches every card; with one it becomes that group's override of the same id (#13),
    // and the base stays exactly as it was.
    case 'patchElement': {
      const face = faceOf(doc, intent.face)
      if (!intent.group) {
        // A lookup that can fail, not a mapping: written as a map over the base, an id the face
        // does not have handed back the document it was given, and the edit still became a version
        // and a step back — the designer saw nothing happen and had spent a Ctrl+Z on it (#41, B4).
        const from = face.base.find((e) => e.id === intent.id)
        if (!from) throw new Error(`face ${intent.face} has no element ${intent.id}`)
        return writeFace(doc, intent.face, { ...face, base: replaceById(face.base, patched(from, intent.patch, intent.clear)) })
      }
      const from = inGroup(face, intent.id, intent.group)
      if (!from) throw new Error(`face ${intent.face} has no element ${intent.id}`)
      return writeVariant(doc, intent.face, face, intent.group, (v) => ({ ...v, override: replaceById(v.override ?? [], patched(from, intent.patch, intent.clear)) }))
    }
    // Adding an element from the canvas (#18): it goes last in the base list, which is the
    // drawing order, so a new element is on top of what is already there.
    case 'addElement': {
      // The symbol comes into the icon set first, by the verb that already knows how to put one
      // there, so an element that shows it never exists in a document that has not heard of it.
      // A refusal below throws the whole of this away, symbol and all, exactly as the column door
      // does (#32): half a composite edit is the same silence a whole one would be.
      if (intent.icon) {
        const { icon, ...rest } = intent
        return applyEdit(applyEdit(doc, { v: 'setIcon', ...icon }), rest)
      }
      const face = faceOf(doc, intent.face)
      if (face.base.some((e) => e.id === intent.element.id)) throw new Error(`face ${intent.face} already has an element ${intent.element.id}`)
      if (!intent.group) return writeFace(doc, intent.face, { ...face, base: [...face.base, intent.element] })
      // An element added with a group open belongs to that group alone: the base never learns of it.
      if ((face.variants[intent.group]?.override ?? []).some((e) => e.id === intent.element.id)) throw new Error(`face ${intent.face} already has an element ${intent.element.id}`)
      return writeVariant(doc, intent.face, face, intent.group, (v) => ({ ...v, override: [...(v.override ?? []), intent.element] }))
    }
    // Without a group the element leaves the face for every card; with one it leaves for that
    // group's cards only — as a removal against the base, or, when the group added it, by going.
    case 'removeElement': {
      const face = faceOf(doc, intent.face)
      if (!intent.group) return writeFace(doc, intent.face, { ...face, base: face.base.filter((e) => e.id !== intent.id) })
      const inBase = face.base.some((e) => e.id === intent.id)
      return writeVariant(doc, intent.face, face, intent.group, (v) => ({
        ...v,
        override: (v.override ?? []).filter((e) => e.id !== intent.id),
        ...(inBase ? { remove: [...new Set([...(v.remove ?? []), intent.id])] } : {}),
      }))
    }
    // Reordering the layers (#18): the base list is the drawing order, so a layer moved in the
    // panel is a layer moved here.
    case 'replaceFace': {
      // A face the template does not have yet is made rather than refused: an empty back is
      // exactly the back a gallery is for.
      const face = doc.template.faces[intent.face] ?? { base: [], variants: {} }
      return writeFace(doc, intent.face, { ...face, base: intent.base })
    }
    case 'moveElement': {
      const face = faceOf(doc, intent.face)
      const from = face.base.findIndex((e) => e.id === intent.id)
      if (from < 0) throw new Error(`face ${intent.face} has no element ${intent.id}`)
      const list = [...face.base]
      const moved = list.splice(from, 1)
      list.splice(Math.max(0, Math.min(list.length, intent.to)), 0, ...moved)
      return writeFace(doc, intent.face, { ...face, base: list })
    }
    // Stops a group from overriding an id: the layer goes back to being the base's (#13).
    case 'resetElement': {
      const face = faceOf(doc, intent.face)
      return writeVariant(doc, intent.face, face, intent.group, (v) => ({
        ...v,
        override: (v.override ?? []).filter((e) => e.id !== intent.id),
        remove: (v.remove ?? []).filter((r) => r !== intent.id),
      }))
    }
    // The column that makes the groups (#13): one column for the whole deck. `null` ungroups it;
    // the variants stay, because ungrouping is not a reason to throw away a design.
    case 'setGroupColumn': {
      const faces = Object.fromEntries(
        Object.entries(doc.template.faces).map(([id, face]) => {
          if (intent.column) return [id, { ...face, variantBy: intent.column }]
          const rest: FaceTemplate = { base: face.base, variants: face.variants }
          return [id, rest]
        }),
      )
      return { ...doc, template: { ...doc.template, faces } }
    }

    case 'setRecipe':
      return { ...doc, setup: applyRecipe(doc.setup, intent.recipe, intent.words) }
    case 'addZone': {
      if (doc.setup.zones.some((z) => z.id === intent.id)) throw new Error(`zone ${intent.id} already exists`)
      const zone: Zone =
        intent.kind === 'pile'
          ? { id: intent.id, kind: 'pile', name: intent.name, visibility: 'all', geometry: point(0, 150) }
          : { id: intent.id, kind: 'area', name: intent.name, visibility: 'all', geometry: rect(-150, 100, 300, 120) }
      return { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, zone] } }
    }
    // The table is the designer's (B5): every zone and every pile is theirs to take away, the
    // recipe's own among them. Three are not, and each for a reason of its own — the floor is the
    // table itself, a seat *is* a hand (C3), and the deck has to lie somewhere, which is why the
    // way to be rid of the draw pile is to point the deck at another pile first (`setDeck`).
    case 'removeZone': {
      const gone = doc.setup.zones.find((z) => z.id === intent.id)
      if (!gone) throw new Error(`no zone ${intent.id}`)
      if (intent.id === doc.setup.floor) throw new Error(`zone ${intent.id} is the felt itself`)
      if (gone.kind === 'hand') throw new Error(`zone ${intent.id} is a seat's hand and goes with the seat`)
      if (intent.id === doc.setup.deckZone) throw new Error(`zone ${intent.id} holds the deck; point the deck at another pile first`)
      return { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.filter((z) => z.id !== intent.id) } }
    }
    case 'addSeatZone': {
      const made = seatZones(doc.setup, intent.role, intent.name, intent.shortcut)
      if (made.length === 0) return doc
      return { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, ...made] } }
    }

    // The deck moves to another pile, and the hands with it: a hand returns its cards to the deck,
    // so what `returnTo` names is the role and not the pile the recipe once laid out.
    case 'setDeck': {
      const pile = doc.setup.zones.find((z) => z.id === intent.id)
      if (!pile) throw new Error(`no zone ${intent.id}`)
      if (pile.kind !== 'pile') throw new Error(`zone ${intent.id} is not a pile; the deck lies in a pile`)
      const zones = doc.setup.zones.map((z) => (z.kind === 'hand' ? { ...z, returnTo: intent.id } : z))
      return { ...doc, setup: { ...doc.setup, deckZone: intent.id, zones } }
    }

    // A zone's name, its shortcut (C4), where it lies and how big it is (K2), who owns it and who
    // sees into it. An undefined shortcut or owner removes it.
    // Laying down a whole zone (a paste). A hand is never one: a seat *is* a hand (C3), so a
    // second hand for a seat is a table nobody asked for. An id already on the table is a
    // mistake in the caller and not something to paper over by renaming.
    case 'insertZone': {
      if (doc.setup.zones.some((z) => z.id === intent.zone.id)) throw new Error(`zone ${intent.zone.id} already exists`)
      if (intent.zone.kind === 'hand') throw new Error('a hand belongs to its seat and cannot be laid down on its own')
      return { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, intent.zone] } }
    }

    case 'patchZone': {
      if (!doc.setup.zones.some((z) => z.id === intent.id)) throw new Error(`no zone ${intent.id}`)
      const zones = doc.setup.zones.map((z) => {
        if (z.id !== intent.id) return z
        const next: Zone = { ...z }
        if (intent.patch.name !== undefined) next.name = intent.patch.name
        if (intent.patch.geometry !== undefined) next.geometry = intent.patch.geometry
        if (intent.patch.visibility !== undefined) next.visibility = intent.patch.visibility
        if ('shortcut' in intent.patch) {
          if (intent.patch.shortcut) next.shortcut = intent.patch.shortcut
          else delete next.shortcut
        }
        if ('owner' in intent.patch) {
          if (intent.patch.owner) next.owner = intent.patch.owner
          else delete next.owner
        }
        if ('beside' in intent.patch) {
          if (intent.patch.beside) next.beside = intent.patch.beside
          else delete next.beside
        }
        if ('fill' in intent.patch) {
          const fill = intent.patch.fill
          if (fill && fill.length > 0) next.fill = fill
          else delete next.fill
        }
        if ('actions' in intent.patch) {
          const actions = intent.patch.actions
          if (actions && actions.length > 0) next.actions = actions
          else delete next.actions
        }
        return next
      })
      return { ...doc, setup: { ...doc.setup, zones } }
    }

    case 'setIcon':
      return {
        ...doc,
        icons: { ...doc.icons, [intent.name]: intent.url },
        ...(intent.credit ? { credits: { ...(doc.credits ?? {}), [intent.name]: intent.credit } } : {}),
      }
    // The name is what card text writes between braces, so renaming one moves its credit too.
    case 'renameIcon': {
      const url = doc.icons[intent.from]
      if (url === undefined) throw new Error(`no icon ${intent.from}`)
      if (doc.icons[intent.to] !== undefined) throw new Error(`icon ${intent.to} already exists`)
      const credit = doc.credits?.[intent.from]
      return {
        ...doc,
        icons: { ...without(doc.icons, intent.from), [intent.to]: url },
        credits: { ...without(doc.credits ?? {}, intent.from), ...(credit ? { [intent.to]: credit } : {}) },
      }
    }
    case 'removeIcon':
      return { ...doc, icons: without(doc.icons, intent.name), credits: without(doc.credits ?? {}, intent.name) }
    case 'setRules':
      return { ...doc, rules: intent.rules }
    case 'setRole': {
      if (!intent.role.trim() || !intent.colour.trim()) throw new Error('a meaning needs a name and a colour')
      return { ...doc, palette: { ...(doc.palette ?? {}), [intent.role]: intent.colour } }
    }
    // Renaming a meaning rewrites every card that says it, for the same reason renaming a symbol
    // does: what is written on a card is the name, and a name nothing answers to is a lost word.
    case 'renameRole': {
      const colour = doc.palette?.[intent.from]
      if (colour === undefined) throw new Error(`no role ${intent.from}`)
      if (doc.palette?.[intent.to] !== undefined) throw new Error(`role ${intent.to} already exists`)
      return {
        ...doc,
        palette: { ...without(doc.palette ?? {}, intent.from), [intent.to]: colour },
        rows: doc.rows.map((r) => ({ ...r, fields: renamedRole(r.fields, intent.from, intent.to) })),
      }
    }
    case 'removeRole':
      return { ...doc, palette: without(doc.palette ?? {}, intent.role) }
    case 'setFraming': {
      const key = framingKey(intent.cardRef, intent.field)
      if (!doc.rows.some((r) => r.id === intent.cardRef)) throw new Error(`no row ${intent.cardRef}`)
      if (intent.framing === null) return { ...doc, ...framingWithout(doc, key) }
      // Checked here, where the value enters, and not only where the document is written: an
      // intent arrives from a browser and nothing between the two reads the schema. A departure
      // that cannot be one would otherwise crop that card on every render from now on (E1).
      return { ...doc, framing: { ...(doc.framing ?? {}), [key]: ProjectFraming.parse(intent.framing) } }
    }
    case 'setCrop': {
      // Checked here, where the value enters, for the same reason a departure is (E1): an intent
      // arrives from a browser and nothing between the two reads the schema. A window that cannot
      // be cut would otherwise crop every card drawn from this picture from now on.
      const asked = intent.crop === null ? null : AssetCrop.parse(intent.crop)
      // A window that shows all of the picture is the picture going back to whole, however the
      // designer said so — dragged out to the edges or asked for by name.
      const crop = asked !== null && showsWholePicture(asked) ? null : asked
      const was = doc.pictures?.[intent.hash] ?? {}
      // The picture keeps its entry when the crop goes. The record is what the game knows about
      // the picture, and a picture it has met is one it has met whether or not it has cropped it;
      // the entry is also where the next thing said about a picture will go.
      const now: Picture = crop === null ? without(was, 'crop') : { ...was, crop }
      return { ...doc, pictures: { ...(doc.pictures ?? {}), [intent.hash]: now } }
    }
    // Naming a family again replaces it, so swapping the file for a better cut is one entry.
    case 'setFont':
      return { ...doc, fonts: { ...(doc.fonts ?? {}), [intent.family]: intent.font } }
    // A family that goes is a family the cards fall back from: the name is then a CSS stack as
    // written, which is what the unpinned-font warning is about (E5).
    case 'removeFont':
      return { ...doc, fonts: without(doc.fonts ?? {}, intent.family) }
    case 'restore':
      return intent.doc
  }
}

function faceOf(doc: ProjectDoc, face: string): FaceTemplate {
  const found = doc.template.faces[face]
  if (!found) throw new Error(`template has no face ${face}`)
  return found
}
// The one way a face of the template is written: every canvas edit leaves as one edit.
function writeFace(doc: ProjectDoc, face: string, next: FaceTemplate): ProjectDoc {
  return { ...doc, template: { ...doc.template, faces: { ...doc.template.faces, [face]: next } } }
}
function writeVariant(doc: ProjectDoc, faceId: string, face: FaceTemplate, group: string, change: (variant: Variant) => Variant): ProjectDoc {
  return writeFace(doc, faceId, { ...face, variants: { ...face.variants, [group]: change(face.variants[group] ?? {}) } })
}
// The element a group sees for an id: its own override if it has one, otherwise the base's.
function inGroup(face: FaceTemplate, id: string, group: string): Element | undefined {
  return (face.variants[group]?.override ?? []).find((e) => e.id === id) ?? face.base.find((e) => e.id === id)
}
// An element with a patch written over it, and the properties it was told to take away taken
// away. Unlocking a layer, or giving it its id back for a name (L15), must leave exactly the
// element a layer that was never locked and never renamed has — or the diff between two versions
// would report a change nobody made (B4), and an empty key would travel to the printer.
function patched(from: Element, patch: Partial<Element>, clear: Clearable[] = []): Element {
  const gone = new Set<string>([...clear, ...Object.entries(patch).flatMap(([key, value]) => (value === undefined ? [key] : []))])
  return Object.fromEntries(Object.entries({ ...from, ...patch }).filter(([key]) => !gone.has(key))) as Element
}

function replaceById(list: Element[], element: Element): Element[] {
  const at = list.findIndex((e) => e.id === element.id)
  if (at < 0) return [...list, element]
  const next = [...list]
  next[at] = element
  return next
}
// A record without one key, since deleting a computed key is not how records are built here.
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))
}

// The one column the engine reads: how many copies of the card the deck holds (L4). It is not
// the designer's to make or to take away, in the wizard or in the editor.
export const ANTAL = 'antal'

// Every name the deck answers to, in the order a table shows them: what the template draws,
// face by face, then whatever else the cards carry. This is the truth about which columns a
// project has — there is no list of fields in the document, and there is deliberately none:
// a column is either drawn or written in, and both are visible here.
export function columnsOf(doc: ProjectDoc): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (field: string) => {
    if (seen.has(field)) return
    seen.add(field)
    out.push(field)
  }
  const walk = (els: readonly Element[]) => {
    for (const el of els) {
      if ('bind' in el && 'field' in el.bind) add(el.bind.field)
      if (el.kind === 'if') {
        add(el.when.field)
        walk(el.children)
      }
      if (el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    if (face.variantBy) add(face.variantBy)
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  for (const row of doc.rows) for (const key of Object.keys(row.fields)) add(key)
  // And the order the designer put them in, laid over that (#46). It is read as an order and
  // never as the list itself: a name in it that the deck no longer answers to is stepped over,
  // and a column it does not mention — one made since the last move — keeps the place the walk
  // above gave it. So a project that has never been reordered, and a project whose order is
  // half a year out of date, both read back as decks with exactly the columns they have.
  const wanted = doc.columns
  if (!wanted || wanted.length === 0) return out
  const has = new Set(out)
  const order = wanted.filter((f) => has.has(f))
  const placed = new Set(order)
  for (const field of out) if (!placed.has(field)) order.push(field)
  return order
}

// How many elements of the template would go with a column, counted across every face and every
// group's own override. What `removeField` takes, in other words, so a question about it can say
// so before it is answered — and the two walk the tree the same way on purpose. A condition on
// the column goes with everything it was guarding, so counting the condition as one element and
// stopping there promised one and took a subtree.
export function drawnBy(doc: ProjectDoc, field: string): number {
  // Every element of a subtree, itself included: what is lost when the subtree is dropped whole.
  const all = (els: readonly Element[]): number => els.reduce((n, el) => n + 1 + ('children' in el ? all(el.children) : 0), 0)
  const count = (els: readonly Element[]): number => {
    let n = 0
    for (const el of els) {
      if ('bind' in el && 'field' in el.bind && el.bind.field === field) n++
      else if (el.kind === 'if' && el.when.field === field) n += 1 + all(el.children)
      else if (el.kind === 'if' || el.kind === 'group') n += count(el.children)
    }
    return n
  }
  let n = 0
  for (const face of Object.values(doc.template.faces)) {
    n += count(face.base)
    for (const v of Object.values(face.variants)) n += count(v.override ?? [])
  }
  return n
}

// The elements left when a column goes: those that drew it are gone, and a condition on it goes
// with what it was guarding, since children shown only sometimes should not become children
// shown always.
function withoutField(els: readonly Element[], field: string): Element[] {
  const out: Element[] = []
  for (const el of els) {
    if ('bind' in el && 'field' in el.bind && el.bind.field === field) continue
    if (el.kind === 'if') {
      if (el.when.field === field) continue
      out.push({ ...el, children: withoutField(el.children, field) })
      continue
    }
    if (el.kind === 'group') {
      out.push({ ...el, children: withoutField(el.children, field) })
      continue
    }
    out.push(el)
  }
  return out
}
