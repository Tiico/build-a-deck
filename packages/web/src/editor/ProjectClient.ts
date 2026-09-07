import type { ProjectDoc, ProjectRow } from '@byd/server'
import type { Element, FaceTemplate, Variant } from '@byd/template'
import { Unauthorized, withCredentials } from '../account/api.js'
import { applyRecipe, point, recipeOf, rect, type Geometry, type Recipe, type Zone } from '../setup/recipe.js'

export type ProjectListener = (client: ProjectClient) => void
export type SaveResult = { ok: true; rev: number } | { ok: false; reason: 'conflict' | 'missing' | string }
export type Cell = string | number | boolean | null
export type Textures = { total: number; done: number; failed: string[] }
// A table of this game as the Bord tab lists it (#19): which session, the version it runs,
// whether its log is locked (C9), and when it last moved.
export type ZonePatch = { name?: string; geometry?: Geometry; visibility?: Zone['visibility']; shortcut?: { label: string; at: 'top' | 'bottom' } | undefined; owner?: string | undefined }
export type TableSummary = { id: string; version: string; ended: boolean; lastAt: string | null }

// The project as the editor holds it: the document, its revision, local edits, and saving with
// optimistic concurrency (a stale save is a conflict to resolve, never a silent overwrite).
// Framework-free so views stay thin; every edit notifies subscribers.
export class ProjectClient {
  private listeners = new Set<ProjectListener>()
  private constructor(
    private readonly http: string,
    readonly id: string,
    public doc: ProjectDoc,
    public rev: number,
    public dirty = false,
  ) {}

