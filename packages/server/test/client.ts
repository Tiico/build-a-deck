import { ServerMessage, type Envelope, type Intent, type Snapshot } from '@byd/protocol'
import { applyPatch } from '@byd/engine'

// A test client that keeps every raw frame it received. The visibility assertions
// are made on those frames — on what actually crossed the wire, not on a view.
export class WireClient {
  readonly frames: string[] = []
  readonly messages: ServerMessage[] = []
  view: Snapshot | null = null
  private readonly ws: WebSocket
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = []
  private envelopes = 0
  // Envelope ids are unique per session, not per connection, so two clients at the same seat
  // must not number from the same one. The real client carries a nonce for exactly this.
  private readonly nonce = Math.random().toString(36).slice(2, 8)

  private constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.addEventListener('message', (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data)
      this.frames.push(raw)
      const msg = ServerMessage.parse(JSON.parse(raw))
      this.messages.push(msg)
      if (msg.t === 'snapshot') this.view = msg.snapshot
      if (msg.t === 'patch' && this.view) this.view = applyPatch(this.view, msg.patch)
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(msg)) return true
        w.resolve(msg)
        return false
      })
    })
  }

  static async connect(base: string, sessionId: string, seat: string | null, as?: { role: 'observer'; name: string } | { role: 'lobby' }, auth?: { host?: string; token?: string }): Promise<WireClient> {
    const q = new URLSearchParams()
    if (seat !== null) q.set('seat', seat)
    if (as) {
      q.set('role', as.role)
      if ('name' in as) q.set('name', as.name)
    }
    if (auth?.host) q.set('host', auth.host)
    if (auth?.token) q.set('token', auth.token)
    const url = `${base}/sessions/${sessionId}${q.size > 0 ? `?${q.toString()}` : ''}`
    const c = new WireClient(url)
    await new Promise<void>((resolve, reject) => {
      c.ws.addEventListener('open', () => resolve(), { once: true })
      c.ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
    })
    await c.waitFor((m) => m.t === 'snapshot' || m.t === 'error' || m.t === 'refused')
    return c
  }

  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    const hit = this.messages.find(pred)
    if (hit) return Promise.resolve(hit)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for message')), timeoutMs)
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer)
          resolve(m)
        },
      })
    })
  }

  sendRaw(text: string): void {
    this.ws.send(text)
  }

  // Resolves once the server has closed the socket (a kick, a refusal).
  closed(timeoutMs = 2000): Promise<void> {
    if (this.ws.readyState === this.ws.CLOSED) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs)
      this.ws.addEventListener('close', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
    })
  }

  // Sends one envelope and resolves with its ack or reject.
  async send(seat: string | null, ...intents: Intent[]): Promise<ServerMessage> {
    const env: Envelope = { id: `${seat ?? 'table'}-${this.nonce}-${this.envelopes++}`, seat, intents }
    this.ws.send(JSON.stringify({ t: 'envelope', envelope: env }))
    return this.waitFor((m) => (m.t === 'ack' || m.t === 'reject' || m.t === 'error') && m.id === env.id)
  }

  // Waits until the view has reached at least `seq`.
  async synced(seq: number): Promise<Snapshot> {
    if (this.view && this.view.seq >= seq) return this.view
    await this.waitFor((m) => (m.t === 'patch' && m.patch.seq >= seq) || (m.t === 'snapshot' && m.snapshot.seq >= seq))
    return this.view!
  }

  close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise((resolve) => {
      this.ws.addEventListener('close', () => resolve(), { once: true })
      if (this.ws.readyState !== WebSocket.CLOSING) this.ws.close()
    })
  }
}
