import { ServerMessage, type Activity, type Envelope, type Intent, type SeatId, type Snapshot } from '@byd/protocol'
import { applyPatch } from '@byd/engine'

export type ClientStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'
export type ConnectOptions = {
  url: string
  sessionId: string
  seat: SeatId | null
  // First reconnect delay; doubles per attempt up to ten times this.
  reconnectDelayMs?: number
}
export type SendResult = { ok: true; seqs: number[] } | { ok: false; reason: string }
export type Listener = (view: Snapshot | null, status: ClientStatus) => void

const ACTIVITY_LIMIT = 200

// The whole wire protocol behind a small surface: a view that follows the table,
// a status, and `send`. Framework-free so that views stay thin.
export class TableClient {
  view: Snapshot | null = null
  status: ClientStatus = 'connecting'
  // The most recent committed lines, redacted by the server; oldest first, bounded.
  activity: Activity[] = []
  private ws: WebSocket
  private readonly readyPromise: Promise<void>
  private resolveReady!: () => void
  private readonly pending = new Map<string, (result: SendResult) => void>()
  private readonly seqWaiters: { seq: number; resolve: () => void }[] = []
  private readonly listeners = new Set<Listener>()
  private envelopes = 0
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private constructor(private readonly opts: ConnectOptions) {
    this.readyPromise = new Promise((resolve) => (this.resolveReady = resolve))
    this.ws = this.open()
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
    const envelope: Envelope = { id: `${this.opts.seat ?? 'table'}-${this.envelopes++}`, seat: this.opts.seat, intents }
    return new Promise((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        resolve({ ok: false, reason: 'not connected' })
        return
      }
      this.pending.set(envelope.id, resolve)
      this.ws.send(JSON.stringify({ t: 'envelope', envelope }))
    })
  }

  // Resolves once the view has reached at least `seq`.
  synced(seq: number): Promise<void> {
    if (this.view && this.view.seq >= seq) return Promise.resolve()
    return new Promise((resolve) => this.seqWaiters.push({ seq, resolve }))
  }

  close(): void {
    this.setStatus('closed')
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws.close()
  }

  private open(): WebSocket {
    const { url, sessionId, seat } = this.opts
    const ws = new WebSocket(`${url}/sessions/${encodeURIComponent(sessionId)}${seat === null ? '' : `?seat=${encodeURIComponent(seat)}`}`)
    ws.addEventListener('message', (ev) => this.receive(ServerMessage.parse(JSON.parse(String(ev.data)))))
    ws.addEventListener('close', () => this.dropped(ws))
    ws.addEventListener('error', () => undefined) // `close` follows; nothing to do here
    return ws
  }

  // The connection went away without us asking. Whatever was in flight is unknown to us:
  // the view after resync is the truth, so pending envelopes are told so and let go.
  private dropped(ws: WebSocket): void {
    if (ws !== this.ws || this.status === 'closed') return
    for (const resolve of this.pending.values()) resolve({ ok: false, reason: 'connection lost' })
    this.pending.clear()
    this.setStatus('reconnecting')
    const base = this.opts.reconnectDelayMs ?? 500
    const delay = Math.min(base * 2 ** this.attempts, base * 10)
    this.attempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.status !== 'closed') this.ws = this.open()
    }, delay)
  }

  private receive(msg: ServerMessage): void {
    switch (msg.t) {
      case 'snapshot':
        this.view = msg.snapshot
        this.attempts = 0
        this.setStatus('open')
        this.resolveReady()
        this.settleSeqWaiters()
        break
      case 'patch':
        if (this.view) this.view = applyPatch(this.view, msg.patch)
        this.settleSeqWaiters()
        this.notify()
        break
      case 'activity':
        this.activity = [...this.activity, ...msg.lines].slice(-ACTIVITY_LIMIT)
        this.notify()
        break
      case 'ack':
        this.settle(msg.id, { ok: true, seqs: msg.seqs })
        break
      case 'reject':
        this.settle(msg.id, { ok: false, reason: msg.reason })
        break
      case 'error':
        if (msg.id !== null) this.settle(msg.id, { ok: false, reason: msg.message })
        break
      case 'bye':
        // The server will close; `dropped` handles the rest.
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
