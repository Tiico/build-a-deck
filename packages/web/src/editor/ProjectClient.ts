import type { ProjectDoc, ProjectRow } from '@byd/server'
import type { Element, FaceTemplate } from '@byd/template'
import { Unauthorized, withCredentials } from '../account/api.js'

export type ProjectListener = (client: ProjectClient) => void
export type SaveResult = { ok: true; rev: number } | { ok: false; reason: 'conflict' | 'missing' | string }
export type Cell = string | number | boolean | null
export type Textures = { total: number; done: number; failed: string[] }

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

  // Replaces fields of one element in one face's base by id (L1); the variants are untouched.
  patchElement(face: string, id: string, patch: Partial<Element>): void {
    const current = this.doc.template.faces[face]
    if (!current) throw new Error(`template has no face ${face}`)
    const next: FaceTemplate = { ...current, base: current.base.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)) }
    this.commit({ ...this.doc, template: { ...this.doc.template, faces: { ...this.doc.template.faces, [face]: next } } })
  }

  rename(name: string): void {
    this.commit({ ...this.doc, name })
  }

  // A zone's name (what the table shows) and its shortcut (the verb the phone shows, C4); an
  // undefined shortcut removes it, so the phone falls back to the name.
  patchZone(id: string, patch: { name?: string; shortcut?: { label: string; at: 'top' | 'bottom' } | undefined }): void {
    if (!this.doc.setup.zones.some((z) => z.id === id)) throw new Error(`no zone ${id}`)
    const zones = this.doc.setup.zones.map((z) => {
      if (z.id !== id) return z
      const next = { ...z, ...(patch.name !== undefined ? { name: patch.name } : {}) }
      const shortcut = 'shortcut' in patch ? patch.shortcut : z.shortcut
      if (shortcut) next.shortcut = shortcut
      else delete next.shortcut
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
  async prepareTable(sessionId: string, retryFailed = false): Promise<Textures> {
    if (this.dirty) {
      const saved = await this.save()
      if (!saved.ok) throw new Error(`could not save before preparing the table: ${saved.reason}`)
    }
    const suffix = retryFailed ? '?retry=1' : ''
    const res = await fetch(`${this.http}/sessions/${encodeURIComponent(sessionId)}/prepare${suffix}`, withCredentials({ method: 'POST' }))
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
