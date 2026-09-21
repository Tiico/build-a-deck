import { assetFormatsNamed, assetTypeDeclaring, pictureNameOf, type AssetCrop, type AssetKind } from '@byd/protocol'
import type { ProjectCredit, ProjectDoc, ProjectFont, ProjectFraming, ProjectRow, RuleDoc, VersionSummary } from '@byd/server'
import { type CatalogFamily, fileInSheet, fileSheetHref } from './font-catalog.js'
import type { DocDiff, VersionChange } from '@byd/server/doc'
import type { Element } from '@byd/template'
import { Unauthorized, withCredentials } from '../account/api.js'
import { applyEdit, recipeOf, type Clearable, type EditIntent, type Recipe, type RecipeWords, type SeatRole, type Zone, type ZonePatch } from '@byd/server/doc'
import { ASSET_PREFIX, assetRef, assetRefOf, assetUrl } from './assets.js'
import { measureAsset } from './motifs.js'
import type { Motif } from '@byd/template'
import { iconElement } from './canvas.js'
import { idsOnFace } from './groups.js'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { freeIconName, svgBytes, symbolName, type GameSymbol } from './symbols.js'
import type { EditorMessage, Presence } from '@byd/server'
import { canEdit, type Role } from '@byd/server/doc'
import { translate, type Key, type T } from '../i18n/index.js'
import { UNDO_STEPS, whatOf } from './undo.js'
import { DEFAULT_TIMING } from '../status/connection.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the surface that opened the project hands over its own
// `t` (A4). Only what a designer is meant to act on is a message; the rest of what can go
// wrong here is a diagnostic, and stays in the language the code is written in.
const swedish: T = (key, params) => translate('sv', key, params)

