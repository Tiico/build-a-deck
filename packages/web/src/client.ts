import { ServerMessage, type Activity, type Envelope, type Intent, type Presence, type PresenceFrom, type SeatId, type Snapshot } from '@byd/protocol'
import { applyPatch } from '@byd/engine'

export type ClientStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'
// Why the client has stopped trying. A status says what it is doing; a trouble says that it is
// no longer doing anything and why (#7). Only a person clears one.
export type ClientTrouble = 'missing' | 'timeout' | 'exhausted'
export type ConnectOptions = {
  url: string
  sessionId: string
  seat: SeatId | null
  // Watch as a named observer (C8): seatless, sees everything, may only flag.
  observer?: string
  // How long the very first connection may take before it is called off. Without this
  // `connecting` could stand for ever, which is the bug in #7.
  connectTimeoutMs?: number
  // The waits before each automatic reconnect, in order. The plan is finite on purpose: the
  // transport tries by itself while trying is likely to help, and then it hands the decision to
  // a person rather than blinking at them for ever.
  retryPlanMs?: readonly number[]
  // The first wait, when no whole plan is given: the rest of the plan doubles from it.
  reconnectDelayMs?: number
}
export type SendResult = { ok: true; seqs: number[] } | { ok: false; reason: string }
export type Listener = (view: Snapshot | null, status: ClientStatus) => void
export type PresenceListener = (from: PresenceFrom, presence: Presence) => void

const ACTIVITY_LIMIT = 200
// One quick attempt so that a blink heals before anyone can read a message about it, then the
// approved 2, 4 and 8 seconds, and then a person decides.
const RETRY_PLAN_MS = [500, 2000, 4000, 8000] as const
const CONNECT_TIMEOUT_MS = 10_000
// Cursor updates are coalesced (K6): at most one in flight per this many ms, the latest wins.
const CURSOR_MS = 50

// The subset of the WebSocket API the client relies on, so another implementation
// (the `ws` package under jsdom, a native module elsewhere) can be injected.
export type WebSocketLike = {
  readonly readyState: number
  readonly OPEN: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (ev: { data?: unknown }) => void): void
}
export type WebSocketCtor = new (url: string) => WebSocketLike

let implementation: WebSocketCtor | null = null
export function useWebSocketImplementation(ctor: WebSocketCtor | null): void {
  implementation = ctor
}
const makeSocket = (url: string): WebSocketLike => new (implementation ?? (globalThis.WebSocket as unknown as WebSocketCtor))(url)

// The whole wire protocol behind a small surface: a view that follows the table,
// a status, and `send`. Framework-free so that views stay thin.
export class TableClient {
  view: Snapshot | null = null
  status: ClientStatus = 'connecting'
  // Set when the client has stopped of its own accord; cleared only by `retry`.
  trouble: ClientTrouble | null = null
  // When the next automatic attempt is due, for a countdown that makes the wait visible.
  nextRetryAt: number | null = null
  // The most recent committed lines, redacted by the server; oldest first, bounded.
  activity: Activity[] = []
  // Who is watching (C8), as the server last told us.
  observers: { id: string; name: string }[] = []
  private ws: WebSocketLike
  private readonly readyPromise: Promise<void>
  private resolveReady!: () => void
  private readonly pending = new Map<string, (result: SendResult) => void>()
  private readonly seqWaiters: { seq: number; resolve: () => void }[] = []
  private readonly listeners = new Set<Listener>()
  private readonly presenceListeners = new Set<PresenceListener>()
  private cursorTimer: ReturnType<typeof setTimeout> | null = null
  private pendingCursor: Presence | null = null
  private envelopes = 0
  private readonly nonce = Math.random().toString(36).slice(2, 10)
  private made = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  // Whether a snapshot has ever arrived. The first connection is the one with a deadline; after
  // that the retry plan is what limits the trying.
  private everOpen = false

  private constructor(private readonly opts: ConnectOptions) {
    this.readyPromise = new Promise((resolve) => (this.resolveReady = resolve))
    this.armConnectTimeout()
    this.ws = this.open()
  }

