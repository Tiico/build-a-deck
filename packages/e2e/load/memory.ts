/**
 * What a container's memory is, read the way the kernel keeps it (#1012, DRIFT §1).
 *
 * A container's cgroup counts its page cache with everything else, and the cache is what the
 * kernel evicts first when the limit is near: a Postgres that has read its tables once sits at its
 * limit forever and is in no danger at all. So the number held up against the limit is the
 * *working set* — `memory.current` less the inactive file cache — which is also the number
 * `docker stats` shows. `anon` is beside it because it is the part nothing can evict: the heap.
 */
export type Sample = { current: number; workingSet: number; anon: number }

/** One reading: `memory.current` on the first line, then `memory.stat` as the kernel writes it. */
export function readSample(text: string): Sample {
  const [first = '', ...rest] = text.trim().split('\n')
  const current = Number(first.trim())
  const stat = keyed(rest.join('\n'))
  const inactive = stat.get('inactive_file') ?? 0
  return { current, workingSet: Math.max(0, current - inactive), anon: stat.get('anon') ?? 0 }
}

export type Container = 'app' | 'render' | 'postgres'
export const CONTAINERS: readonly Container[] = ['app', 'render', 'postgres']

/** A sample, and which container and which part of the scenario it was taken in. */
export type Reading = { container: Container; phase: string; sample: Sample }

/**
 * What the kernel says once the run is over: the limit, the highest `memory.current` it ever saw
 * (cache included), and `memory.events` as written — `max` is how often the container hit its
 * limit and had to be reclaimed into, `oom_kill` how often that was not enough.
 */
export type Kernel = { limit: number; peak: number; events: string; restarts: number }

export type Verdict = {
  container: Container
  limit: number
  workingSetPeak: number
  anonPeak: number
  kernelPeak: number
  hitLimit: number
  oomKills: number
  /** How often Docker restarted the container during the run; each restart reset the counts above. */
  restarts: number
  /** The working set's peak in each phase, in the order the phases first appeared. */
  phases: Record<string, number>
  fits: boolean
}

/** Each container measured against its limit. */
export function verdict(readings: readonly Reading[], kernel: Partial<Record<Container, Kernel>>): Verdict[] {
  return CONTAINERS.flatMap((container) => {
    const k = kernel[container]
    if (!k) return []
    const mine = readings.filter((r) => r.container === container)
    const events = keyed(k.events)
    const workingSetPeak = Math.max(0, ...mine.map((r) => r.sample.workingSet))
    const oomKills = events.get('oom_kill') ?? 0
    const phases: Record<string, number> = {}
    for (const r of mine) phases[r.phase] = Math.max(phases[r.phase] ?? 0, r.sample.workingSet)
    return [
      {
        container,
        limit: k.limit,
        workingSetPeak,
        anonPeak: Math.max(0, ...mine.map((r) => r.sample.anon)),
        kernelPeak: k.peak,
        hitLimit: events.get('max') ?? 0,
        oomKills,
        restarts: k.restarts,
        phases,
        fits: oomKills === 0 && k.restarts === 0 && workingSetPeak < k.limit,
      },
    ]
  })
}

// `key value` per line, which is how every flat file under a cgroup is written.
const keyed = (text: string): Map<string, number> =>
  new Map(
    text
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .map(([k = '', v = '0']) => [k, Number(v)]),
  )
