import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { codeOfAddress } from '@byd/protocol'
import { translate, type Lang, type T } from '../src/i18n/index.js'
import { documentTitle, routeOf } from '../src/status/title.js'
import { routesOf } from '../scripts/route-table.js'

// Every page the router draws names itself in the tab (#12). `/villkor/anmal` arrived in the
// router and not in the tab's table, so a reader reporting a picture was told the page did not
// exist (#1351). The routes are read off `fetchPage` as the build reads them, so a new page that
// is not given a name turns this red instead of slipping by.
const APP = readFileSync(join(import.meta.dirname, '..', 'src', 'App.tsx'), 'utf8')
const routes = routesOf(APP)

// An address each route answers: the path itself, something under a prefix, a room's code.
const CODE = '/K7MQ2X'
const addressOf = (r: (typeof routes)[number]): string => (r.kind === 'code' ? CODE : r.kind === 'prefix' ? `${r.path}abc_DEF-123` : r.path)

const LANGS: Lang[] = ['sv', 'en']
const tOf =
  (lang: Lang): T =>
  (key, params) =>
    translate(lang, key, params)

describe('every route the router draws names itself in the tab (#1351)', () => {
  it('reads the router, not a list kept beside it', () => {
    expect(codeOfAddress(CODE)).toBeTruthy()
    expect(routes.map(addressOf)).toEqual(expect.arrayContaining(['/', '/villkor', '/villkor/anmal', '/editor', '/invites/abc_DEF-123', CODE]))
  })

  it.each(routes.map(addressOf))('%s is a route the tab knows', (path) => {
    expect(routeOf(path)).not.toBe('unknown')
  })

  it.each(routes.flatMap((r) => LANGS.map((lang) => [addressOf(r), lang] as const)))('%s is not «the page does not exist» in %s', (path, lang) => {
    const t = tOf(lang)
    expect(documentTitle(routeOf(path), {}, t)).not.toBe(documentTitle('unknown', {}, t))
  })
})

describe('the report page’s tab (#1351)', () => {
  it.each([
    ['sv', 'Anmäl en bild · Deckster'],
    ['en', 'Report a picture · Deckster'],
  ] as const)('says what the page is for in %s', (lang, title) => {
    expect(documentTitle(routeOf('/villkor/anmal'), {}, tOf(lang))).toBe(title)
  })
})
