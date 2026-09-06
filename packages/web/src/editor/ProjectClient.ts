import type { ProjectDoc } from '@byd/server'
import type { Element, FaceTemplate } from '@byd/template'

export type ProjectListener = (client: ProjectClient) => void
export type SaveResult = { ok: true; rev: number } | { ok: false; reason: 'conflict' | 'missing' | string }
export type Cell = string | number | boolean | null

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
    const res = await fetch(`${opts.http}/projects/${encodeURIComponent(opts.id)}`)
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

  async save(): Promise<SaveResult> {
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...this.doc, rev: this.rev }),
    })
    if (res.status === 409) return { ok: false, reason: 'conflict' }
    if (res.status === 404) return { ok: false, reason: 'missing' }
    if (!res.ok) return { ok: false, reason: `save failed: ${res.status}` }
    const { rev } = (await res.json()) as { rev: number }
    this.rev = rev
    this.dirty = false
    this.notify()
    return { ok: true, rev }
  }

  // "Uppdatera bordet" (L5): a table from the saved project. Unsaved edits are saved first.
  async startTable(): Promise<{ id: string; version: string }> {
    if (this.dirty) {
      const saved = await this.save()
      if (!saved.ok) throw new Error(`could not save before starting a table: ${saved.reason}`)
    }
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/sessions`, { method: 'POST' })
    if (!res.ok) throw new Error(`could not start a table: ${res.status}`)
    return (await res.json()) as { id: string; version: string }
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
