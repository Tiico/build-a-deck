import type { Applied, Envelope, Presence, SeatId, ServerMessage, Snapshot } from '@byd/protocol'
import {
  apply,
  cryptoRng,
  decide,
  diff,
  initialState,
  project,
  projectActivity,
  replay,
  uuidIds,
  type DecideDeps,
  type Decision,
  type Sources,
  type FaceHashes,
  type SetupDef,
  type TableState,
  type TypeRegistry,
} from '@byd/engine'
import type { RenderStore } from '@byd/render/queue'
import { facesOf, type Deck } from './faces.js'
import type { LogStore } from './store.js'

export const TEXTURE_DPI = 150
// How much of the log a joining connection is handed, so a screen that comes in mid-game can
// say what has happened (#20). Enough to fill a feed, not the whole session.
const HISTORY_LINES = 50

// One actor owns one table. A serial queue makes concurrency impossible; the order
// decide → append (commit) → apply → broadcast makes the log the truth (DRIFT §3).
// Nothing in memory is authoritative: an actor is rebuilt from its log on load.

// `observer` (C8) names a watcher: seatless, sees everything, may only flag.
export type Subscriber = { seat: SeatId | null; id: string; observer?: string; send(message: ServerMessage): void }

export class TableActor {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly subscribers = new Map<Subscriber, Snapshot>()
  private lastActivity = Date.now()

  private readonly deps: DecideDeps

  private constructor(
    readonly id: string,
    private readonly initial: TableState,
    private state: TableState,
    // The committed log, kept so a rewind (B) can look back without a round trip to the store.
    private readonly log: Applied[],
    private readonly registry: TypeRegistry,
    private readonly store: LogStore,
    sources: Sources,
    // Texture hashes per card and face; undefined for a session without a deck.
    private faces: FaceHashes | undefined,
    private readonly renders: RenderStore | undefined,
  ) {
    this.deps = {
      ...sources,
      history: {
        stateAt: (seq) => replay(this.initial, this.registry, this.log.filter((l) => l.seq <= seq)),
        lines: () => this.log,
      },
    }
  }

  static async load(id: string, registry: TypeRegistry, store: LogStore, sources?: Sources, renders?: RenderStore): Promise<TableActor | null> {
    const record = await store.loadSession(id)
    if (!record) return null
    const initial = initialState(record.version, record.setup, registry)
    const log = await store.read(id)
    const state = replay(initial, registry, log)
    let faces: FaceHashes | undefined
    if (record.deck) {
      // Enqueue is idempotent by hash, so loading a table twice costs nothing the second time.
      const compiled = facesOf(record.deck, record.setup, registry, TEXTURE_DPI, Date.now())
      faces = compiled.faces
      if (renders) for (const job of compiled.jobs) await renders.enqueue(job)
    }
    return new TableActor(id, initial, state, log, registry, store, sources ?? defaultSources(), faces, renders)
  }

  // A newer deck (C7): recompute texture hashes and queue what is not rendered yet. Views
  // pick the new hashes up with the next projection.
  async refreshDeck(deck: Deck, setup: SetupDef): Promise<void> {
    const compiled = facesOf(deck, setup, this.registry, TEXTURE_DPI, Date.now())
    this.faces = compiled.faces
    if (this.renders) for (const job of compiled.jobs) await this.renders.enqueue(job)
  }

  get seq(): number {
    return this.state.seq
  }

  // Every distinct texture this table needs (L5): the editor waits for them before opening it.
  textureHashes(): string[] {
    const all = new Set<string>()
    for (const perFace of Object.values(this.faces ?? {})) for (const hash of Object.values(perFace)) all.add(hash)
    return [...all]
  }

  get ended(): boolean {
    return this.state.ended
  }

  get version(): string {
    return this.state.version
  }

  get idleMs(): number {
    return this.subscribers.size > 0 ? 0 : Date.now() - this.lastActivity
  }

  subscribe(sub: Subscriber): void {
    const snapshot = project(this.state, this.registry, sub.seat, this.faces, this.deps.history, sub.observer !== undefined)
    this.subscribers.set(sub, snapshot)
    sub.send({ t: 'snapshot', snapshot })
    // After the table, what led to it: the same redaction every view gets while playing.
    const history = this.log.slice(-HISTORY_LINES).map(projectActivity)
    if (history.length > 0) sub.send({ t: 'activity', lines: history })
    if (sub.observer !== undefined) this.broadcastRoster()
    else sub.send({ t: 'roster', observers: this.observers() })
    this.lastActivity = Date.now()
  }

