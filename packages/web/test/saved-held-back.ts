import type { EditSocketCtor, WebSocketLike } from '../src/editor/ProjectClient.js'
import { EditSocket } from './setup.js'

// The editor's line with the actor's «saved» held back on its way in until `release` lets it
// through (#988). Nothing is invented: every frame is the actor's own and arrives in the order it
// was sent — only late. That is the order a busy machine falls into by accident, where the version
// is made and in the store and the word that says so is still on the line when the next save is
// asked for; here it is made certain rather than hoped for.
export class SavedHeldBack {
  private readonly held: { line: WebSocketLike; event: { data: unknown } }[] = []
  private holding = true

  /** How many «saved» are waiting. */
  get waiting(): number {
    return this.held.length
  }

  /** Lets every held «saved» through, in the order it came, and holds nothing after. */
  release(): void {
    this.holding = false
    for (const { line, event } of this.held.splice(0)) line.onmessage?.(event)
  }

  readonly Line: EditSocketCtor = ((gate: SavedHeldBack) =>
    class implements WebSocketLike {
      private readonly line: WebSocketLike
      onopen: (() => void) | null = null
      onmessage: ((event: { data: unknown }) => void) | null = null
      onclose: ((event?: { code?: number }) => void) | null = null
      onerror: (() => void) | null = null
      constructor(url: string) {
        this.line = new EditSocket(url) as unknown as WebSocketLike
        this.line.onopen = () => this.onopen?.()
        this.line.onclose = (event) => this.onclose?.(event)
        this.line.onerror = () => this.onerror?.()
        this.line.onmessage = (event) => {
          if (gate.holding && (JSON.parse(String(event.data)) as { v: string }).v === 'saved') gate.held.push({ line: this, event })
          else this.onmessage?.(event)
        }
      }
      get readyState(): number {
        return this.line.readyState
      }
      send(data: string): void {
        this.line.send(data)
      }
      close(): void {
        this.line.close()
      }
    })(this) as unknown as EditSocketCtor
}