  // How many automatic attempts have been made, and how many the plan allows.
  get attempts(): { made: number; of: number } {
    return { made: this.made, of: this.plan.length }
  }

  private get plan(): readonly number[] {
    if (this.opts.retryPlanMs) return this.opts.retryPlanMs
    const base = this.opts.reconnectDelayMs
    return base === undefined ? RETRY_PLAN_MS : [base, base * 2, base * 4, base * 8]
  }

  static connect(opts: ConnectOptions): TableClient {
    return new TableClient(opts)
  }

  // Resolves on the first snapshot.
  ready(): Promise<void> {
    return this.readyPromise
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Sends one atomic envelope (K3). Resolves when the server has committed or refused it.
  send(...intents: Intent[]): Promise<SendResult> {
    // Ids must be unique per session, not per connection: the id becomes the log's batch.
    const envelope: Envelope = { id: `${this.opts.seat ?? 'table'}-${this.nonce}-${this.envelopes++}`, seat: this.opts.seat, intents }
    return new Promise((resolve) => {
      if (this.ws.readyState !== this.ws.OPEN) {
        resolve({ ok: false, reason: 'not connected' })
        return
      }
      this.pending.set(envelope.id, resolve)
      this.ws.send(JSON.stringify({ t: 'envelope', envelope }))
    })
  }

  // Presence (K6): fire and forget, beside the log. Cursor moves are throttled; anything
  // else goes at once (a point, a drag, a drop, going away).
  sendPresence(p: Presence): void {
    if (p.kind !== 'cursor') {
      this.flushCursor()
      this.raw({ t: 'presence', presence: p })
      return
    }
    this.pendingCursor = p
    if (this.cursorTimer) return
    this.flushCursor()
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null
      this.flushCursor()
    }, CURSOR_MS)
  }

  onPresence(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  private flushCursor(): void {
    const p = this.pendingCursor
    this.pendingCursor = null
    if (p) this.raw({ t: 'presence', presence: p })
  }

  private raw(message: { t: 'presence'; presence: Presence }): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(message))
  }

  // Resolves once the view has reached at least `seq`.
  synced(seq: number): Promise<void> {
    if (this.view && this.view.seq >= seq) return Promise.resolve()
    return new Promise((resolve) => this.seqWaiters.push({ seq, resolve }))
  }

  close(): void {
    this.setStatus('closed')
    this.clearTimers()
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
    this.ws.close()
  }

  // What a person pressing "Försök igen" does. Never a reload: the view, the activity and the
  // seat are all still here, and throwing them away to ask the same question is how a page ends
  // up in a loop.
  retry(): void {
    if (this.status === 'closed') return
    this.clearTimers()
    this.trouble = null
    this.nextRetryAt = null
    this.made = 0
    if (!this.everOpen) this.armConnectTimeout()
    this.setStatus(this.view ? 'reconnecting' : 'connecting')
    this.ws.close()
    this.ws = this.open()
    this.notify()
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.reconnectTimer = null
    this.connectTimer = null
  }

  private armConnectTimeout(): void {
    const ms = this.opts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null
      if (!this.everOpen && this.status !== 'closed') this.giveUp('timeout')
    }, ms)
  }

  // Stops trying and says why. Whatever socket is open is let go of, so nothing keeps arriving
  // behind a screen that has already said the line is down.
  private giveUp(trouble: ClientTrouble): void {
    this.clearTimers()
    this.trouble = trouble
    this.nextRetryAt = null
    this.ws.close()
    this.notify()
  }

  private open(): WebSocketLike {
    const { url, sessionId, seat, observer } = this.opts
    const q = new URLSearchParams()
    if (observer !== undefined) {
      q.set('role', 'observer')
      q.set('name', observer)
    } else if (seat !== null) q.set('seat', seat)
    const ws = makeSocket(`${url}/sessions/${encodeURIComponent(sessionId)}${q.size > 0 ? `?${q.toString()}` : ''}`)
    ws.addEventListener('message', (ev) => this.receive(ServerMessage.parse(JSON.parse(String(ev.data)))))
    ws.addEventListener('close', () => this.dropped(ws))
    ws.addEventListener('error', () => undefined) // `close` follows; nothing to do here
    return ws
  }

  // The connection went away without us asking. Whatever was in flight is unknown to us:
  // the view after resync is the truth, so pending envelopes are told so and let go.
  private dropped(ws: WebSocketLike): void {
    if (ws !== this.ws || this.status === 'closed' || this.trouble !== null) return
    for (const resolve of this.pending.values()) resolve({ ok: false, reason: 'connection lost' })
    this.pending.clear()
    this.setStatus('reconnecting')
    const delay = this.plan[this.made]
    // The plan is spent: trying again on our own would only be a page blinking at nobody.
    if (delay === undefined) {
      this.giveUp('exhausted')
      return
    }
    this.made++
    this.nextRetryAt = Date.now() + delay
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.nextRetryAt = null
      if (this.status !== 'closed' && this.trouble === null) this.ws = this.open()
    }, delay)
    this.notify()
  }

  private receive(msg: ServerMessage): void {
    switch (msg.t) {
      case 'snapshot':
        this.view = msg.snapshot
        this.made = 0
        this.nextRetryAt = null
        this.everOpen = true
        if (this.connectTimer) {
          clearTimeout(this.connectTimer)
          this.connectTimer = null
        }
        this.setStatus('open')
        this.resolveReady()
        this.settleSeqWaiters()
        break
      case 'patch':
        if (this.view) this.view = applyPatch(this.view, msg.patch)
        this.settleSeqWaiters()
        this.notify()
        break
      case 'activity': {
        // A connection is handed the log so far, and again after a reconnect. `seq` is the line's
        // identity, so saying the same line twice adds nothing.
        const known = new Set(this.activity.map((l) => l.seq))
        const fresh = msg.lines.filter((l) => !known.has(l.seq))
        if (fresh.length === 0) break
        this.activity = [...this.activity, ...fresh].sort((a, b) => a.seq - b.seq).slice(-ACTIVITY_LIMIT)
        this.notify()
        break
      }
      case 'ack':
        this.settle(msg.id, { ok: true, seqs: msg.seqs })
        break
      case 'reject':
        this.settle(msg.id, { ok: false, reason: msg.reason })
        break
      case 'error':
        if (msg.id !== null) this.settle(msg.id, { ok: false, reason: msg.message })
        // An error with no envelope to blame is about the connection itself, and the only one
        // the server sends is a session it has never heard of. Asking again gives the same
        // answer, so the client stops rather than reconnecting into the same wall.
        else if (/^unknown session/.test(msg.message)) this.giveUp('missing')
        break
      case 'bye':
        // The server will close; `dropped` handles the rest.
        break
      case 'presence':
        for (const l of this.presenceListeners) l(msg.from, msg.presence)
        break
      case 'roster':
        this.observers = msg.observers
        this.notify()
        break
    }
  }

  private settle(id: string, result: SendResult): void {
    const resolve = this.pending.get(id)
    if (!resolve) return
    this.pending.delete(id)
    // A patch for this envelope may arrive after the ack; the view is authoritative, so
    // wait for it before resolving so that `await send()` always sees its own effect.
    if (result.ok && result.seqs.length > 0) {
      void this.synced(Math.max(...result.seqs)).then(() => resolve(result))
    } else {
      resolve(result)
    }
  }

  private settleSeqWaiters(): void {
    const seq = this.view?.seq ?? -1
    for (let i = this.seqWaiters.length - 1; i >= 0; i--) {
      const w = this.seqWaiters[i]
      if (w && w.seq <= seq) {
        this.seqWaiters.splice(i, 1)
        w.resolve()
      }
    }
  }

  private setStatus(status: ClientStatus): void {
    if (this.status === status) return
    this.status = status
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l(this.view, this.status)
  }
}
