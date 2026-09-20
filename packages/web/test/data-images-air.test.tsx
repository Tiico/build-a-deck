// @vitest-environment jsdom
// The air around the deck's picture strip in the Tabell panel (#311).
//
// The strip stood flush against the crown's line: `margin-bottom` and nothing above, so the row
// began in the very pixel the divider ended in. The crown lays a rung of air over its own line;
// a section that lays none under it reads as part of the crown rather than as the first thing in
// the panel.
//
// The issue asked for two things that do not both fit — "the same step as below (12 px)" and
// "`var(--byd-s2)`" — and the panel settles it: the two other blocks that stand in this same
// stack, the comparison line and the bulk row, are both on 8 px, and the crown's own padding over
// the line is `--byd-s2` too. So the strip takes that rung on both sides, the divider sits in even
// air, and the odd 12 goes.
//
// Measured and not read off the stylesheet. jsdom lays nothing out, so the distance is taken in a
// real engine against the sheet the editor ships, the way `editor-spacing` takes the panel edge —
// and it is held against a rung resolved on the page rather than against a number written here,
// so retuning the ladder retunes this. It is a distance between two boxes and never a height, so
// no font on any machine can move it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { chromium, type Browser } from 'playwright'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The viewport the issue's own screenshot was taken at.
const WIDTH = 1440
const HEIGHT = 900

// A deck whose template draws a picture, so the strip is in the panel at all. `used` is whether
// any card is drawn from a picture yet: with none the strip says «inga bilder» instead of listing
// them, and the issue asks for that row to stand in the same air.
function deckWithArt(used: boolean): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  if (used) doc.rows[0]!.fields['art'] = `asset:${'1'.repeat(64)}`
  return doc
}

// The editor with the Tabell tab open, as markup.
async function tablePanel(doc: ProjectDoc): Promise<string> {
  atWidth(WIDTH)
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const user = userEvent.setup()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: 'Tabell' }))
    await waitFor(() => expect(document.querySelector('.byd-data-images')).not.toBeNull())
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

type Air = { rung: number; above: number; below: number; over: string; under: string }

// What stands over the strip, what stands under it, and how much air there is on each side.
async function air(html: string): Promise<Air> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await page.evaluate(() => {
      // The rung read back off the page, so this file never writes a length of its own.
      const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
      probe.style.cssText = 'position: absolute; top: 0; left: 0; display: block; margin-top: var(--byd-s2)'
      const rung = parseFloat(getComputedStyle(probe).marginTop)
      probe.remove()
      const strip = document.querySelector('.byd-data-images')!
      // Named as well as measured: the neighbours are what the distance is a distance *to*, so a
      // panel that had been restacked would say so here rather than quietly report the air
      // between two other things.
      const over = strip.previousElementSibling!
      const under = strip.nextElementSibling!
      const box = strip.getBoundingClientRect()
      return {
        rung,
        // The crown's rectangle ends at its own bottom border, which is the line the issue is
        // about, so this is the air between the line and the row and nothing else.
        above: Math.round(box.top - over.getBoundingClientRect().bottom),
        below: Math.round(under.getBoundingClientRect().top - box.bottom),
        over: over.className,
        under: under.className,
      }
    })
  } finally {
    await page.close()
  }
}

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
}, 60_000)
afterEach(async () => {
  await run.stop()
}, 60_000)

describe(`«Media i spelet» in the Tabell panel, at ${WIDTH}×${HEIGHT}`, () => {
  it('stands a rung of the ladder clear of the line above it, and the same rung clear of the table below', async () => {
    const measured = await air(await tablePanel(deckWithArt(true)))
    expect(measured.over).toBe('byd-crown')
    expect(measured.under).toBe('byd-data-scroll')
    expect(measured.rung).toBeGreaterThan(0)
    expect({ above: measured.above, below: measured.below }).toEqual({ above: measured.rung, below: measured.rung })
  }, 60_000)

  it('gives the same air to the strip that has nothing to show yet', async () => {
    const measured = await air(await tablePanel(deckWithArt(false)))
    expect(measured.over).toBe('byd-crown')
    expect({ above: measured.above, below: measured.below }).toEqual({ above: measured.rung, below: measured.rung })
  }, 60_000)
})
