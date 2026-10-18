// An incremental JSON reader for a structured answer (#1002): the answer arrives a few characters at
// a time, and each part of the proposal is handed on the moment it is whole, so a card is shown when
// its closing brace arrives and not when the whole answer has.
//
// Written here rather than taken from a package, because what is needed is small and particular: the
// parts are the properties of one object (an array property's elements one by one, any other
// property whole), and one string beside them is handed on as it grows — OpenAI's structured answer
// carries its prose inside the JSON, and a prose answer must still stream word by word. A general
// streaming parser does either half; this does both in a page, holds the answer in one string, and
// parses each part with `JSON.parse`, so a value is never read by anything but the platform's own
// parser.

export type JsonPartEvent = { type: 'text'; text: string } | { type: 'part'; key: string; value: unknown }
export type JsonPartsOptions = {
  // Where the object whose properties are the parts stands: `[]` for the root.
  partsAt: readonly string[]
  // A string to hand on as it grows, by where it stands.
  textAt?: readonly string[]
}

type Step = string | number
type Frame = { kind: 'object'; key: string | null; expect: 'key' | 'colon' | 'value' | 'next' } | { kind: 'array'; index: number; expect: 'value' | 'next' }

export class JsonParts {
  private buf = ''
  private at = 0
  private readonly stack: Frame[] = []
  private rootDone = false
  private broken = false
  // The string or literal being read, from where it began.
  private mode: 'none' | 'string' | 'literal' = 'none'
  private isKey = false
  private escape = false
  private start = 0
  // The part being gathered: where it began, and how deep the stack stood when it did.
  private part: { key: string; start: number; depth: number } | null = null
  // The text being handed on: where its characters begin, and how many have been handed on.
  private text: { start: number; said: number } | null = null

  constructor(private readonly options: JsonPartsOptions) {}

  push(chunk: string): JsonPartEvent[] {
    const out: JsonPartEvent[] = []
    this.buf += chunk
    while (this.at < this.buf.length && !this.broken) {
      this.step(this.buf[this.at] ?? '', this.at, out)
      this.at++
    }
    if (this.text && !this.broken) this.sayText(this.buf.length, out)
    return out
  }

  // Whether the answer came whole, and what it was when it did.
  end(): { complete: false } | { complete: true; value: unknown } {
    if (this.mode === 'literal') this.literalEnded(this.buf.length, [])
    if (!this.rootDone || this.broken || this.stack.length > 0 || this.mode !== 'none') return { complete: false }
    try {
      return { complete: true, value: JSON.parse(this.buf) }
    } catch {
      return { complete: false }
    }
  }

  private step(c: string, i: number, out: JsonPartEvent[]): void {
    if (this.mode === 'string') {
      if (this.escape) this.escape = false
      else if (c === '\\') this.escape = true
      else if (c === '"') this.stringEnded(i, out)
      return
    }
    if (this.mode === 'literal') {
      if (!/[\s,\]}]/.test(c)) return
      this.literalEnded(i, out)
      if (this.broken) return
    }
    if (/\s/.test(c)) return
    const top = this.stack.at(-1)
    if (top === undefined ? !this.rootDone : top.expect === 'value' && !(top.kind === 'array' && c === ']')) return this.valueBegins(c, i)
    if (top === undefined) return this.fail()
    if (top.kind === 'object') {
      if (top.expect === 'key' && c === '"') {
        this.mode = 'string'
        this.isKey = true
        this.start = i
      } else if (top.expect === 'colon' && c === ':') top.expect = 'value'
      else if (top.expect === 'next' && c === ',') top.expect = 'key'
      else if ((top.expect === 'next' || (top.expect === 'key' && top.key === null)) && c === '}') this.close(i, out)
      else this.fail()
      return
    }
    if (top.expect === 'next' && c === ',') {
      top.index++
      top.expect = 'value'
    } else if (c === ']') this.close(i, out)
    else this.fail()
  }

  private path(): Step[] {
    return this.stack.map((f) => (f.kind === 'object' ? (f.key ?? '') : f.index))
  }

  private valueBegins(c: string, i: number): void {
    const path = this.path()
    const parent = this.stack.at(-1)
    if (parent) parent.expect = 'next'
    this.notice(path, c, i)
    if (c === '{') this.stack.push({ kind: 'object', key: null, expect: 'key' })
    else if (c === '[') this.stack.push({ kind: 'array', index: 0, expect: 'value' })
    else if (c === '"') {
      this.mode = 'string'
      this.isKey = false
      this.start = i
    } else {
      this.mode = 'literal'
      this.start = i
    }
  }

  // Whether the value beginning here is a part, or the text to hand on.
  private notice(path: Step[], c: string, i: number): void {
    const at = this.options.partsAt
    const under = path.length > at.length && at.every((step, n) => path[n] === step)
    const key = path[at.length]
    if (under && typeof key === 'string') {
      if (path.length === at.length + 1 && c !== '[') this.part = { key, start: i, depth: this.stack.length }
      if (path.length === at.length + 2 && typeof path[at.length + 1] === 'number') this.part = { key, start: i, depth: this.stack.length }
    }
    const textAt = this.options.textAt
    if (textAt && c === '"' && path.length === textAt.length && textAt.every((step, n) => path[n] === step)) this.text = { start: i + 1, said: 0 }
  }

  private stringEnded(i: number, out: JsonPartEvent[]): void {
    this.mode = 'none'
    if (this.isKey) {
      const top = this.stack.at(-1)
      if (top?.kind !== 'object') return this.fail()
      top.key = JSON.parse(this.buf.slice(this.start, i + 1)) as string
      top.expect = 'colon'
      return
    }
    if (this.text) {
      this.sayText(i, out)
      this.text = null
    }
    this.valueEnded(i + 1, out)
  }

  private literalEnded(end: number, out: JsonPartEvent[]): void {
    this.mode = 'none'
    try {
      JSON.parse(this.buf.slice(this.start, end))
    } catch {
      return this.fail()
    }
    this.valueEnded(end, out)
  }

  private close(i: number, out: JsonPartEvent[]): void {
    this.stack.pop()
    this.valueEnded(i + 1, out)
  }

  private valueEnded(end: number, out: JsonPartEvent[]): void {
    if (this.stack.length === 0) this.rootDone = true
    if (this.part && this.part.depth === this.stack.length) {
      out.push({ type: 'part', key: this.part.key, value: JSON.parse(this.buf.slice(this.part.start, end)) })
      this.part = null
    }
  }

  // The text read so far up to `end`, short of an escape that has not arrived whole, and what of it
  // has not been handed on yet.
  private sayText(end: number, out: JsonPartEvent[]): void {
    const text = this.text
    if (!text) return
    let raw = this.buf.slice(text.start, end)
    const slashesBefore = (at: number): number => /\\*$/.exec(raw.slice(0, at))?.[0].length ?? 0
    // A backslash that is not itself escaped, at the very end, has not said what it escapes yet.
    if (slashesBefore(raw.length) % 2 === 1) raw = raw.slice(0, -1)
    // Nor has a `\u` with fewer than four digits after it.
    const unicode = /\\u[0-9a-fA-F]{0,3}$/.exec(raw)
    if (unicode && slashesBefore(unicode.index + 1) % 2 === 1) raw = raw.slice(0, unicode.index)
    let decoded: string
    try {
      decoded = JSON.parse(`"${raw}"`) as string
    } catch {
      return
    }
    if (decoded.length > text.said) {
      out.push({ type: 'text', text: decoded.slice(text.said) })
      text.said = decoded.length
    }
  }

  private fail(): void {
    this.broken = true
    this.part = null
    this.text = null
  }
}