  static async open(opts: { http: string; id: string }): Promise<ProjectClient> {
    const res = await fetch(`${opts.http}/projects/${encodeURIComponent(opts.id)}`, withCredentials())
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 403) throw new Error('det här spelet tillhör någon annan')
    if (res.status === 404) throw new Error(`unknown project ${opts.id}`)
    if (!res.ok) throw new Error(`could not load project: ${res.status}`)
    const rec = (await res.json()) as ProjectDoc & { id: string; rev: number }
    const doc: ProjectDoc = { name: rec.name, template: rec.template, rows: rec.rows, icons: rec.icons, setup: rec.setup }
    return new ProjectClient(opts.http, opts.id, doc, rec.rev)
  }

  subscribe(listener: ProjectListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setCell(cardRef: string, field: string, value: Cell): void {
    if (!this.doc.rows.some((r) => r.id === cardRef)) throw new Error(`no row ${cardRef}`)
    this.commit({ ...this.doc, rows: this.doc.rows.map((r) => (r.id === cardRef ? { ...r, fields: { ...r.fields, [field]: value } } : r)) })
  }

  // Appends a row: new cards go to the end of the deck.
  addRow(cardRef: string, fields: Record<string, Cell> = {}): void {
    if (this.doc.rows.some((r) => r.id === cardRef)) throw new Error(`row ${cardRef} already exists`)
    this.commit({ ...this.doc, rows: [...this.doc.rows, { id: cardRef, fields }] })
  }

  removeRow(cardRef: string): void {
    this.commit({ ...this.doc, rows: this.doc.rows.filter((r) => r.id !== cardRef) })
  }

  replaceRows(rows: ProjectRow[]): void {
    this.commit({ ...this.doc, rows })
  }

  // Replaces fields of one element by id (L1). Without a group that is the face's base, and the
  // change reaches every card; with one it becomes that group's override of the same id (#13),
  // and the base stays exactly as it was.
  patchElement(face: string, id: string, patch: Partial<Element>, group?: string | null): void {
    const current = this.faceOf(face)
    if (!group) return this.writeFace(face, { ...current, base: current.base.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)) })
    const from = this.elementInGroup(current, id, group)
    if (!from) throw new Error(`face ${face} has no element ${id}`)
    this.writeVariant(face, current, group, (v) => ({ ...v, override: replaceById(v.override ?? [], { ...from, ...patch } as Element) }))
  }

  // The element a group sees for an id: its own override if it has one, otherwise the base's.
  private elementInGroup(face: FaceTemplate, id: string, group: string): Element | undefined {
    return (face.variants[group]?.override ?? []).find((e) => e.id === id) ?? face.base.find((e) => e.id === id)
  }

  // The column that makes the groups (#13): one column for the whole deck, so a group is one
  // thing with a front and a back (L7), not a different rule per face. `null` ungroups the deck;
  // the variants stay, because ungrouping is not a reason to throw away a design.
  setGroupColumn(column: string | null): void {
    const faces = Object.fromEntries(
      Object.entries(this.doc.template.faces).map(([id, face]) => {
        if (column) return [id, { ...face, variantBy: column }]
        const rest: FaceTemplate = { base: face.base, variants: face.variants }
        return [id, rest]
      }),
    )
    this.commit({ ...this.doc, template: { ...this.doc.template, faces } })
  }

  // Stops a group from overriding an id: the layer goes back to being the base's (#13).
  resetElement(face: string, id: string, group: string): void {
    const current = this.faceOf(face)
    this.writeVariant(face, current, group, (v) => ({
      ...v,
      override: (v.override ?? []).filter((e) => e.id !== id),
      remove: (v.remove ?? []).filter((r) => r !== id),
    }))
  }

  private writeVariant(face: string, current: FaceTemplate, group: string, change: (variant: Variant) => Variant): void {
    const next = change(current.variants[group] ?? {})
    this.writeFace(face, { ...current, variants: { ...current.variants, [group]: next } })
  }

  private faceOf(face: string): FaceTemplate {
    const current = this.doc.template.faces[face]
    if (!current) throw new Error(`template has no face ${face}`)
    return current
  }

  // The one way a face of the template is written: every canvas edit — a patch, an addition, a
  // removal, a move — leaves as one commit of the project.
  private writeFace(face: string, next: FaceTemplate): void {
    this.commit({ ...this.doc, template: { ...this.doc.template, faces: { ...this.doc.template.faces, [face]: next } } })
  }

  // Adding an element from the canvas (#18): it goes last in the base list, which is the drawing
  // order, so a new element is on top of what is already there and can be seen at once.
  addElement(face: string, element: Element, group?: string | null): void {
    const current = this.faceOf(face)
    if (current.base.some((e) => e.id === element.id)) throw new Error(`face ${face} already has an element ${element.id}`)
    if (!group) return this.writeFace(face, { ...current, base: [...current.base, element] })
    // An element added with a group open belongs to that group alone: the base never learns of it.
    if ((current.variants[group]?.override ?? []).some((e) => e.id === element.id)) throw new Error(`face ${face} already has an element ${element.id}`)
    this.writeVariant(face, current, group, (v) => ({ ...v, override: [...(v.override ?? []), element] }))
  }

  // Without a group the element leaves the face for every card; with one it leaves for that
  // group's cards only — as a removal against the base, or, when the group added it, by going.
  removeElement(face: string, id: string, group?: string | null): void {
    const current = this.faceOf(face)
    if (!group) return this.writeFace(face, { ...current, base: current.base.filter((e) => e.id !== id) })
    const inBase = current.base.some((e) => e.id === id)
    this.writeVariant(face, current, group, (v) => ({
      ...v,
      override: (v.override ?? []).filter((e) => e.id !== id),
      ...(inBase ? { remove: [...new Set([...(v.remove ?? []), id])] } : {}),
    }))
  }

  // Reordering the layers (#18): the base list is the drawing order, so a layer moved in the
  // panel is a layer moved here. The index is where the element ends up in that list.
  moveElement(face: string, id: string, to: number): void {
    const current = this.faceOf(face)
    const from = current.base.findIndex((e) => e.id === id)
    if (from < 0) throw new Error(`face ${face} has no element ${id}`)
    const base = [...current.base]
    const moved = base.splice(from, 1)
    base.splice(Math.max(0, Math.min(base.length, to)), 0, ...moved)
    this.writeFace(face, { ...current, base })
  }

  rename(name: string): void {
    this.commit({ ...this.doc, name })
  }

  // The setup's recipe (B5): the knobs the wizard turned, turned again here. Recipe zones come
  // and go with it; the designer's own zones stay.
  get recipe(): Recipe {
    return recipeOf(this.doc.setup)
  }
  setRecipe(recipe: Recipe): void {
    this.commit({ ...this.doc, setup: applyRecipe(this.doc.setup, recipe) })
  }

  // A zone of the designer's own (K2): an area of a card's rows or a pile at a point, in the
  // middle of the table until it is dragged somewhere. Returns its id.
  addZone(kind: 'area' | 'pile'): string {
    const ids = new Set(this.doc.setup.zones.map((z) => z.id))
    const base = kind === 'pile' ? 'hog' : 'yta'
    let n = 1
    while (ids.has(`${base}-${n}`)) n++
    const id = `${base}-${n}`
    const zone: Zone = kind === 'pile' ? { id, kind, name: `Hög ${n}`, visibility: 'all', geometry: point(0, 150) } : { id, kind, name: `Yta ${n}`, visibility: 'all', geometry: rect(-150, 100, 300, 120) }
    this.commit({ ...this.doc, setup: { ...this.doc.setup, zones: [...this.doc.setup.zones, zone] } })
    return id
  }

  removeZone(id: string): void {
    if (id === this.doc.setup.floor || id === this.doc.setup.deckZone) throw new Error(`zone ${id} cannot be removed`)
    if (!this.doc.setup.zones.some((z) => z.id === id)) throw new Error(`no zone ${id}`)
    this.commit({ ...this.doc, setup: { ...this.doc.setup, zones: this.doc.setup.zones.filter((z) => z.id !== id) } })
  }

  // A zone's name (what the table shows), its shortcut (the verb the phone shows, C4), where it
  // lies and how big it is (K2), who owns it and who sees into it. An undefined shortcut or
  // owner removes it: the phone falls back to the name, the zone becomes everyone's.
  patchZone(id: string, patch: ZonePatch): void {
    if (!this.doc.setup.zones.some((z) => z.id === id)) throw new Error(`no zone ${id}`)
    const zones = this.doc.setup.zones.map((z) => {
      if (z.id !== id) return z
      const next: Zone = { ...z }
      if (patch.name !== undefined) next.name = patch.name
      if (patch.geometry !== undefined) next.geometry = patch.geometry
      if (patch.visibility !== undefined) next.visibility = patch.visibility
      if ('shortcut' in patch) {
        if (patch.shortcut) next.shortcut = patch.shortcut
        else delete next.shortcut
      }
      if ('owner' in patch) {
        if (patch.owner) next.owner = patch.owner
        else delete next.owner
      }
      return next
    })
    this.commit({ ...this.doc, setup: { ...this.doc.setup, zones } })
  }

  async save(): Promise<SaveResult> {
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}`, withCredentials({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...this.doc, rev: this.rev }),
    }))
    if (res.status === 409) return { ok: false, reason: 'conflict' }
    if (res.status === 404) return { ok: false, reason: 'missing' }
    if (!res.ok) return { ok: false, reason: `save failed: ${res.status}` }
    const { rev } = (await res.json()) as { rev: number }
    this.rev = rev
    this.dirty = false
    this.notify()
    return { ok: true, rev }
  }

  // The tables started from this game (#19), newest first. The editor keeps no list of its own:
  // a table is a session that names the project, and the server is the one that knows.
  async tables(): Promise<TableSummary[]> {
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/sessions`, withCredentials())
    if (!res.ok) throw new Error(`could not list the tables: ${res.status}`)
    return (await res.json()) as TableSummary[]
  }

  // "Uppdatera bordet" (L5): a table from the saved project, with the room code guests join by
  // and the host key that opens its screen (DRIFT §9). Unsaved edits are saved first.
  async startTable(): Promise<{ id: string; version: string; code: string; hostKey: string }> {
    if (this.dirty) {
      const saved = await this.save()
      if (!saved.ok) throw new Error(`could not save before starting a table: ${saved.reason}`)
    }
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/sessions`, withCredentials({ method: 'POST' }))
    if (!res.ok) throw new Error(`could not start a table: ${res.status}`)
    return (await res.json()) as { id: string; version: string; code: string; hostKey: string }
  }

  // The host's controls (DRIFT §9): a new code, so those who have the old one can no longer
  // come in; and a kick, which frees the seat and ends its connections. The host key the table
  // was started with is the authority, with or without an account.
  async rotateCode(sessionId: string, hostKey: string): Promise<{ code: string; expiresAt: string }> {
    const res = await fetch(`${this.http}/sessions/${encodeURIComponent(sessionId)}/code`, { method: 'POST', headers: { authorization: `Bearer ${hostKey}` } })
    if (!res.ok) throw new Error(`could not rotate the code: ${res.status}`)
    return (await res.json()) as { code: string; expiresAt: string }
  }
  async kick(sessionId: string, hostKey: string, seat: string): Promise<void> {
    const res = await fetch(`${this.http}/sessions/${encodeURIComponent(sessionId)}/kick`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${hostKey}` }, body: JSON.stringify({ seat }) })
    if (!res.ok) throw new Error(`could not kick ${seat}: ${res.status}`)
  }

  // "Uppdatera bordet" on a running table (C7, L5): unsaved edits are saved first, then the
  // table takes the current rev as a version change without stopping the game.
  async refreshTable(sessionId: string): Promise<{ version: string; seqs: number[] }> {
    if (this.dirty) {
      const saved = await this.save()
      if (!saved.ok) throw new Error(`could not save before refreshing the table: ${saved.reason}`)
    }
    const res = await fetch(`${this.http}/sessions/${encodeURIComponent(sessionId)}/refresh`, withCredentials({ method: 'POST' }))
    if (!res.ok) throw new Error(`could not refresh the table: ${res.status}`)
    return (await res.json()) as { version: string; seqs: number[] }
  }

  // Queues the textures of the saved project for a running table without switching it (L5),
  // and says how far they have come. Idempotent: call it until done equals total.
  // `retryFailed` is a person asking again after a render died for good (#10): without it the
  // server leaves a failed job failed, so the editor learns that it is dead instead of polling
  // a queue that will never move.
  async prepareTable(sessionId: string, retryFailed = false): Promise<Textures> {
    if (this.dirty) {
      const saved = await this.save()
      if (!saved.ok) throw new Error(`could not save before preparing the table: ${saved.reason}`)
    }
    const res = await fetch(`${this.http}/sessions/${encodeURIComponent(sessionId)}/prepare${retryFailed ? '?retry=1' : ''}`, withCredentials({ method: 'POST' }))
    if (!res.ok) throw new Error(`could not prepare the table: ${res.status}`)
    return (await res.json()) as Textures
  }

  // How far a table's textures have come (L5).
  async textures(sessionId: string): Promise<Textures> {
    const res = await fetch(`${this.http}/sessions/${encodeURIComponent(sessionId)}/textures`, withCredentials())
    if (!res.ok) throw new Error(`could not read texture status: ${res.status}`)
    return (await res.json()) as Textures
  }

  private commit(doc: ProjectDoc): void {
    this.doc = doc
    this.dirty = true
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l(this)
  }
}

// One element in, one out, by id: an override list is a set keyed by id, not an order.
function replaceById(list: Element[], element: Element): Element[] {
  return list.some((e) => e.id === element.id) ? list.map((e) => (e.id === element.id ? element : e)) : [...list, element]
}
