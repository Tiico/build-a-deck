import { expect, test } from '@playwright/test'
import { readSample, verdict } from '../load/memory.js'

// The arithmetic behind the memory load test (#1012, DRIFT §1). The test itself stands the box's
// stack up and is not part of this suite; what is here is what decides its verdict, so a wrong
// reading of the kernel's files cannot turn an over-budget run into a line in DRIFT saying it fit.

test('a sample is what the kernel would fight for, not what it could drop', () => {
  // A cgroup's memory.current counts page cache it can evict before it ever kills anything. What
  // `docker stats` shows, and what is compared with the limit here, leaves the inactive part out.
  const sample = readSample('104857600\nanon 52428800\nfile 41943040\ninactive_file 31457280\nshmem 0\n')
  expect(sample).toEqual({ current: 104857600, workingSet: 73400320, anon: 52428800 })
})

test('a container the kernel killed did not fit, whatever the samples between kills said', () => {
  // The sampler reads twice a second and a spike can fall between two readings; the kernel's own
  // count of kills cannot miss one.
  const [app] = verdict(
    [{ container: 'app', phase: 'spel', sample: { current: 300e6, workingSet: 200e6, anon: 180e6 } }],
    { app: { limit: 512 * 2 ** 20, peak: 536e6, events: 'low 0\nhigh 0\nmax 41\noom 1\noom_kill 1\n', restarts: 0 } },
  )
  expect(app).toMatchObject({ container: 'app', workingSetPeak: 200e6, oomKills: 1, hitLimit: 41, fits: false })
})

test('a container that restarted did not fit either, since a restart starts the kernel counting from nothing', () => {
  // The whole container is replaced when the kill takes its main process: the new cgroup's
  // memory.events says zero, and only Docker's restart count remembers.
  const quiet = 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n'
  const [, render] = verdict(
    [{ container: 'render', phase: 'spel', sample: { current: 900e6, workingSet: 800e6, anon: 600e6 } }],
    { app: { limit: 1, peak: 0, events: quiet, restarts: 0 }, render: { limit: 1500 * 2 ** 20, peak: 900e6, events: quiet, restarts: 1 } },
  )
  expect(render).toMatchObject({ container: 'render', restarts: 1, fits: false })
})

test('each phase of the scenario has its own peak, so a reader can see which part of the playtest cost what', () => {
  const at = (phase: string, workingSet: number) => ({ container: 'postgres' as const, phase, sample: { current: workingSet, workingSet, anon: 0 } })
  const [pg] = verdict([at('vila', 50), at('spel', 300), at('vila', 70), at('spel', 200)], { postgres: { limit: 1000, peak: 400, events: '', restarts: 0 } })
  expect(pg?.phases).toEqual({ vila: 70, spel: 300 })
  expect(pg?.fits).toBe(true)
})
