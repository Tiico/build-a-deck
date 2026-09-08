import type { ProjectDoc, ProjectRow, RuleDoc, VersionSummary } from '@byd/server'
import type { DocDiff } from '@byd/server/doc'
import type { Element } from '@byd/template'
import { Unauthorized, withCredentials } from '../account/api.js'
import { applyEdit, recipeOf, type EditIntent, type Recipe, type ZonePatch } from '@byd/server/doc'
import { ASSET_PREFIX } from './assets.js'
import { freeIconName, svgBytes, type GameSymbol } from './symbols.js'
import type { EditorMessage, Presence } from '@byd/server'

// The editor's socket, kept small on purpose: the same shape the table's client speaks, so a
// test can hand it Node's WebSocket the way it hands one to the table.
export type WebSocketLike = {
  send(data: string): void
  close(): void
  readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}
export type EditSocketCtor = new (url: string) => WebSocketLike
let editSocket: EditSocketCtor | null = null
export function useEditSocketImplementation(ctor: EditSocketCtor | null): void {
  editSocket = ctor
}
const makeEditSocket = (url: string): WebSocketLike => new (editSocket ?? (globalThis.WebSocket as unknown as EditSocketCtor))(url)

export type ProjectListener = (client: ProjectClient) => void
export type SaveResult = { ok: true; rev: number } | { ok: false; reason: 'conflict' | 'missing' | string }
export type Cell = string | number | boolean | null
export type Textures = { total: number; done: number; failed: string[] }
// A table of this game as the Bord tab lists it (#19): which session, the version it runs,
// whether its log is locked (C9), and when it last moved.
export type TableSummary = { id: string; version: string; ended: boolean; lastAt: string | null }

// The project as the editor holds it, and its end of the actor (D3): the document, who else has
// it open, and one socket the edits go both ways over. An edit is applied here at once and sent;
// the actor's echo of one's own edit is skipped, and everyone else's is applied as it lands.
// Framework-free so views stay thin; every change notifies subscribers.
export class ProjectClient {
  private listeners = new Set<ProjectListener>()
  private socket: WebSocketLike | null = null
  private me: string | null = null
  // Edits made before the socket was open, or made and not yet echoed back. They are sent when
  // the socket opens, and laid on top again whenever the actor hands over its document.
  private pending: EditIntent[] = []
  private outbox: string[] = []
  // A save asked for over the socket, waiting for the actor to say what became of it.
  private saving: ((result: SaveResult) => void) | null = null
  // Who else has this project open (D3). Empty until the socket says otherwise.
  public here: Presence[] = []
  // This editor's own connection, so a view can leave itself out of the list.
  public who: string | null = null
  private constructor(
    private readonly http: string,
    readonly id: string,
    public doc: ProjectDoc,
    public rev: number,
    public dirty = false,
  ) {}

