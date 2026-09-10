import type { ProjectCredit, ProjectDoc, ProjectFont, ProjectRow, RuleDoc, VersionSummary } from '@byd/server'
import type { DocDiff } from '@byd/server/doc'
import type { Element } from '@byd/template'
import { Unauthorized, withCredentials } from '../account/api.js'
import { applyEdit, recipeOf, type EditIntent, type Recipe, type RecipeWords, type ZonePatch } from '@byd/server/doc'
import { ASSET_PREFIX } from './assets.js'
import { freeIconName, svgBytes, symbolName, type GameSymbol } from './symbols.js'
import type { EditorMessage, Presence } from '@byd/server'
import { canEdit, type Role } from '@byd/server/doc'
import { translate, type Key, type T } from '../i18n/index.js'
import { UNDO_STEPS, whatOf } from './undo.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the surface that opened the project hands over its own
// `t` (A4). Only what a designer is meant to act on is a message; the rest of what can go
// wrong here is a diagnostic, and stays in the language the code is written in.
const swedish: T = (key, params) => translate('sv', key, params)


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

// Why a project could not be opened, as one of the states the whole product shares (#12). The
// server's own sentence is a fact about a request, not a message to a person, so it stops here.
export type ProjectFault = 'missing' | 'forbidden' | 'offline'
export class ProjectUnavailable extends Error {
  constructor(readonly fault: ProjectFault) {
    super(fault)
    this.name = 'ProjectUnavailable'
  }
}
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
  // Whether the actor can be reached. A socket that breaks comes back by itself; one this editor
  // closed stays closed.
  public connected = false
  // Whether the line is known to be gone, which is not the same as not being up yet. A socket
  // takes a moment to open on every load, and a banner that says "no connection" for that moment
  // — and then takes itself away — is a false alarm on every single open.
  public lineDown = false
  // What the others are told this editor is called (D3). It is set by `connect` on the first
  // socket and kept across every reconnection, so nobody's name changes under them mid-session.
  private name = ''
  private left = false
  private retry: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private me: string | null = null
  // Edits made before the socket was open, or made and not yet echoed back. They are sent when
  // the socket opens, and laid on top again whenever the actor hands over its document.
  private pending: EditIntent[] = []
  // The steps the designer took in this tab, each kept as the document it was taken from, and the
  // ones taken back and waiting to come forward again (#35).
  private past: { doc: ProjectDoc; what: Key }[] = []
  private future: { doc: ProjectDoc; what: Key }[] = []
  private outbox: string[] = []
  // A save asked for over the socket, waiting for the actor to say what became of it.
  private saving: ((result: SaveResult) => void) | null = null
  // Who else has this project open (D3). Empty until the socket says otherwise.
  public here: Presence[] = []
  // This editor's own connection, so a view can leave itself out of the list.
  public who: string | null = null
  // What this account may do with the project (D3): a viewer or a test leader may not edit it.
  public role: Role | null = null
  // The document as the server holds it, in a form two documents can be compared in. "Unsaved"
  // is the difference between that and `doc`, never a memory of something having been typed
  // (#8): an edit that writes the value already there changes nothing, and taking an edit back
  // by hand is the deck saved again.
  private saved: string
  // The last document that was measured, and what it measured as. A document is replaced whole on
  // every edit, so the reference is enough to know the answer still holds.
  private measured: { doc: ProjectDoc; stamp: string } | null = null
  private constructor(
    private readonly http: string,
    readonly id: string,
    public doc: ProjectDoc,
    public rev: number,
  ) {
    this.saved = stamp(doc)
  }

  get dirty(): boolean {
    if (this.measured?.doc !== this.doc) this.measured = { doc: this.doc, stamp: stamp(this.doc) }
    return this.measured.stamp !== this.saved
  }

  // `name` is what the others see. Without an account it is the tool's word for somebody, and
  // that word is settled here rather than inside the client: a name belongs to whoever it names
  // (A4), so it is written in the language of the person arriving and then travels with them.
  static async open(opts: { http: string; id: string; name?: string; t?: T }): Promise<ProjectClient> {
    const res = await fetch(`${opts.http}/projects/${encodeURIComponent(opts.id)}`, withCredentials())
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 403) throw new ProjectUnavailable('forbidden')
    if (res.status === 404) throw new ProjectUnavailable('missing')
    if (!res.ok) throw new ProjectUnavailable('offline')
    const rec = (await res.json()) as ProjectDoc & { id: string; rev: number }
    // Everything the document has is the document; only what the record adds around it is left
    // behind. Picking fields by name here is how a project quietly loses one it gained later.
    const { id, rev, ...doc } = rec
    const client = new ProjectClient(opts.http, opts.id, doc, rev)
    client.connect(opts.name ?? (opts.t ?? swedish)('editor.here.someone'))
    return client
  }

  // The socket to the project's actor. The editor works without it — the document was read over
  // HTTP — but then it is alone with its own edits until it saves.
  private connect(name: string): void {
    this.name = name
    const url = `${this.http.replace(/^http/, 'ws')}/projects/${encodeURIComponent(this.id)}/edit?name=${encodeURIComponent(name)}`
    const socket = makeEditSocket(url)
    this.socket = socket
    socket.onopen = () => {
      this.connected = true
      this.lineDown = false
      this.attempt = 0
      for (const message of this.outbox) socket.send(message)
      this.outbox = []
      this.notify()
    }
    socket.onmessage = (event: { data: unknown }) => {
      const message = JSON.parse(String(event.data)) as EditorMessage
      this.receive(message)
    }
    // A socket that breaks is picked up again: the editor carries on with what it holds, and
    // what was written in the dark is sent when the line is back. The actor hands over its
    // document on the new connection, so nothing has to be asked for.
    const dropped = () => {
      if (this.socket !== socket) return
      this.socket = null
      this.connected = false
      this.lineDown = true
      this.notify()
      this.reconnect()
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
        this.role = message.you.role ?? null
        this.rev = message.rev
        this.here = message.here
        // Whatever this editor did while it was alone is laid on top again; an edit that no
        // longer makes sense against the actor's document is simply gone.
        const held = message.doc
        let doc = held
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
        // A handover that says nothing new keeps the document it already has. The wall draws a
        // card from the object it was given, so replacing an identical document with a fresh copy
        // rebuilds every card on the screen — under the pointer, and under whoever is reading it.
        const fresh = stamp(doc)
        if (fresh !== stamp(this.doc)) this.doc = doc
        this.saved = stamp(held)
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
        this.notify()
        return
      }
      case 'here':
        this.here = message.here
        this.notify()
        return
      case 'saved':
        this.rev = message.rev
        this.saved = stamp(this.doc)
        this.finishSave({ ok: true, rev: message.rev })
        this.notify()
        return
      case 'refused':
        // The actor sends the document with it, so nothing has to be asked for again.
        this.finishSave({ ok: false, reason: message.why })
        return
    }
  }

  // Waiting a little longer each time, so a server that is down is not hammered, and never so
  // long that someone sits and waits for it.
  private reconnect(): void {
    if (this.left || this.retry) return
    const wait = Math.min(4000, 200 * 2 ** this.attempt++)
    this.retry = setTimeout(() => {
      this.retry = null
      if (!this.left) this.connect(this.name)
    }, wait)
  }

  private finishSave(result: SaveResult): void {
    const waiting = this.saving
    this.saving = null
    waiting?.(result)
  }

  // A socket that has not opened yet keeps what it was given until it can send it.
  // What cannot be sent now is kept until the line is back, in the order it was written.
  private post(message: string): void {
    const socket = this.socket
    if (socket && socket.readyState === 1) socket.send(message)
    else this.outbox.push(message)
  }

  // Leaves the project: the others stop being told this editor is here.
  close(): void {
    this.left = true
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.socket?.close()
    this.socket = null
    this.connected = false
  }

  subscribe(listener: ProjectListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Every edit goes the same way (D3): an intent, applied by the one pure function the actor
  // will apply it with too. The editor holds the result until it is saved.
  // Whether this account may change the project at all (D3). Until the actor has said, the
  // editor assumes it may: a project without accounts is everyone's.
  get mayEdit(): boolean {
    return this.role === null || canEdit(this.role)
  }

  edit(intent: EditIntent): void {
    // Where the designer was before this: a step back is `restore` with that document, which is
    // already how taking a document back is said (B4), so no new verb is needed (#35). A new edit
    // is a new branch, so what was taken back stops waiting to come forward.
    this.past.push({ doc: this.doc, what: whatOf(intent) })
    if (this.past.length > UNDO_STEPS) this.past.shift()
    this.future = []
    this.send(intent)
  }

  // The edit itself, without touching the stack: this is the path a step of the stack takes, and
  // recording those would be a stack that can never be emptied.
  private send(intent: EditIntent): void {
    // It must apply here before it is sent: an edit that makes no sense is the editor's mistake
    // to see, not something to find out about a round trip later.
    this.commit(applyEdit(this.doc, intent))
    this.pending.push(intent)
    this.post(JSON.stringify({ t: 'edit', intent }))
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }

  // A step back, and the word for what it took. Null when there is nothing behind: the view says
  // nothing rather than saying it undid something.
  undo(): Key | null {
    const step = this.past.pop()
    if (!step) return null
    this.future.push({ doc: this.doc, what: step.what })
    this.send({ v: 'restore', doc: step.doc })
    return step.what
  }

  redo(): Key | null {
    const step = this.future.pop()
    if (!step) return null
    this.past.push({ doc: this.doc, what: step.what })
    this.send({ v: 'restore', doc: step.doc })
    return step.what
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

  addField(field: string): void {
    this.edit({ v: 'addField', field })
  }

  removeField(field: string): void {
    this.edit({ v: 'removeField', field })
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
  setRecipe(recipe: Recipe, words?: RecipeWords): void {
    this.edit({ v: 'setRecipe', recipe, ...(words ? { words } : {}) })
  }

  // A zone of the designer's own (K2): an area of a card's rows or a pile at a point, in the
  // middle of the table until it is dragged somewhere. Returns its id.
  // A zone the designer adds is theirs, and it is named in the language they are working in
  // (A4); they rename it from there.
  addZone(kind: 'area' | 'pile', t: T = swedish): string {
    const taken = new Set(this.doc.setup.zones.map((z) => z.id))
    const base = kind === 'pile' ? 'hog' : 'yta'
    let n = 1
    while (taken.has(`${base}-${n}`)) n++
    const id = `${base}-${n}`
    this.edit({ v: 'addZone', id, kind, name: kind === 'pile' ? t('zone.new.pile', { n }) : t('zone.new.area', { n }) })
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
  async useSymbol(symbol: GameSymbol, as?: string, t: T = swedish): Promise<string> {
    const file = svgBytes(symbol)
    const ref = `${ASSET_PREFIX}${await this.uploadAsset(new Blob([file.bytes], { type: file.type }), t)}`
    const already = Object.entries(this.doc.icons).find(([, url]) => url === ref)
    if (already) return already[0]
    // What the symbol is called in the language the designer is working in: the icon name is
    // theirs from here on, and card text writes it between braces (L2, A4).
    const name = freeIconName(as ?? symbolName(symbol, t), this.doc.icons)
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

  // A typeface the game is set in (B3): the file becomes one of the project's assets, and the
  // family is named after the file, which is what a designer calls it anyway. The version then
  // pins the file, so what is printed a year from now is what was designed today.
  //
  // A licence is not in the file: only the designer knows it, and it is stated beside the family.
  async useFont(file: File, t: T = swedish): Promise<string> {
    const ref = `${ASSET_PREFIX}${await this.uploadAsset(file, t)}`
    const already = Object.entries(this.doc.fonts ?? {}).find(([, f]) => f.asset === ref)
    if (already) return already[0]
    const family = freeFamily(familyFromFile(file.name), this.doc.fonts ?? {})
    this.edit({ v: 'setFont', family, font: { stack: `"${family}", sans-serif`, asset: ref } })
    return family
  }

  setFontLicence(family: string, licence: ProjectCredit | null): void {
    const font = this.doc.fonts?.[family]
    if (!font) throw new Error(`no font ${family}`)
    const { licence: was, ...rest } = font
    this.edit({ v: 'setFont', family, font: licence ? { ...rest, licence } : rest })
  }

  removeFont(family: string): void {
    this.edit({ v: 'removeFont', family })
  }

  // An image for the project (E1): uploaded once, named by its bytes; the cell then points at it.
  async uploadAsset(file: Blob, t: T = swedish): Promise<string> {
    const res = await fetch(`${this.http}/assets`, withCredentials({ method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file }))
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 415) throw new Error(t('upload.wrongType'))
    if (res.status === 413) throw new Error(t('upload.tooBig'))
    if (!res.ok) throw new Error(t('upload.failed', { status: res.status }))
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
    this.saved = stamp(this.doc)
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
  // The rulebook as a booklet for print (B7): the queue answers with the rendering's hash, and
  // the file is fetched where every other rendering is once it is done.
  async orderBooklet(t: T = swedish): Promise<string> {
    // The booklet is the designer's own words with one heading of the tool's, and that heading
    // is set in the language the order was placed in (A4, B7).
    const lang = typeof document === 'undefined' ? '' : document.documentElement.lang
    const where = `${this.http}/projects/${encodeURIComponent(this.id)}/rulebook${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`
    const res = await fetch(where, withCredentials({ method: 'POST' }))
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 404) throw new Error(t('rules.booklet.noRules'))
    if (!res.ok) throw new Error(t('rules.booklet.orderFailed', { status: res.status }))
    return ((await res.json()) as { hash: string }).hash
  }

  // Whether a rendering is finished, so a link is offered only when there is a file behind it.
  async rendered(hash: string): Promise<boolean> {
    const res = await fetch(`${this.http}/faces/${hash}`, { ...withCredentials(), redirect: 'follow' })
    return res.ok
  }

  bookletUrl(hash: string): string {
    return `${this.http}/faces/${hash}`
  }

  async textures(sessionId: string): Promise<Textures> {
    const res = await fetch(`${this.http}/sessions/${encodeURIComponent(sessionId)}/textures`, withCredentials())
    if (!res.ok) throw new Error(`could not read texture status: ${res.status}`)
    return (await res.json()) as Textures
  }

  private commit(doc: ProjectDoc): void {
    this.doc = doc
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l(this)
  }
}

// One element in, one out, by id: an override list is a set keyed by id, not an order.

// What a font file is called, as a family name: the name without its format, and without the
// weight suffix a foundry writes into it, since that is a file's business rather than a game's.
function familyFromFile(name: string): string {
  const bare = name.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[_-]+/g, ' ').trim()
  return bare === '' ? 'Typsnitt' : bare
}
function freeFamily(wanted: string, taken: Record<string, ProjectFont>): string {
  if (!taken[wanted]) return wanted
  for (let n = 2; ; n++) if (!taken[`${wanted} ${n}`]) return `${wanted} ${n}`
}

// A document as one comparable string: object keys in a fixed order, so two documents built by
// different routes to the same content are the same string. Undefined is left out, as it is in
// the JSON that reaches the server.
function stamp(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stamp).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stamp(v)}`).join(',')}}`
}