// The generic a catalog family falls back to when its own file has not arrived yet, so the
// sample and the card are set in something of the right shape rather than in the browser's
// default while the bytes travel.
const GENERIC: Record<string, string> = { serif: 'serif', sans: 'sans-serif', display: 'serif', handskrift: 'cursive', mono: 'monospace' }


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
// What a failed upload has to take back, and what the thing it takes back is called (#344, L37).
// `intents` is the inverse of the edit that put the asset into the document; `said` and `name`
// are how the notice says which of the things the designer did went away again.
type Undoing = { said: Key; name: string; intents: readonly EditIntent[] }
// One step of the way back or the way forward: the document it was taken from, and the word for
// what the designer did to leave it (#35).
type Step = { doc: ProjectDoc; what: Key }

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
  // — and then takes itself away — is a false alarm on every single open. The same is true of a
  // break the client mends by itself: the ladder below starts at 200 ms, so a line that comes
  // back on its first attempt would put the bar in the chrome up and take it down again inside a
  // third of a second, moving the whole page down and back up with it. So the line is not gone
  // until it has been gone longer than a mending takes.
  public lineDown = false
  private falling: ReturnType<typeof setTimeout> | null = null
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
  private past: Step[] = []
  private future: Step[] = []
  // The gesture the stack's top step belongs to, or null when the top step is a whole change of
  // its own. A gesture is one thing the designer did that the pointer reports many times over —
  // a drag, a resize, a cell typed into — and the token is made where it begins, so a second
  // grab of the same element is a second token and therefore a second step back (#35).
  private gesture: string | null = null
  // Counts the gestures this client has opened by itself, so a placement that must be taken
  // back names its own and nothing else (#310).
  private gestures = 0
  // What was waiting to come forward when the open gesture's first patch emptied it (#142). That
  // emptying is right for a drag that is made — a new branch is a new branch — and wrong for one
  // taken back, which is nothing that happened and may therefore not have taken the way forward
  // with it. Only the gesture still open can be called off, so only its own is worth keeping, and
  // one field is the whole of it.
  private futureBeforeGesture: Step[] = []
  private outbox: string[] = []
  // A save asked for over the socket, waiting for the actor to say what became of it.
  private saving: ((result: SaveResult) => void) | null = null
  // The document as it was when that save was asked for. The actor makes its version out of the
  // edits it has when the save reaches it, so an edit written while the save travels is not in
  // the version that comes back (#380): what became saved is this document and not the one on
  // the screen a moment later.
  private asked: string | null = null
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
    // How long the line may be gone before that is worth saying. The number is the product's,
    // not this client's: it is the same silence a wait is allowed anywhere else (#7).
    private readonly dropAfterMs: number,
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
  static async open(opts: { http: string; id: string; name?: string; t?: T; dropAfterMs?: number }): Promise<ProjectClient> {
    const res = await fetch(`${opts.http}/projects/${encodeURIComponent(opts.id)}`, withCredentials())
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 403) throw new ProjectUnavailable('forbidden')
    if (res.status === 404) throw new ProjectUnavailable('missing')
    if (!res.ok) throw new ProjectUnavailable('offline')
    const rec = (await res.json()) as ProjectDoc & { id: string; rev: number }
    // Everything the document has is the document; only what the record adds around it is left
    // behind. Picking fields by name here is how a project quietly loses one it gained later.
    const { id, rev, ...doc } = rec
    const client = new ProjectClient(opts.http, opts.id, doc, rev, opts.dropAfterMs ?? DEFAULT_TIMING.dropAfterMs)
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
      if (this.falling) clearTimeout(this.falling)
      this.falling = null
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
      if (!this.lineDown && this.falling === null) {
        this.falling = setTimeout(() => {
          this.falling = null
          this.lineDown = true
          this.notify()
        }, this.dropAfterMs)
      }
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
        if (theirs.length > 0) this.doc = theirs.reduce((d, e) => applyEdit(d, e.intent), this.doc)
        // Said even when nothing in the document moved: an echo of one's own is the actor
        // confirming it holds the edit, and a status that waits on that (#297, L33) has no other
        // way to hear it.
        if (mine.length > 0 || theirs.length > 0) this.notify()
        return
      }
      case 'here':
        this.here = message.here
        this.notify()
        return
      case 'saved':
        this.rev = message.rev
        this.saved = this.asked ?? stamp(this.doc)
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
    // Whatever became of it, that save is over: a refused one leaves no document behind to call
    // saved, and the next one reads its own.
    this.asked = null
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
    if (this.falling) clearTimeout(this.falling)
    this.falling = null
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

  // `gesture` names the one thing the designer is doing, when what she is doing arrives in
  // pieces: a drag is sixty patches and a cell is one per keystroke. Every edit carrying the
  // token that is already on top of the stack joins that step instead of making its own, so the
  // way back from a move is one press and not sixty. Everything else leaves it out and is its own
  // step, as it always was.
  edit(intent: EditIntent, gesture?: string): void {
    // It applies before anything is recorded, and that order is the whole of it: an edit the
    // document refuses never happened, so it must cost neither a version nor a step back (#41,
    // B4). `applyEdit` throws from here, with the stack untouched and nothing sent.
    const next = applyEdit(this.doc, intent)
    // Where the designer was before this: a step back is `restore` with that document, which is
    // already how taking a document back is said (B4), so no new verb is needed (#35). A new edit
    // is a new branch, so what was taken back stops waiting to come forward.
    // The gesture that is already open keeps the document it began from: that is the whole of
    // taking a move back in one press, and it is why the token must be new for every new grab.
    if (gesture === undefined || gesture !== this.gesture) {
      this.past.push({ doc: this.doc, what: whatOf(intent) })
      if (this.past.length > UNDO_STEPS) this.past.shift()
      this.futureBeforeGesture = this.future
    }
    this.gesture = gesture ?? null
    this.future = []
    this.send(intent, next)
  }

  // The edit itself, without touching the stack: this is the path a step of the stack takes, and
  // recording those would be a stack that can never be emptied.
  // It must apply before it is sent: an edit that makes no sense is the editor's mistake to see,
  // not something to find out about a round trip later. `edit` has already applied it by the time
  // it gets here, and hands over what came out rather than having it worked out twice.
  private send(intent: EditIntent, next: ProjectDoc = applyEdit(this.doc, intent)): void {
    this.commit(next)
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
    // A step back closes whatever was open: the next patch of a gesture that is still being made
    // would otherwise join the step the designer just took off the stack.
    this.gesture = null
    this.future.push({ doc: this.doc, what: step.what })
    this.send({ v: 'restore', doc: step.doc })
    return step.what
  }

  // A gesture called off before it ever ended (#142): a drag the hand took back with Escape, or
  // one the browser took away from the page. The document goes back to the one the gesture began
  // from and the step it opened goes with it — and that second half is the whole difference
  // between taking a move back and never having made it. A step back is a row in the history
  // (B4); a drag that was called off is nothing that happened.
  //
  // Only the gesture still being made can be called off. Anything else is a doing that is already
  // over, and the way back from one of those is the way back from any other.
  callOff(gesture: string): void {
    if (this.gesture !== gesture) return
    const step = this.past.pop()
    if (!step) return
    this.gesture = null
    // And what the gesture's first patch emptied on the way in is put back with it, for the same
    // reason the step is: the designer took a change back, laid a hand on something, thought
    // better of it, and must find the way forward exactly where she left it.
    this.future = this.futureBeforeGesture
    this.futureBeforeGesture = []
    this.send({ v: 'restore', doc: step.doc })
  }

  redo(): Key | null {
    const step = this.future.pop()
    if (!step) return null
    this.gesture = null
    this.past.push({ doc: this.doc, what: step.what })
    this.send({ v: 'restore', doc: step.doc })
    return step.what
  }

  // Typing into a cell is a gesture too (#35): the table writes a value per keystroke, and a
  // whole word typed into one cell is one thing the designer did. The token is the cell itself,
  // so leaving it and coming back is a new step, and so is typing into the one beside it.
  setCell(cardRef: string, field: string, value: Cell, gesture?: string): void {
    this.edit({ v: 'setCell', cardRef, field, value }, gesture)
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

  // `bind` binds an element to the column in the same edit, which is what the canvas door needs:
  // one thing the designer did, one version, one step back (B4).
  addField(field: string, bind?: { face: string; id: string; group?: string | null }): void {
    this.edit({ v: 'addField', field, ...(bind ? { bind } : {}) })
  }

  // Where a column stands (#46). `before` is the column it comes to stand in front of, and null
  // is last of all — the same two ways a drag can end.
  moveField(field: string, before: string | null): void {
    this.edit({ v: 'moveField', field, before })
  }

  // Vad kolumnen heter (#384). Namnet är nyckeln, så det här flyttar den överallt dokumentet
  // skriver den — värdena på korten, bindningarna och villkoren i mallen, gruppkolumnen,
  // ordningen, beskärningarna och prosavalet — och CSV-rubriken byter namn med den.
  renameField(from: string, to: string): void {
    this.edit({ v: 'renameField', from, to })
  }

  // Vad kolumnen skrivs som (L43, #362). `null` lämnar tillbaka frågan till rutans höjd, och är
  // därmed inte ett tredje läge utan frånvaron av ett val.
  setProse(field: string, prose: boolean | null): void {
    this.edit({ v: 'setProse', field, prose })
  }

  removeField(field: string): void {
    this.edit({ v: 'removeField', field })
  }

  // `gesture` is the token of the grab this patch belongs to, when it belongs to one: the canvas
  // makes a fresh one at every pointerdown, so a drag is one step back and the next drag is the
  // next one.
  patchElement(face: string, id: string, patch: Partial<Element>, group?: string | null, gesture?: string): void {
    // A property set to `undefined` is a property taken away, and it is said that way on the
    // wire: `undefined` does not survive JSON, so an unlock written as `{ locked: undefined }`
    // would reach the actor as a patch that changes nothing, and the saved project would still
    // be locked (L15).
    const clear = Object.entries(patch).flatMap(([key, value]) => (value === undefined ? [key as Clearable] : []))
    const set = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<Element>
    this.edit({ v: 'patchElement', face, id, patch: set, ...(clear.length ? { clear } : {}), ...(group !== undefined ? { group } : {}) }, gesture)
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

  // A whole face at once (L17): the ready-made back the designer chose, laid down as one edit
  // and therefore one step back.
  replaceFace(face: string, base: Element[]): void {
    this.edit({ v: 'replaceFace', face, base })
  }

  moveElement(face: string, id: string, to: number): void {
    this.edit({ v: 'moveElement', face, id, to })
  }

  rename(name: string): void {
    this.edit({ v: 'rename', name })
  }

  // The one knob the recipe still owns (B5, reviderat): who sits at the table, and what each seat
  // keeps count of. It lays seats in and out and puts nothing back that the designer took away.
  get recipe(): Recipe {
    return recipeOf(this.doc.setup)
  }
  // A knob turned is one edit, but a counter's name is a whole recipe written out per keystroke,
  // so the token belongs here too (L14).
  setRecipe(recipe: Recipe, words?: RecipeWords, gesture?: string): void {
    this.edit({ v: 'setRecipe', recipe, ...(words ? { words } : {}) }, gesture)
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

  // A zone laid down as it stands (a paste): everything it carried comes with it, under an id
  // nothing else has. One edit, so it is one step back (B4).
  insertZone(zone: Zone): string {
    const taken = new Set(this.doc.setup.zones.map((z) => z.id))
    const base = zone.id.replace(/-\d+$/, '')
    let n = 2
    while (taken.has(`${base}-${n}`)) n++
    const id = `${base}-${n}`
    this.edit({ v: 'insertZone', zone: { ...zone, id } })
    return id
  }

  removeZone(id: string): void {
    this.edit({ v: 'removeZone', id })
  }

  // The same zone for every seat that has not got one (B5): the area in front of a player, or the
  // strip its counters lie on. One edit, so it is one step back (B4), and named in the language
  // the designer is working in (A4) — `{seat}` becomes the seat's letter.
  addSeatZone(role: SeatRole, t: T = swedish): void {
    const name = role === 'mine' ? t('zone.mine') : t('zone.counters')
    this.edit({ v: 'addSeatZone', role, name, ...(role === 'mine' ? { shortcut: { label: t('zone.mine.shortcut'), at: 'top' as const } } : {}) })
  }

  // Where the deck lies (B5, K10): the role moves to another pile, and the hands return there.
  setDeck(id: string): void {
    this.edit({ v: 'setDeck', id })
  }

  // `gesture` is the token of the one thing the designer is doing, when what she is doing arrives
  // in pieces (L14): a zone dragged across the felt is a patch per frame of the pointer, and a
  // name typed into the panel beside it is one per keystroke.
  patchZone(id: string, patch: ZonePatch, gesture?: string): void {
    // A property taken away is said as `null` from here on: `undefined` does not survive JSON,
    // and the server would be handed a patch that says nothing where the editor said "none".
    const said = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === undefined ? null : value])) as ZonePatch
    this.edit({ v: 'patchZone', id, patch: said }, gesture)
  }

  // The rulebook (B7): part of the document, so it is saved and versioned with the cards.
  // The whole rulebook is written out on every keystroke, so a sentence typed into a paragraph
  // carries the token of that visit to it (L14).
  setRules(rules: RuleDoc, gesture?: string): void {
    this.edit({ v: 'setRules', rules }, gesture)
  }

  // An import is never an overwrite (#131, B4). It lays a version named for the file, the way
  // every save already lays one, so the book that stood there is a row in the history rather than
  // something hanging on a stack that lives in one tab and is fifty steps deep (L14).
  //
  // The book remembers the file as text — which file, and when — and not as a handle: a handle
  // belongs to one browser and one person, and the book has to travel with the project.
  //
  // The name of the version is the designer's own word from here on, so it is written in the
  // language she was working in and then stays put.
  async importRules(rules: RuleDoc, file: string, t: T = swedish): Promise<void> {
    this.edit({ v: 'setRules', rules: { ...rules, source: { file, at: new Date().toISOString() } } })
    const saved = await this.save()
    if (!saved.ok) throw new Error(saved.reason)
    await this.nameVersion(saved.rev, t('rules.import.version', { file }))
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

  // What every version changed, in one answer (#177): what a row in the history says without
  // being opened. It is asked for beside the list rather than after it, so the panel opens on the
  // rows and fills them in when this lands — and it is one request for the whole history, not one
  // per row, because the history is read as a whole and grows for as long as the game does.
  async changes(): Promise<VersionChange[]> {
    const res = await fetch(`${this.http}/projects/${encodeURIComponent(this.id)}/versions/changes`, withCredentials())
    if (res.status === 401) throw new Unauthorized()
    if (!res.ok) throw new Error(`could not read what the versions changed: ${res.status}`)
    return (await res.json()) as VersionChange[]
  }

  // What a version changed against the one before it, spelled out card by card; null for the
  // first version of all. This is the opened row — the whole difference — where `changes` is the
  // one line every row carries.
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
    // The reference first, off the bytes themselves (#310). It is the name the service will give
    // them, so the question the next line asks — does the game already have this symbol? — is
    // answered without asking anybody: a symbol already in the set costs nothing on the wire.
    const ref = await assetRefOf(file.bytes)
    const already = Object.entries(this.doc.icons).find(([, url]) => url === ref)
    if (already) return already[0]
    // What the symbol is called in the language the designer is working in: the icon name is
    // theirs from here on, and card text writes it between braces (L2, A4).
    const name = freeIconName(as ?? symbolName(symbol, t), this.doc.icons)
    const taking = this.newGesture('symbol')
    this.edit({ v: 'setIcon', name, url: ref, credit: { licence: symbol.licence, by: symbol.by, source: symbol.id } }, taking)
    await this.storeAsset(blobOf(file), 'vector', ref, taking, { said: 'upload.undone.symbol', name, intents: [{ v: 'removeIcon', name }] }, t)
    return name
  }

  // An icon placed on the card from the tool row (#33). Two things have to be true afterwards —
  // the game has the symbol, and the template has an element showing it — and the designer did
  // one thing to ask for both, so they leave as one edit and come back with one Ctrl+Z (B4).
  //
  // The element is the `icons` element the canvas already had, bound to the name rather than to a
  // column, so the one renderer draws it and packages/template needed nothing (L1).
  async placeIcon(symbol: GameSymbol, face: string, group: string | null, t: T = swedish): Promise<string> {
    if (!this.doc.template.faces[face]) throw new Error(`template has no face ${face}`)
    const file = svgBytes(symbol)
    // The bytes' own name, before anything is read and before anything is sent (#310).
    const ref = await assetRefOf(file.bytes)
    // Everything the edit is worked out from is read after every wait, never before one. That
    // rule was written for the upload, which took as long as the network took while the document
    // moved underneath it — a second press, or somebody else in the game (D3). A face read
    // before the wait would give this element the id the placement that landed first has already
    // taken, and the template refuses it: `edit` applies before it records, so the whole
    // placement would be lost. The wait is now a hash rather than a round trip, and the rule is
    // unchanged and still what keeps two overlapping placements apart — it is simply that
    // nothing at all is awaited between here and the edit below.
    const faceTemplate = this.doc.template.faces[face]
    if (!faceTemplate) throw new Error(`template has no face ${face}`)
    // The same symbol twice is the same entry (E4), and then there is nothing to take in: the
    // edit places the element alone and the icon set is left exactly as it was. Which is also
    // why such a placement never touches the network at all — the bytes are already up there.
    const already = Object.entries(this.doc.icons).find(([, url]) => url === ref)?.[0]
    const name = already ?? freeIconName(symbolName(symbol, t), this.doc.icons)
    const element = iconElement(name, { taken: idsOnFace(faceTemplate), card: CARD_STANDARD_63x88.physical })
    const placing = this.newGesture('symbol')
    this.edit(
      {
        v: 'addElement',
        face,
        element,
        group,
        ...(already ? {} : { icon: { name, url: ref, credit: { licence: symbol.licence, by: symbol.by, source: symbol.id } } }),
      },
      placing,
    )
    // The element is on the card by now; the bytes follow it. Nothing waits for them but the
    // answer to whether they arrived.
    // Two things went in as one edit, so two come back out: the element, and the symbol the game
    // did not have before. The order is the element first — a set without the symbol its card
    // still shows is a card drawn with a hole in it, however few milliseconds it lasts.
    if (!already)
      await this.storeAsset(
        blobOf(file),
        'vector',
        ref,
        placing,
        {
          said: 'upload.undone.symbol',
          name,
          intents: [
            { v: 'removeElement', face, id: element.id, group },
            { v: 'removeIcon', name },
          ],
        },
        t,
      )
    return element.id
  }

  // The bytes behind a symbol, a typeface or a picture that has just been put into the document,
  // sent after the fact (#310, #339). The document already says the file is there, because the
  // reference is the hash of these very bytes and needed no round trip to learn. `kind` is the
  // caller's word for what the bytes are, as it is for `uploadAsset` (#312).
  //
  // What that buys has to be paid for here: if the bytes never arrive, the document is holding a
  // reference to nothing. So a failed upload takes the placement back — see `takeBack` for the
  // two ways it does that — and the error goes on to the caller, which is what the surface turns
  // into a notice. A symbol that appears and then vanishes without a word would be worse than
  // one that is merely slow.
  //
  // `undoing` is what puts the document back if they never do, and what the thing that goes is
  // called. The intents are the inverse of the edit that was just made, worked out where that
  // edit was made and out of nothing but what it was made of — a family, a hash, a face and an
  // id. They read nothing from the document, which is why they may be worked out before the wait
  // without breaking D3.
  //
  // A hash that comes back different from the one worked out here is the same fault as no
  // upload at all — the document would be pointing somewhere the bytes are not — so it is
  // handled as one rather than papered over.
  private async storeAsset(file: Blob, kind: AssetKind, ref: string, gesture: string, undoing: Undoing, t: T): Promise<void> {
    const landed = await this.uploadAsset(file, kind, t).catch((err: unknown) => {
      throw this.takeBack(gesture, ref, undoing, err, t)
    })
    if (assetRef(landed) === ref) {
      // Arrived, so there is nothing left to take back: the placement stops being callable off
      // rather than staying open for the rest of the session. Only if it is still the open one —
      // a designer who laid a hand on something while the bytes flew is in the middle of that,
      // and closing her gesture would split it into two steps back.
      if (this.gesture === gesture) this.gesture = null
      return
    }
    throw this.takeBack(gesture, ref, undoing, new Error(t('upload.wrongName')), t)
  }

  // What never arrived, taken back out of the document (#344, L37).
  //
  // While the gesture is still the open one it is called off, and that is unchanged: a placement
  // taken back before the designer went on is nothing that happened — no row in the history and
  // no version (B4).
  //
  // Once she has gone on, the gesture is not hers to call off any more. `callOff` says so by
  // doing nothing, which is right for a drag and was silently wrong here: two gesture-bearing
  // uploads that overlap each opened a gesture, so the first one to fail found the second one's
  // on top and took nothing back at all. The document was left pointing at bytes that never came
  // while the surface said it had gone wrong.
  //
  // Then the way back is a plain edit through `applyEdit` like any other — and it never pushes a
  // step. A correction is not something the designer did, and the step it would push is one an
  // undo would walk straight back into: the document as it was with the asset still in it, which
  // is precisely the state the correction existed to leave (L37).
  //
  // And the same intents go on every document the stack holds (#358, L37 revised). The living
  // document alone is not enough, because the stack holds whole documents and not operations:
  // the snapshot taken when the next gesture opened carries the asset that never arrived, and a
  // press of Ctrl+Z walks straight into it — the very state the correction existed to leave, one
  // step behind where it was. The inverse is worked out for the living document anyway, so
  // laying it on the stack as well is that edit applied a few more times, and no number of
  // presses reaches bytes that never came. All three sides of the stack, because the way forward
  // a gesture put aside (#142) is handed back whole when that gesture is called off.
  //
  // What comes back is the notice, in the reader's own language and naming what went: the
  // document changed behind the designer, and a notice that does not say which of the things she
  // did was taken back leaves her with a game she does not recognise. Why it went stands after
  // the colon, because that is what tells her whether trying again is worth anything.
  private takeBack(gesture: string, ref: string, undoing: Undoing, why: unknown, t: T): Error {
    if (this.gesture === gesture) this.callOff(gesture)
    else {
      for (const intent of undoing.intents) this.send(intent)
      const rebased = (steps: Step[]): Step[] => steps.map((step) => this.rebase(step, ref, undoing.intents))
      this.past = rebased(this.past)
      this.future = rebased(this.future)
      this.futureBeforeGesture = rebased(this.futureBeforeGesture)
    }
    return new Error(t('upload.undone', { what: t(undoing.said, { name: undoing.name }), why: why instanceof Error ? why.message : String(why) }))
  }

  // One step with the correction laid on it (#358). Only the document changes: what the step is
  // called is what the designer did, and a correction may not rewrite the history's own account
  // of that.
  //
  // A step that never held the bytes is left untouched, and the bytes have a name to ask for: the
  // hash is their name wherever they are written down — as the reference a symbol or a typeface
  // points at, and as the key a picture is filed under — so a document holds what fell away
  // exactly when it says that hash somewhere. Asking is not thrift but care: a removal writes the
  // shelf it removes from, so running one over a step from before the asset existed would leave
  // an empty `credits` where there was nothing at all, and the editor reads that difference as
  // the project having unsaved changes (#8).
  private rebase(step: Step, ref: string, intents: readonly EditIntent[]): Step {
    if (!JSON.stringify(step.doc).includes(ref.slice(ASSET_PREFIX.length))) return step
    return { ...step, doc: intents.reduce(applyEdit, step.doc) }
  }

  // A token no other doing can carry, so a placement that has to be taken back takes back its
  // own and nothing else.
  private newGesture(kind: string): string {
    return `${kind}-${(this.gestures += 1)}`
  }

  // The name is what card text writes between braces, so renaming one moves its credit too.
  renameIcon(from: string, to: string): void {
    this.edit({ v: 'renameIcon', from, to })
  }

  removeIcon(name: string): void {
    this.edit({ v: 'removeIcon', name })
  }

  // The game's own meanings and what they are painted in (E4). A card writes the meaning and
  // never the colour, so repainting a deck is one edit and renaming a meaning rewrites every
  // card that says it — the same bargain the icon set already makes with its names.
  setRole(role: string, colour: string): void {
    this.edit({ v: 'setRole', role, colour })
  }

  renameRole(from: string, to: string): void {
    this.edit({ v: 'renameRole', from, to })
  }

  removeRole(role: string): void {
    this.edit({ v: 'removeRole', role })
  }

  // What one card asks of its template's measure (E1). `null` puts the card back on the measure
  // the deck gave it, which is the only way back that does not require remembering a number.
  setFraming(cardRef: string, field: string, framing: ProjectFraming | null): void {
    this.edit({ v: 'setFraming', cardRef, field, framing })
  }

  // The window a picture is looked at through (#222, L22, beslut 2). It names no card because it
  // is about no card: it is cut once and every card drawn from the picture obeys it, which is one
  // edit, one version and one step back however many cards that turns out to be. `null` is the
  // picture going back to whole.
  setCrop(hash: string, crop: AssetCrop | null): void {
    this.edit({ v: 'setCrop', hash, crop })
  }
  // The pictures whose crop the actor has not yet confirmed (#297, L33): sent, or waiting for the
  // line, and not echoed back. The status under the window may say «sparad» only once a picture
  // has left this list.
  get cropsInFlight(): string[] {
    return [...new Set(this.pending.flatMap((intent) => (intent.v === 'setCrop' ? [intent.hash] : [])))]
  }
  // A picture out of the game (#318): the record and every picture cell that held it, in one
  // intent — so the way back from it is one step and not a picture followed by its cards.
  removePicture(hash: string): void {
    this.edit({ v: 'removePicture', hash })
  }

  // A typeface the game is set in (B3): the file becomes one of the project's assets, and the
  // family is named after the file, which is what a designer calls it anyway. The version then
  // pins the file, so what is printed a year from now is what was designed today.
  //
  // A licence is not in the file: only the designer knows it, and it is stated beside the family.
  async useFont(file: File, t: T = swedish): Promise<string> {
    // The reference first, off the bytes themselves (#339, as #310 did for the symbol): whether
    // the game already has this typeface is a question about a name, and the name is known here.
    const ref = await assetRefOfFile(file)
    // Read after every wait and never before one (D3); nothing is awaited from here to the edit.
    const already = Object.entries(this.doc.fonts ?? {}).find(([, f]) => f.asset === ref)
    if (already) return already[0]
    const family = freeFamily(familyFromFile(file.name), this.doc.fonts ?? {})
    const taking = this.newGesture('font')
    this.edit({ v: 'setFont', family, font: { stack: `"${family}", sans-serif`, asset: ref } }, taking)
    await this.storeAsset(file, 'font', ref, taking, { said: 'upload.undone.font', name: family, intents: [{ v: 'removeFont', family }] }, t)
    return family
  }

  // A family taken out of Google Fonts (#329, L27).
  //
  // Only this method ever reaches Google, and only from the designer's browser: the server and
  // the render worker never do (DRIFT §12). What comes back is copied in as the project's own
  // asset down the very path an uploaded file takes, so a version prints from a file the project
  // holds and an archived project needs nothing from Google at all.
  //
  // The whole variable file when the family has one, which is what `fileSheetHref` asks for. The
  // alternative — only the weights the template happens to use — buys bytes with a dependency the
  // project may not have: choosing a new weight a year from now would need Google again.
  async useCatalogFont(family: CatalogFamily, t: T = swedish): Promise<string> {
    const sheet = await fetch(fileSheetHref(family)).catch(() => null)
    if (!sheet?.ok) throw new Error(t('fonts.catalog.silent'))
    const file = await fetch(fileInSheet(await sheet.text())).catch(() => null)
    if (!file?.ok) throw new Error(t('fonts.catalog.silent'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    const blob = new File([bytes], `${family.family}.woff2`, { type: 'font/woff2' })
    // Read after every wait and never before one (D3).
    const ref = await assetRefOfFile(blob)
    const already = Object.entries(this.doc.fonts ?? {}).find(([, f]) => f.asset === ref)
    if (already) return already[0]
    const name = freeFamily(family.family, this.doc.fonts ?? {})
    const taking = this.newGesture('font')
    // The licence is written in the same edit as the family, because it is the same fact: the
    // catalog knows the answer, and a family that arrived knowing it must never stand in the
    // list with two empty boxes (L27).
    this.edit({ v: 'setFont', family: name, font: { stack: `"${name}", ${GENERIC[family.category] ?? 'serif'}`, asset: ref, licence: { licence: family.licence, by: family.by }, source: 'catalog' } }, taking)
    await this.storeAsset(blob, 'font', ref, taking, { said: 'upload.undone.font', name, intents: [{ v: 'removeFont', family: name }] }, t)
    return name
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

  // A picture brought into the game from the library (#222, L22, beslut 5 och 6). Two things are
  // true afterwards — the service holds the bytes, and the game holds a picture — and the designer
  // did one thing to ask for both, so the second half is one edit: one version and one step back
  // (B4), exactly as `placeIcon` is.
  //
  // The game has to hold the picture in its own right, because nothing is drawn from it yet: a
  // library that only listed what was in use would lose an uploaded picture the moment it arrived,
  // and it is the pictures nothing uses yet that the library exists for (beslut 4).
  //
  // The name comes along because this is the only moment it can. The bytes are content-addressed
  // and answer to a hash; what the file was called lives on the designer's disk and nowhere else,
  // so a name not taken here is a name gone for good. It is untrusted input and is made into a
  // name by `pictureNameOf`, which is where the schema that bounds it lives.
  async addPicture(file: File, t: T = swedish): Promise<string> {
    // The hash first, off the bytes themselves (#339, as #310 did for the symbol): it is the name
    // the service will give them, so whether the game already has the picture is known here.
    const ref = await assetRefOfFile(file)
    const hash = ref.slice(ASSET_PREFIX.length)
    // Read after every wait and never before one, for the reason `placeIcon` reads its face
    // after: the document moves while anything is awaited. Nothing is awaited from here to the
    // edit.
    const already = this.doc.pictures?.[hash] !== undefined
    const name = pictureNameOf(file.name)
    const adding = this.newGesture('picture')
    this.edit({ v: 'addPicture', hash, ...(name === undefined ? {} : { name }) }, adding)
    // A picture the game already has is bytes the service already holds: the edit above is all
    // there was to do, and the wire is never touched.
    if (!already) await this.storeAsset(file, 'image', ref, adding, { said: 'upload.undone.picture', name: name ?? file.name, intents: [{ v: 'removePicture', hash }] }, t)
    return hash
  }

  // A file for the project (E1): uploaded once, named by its bytes; whatever points at it then
  // points by hash.
  //
  // `kind` is the caller's word and not the file's. A browser's `File.type` is empty for a
  // typeface as often as not, so declaring it was declaring nothing and every typeface was refused
  // before its bytes were ever read (#312). The surface that opened the file is the one that knows
  // — the typeface button took a typeface, the picture button a picture — and the bytes still
  // decide what it actually is (#204).
  //
  // Which is also what the refusal can say now. A 415 used to mean either "you said nothing" or
  // "the bytes are not that", and the message blamed the file for both. Saying the kind ourselves
  // leaves only the second, so the refusal names the formats that kind may be in.
  async uploadAsset(file: Blob, kind: AssetKind, t: T = swedish): Promise<string> {
    const res = await fetch(`${this.http}/assets`, withCredentials({ method: 'POST', headers: { 'content-type': assetTypeDeclaring(kind) }, body: file }))
    if (res.status === 401) throw new Unauthorized()
    if (res.status === 415) throw new Error(t('upload.notThisKind', { formats: assetFormatsNamed(kind, t('upload.or')) }))
    if (res.status === 413) throw new Error(t('upload.tooBig'))
    if (!res.ok) throw new Error(t('upload.failed', { status: res.status }))
    return ((await res.json()) as { hash: string }).hash
  }

  // What is drawn inside each of the deck's pictures (E1): the file's own size and the uniform
  // border it carries around its motif, so a template can fit the motif rather than the file.
  //
  // The server is asked first, because the measurement is of the bytes and is therefore made once
  // for everyone. Whatever it does not know is measured here, where the browser has already
  // decoded the picture in order to show it, and told back — which is what lets a deck made
  // before there was anything to measure catch up the first time it is opened. A picture that
  // cannot be measured is left out, and such a card is then drawn by its file as it always was.
  // `measure` is how a file is measured, as it is for text (E6): the browser's own canvas by
  // default, and something else where there is no browser to ask.
  async motifs(hashes: readonly string[], measure: (url: string) => Promise<Motif | null> = measureAsset): Promise<Record<string, Motif>> {
    if (hashes.length === 0) return {}
    const res = await fetch(`${this.http}/assets/motifs?of=${hashes.join(',')}`, withCredentials())
    const known = res.ok ? ((await res.json()) as Record<string, Motif>) : {}
    for (const hash of hashes) {
      if (known[hash]) continue
      const motif = await measure(assetUrl(this.http, hash))
      if (!motif) continue
      known[hash] = motif
      await fetch(`${this.http}/assets/${hash}/motif`, withCredentials({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(motif) }))
    }
    return known
  }

  // Saving makes a version (B4). With a socket the actor makes it, so everyone with the project
  // open is told which version it became; without one the document is written the old way.
  async save(): Promise<SaveResult> {
    // Read before the save leaves, for both ways of saving: it is the document the version will
    // be made of, whatever is edited while the answer is on its way (#380).
    const asked = stamp(this.doc)
    if (this.socket) {
      const answered = new Promise<SaveResult>((resolve) => {
        this.saving = resolve
      })
      this.asked = asked
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
    this.saved = asked
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

  // "Starta bord" (L5, #417): a table from the saved project, with the room code guests join by
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

// A symbol's bytes as the body an upload wants, and the reference a file the designer picked will
// have once the service holds it (#339): the same hash `assetRefOf` works out for a symbol, read
// off the file's own bytes.
const blobOf = (file: ReturnType<typeof svgBytes>): Blob => new Blob([file.bytes], { type: file.type })
const assetRefOfFile = async (file: Blob): Promise<string> => assetRefOf(new Uint8Array(await file.arrayBuffer()))

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