  static async open(opts: { http: string; id: string; name?: string }): Promise<ProjectClient> {
    const res = await fetch(`${opts.http}/projects/${encodeURIComponent(opts.id)}`, withCredentials())
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 403) throw new Error('det här spelet tillhör någon annan')
    if (res.status === 404) throw new Error(`unknown project ${opts.id}`)
    if (!res.ok) throw new Error(`could not load project: ${res.status}`)
    const rec = (await res.json()) as ProjectDoc & { id: string; rev: number }
    const doc: ProjectDoc = { name: rec.name, template: rec.template, rows: rec.rows, icons: rec.icons, setup: rec.setup, ...(rec.credits ? { credits: rec.credits } : {}), ...(rec.rules ? { rules: rec.rules } : {}) }
    const client = new ProjectClient(opts.http, opts.id, doc, rec.rev)
    client.connect(opts.name ?? 'Någon')
    return client
  }

  // The socket to the project's actor. The editor works without it — the document was read over
  // HTTP — but then it is alone with its own edits until it saves.
  private connect(name: string): void {
    const url = `${this.http.replace(/^http/, 'ws')}/projects/${encodeURIComponent(this.id)}/edit?name=${encodeURIComponent(name)}`
    const socket = makeEditSocket(url)
    this.socket = socket
    socket.onopen = () => {
      for (const message of this.outbox) socket.send(message)
      this.outbox = []
    }
    socket.onmessage = (event: { data: unknown }) => {
      const message = JSON.parse(String(event.data)) as EditorMessage
      this.receive(message)
    }
    // A socket that breaks is simply gone: the editor carries on with what it holds, saves the
    // old way, and is alone with its edits until the page is opened again.
    const dropped = () => {
      if (this.socket === socket) this.socket = null
    }
    socket.onclose = dropped
    socket.onerror = dropped
  }

  private receive(message: EditorMessage): void {
    switch (message.v) {
      // The document as the actor holds it: on joining, and again whenever this editor drifted.
      case 'project': {
        this.me = message.you.id
        this.who = message.you.id
        this.rev = message.rev
        this.here = message.here
        // Whatever this editor did while it was alone is laid on top again; an edit that no
        // longer makes sense against the actor's document is simply gone.
        let doc = message.doc
        const kept: EditIntent[] = []
        for (const intent of this.pending) {
          try {
            doc = applyEdit(doc, intent)
            kept.push(intent)
          } catch {
            // The actor will refuse it too; there is nothing to keep.
          }
        }
        this.pending = kept
        this.doc = doc
        this.dirty = kept.length > 0
        this.notify()
        return
      }
      case 'edits': {
        // An edit of one's own was applied when it was made; its echo only says it landed.
        const mine = message.edits.filter((e) => e.from === this.me)
        if (mine.length > 0) this.pending = this.pending.slice(mine.length)
        const theirs = message.edits.filter((e) => e.from !== this.me)
        if (theirs.length === 0) return
        this.doc = theirs.reduce((d, e) => applyEdit(d, e.intent), this.doc)
        this.dirty = true
        this.notify()
        return
      }
      case 'here':
        this.here = message.here
        this.notify()
        return
      case 'saved':
        this.rev = message.rev
        this.dirty = false
        this.finishSave({ ok: true, rev: message.rev })
        this.notify()
        return
      case 'refused':
        // The actor sends the document with it, so nothing has to be asked for again.
        this.finishSave({ ok: false, reason: message.why })
        return
    }
  }

  private finishSave(result: SaveResult): void {
    const waiting = this.saving
    this.saving = null
    waiting?.(result)
  }

  // A socket that has not opened yet keeps what it was given until it can send it.
  private post(message: string): void {
    const socket = this.socket
    if (!socket) return
    if (socket.readyState === 1) socket.send(message)
    else this.outbox.push(message)
  }

  // Leaves the project: the others stop being told this editor is here.
  close(): void {
    this.socket?.close()
    this.socket = null
  }

  subscribe(listener: ProjectListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Every edit goes the same way (D3): an intent, applied by the one pure function the actor
  // will apply it with too. The editor holds the result until it is saved.
  edit(intent: EditIntent): void {
    // It must apply here before it is sent: an edit that makes no sense is the editor's mistake
    // to see, not something to find out about a round trip later.
    this.commit(applyEdit(this.doc, intent))
    this.pending.push(intent)
    this.post(JSON.stringify({ t: 'edit', intent }))
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
    this.edit({ v: 'restore', doc: old })
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

  // Saving makes a version (B4). With a socket the actor makes it, so everyone with the project
  // open is told which version it became; without one the document is written the old way.
  async save(): Promise<SaveResult> {
    if (this.socket) {
      const answered = new Promise<SaveResult>((resolve) => {
        this.saving = resolve
      })
      this.post(JSON.stringify({ t: 'save' }))
      const timeout = new Promise<SaveResult>((resolve) => setTimeout(() => resolve({ ok: false, reason: 'save failed' }), 2000))
      return Promise.race([answered, timeout])
    }
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

