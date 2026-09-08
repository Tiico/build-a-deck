import type { ProjectDoc, ProjectRow, RuleDoc, VersionSummary } from '@byd/server'
import type { DocDiff } from '@byd/server/doc'
import type { Element } from '@byd/template'
import { Unauthorized, withCredentials } from '../account/api.js'
import { applyEdit, recipeOf, type EditIntent, type Recipe, type ZonePatch } from '@byd/server/doc'
import { ASSET_PREFIX } from './assets.js'
import { freeIconName, svgBytes, type GameSymbol } from './symbols.js'

export type ProjectListener = (client: ProjectClient) => void
export type SaveResult = { ok: true; rev: number } | { ok: false; reason: 'conflict' | 'missing' | string }
export type Cell = string | number | boolean | null
export type Textures = { total: number; done: number; failed: string[] }
// A table of this game as the Bord tab lists it (#19): which session, the version it runs,
// whether its log is locked (C9), and when it last moved.
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
    const doc: ProjectDoc = { name: rec.name, template: rec.template, rows: rec.rows, icons: rec.icons, setup: rec.setup, ...(rec.credits ? { credits: rec.credits } : {}), ...(rec.rules ? { rules: rec.rules } : {}) }
    return new ProjectClient(opts.http, opts.id, doc, rec.rev)
  }

  subscribe(listener: ProjectListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Every edit goes the same way (D3): an intent, applied by the one pure function the actor
  // will apply it with too. The editor holds the result until it is saved.
  edit(intent: EditIntent): void {
    this.commit(applyEdit(this.doc, intent))
  }

  setCell(cardRef: string, field: string, value: Cell): void {
    this.edit({ v: 'setCell', cardRef, field, value })
  }

  addRow(cardRef: string, fields: Record<string, Cell> = {}): void {
    this.edit({ v: 'addRow', cardRef, fields })
  }

  removeRow(cardRef: string): void {
    this.edit({ v: 'removeRow', cardRef })
  }

  replaceRows(rows: ProjectRow[]): void {
    this.edit({ v: 'replaceRows', rows })
  }

  patchElement(face: string, id: string, patch: Partial<Element>, group?: string | null): void {
    this.edit({ v: 'patchElement', face, id, patch, ...(group !== undefined ? { group } : {}) })
  }

  setGroupColumn(column: string | null): void {
    this.edit({ v: 'setGroupColumn', column })
  }

  resetElement(face: string, id: string, group: string): void {
    this.edit({ v: 'resetElement', face, id, group })
  }

  addElement(face: string, element: Element, group?: string | null): void {
    this.edit({ v: 'addElement', face, element, ...(group !== undefined ? { group } : {}) })
  }

  removeElement(face: string, id: string, group?: string | null): void {
    this.edit({ v: 'removeElement', face, id, ...(group !== undefined ? { group } : {}) })
  }

  moveElement(face: string, id: string, to: number): void {
    this.edit({ v: 'moveElement', face, id, to })
  }

  rename(name: string): void {
    this.edit({ v: 'rename', name })
  }

  // The setup's recipe (B5): the knobs the wizard turned, turned again here. Recipe zones come
  // and go with it; the designer's own zones stay.
  get recipe(): Recipe {
    return recipeOf(this.doc.setup)
  }
  setRecipe(recipe: Recipe): void {
    this.edit({ v: 'setRecipe', recipe })
  }

  // A zone of the designer's own (K2): an area of a card's rows or a pile at a point, in the
  // middle of the table until it is dragged somewhere. Returns its id.
  addZone(kind: 'area' | 'pile'): string {
    const taken = new Set(this.doc.setup.zones.map((z) => z.id))
    const base = kind === 'pile' ? 'hog' : 'yta'
    let n = 1
    while (taken.has(`${base}-${n}`)) n++
    const id = `${base}-${n}`
    this.edit({ v: 'addZone', id, kind, name: kind === 'pile' ? `Hög ${n}` : `Yta ${n}` })
    return id
  }

  removeZone(id: string): void {
    this.edit({ v: 'removeZone', id })
  }

  patchZone(id: string, patch: ZonePatch): void {
    this.edit({ v: 'patchZone', id, patch })
  }

  // The rulebook (B7): part of the document, so it is saved and versioned with the cards.
  setRules(rules: RuleDoc): void {
    this.edit({ v: 'setRules', rules })
  }

  // The project's history (B4): every save is a version, kept whole and never rewritten. The
  // list is the server's answer, not something the editor keeps of its own.
  async versions(): Promise<VersionSummary[]> {
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/versions`, withCredentials())
    if (res.status === 401) throw new Unauthorized()
    if (!res.ok) throw new Error(`could not read the history: ${res.status}`)
    return (await res.json()) as VersionSummary[]
  }

  // The project as it stood at a revision, or null when there is no such version.
  async at(rev: number): Promise<ProjectDoc | null> {
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/versions/${rev}`, withCredentials())
    if (res.status === 404) return null
    if (res.status === 401) throw new Unauthorized()
    if (!res.ok) throw new Error(`could not open version ${rev}: ${res.status}`)
    const rec = (await res.json()) as ProjectDoc
    return { name: rec.name, template: rec.template, rows: rec.rows, icons: rec.icons, setup: rec.setup, ...(rec.credits ? { credits: rec.credits } : {}), ...(rec.rules ? { rules: rec.rules } : {}) }
  }

  // What a version changed against the one before it; null for the first version of all.
  async diff(rev: number): Promise<DocDiff | null> {
    if (rev <= 1) return null
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/versions/${rev}/diff`, withCredentials())
    if (res.status === 401) throw new Unauthorized()
    if (!res.ok) throw new Error(`could not read what version ${rev} changed: ${res.status}`)
    return (await res.json()) as DocDiff
  }

  // Names a version, or takes the name back with null. Naming does not change the document.
  async nameVersion(rev: number, label: string | null): Promise<void> {
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/versions/${rev}/label`, withCredentials({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) }))
    if (res.status === 401) throw new Unauthorized()
    if (!res.ok) throw new Error(`could not name version ${rev}: ${res.status}`)
  }

  // Bringing an older version back is an edit like any other: it becomes the next version when
  // saved, and the one it came from stays exactly as it was.
  async restore(rev: number): Promise<void> {
    const old = await this.at(rev)
    if (!old) throw new Error(`no version ${rev}`)
    this.commit(old)
  }

  // A symbol from the library taken into the game (E4): its bytes become one of the project's
  // assets, the icon set gets a name for it, and the licence is kept beside the set so it can
  // travel to the printer. The same symbol twice is the same entry, not a second name.
  async useSymbol(symbol: GameSymbol, as?: string): Promise<string> {
    const file = svgBytes(symbol)
    const ref = `${ASSET_PREFIX}${await this.uploadAsset(new Blob([file.bytes], { type: file.type }))}`
    const already = Object.entries(this.doc.icons).find(([, url]) => url === ref)
    if (already) return already[0]
    const name = freeIconName(as ?? symbol.name, this.doc.icons)
    this.edit({ v: 'setIcon', name, url: ref, credit: { licence: symbol.licence, by: symbol.by, source: symbol.id } })
    return name
  }

  // The name is what card text writes between braces, so renaming one moves its credit too.
  renameIcon(from: string, to: string): void {
    this.edit({ v: 'renameIcon', from, to })
  }

  removeIcon(name: string): void {
    this.edit({ v: 'removeIcon', name })
  }

  // An image for the project (E1): uploaded once, named by its bytes; the cell then points at it.
  async uploadAsset(file: Blob): Promise<string> {
    const res = await fetch(`${this.http}/assets`, withCredentials({ method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file }))
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 415) throw new Error('bara bilder kan laddas upp')
    if (res.status === 413) throw new Error('bilden är för stor (max 8 MB)')
    if (!res.ok) throw new Error(`kunde inte ladda upp bilden: ${res.status}`)
    return ((await res.json()) as { hash: string }).hash
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

