import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_WORDS } from '@byd/protocol'
import { loadPage } from '../src/App.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { NotFoundPage } from '../src/status/NotFoundPage.js'
import { pageWords, routesOf } from '../scripts/route-table.js'

// The code is the address (#675, beslut C 2026-10-06): `värd/KOD` is the seat picker for that room.
// A room's code must never be one of the app's own words, or the address would be two things, so
// the words the server leaves out of its codes are held against what the app really answers.
const WEB = join(import.meta.dirname, '..')
const APP = readFileSync(join(WEB, 'src', 'App.tsx'), 'utf8')

describe('a room’s own address (#675)', () => {
  it('opens the seat picker at `/KOD`, in either case', async () => {
    expect(await loadPage('/K7MQ2X')).toBe(JoinPage)
    expect(await loadPage('/k7mq2x')).toBe(JoinPage)
  })

  it('leaves every other path to the page it was, or to the page that does not exist', async () => {
    // Six letters that cannot be a code — an O — and six letters that are the app's own.
    expect(await loadPage('/K7MQ2O')).toBe(NotFoundPage)
    expect(await loadPage('/GUESTS')).toBe(NotFoundPage)
    expect(await loadPage('/K7MQ2X/x')).toBe(NotFoundPage)
    expect(await loadPage('/join')).toBe(JoinPage)
  })

  it('is read by the build too, so the picker’s chunk is asked for beside the entry', () => {
    expect(routesOf(APP).filter((r) => r.kind === 'code').map((r) => r.spec)).toEqual(['./join/JoinPage.js'])
  })

  it('knows every word the app answers at the top of a path, and every file it ships there', () => {
    const words = pageWords(APP)
    expect(words, 'the scan found the routes it reads').toContain('join')
    // What the build puts at the root of the origin: `public/` as it is, and the hashed `assets/`.
    // A name with a dot in it is no code, so only the names without one could ever collide.
    const shipped = [...readdirSync(join(WEB, 'public')).filter((f) => !f.includes('.')), 'assets']
    expect([...words, ...shipped].filter((w) => !ROUTE_WORDS.includes(w.toLowerCase())), 'words the app answers that are not route words').toEqual([])
  })
})
