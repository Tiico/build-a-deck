// @vitest-environment jsdom
// The door to who has the game (L63, #1250) is the one piece of the editor's header whose content
// changes while the designer is looking at it: a co-editor arrives. Whatever it draws, the row it
// stands in must not move under the pointer when that happens — a tab that slides between a press
// and its release is a tab that is not chosen (#1231). So the editor is mounted with the people in
// it, and its markup is laid in Chromium against the stylesheet it ships, in the Mac's face and in
// one as wide as CI's DejaVu (Verdana), since a row that holds in the narrow face says nothing
// about the wide one (#1009).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`
// Verdana is about as wide as DejaVu, the face CI's Linux draws system-ui with.
const WIDE = ".byd-editor, .byd-editor * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"
const FACES = { mac: '', wide: WIDE } as const

const document_ = (html: string, extra: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}${extra}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

const OTHERS = ['Bo', 'Lo', 'Mi', 'Ylva', 'Gus', 'Åsa', 'Pim']

let run: Running
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

// The editor as it stands with `n` people in it, the designer one of them. The others are real
// editors on the fixture's server, so the door is drawn from the presence the actor sends.
async function withIn(width: number, n: number): Promise<string> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  const others: ProjectClient[] = []
  try {
    await screen.findByText('Skogens herrar')
    // The designer is in it too, once the actor has said so: alone is one face and not none.
    const door = await screen.findByRole('button', { name: 'Dela · vilka som har spelet' })
    await waitFor(() => expect(door.querySelectorAll('i')).toHaveLength(1))
    for (const name of OTHERS.slice(0, n - 1)) others.push(await ProjectClient.open({ http: run.http, id: run.projectId, name }))
    if (n > 1) await screen.findByRole('button', { name: `Dela: vilka som har spelet, ${n} online` })
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    for (const other of others) other.close()
    unmount()
  }
}

// Where every piece of the header stands, left and right edge, by what it is.
const row = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('.byd-editor > header')!
    const pieces: Record<string, Element | null> = {
      'hemvägen': header.querySelector(':scope > .byd-editor-home'),
      'namnet': header.querySelector(':scope > .byd-editor-name'),
      '⋯': header.querySelector(':scope > .byd-editor-more'),
      'versionen': header.querySelector(':scope > .byd-editor-rev'),
      'sparstatusen': header.querySelector(':scope > .byd-editor-saved'),
      'ångra/gör om': header.querySelector(':scope > .byd-editor-steps'),
    }
    for (const tab of header.querySelectorAll('[role=tab]')) pieces[tab.textContent!.trim()] = tab
    const at: Record<string, [number, number]> = {}
    for (const [name, el] of Object.entries(pieces)) {
      if (!el) throw new Error(`the header has no ${name}`)
      const b = el.getBoundingClientRect()
      at[name] = [b.left, b.right]
    }
    const door = header.querySelector(':scope > .byd-editor-here')!.getBoundingClientRect()
    const tap = parseFloat(getComputedStyle(document.querySelector('.byd-editor')!).getPropertyValue('--byd-tap'))
    return { at, door: { left: door.left, width: door.width }, tap }
  })

async function laid(html: string, width: number, extra: string) {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(document_(html, extra), { waitUntil: 'load' })
    return await row(page)
  } finally {
    await page.close()
  }
}

// Between 1024 and 1279 the door is one face, «en tummyta bred» (L63). The rule said it as a
// ceiling, `max-width`, and it held only because every button in the editor has a target as its
// floor (`.byd-editor button`): the prototype for #1250 drew the header without that floor and
// measured a door 24 px wide alone and 44 with company, and a row that moved 8–20 px. The width is
// now said as a width, and this holds it to the target alone and in company, in both faces.
describe('the door to who has the game at 1024 (L63, #1250)', () => {
  it('is one target wide alone and with company, and nothing before it moves when someone comes in', async () => {
    const alone = await withIn(1024, 1)
    const two = await withIn(1024, 2)
    for (const [face, extra] of Object.entries(FACES)) {
      const before = await laid(alone, 1024, extra)
      const after = await laid(two, 1024, extra)
      expect(before.tap, 'the editor names its target').toBeGreaterThan(0)
      expect({ face, alone: before.door.width, two: after.door.width }).toEqual({ face, alone: before.tap, two: before.tap })
      expect({ face, door: after.door.left, at: after.at }).toEqual({ face, door: before.door.left, at: before.at })
    }
  }, 60_000)
})

