import { applyEdit, type EditIntent } from './edits.js'
import type { ProjectDoc, ProjectStore } from './projects.js'
import type { Role } from './roles.js'

// One actor owns one project (D3). A project is structurally the same as a table — shared state
// several people change at once, which belongs in the history — so it gets the table's shape: a
// serial queue makes concurrency impossible, and the order is decide → commit to the log →
// apply → tell everyone. Nothing in memory is authoritative: an actor is rebuilt from the saved
// version plus the edits that have happened since.
//
// Saving is still what makes a version (B4). The log carries the tail between saves, so two
// editors see each other's work at once without either of them having to save first.
// `from` is the connection the edit came from, so an editor can tell its own echo from someone
// else's edit and not apply what it already applied.
export type AppliedEdit = { seq: number; at: string; by?: string; from?: string; intent: EditIntent }
export type Editor = { id: string; name: string; role?: Role; send(message: EditorMessage): void; close?(): void }
export type EditorMessage =
  | { v: 'project'; doc: ProjectDoc; rev: number; seq: number; here: Presence[]; you: Presence }
  | { v: 'edits'; edits: AppliedEdit[] }
  | { v: 'here'; here: Presence[] }
  | { v: 'saved'; rev: number }
  | { v: 'refused'; why: string }
export type Presence = { id: string; name: string; role?: Role }

export class ProjectActor {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly editors = new Set<Editor>()

  private constructor(
    readonly id: string,
    private current: ProjectDoc,
    private rev: number,
    private at: number,
    private readonly store: ProjectStore,
  ) {}

  // The saved version, then everything that has happened since it.
  static async load(id: string, store: ProjectStore): Promise<ProjectActor | null> {
    const rec = await store.load(id)
    if (!rec) return null
    const versions = await store.versions(id)
    const from = versions.find((v) => v.rev === rec.rev)?.atSeq ?? 0
    const tail = await store.readEdits(id, from)
    const doc = tail.reduce((d, e) => applyEdit(d, e.intent), stripped(rec))
    return new ProjectActor(id, doc, rec.rev, tail.at(-1)?.seq ?? from, store)
  }

  get doc(): ProjectDoc {
    return this.current
  }
  get seq(): number {
    return this.at
  }
  get here(): Presence[] {
    return [...this.editors].map((e) => ({ id: e.id, name: e.name, ...(e.role ? { role: e.role } : {}) }))
  }

  // An editor joins: it is given the document as it stands, and everyone is told who is here.
  subscribe(editor: Editor): () => void {
    this.editors.add(editor)
    editor.send({ v: 'project', doc: this.current, rev: this.rev, seq: this.at, here: this.here, you: { id: editor.id, name: editor.name, ...(editor.role ? { role: editor.role } : {}) } })
    this.tellPresence()
    return () => {
      this.editors.delete(editor)
      this.tellPresence()
    }
  }

  // One edit, in the only order there is: it must apply, then it is committed, then it is applied
  // for real, then everyone is told. An edit that makes no sense moves neither log nor document.
  async edit(intent: EditIntent, by?: string, from?: string): Promise<AppliedEdit> {
    return this.serial(async () => {
      const next = applyEdit(this.current, intent)
      const entry: AppliedEdit = { seq: this.at + 1, at: new Date().toISOString(), ...(by ? { by } : {}), ...(from ? { from } : {}), intent }
      await this.store.appendEdits(this.id, [entry])
      this.current = next
      this.at = entry.seq
      this.tell({ v: 'edits', edits: [entry] })
      return entry
    })
  }

  // Saving makes a version of what stands now (B4), and marks how far the log had come, so a
  // fresh actor knows which edits are already in it.
  async save(): Promise<{ ok: true; rev: number } | { ok: false; reason: string }> {
    return this.serial(async () => {
      const result = await this.store.replace(this.id, this.rev, this.current, this.at)
      if (result === 'missing') return { ok: false as const, reason: 'unknown project' }
      if (result === 'conflict') return { ok: false as const, reason: 'conflict' }
      this.rev = result.rev
      this.tell({ v: 'saved', rev: result.rev })
      return { ok: true as const, rev: result.rev }
    })
  }

  // An editor whose edit was refused has drifted from the truth: it is handed the document as it
  // stands, so it can carry on from what is real rather than from what it thought.
  resync(editor: Editor): void {
    editor.send({ v: 'project', doc: this.current, rev: this.rev, seq: this.at, here: this.here, you: { id: editor.id, name: editor.name, ...(editor.role ? { role: editor.role } : {}) } })
  }

  private tell(message: EditorMessage): void {
    for (const editor of this.editors) editor.send(message)
  }
  private tellPresence(): void {
    this.tell({ v: 'here', here: this.here })
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => undefined)
    return next
  }
}

// The document without the record's own fields: what an editor holds and an edit applies to.
// Everything else is the document, whatever it has come to hold — naming the fields here is how
// a project would quietly lose one that the schema gained later.
function stripped(rec: ProjectDoc & { id: string; rev: number; owner?: string }): ProjectDoc {
  const { id, rev, owner, ...doc } = rec
  return doc
}

// One actor per project, in this process, exactly as one actor per table (D2, D3).
export class ProjectHost {
  private readonly actors = new Map<string, Promise<ProjectActor | null>>()
  constructor(private readonly store: ProjectStore) {}

  async get(id: string): Promise<ProjectActor | null> {
    const existing = this.actors.get(id)
    if (existing) {
      const actor = await existing
      if (actor) return actor
      this.actors.delete(id)
    }
    const loading = ProjectActor.load(id, this.store)
    this.actors.set(id, loading)
    const actor = await loading
    if (!actor) this.actors.delete(id)
    return actor
  }

  // A project that is gone has no actor: the next asker gets a fresh answer.
  forget(id: string): void {
    this.actors.delete(id)
  }
}
