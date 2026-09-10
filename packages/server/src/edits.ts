import type { Element, FaceTemplate, Variant } from '@byd/template'
import type { Cell, ProjectCredit, ProjectDoc, ProjectFont, ProjectRow, RuleDoc } from './projects.js'
import { applyRecipe, point, rect, type Geometry, type Recipe, type RecipeWords, type Zone } from './recipe.js'

// An edit is a thing that happened to a project (D3). A project is structurally the same as a
// table — shared state several people change at once, which belongs in the history — so it gets
// the same shape: a closed vocabulary of intents, applied by one pure function. The editor
// applies them to what it holds, the actor applies them to the truth, and both get the same
// document out. Nothing here touches the network or the database.
//
// Imported by the editor as well as the server, so this module stays free of anything Node.
export type ZonePatch = { name?: string; geometry?: Geometry; visibility?: Zone['visibility']; shortcut?: { label: string; at: 'top' | 'bottom' } | undefined; owner?: string | undefined }

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
  | { v: 'addField'; field: string }
  | { v: 'removeField'; field: string }
  // The template (L1, #13, #18)
  | { v: 'patchElement'; face: string; id: string; patch: Partial<Element>; group?: string | null }
  | { v: 'addElement'; face: string; element: Element; group?: string | null }
  | { v: 'removeElement'; face: string; id: string; group?: string | null }
  | { v: 'moveElement'; face: string; id: string; to: number }
  | { v: 'resetElement'; face: string; id: string; group: string }
  | { v: 'setGroupColumn'; column: string | null }
  // The table (B5, K2)
  // The words come with the edit, so the actor writes the same zone names the editor showed the
  // designer — their own language, not the tool's home one (A4).
  | { v: 'setRecipe'; recipe: Recipe; words?: RecipeWords }
  | { v: 'addZone'; id: string; kind: 'area' | 'pile'; name: string }
  | { v: 'removeZone'; id: string }
  | { v: 'patchZone'; id: string; patch: ZonePatch }
  // The symbols (E4) and the rulebook (B7)
  | { v: 'setIcon'; name: string; url: string; credit?: ProjectCredit }
  | { v: 'renameIcon'; from: string; to: string }
  | { v: 'removeIcon'; name: string }
  | { v: 'setRules'; rules: RuleDoc }
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
      return { ...doc, rows: doc.rows.map((r) => (r.id === intent.cardRef ? { ...r, fields: { ...r.fields, [intent.field]: intent.value } } : r)) }
    }
    // New cards go to the end of the deck, which is the order it is dealt in.
    case 'addRow': {
      if (doc.rows.some((r) => r.id === intent.cardRef)) throw new Error(`row ${intent.cardRef} already exists`)
      return { ...doc, rows: [...doc.rows, { id: intent.cardRef, fields: intent.fields }] }
    }
    case 'removeRow':
      return { ...doc, rows: doc.rows.filter((r) => r.id !== intent.cardRef) }
    case 'replaceRows':
      return { ...doc, rows: intent.rows }

    // A column exists because the cards carry the key or because the template draws it, so a new
    // one is written onto every card, empty, and a name either of those already answers to is a
    // collision rather than a second column.
    case 'addField': {
      if (intent.field === ANTAL) throw new Error(`field ${ANTAL} is the deck's own`)
      if (columnsOf(doc).includes(intent.field)) throw new Error(`field ${intent.field} already exists`)
      return { ...doc, rows: doc.rows.map((r) => ({ ...r, fields: { ...r.fields, [intent.field]: '' } })) }
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
      return {
        ...doc,
        rows: doc.rows.map((r) => ({ ...r, fields: without(r.fields, intent.field) })),
        template: { ...doc.template, faces },
      }
    }

    // Replaces fields of one element by id (L1). Without a group that is the face's base, and the
    // change reaches every card; with one it becomes that group's override of the same id (#13),
    // and the base stays exactly as it was.
    case 'patchElement': {
      const face = faceOf(doc, intent.face)
      if (!intent.group) return writeFace(doc, intent.face, { ...face, base: face.base.map((e) => (e.id === intent.id ? ({ ...e, ...intent.patch } as Element) : e)) })
      const from = inGroup(face, intent.id, intent.group)
      if (!from) throw new Error(`face ${intent.face} has no element ${intent.id}`)
      return writeVariant(doc, intent.face, face, intent.group, (v) => ({ ...v, override: replaceById(v.override ?? [], { ...from, ...intent.patch } as Element) }))
    }
    // Adding an element from the canvas (#18): it goes last in the base list, which is the
    // drawing order, so a new element is on top of what is already there.
    case 'addElement': {
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
    case 'removeZone': {
      if (intent.id === doc.setup.floor || intent.id === doc.setup.deckZone) throw new Error(`zone ${intent.id} cannot be removed`)
      if (!doc.setup.zones.some((z) => z.id === intent.id)) throw new Error(`no zone ${intent.id}`)
      return { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.filter((z) => z.id !== intent.id) } }
    }
    // A zone's name, its shortcut (C4), where it lies and how big it is (K2), who owns it and who
    // sees into it. An undefined shortcut or owner removes it.
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
  return out
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