  private observers(): { id: string; name: string }[] {
    return [...this.subscribers.keys()].flatMap((s) => (s.observer !== undefined ? [{ id: s.id, name: s.observer }] : []))
  }

  private broadcastRoster(): void {
    const observers = this.observers()
    for (const sub of this.subscribers.keys()) sub.send({ t: 'roster', observers })
  }

  unsubscribe(sub: Subscriber): void {
    if (!this.subscribers.has(sub)) return
    this.subscribers.delete(sub)
    if (sub.observer !== undefined) this.broadcastRoster()
    // No cursor or carried card outlives its connection.
    this.relay(sub, { kind: 'drop' })
    this.relay(sub, { kind: 'away' })
    this.lastActivity = Date.now()
  }

  // Presence (K6): straight to every other connection, never through decide or the log.
  relay(from: Subscriber, presence: Presence): void {
    for (const sub of this.subscribers.keys()) {
      if (sub !== from) sub.send({ t: 'presence', from: { seat: from.seat, id: from.id }, presence })
    }
  }

  submit(env: Envelope): Promise<Decision> {
    const run = this.queue.then(() => this.handle(env))
    // Keep the queue alive past failures; the caller sees them through `run`.
    this.queue = run.catch(() => undefined)
    return run
  }

  // Resolves once every submitted envelope has been handled.
  async idle(): Promise<void> {
    await this.queue
  }

  // Tells every connection to go away, e.g. on drain.
  farewell(reason: string): void {
    for (const sub of this.subscribers.keys()) sub.send({ t: 'bye', reason })
  }

  private async handle(env: Envelope): Promise<Decision> {
    this.lastActivity = Date.now()
    const decision = decide(this.state, this.registry, env, this.deps)
    if (!decision.ok) return decision

    await this.store.append(this.id, decision.applied)
    for (const line of decision.applied) {
      this.state = apply(this.state, this.registry, line)
      this.log.push(line)
    }

    const activity = decision.applied.map(projectActivity)
    for (const [sub, previous] of this.subscribers) {
      const next = project(this.state, this.registry, sub.seat, this.faces, this.deps.history, sub.observer !== undefined)
      const patch = diff(previous, next)
      this.subscribers.set(sub, next)
      if (patch.ops.length > 0 || patch.seq !== previous.seq) sub.send({ t: 'patch', patch })
      sub.send({ t: 'activity', lines: activity })
    }
    return decision
  }
}

export function defaultSources(): Sources {
  return { rng: cryptoRng(), ids: uuidIds(), now: () => new Date().toISOString() }
}

// Holds the actors of one process, loading each from its log the first time it is
// asked for, and letting idle ones go so a long-running process does not keep every
// table it ever saw (DRIFT §3).
export class TableHost {
  private readonly actors = new Map<string, Promise<TableActor | null>>()

  constructor(
    private readonly registry: TypeRegistry,
    private readonly store: LogStore,
    private readonly makeSources: () => Sources = defaultSources,
    private readonly renders?: RenderStore,
  ) {}

  get(id: string): Promise<TableActor | null> {
    let pending = this.actors.get(id)
    if (!pending) {
      pending = TableActor.load(id, this.registry, this.store, this.makeSources(), this.renders).then((actor) => {
        if (!actor) this.actors.delete(id)
        return actor
      })
      this.actors.set(id, pending)
    }
    return pending
  }

  async evictIdle(olderThanMs: number): Promise<string[]> {
    const evicted: string[] = []
    for (const [id, pending] of this.actors) {
      const actor = await pending
      if (actor && actor.idleMs > olderThanMs) {
        await actor.idle()
        this.actors.delete(id)
        evicted.push(id)
      }
    }
    return evicted
  }

  async loaded(): Promise<TableActor[]> {
    const all = await Promise.all(this.actors.values())
    return all.filter((a): a is TableActor => a !== null)
  }

  // The timeout in C9: ends every table nobody has touched since `olderThan`, as the table.
  async endStale(olderThan: Date): Promise<string[]> {
    const ended: string[] = []
    for (const id of await this.store.staleSessions(olderThan)) {
      const actor = await this.get(id)
      if (!actor) continue
      const d = await actor.submit({ id: `end-${id}-${Date.now()}`, seat: null, intents: [{ v: 'session.end' }] })
      if (d.ok) ended.push(id)
    }
    return ended
  }

  async drain(reason: string): Promise<void> {
    for (const actor of await this.loaded()) {
      await actor.idle()
      actor.farewell(reason)
    }
    this.actors.clear()
  }
}
