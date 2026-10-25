import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

// The worker runs under tsx on the box (Dockerfile.render), and tsx's esbuild keeps function names
// by wrapping them in a `__name` helper (`keepNames` with `minifyWhitespace`). Vite does not, so a
// function handed to the page that names an inner function passes every test here and throws in
// the page on the box. That is how every svg screening failed (#1273): `renderPicture` named its
// helpers inside the page. This runs the renderer the way the box does.
const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url))
const script = fileURLToPath(new URL('./under-tsx.ts', import.meta.url))

describe('renderaren under tsx, som på lådan', () => {
  it('ritar en bild för screening, svg som raster, och passar in ett kort', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [tsx, script], { timeout: 90_000 })
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({ drawn: [{ width: 384, height: 512 }, { width: 2, height: 2 }], fitted: true })
  }, 120_000)
})
