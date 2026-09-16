// @vitest-environment jsdom
// One edge down the whole editor (UX-granskning 2026-09-16, fynd 7 — issue #132).
//
// The same thing — what a tab's panel keeps between its content and the window — was four
// different numbers depending on which tab the designer was standing in: 16 px on the card wall,
// 20 on Symboler and on Bord's setup, 24 on Bord's table list and on Regler, 12 in the template's
// columns, and `0 4px 10px` on the wall's own tool row. Half as much again between the smallest
// and the largest, seen every time a tab is switched, and no token to point at when the next panel
// is built.
//
// So the number is read out of the stylesheet through a probe rather than written here: the test
// says "the gutter the editor declares", not "16 px", and it stays true the day that changes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
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

const EDGED = ['Kortvägg', 'Mall', 'Tabell', 'Symboler', 'Regler', 'Bord']

describe('the editor at 1280px', () => {
  it('opens every tab on the same edge', async () => {
    atWidth(1280)
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    const { unmount } = render(<EditorPage />)
    const marked: Record<string, string> = {}
    try {
      await screen.findByText('Skogens herrar')
      const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Editorlägen"] [role="tab"]')]
      for (let i = 0; i < tabs().length; i++) {
        const tab = tabs()[i]!
        const name = tab.textContent?.trim() ?? String(i)
        fireEvent.click(tab)
        if (name === 'Bord') await screen.findByText(/Varje bord hör till det här spelet/)
        marked[name] = document.querySelector('.byd-editor')!.outerHTML
      }
    } finally {
      unmount()
    }

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    try {
      const edges: Record<string, string> = {}
      for (const [name, html] of Object.entries(marked)) {
        if (!EDGED.includes(name)) continue
        await page.setContent(document_(html), { waitUntil: 'load' })
        edges[name] = await page.evaluate(() => {
          const editor = document.querySelector('.byd-editor')!
          // What the editor says a gutter is, asked of the stylesheet itself rather than written
          // down here, so the fact survives the number changing.
          const probe = editor.appendChild(document.createElement('span'))
          probe.style.cssText = 'position: absolute; top: 0; left: 0; display: block; width: var(--byd-gutter)'
          const gutter = probe.offsetWidth
          probe.remove()
          // And what the open tab's own outermost box keeps against the window. Two answers are
          // right and no third one is: the gutter, or nothing at all — nothing when the panel is
          // a set of full-height columns that run to their own dividers and pad their insides
          // instead, which is what the wall, the table, the template and Bord are. What was wrong
          // before the audit was the third answer: 20 px here, 24 px there, 12 px in the template.
          const panel = [...document.querySelectorAll<HTMLElement>('.byd-editor > main > [role="tabpanel"]')].find((el) => el.checkVisibility())!
          const box = panel.firstElementChild as HTMLElement | null
          if (!box) return 'nothing at all'
          const style = getComputedStyle(box)
          const sides = [style.paddingLeft, style.paddingRight].map((v) => Math.round(parseFloat(v)))
          if (sides.every((v) => v === 0)) return 'the gutter'
          if (sides.every((v) => v === gutter)) return 'the gutter'
          return `${sides.join('/')}px, not the ${gutter}px gutter`
        })
      }
      expect(edges).toEqual(Object.fromEntries(Object.keys(edges).map((name) => [name, 'the gutter'])))
    } finally {
      await page.close()
    }
  }, 120_000)
})
