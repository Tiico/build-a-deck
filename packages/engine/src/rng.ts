import type { ComponentId } from '@byd/protocol'

export type Rng = { int(maxExclusive: number): number }
export type IdSource = { next(): ComponentId }

// Fisher–Yates. Returns a permutation of 0..n-1.
export function permutation(n: number, rng: Rng): number[] {
  const p = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const a = p[i] as number
    p[i] = p[j] as number
    p[j] = a
  }
  return p
}

// mulberry32 — small, fast, adequate for tests. Never used in production.
export function seededRng(seed: number): Rng {
  let s = seed >>> 0
  return {
    int(maxExclusive) {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
      return Math.floor(r * maxExclusive)
    },
  }
}

export function cryptoRng(): Rng {
  return {
    int(maxExclusive) {
      if (maxExclusive <= 0) throw new Error('maxExclusive must be positive')
      // Rejection sampling to avoid modulo bias.
      const range = 0x100000000
      const limit = range - (range % maxExclusive)
      const buf = new Uint32Array(1)
      for (;;) {
        crypto.getRandomValues(buf)
        const v = buf[0] as number
        if (v < limit) return v % maxExclusive
      }
    },
  }
}

export function uuidIds(): IdSource {
  return { next: () => crypto.randomUUID() }
}

export function counterIds(prefix: string, start = 0): IdSource {
  let n = start
  return { next: () => `${prefix}${n++}` }
}
