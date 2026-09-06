import type { Envelope, SeatId, ServerMessage, Snapshot } from '@byd/protocol'
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
  type TableState,
  type TypeRegistry,
} from '@byd/engine'
import type { LogStore } from './store.js'

// One actor owns one table. A serial queue makes concurrency impossible; the order
// decide → append (commit) → apply → broadcast makes the log the truth (DRIFT §3).
// Nothing in memory is authoritative: an actor is rebuilt from its log on load.

export type Subscriber = { seat: SeatId | null; send(message: ServerMessage): void }

export class TableActor {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly subscribers = new Map<Subscriber, Snapshot>()
  private lastActivity = Date.now()

  private constructor(
    readonly id: string,
    private state: TableState,
    private readonly registry: TypeRegistry,
    private readonly store: LogStore,
    private readonly deps: DecideDeps,
  ) {}

  static async load(id: string, registry: TypeRegistry, store: LogStore, deps?: DecideDeps): Promise<TableActor | null> {
    const record = await store.loadSession(id)
    if (!record) return null
    const initial = initialState(record.version, record.setup, registry)
    const state = replay(initial, registry, await store.read(id))
    return new TableActor(id, state, registry, store, deps ?? defaultDeps())
  }

  get seq(): number {
    return this.state.seq
  }

  get idleMs(): number {
    return this.subscribers.size > 0 ? 0 : Date.now() - this.lastActivity
  }

  subscribe(sub: Subscriber): void {
    const snapshot = project(this.state, this.registry, sub.seat)
    this.subscribers.set(sub, snapshot)
    sub.send({ t: 'snapshot', snapshot })
    this.lastActivity = Date.now()
  }

  unsubscribe(sub: Subscriber): void {
    this.subscribers.delete(sub)
    this.lastActivity = Date.now()
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
    for (const line of decision.applied) this.state = apply(this.state, this.registry, line)

    const activity = decision.applied.map(projectActivity)
    for (const [sub, previous] of this.subscribers) {
      const next = project(this.state, this.registry, sub.seat)
      const patch = diff(previous, next)
      this.subscribers.set(sub, next)
      if (patch.ops.length > 0 || patch.seq !== previous.seq) sub.send({ t: 'patch', patch })
      sub.send({ t: 'activity', lines: activity })
    }
    return decision
  }
}

export function defaultDeps(): DecideDeps {
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
    private readonly makeDeps: () => DecideDeps = defaultDeps,
  ) {}

  get(id: string): Promise<TableActor | null> {
    let pending = this.actors.get(id)
    if (!pending) {
      pending = TableActor.load(id, this.registry, this.store, this.makeDeps()).then((actor) => {
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

  async drain(reason: string): Promise<void> {
    for (const actor of await this.loaded()) {
      await actor.idle()
      actor.farewell(reason)
    }
    this.actors.clear()
  }
}
