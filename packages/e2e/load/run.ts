import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { free } from '../support/ports.js'
import { Designer } from './designer.js'
import { CONTAINERS, verdict, type Kernel, type Container, type Verdict } from './memory.js'
import { Compose } from './stack.js'
import { playTable, type Played } from './table.js'

/**
 * The memory load test (#1012, DRIFT §1): the box's stack under the box's limits, played the way a
 * beta playtest plays it, and every container's peak held up against its limit.
 *
 *   pnpm --filter @byd/e2e load:memory [--tables 1,3] [--cards 308] [--versions 15]
 *                                      [--intents 200] [--picture-kb 250] [--keep] [--no-build]
 *
 * Each scenario starts the stack from nothing (`down -v`, `up`), as a deploy does, so the kernel's
 * peak is that scenario's and no other's. Per table there is a designer with a game of `cards`
 * cards on as many pictures and two uploaded typefaces, saved `versions` times; eight phones, the
 * television and an observer playing `intents` envelopes on real sockets, with shuffles and
 * rewinds; and, while they play, the designer saving a version that redraws every card and sending
 * it to the table. The tables of a scenario do all of it at the same time.
 *
 * It is not part of `pnpm test`: it takes the machine for a quarter of an hour and needs Docker.
 * What it prints is what goes into DRIFT §1; the raw readings are kept in `packages/e2e/.load/`.
 */
const run = promisify(execFile)
const { values: args } = parseArgs({
  options: {
    tables: { type: 'string', default: '1,3' },
    cards: { type: 'string', default: '308' },
    versions: { type: 'string', default: '15' },
    intents: { type: 'string', default: '200' },
    'picture-kb': { type: 'string', default: '250' },
    'pause-ms': { type: 'string', default: '150' },
    project: { type: 'string', default: `byd-load-${process.pid}` },
    keep: { type: 'boolean', default: false },
    'no-build': { type: 'boolean', default: false },
  },
})
const scenarios = (args.tables ?? '1,3').split(',').map(Number)
const cards = Number(args.cards)
const versions = Number(args.versions)
const intents = Number(args.intents)
const pictureBytes = Number(args['picture-kb']) * 1000
const pauseMs = Number(args['pause-ms'])
const OUT = join(import.meta.dirname, '..', '.load')
const RENDER_BUDGET_MS = 30 * 60_000
const MiB = 2 ** 20

const say = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`)
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

const project = args.project ?? 'byd-load'
const stack = new Compose(project, await free(58000), project)
mkdirSync(OUT, { recursive: true })
if (!args['no-build']) {
  say(`building the images as ${stack.tag}`)
  await stack.build()
}

const results: { tables: number; verdicts: Verdict[]; played: Played[]; renders: { start: number; refresh: number }[] }[] = []
try {
  for (const tables of scenarios) results.push(await scenario(tables))
} finally {
  if (!args.keep) await stack.down()
}

const { stdout: host } = await run('docker', ['info', '--format', '{{.NCPU}} CPU, {{.MemTotal}} B, kernel {{.KernelVersion}}'])
const report = { at: new Date().toISOString(), host: host.trim(), cards, versions, intents, pictureBytes, results }
const file = join(OUT, `memory-${report.at.replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify(report, null, 2))
for (const r of results) {
  console.log(`\n${r.tables} ${r.tables === 1 ? 'bord' : 'bord samtidigt'}: ${r.played.map((p) => `${p.acked} intents (${p.shuffles} blandningar, ${p.rewinds} tillbakaspolningar), ${p.faces} texturhämtningar`).join('; ')}`)
  console.log(`  rendering: ${r.renders.map((x) => `start ${x.start} s, ny version ${x.refresh} s`).join('; ')}`)
  for (const v of r.verdicts) {
    const phases = Object.entries(v.phases).map(([p, b]) => `${p} ${mib(b)}`).join(', ')
    console.log(`  ${v.container.padEnd(8)} topp ${mib(v.workingSetPeak).padStart(5)} MiB av ${mib(v.limit)} (anon ${mib(v.anonPeak)}, kärnans topp ${mib(v.kernelPeak)}, i taket ${v.hitLimit} ggr, OOM ${v.oomKills}, omstarter ${v.restarts}) ${v.fits ? 'ryms' : 'RYMS INTE'} — ${phases}`)
  }
}
console.log(`\n${file}`)
if (results.some((r) => r.verdicts.some((v) => !v.fits) || r.played.some((p) => p.refused.length > 0))) process.exitCode = 1

async function scenario(tables: number): Promise<(typeof results)[number]> {
  say(`${tables} table(s): a fresh stack on ${stack.origin}`)
  await stack.fresh()
  let phase = 'vila'
  const sampler = await stack.sample(() => phase)
  try {
    await pause(20_000)

    phase = 'förberedelse'
    const fonts = await typefaces()
    const mailbox = () => stack.logs('app')
    const designers = await Promise.all(Array.from({ length: tables }, (_, i) => Designer.logIn(stack.origin, `designer-${i + 1}-${Date.now()}@load.test`, mailbox)))
    const games = await Promise.all(
      designers.map(async (d, i) => {
        say(`designer ${i + 1}: ${cards} pictures of ${pictureBytes / 1000} kB, ${versions} versions`)
        const assets = await d.uploadAssets({ cards, pictureBytes, seed: i + 1, fonts })
        const name = `Lastspelet ${i + 1}`
        return { name, assets, project: await d.saveGame(name, assets, versions) }
      }),
    )

    phase = 'bordsstart'
    const addresses = await Promise.all(designers.map((d, i) => d.startTable(games[i]?.project.id ?? '')))
    const started = await Promise.all(designers.map((d, i) => d.texturesDone(addresses[i]?.session ?? '', RENDER_BUDGET_MS)))
    say(`tables drawn: ${started.map((s) => `${s.total} textures in ${s.seconds} s`).join(', ')}`)

    phase = 'spel'
    const outcome = await Promise.all(
      designers.map(async (d, i) => {
        const game = games[i]
        const table = addresses[i]
        if (!game || !table) throw new Error('a designer without a table')
        const playing = playTable(stack.origin, table, { intents, pauseMs })
        await d.saveVersion(game.project, game.name, game.assets, versions + 1)
        const refreshed = await d.refreshTable(table.session, RENDER_BUDGET_MS)
        say(`table ${i + 1}: new version drawn, ${refreshed.total} textures in ${refreshed.seconds} s`)
        return { played: await playing, refresh: refreshed.seconds, start: started[i]?.seconds ?? 0 }
      }),
    )

    phase = 'efteråt'
    await pause(20_000)
    await sampler.stop()
    const kernel: Partial<Record<Container, Kernel>> = {}
    for (const c of CONTAINERS) kernel[c] = await stack.kernel(c)
    return { tables, verdicts: verdict(sampler.readings, kernel), played: outcome.map((o) => o.played), renders: outcome.map((o) => ({ start: o.start, refresh: o.refresh })) }
  } catch (cause) {
    await sampler.stop()
    throw cause
  }
}

// Two real typefaces, taken from the render image, which every run of this has built anyway.
async function typefaces(): Promise<{ title: Uint8Array; body: Uint8Array }> {
  const id = await stack.id('render')
  const cat = async (file: string) => new Uint8Array((await run('docker', ['exec', id, 'cat', file], { encoding: 'buffer', maxBuffer: 16 * MiB })).stdout)
  return { title: await cat('/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'), body: await cat('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf') }
}

function mib(bytes: number): string {
  return String(Math.round(bytes / MiB))
}
