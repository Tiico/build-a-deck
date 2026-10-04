// Stress the one renderer: renderTexture in a loop, count Chromium's refusals.
// usage: tsx stress.ts <seconds> <tag>
import { Renderer } from '../src/renderer.js'
import { compiled } from '../test/fixture.js'

const seconds = Number(process.argv[2] ?? 60)
const tag = process.argv[3] ?? 'p'
const until = Date.now() + seconds * 1000
let ok = 0
let fail = 0
const errors: Record<string, number> = {}
while (Date.now() < until) {
  // A fresh browser per batch, as the server fixture's renderAll does.
  const r = await Renderer.launch()
  try {
    for (let i = 0; i < Number(process.env.PER_BROWSER ?? 4) && Date.now() < until; i++) {
      const t0 = Date.now()
      try {
        await r.renderTexture(compiled({ title: `Drake ${tag} ${ok + fail}`, body: 'Gör 2 skada. '.repeat(i + 1) }), { dpi: 150 })
        ok++
      } catch (e) {
        fail++
        const m = (e as Error).message.split('\n')[0] ?? ''
        errors[m] = (errors[m] ?? 0) + 1
        console.log(`[${tag}] FAIL after ${Date.now() - t0}ms: ${m}`)
      }
    }
  } finally {
    await r.close()
  }
}
console.log(JSON.stringify({ tag, ok, fail, errors }))
