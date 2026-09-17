// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { RULE_IMAGE_FRAME, imageBoxMm, ruleEm } from '@byd/template'
import { RuleDrawer } from '../src/rules/RuleDrawer.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Spelet slutar när [[zon:draw]] är tom.' },
    { kind: 'heading', id: 'h2', level: 2, text: 'Kasthögen' },
    { kind: 'text', id: 't2', text: '[[zon:discard]] ligger öppen. Ingen får ta ur den.' },
  ],
}

async function table(withRules = true): Promise<string> {
  await run.projects.create(run.projectId, withRules ? { ...projectDoc(), rules } : projectDoc())
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  return ((await res.json()) as { id: string }).id
}
const open = async (id: string) => {
  render(<RuleDrawer http={run.http} sessionId={id} placement="table" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
  return screen.findByRole('dialog', { name: 'Regler' })
}

// The picture in the book, where the book is read (#173, decided 2026-09-17). A5 sets the frame
// and the table and the phone draw the same picture inside it; what it says about itself is the
// alt text the Markdown carried, and a picture that carried none is decorative — `alt=""` — and is
// passed over by a screen reader.
describe('a picture at the table (#173)', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const withPicture = async (alt: string, px = { w: 4000, h: 2000 }, caption?: string): Promise<string> => {
    const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })
    const { hash } = (await put.json()) as { hash: string }
    await run.projects.create(run.projectId, {
      ...projectDoc(),
      rules: { title: 'Skogens herrar', blocks: [{ kind: 'image', id: 'i1', asset: `asset:${hash}`, alt, ...(caption === undefined ? {} : { caption }), px }] },
    })
    const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    return ((await res.json()) as { id: string }).id
  }

  it('draws the picture out of the project’s own assets, saying what it was written to say', async () => {
    const panel = await open(await withPicture('Bordet från ovan'))
    const picture = await within(panel).findByRole('img', { name: 'Bordet från ovan' })
    expect(picture.getAttribute('src')).toMatch(new RegExp(`^${run.http}/assets/[0-9a-f]{64}$`))
  })

  it('holds the same frame the printed booklet does, said in the book’s own type', () => {
    // A5 sets the size and the other two surfaces draw the same picture inside it. A stylesheet
    // cannot read the constant, so this is what keeps the three of them from drifting apart.
    for (const sheet of ['../src/rules/rules.css', '../src/editor/editor.css']) {
      const css = readFileSync(new URL(sheet, import.meta.url), 'utf8')
      expect(css).toContain(`${RULE_IMAGE_FRAME.wEm}em`)
      expect(css).toContain(`${RULE_IMAGE_FRAME.hEm}em`)
    }
  })

  // The caption is the designer's line beside the picture and is read by everyone; the alt text
  // stands for the picture for whoever cannot see it. They are two fields and never swap places
  // (decided 2026-09-17), so a decorative picture can still carry a caption.
  it('reads the caption beside the picture, without it standing in for the alt text', async () => {
    const panel = await open(await withPicture('', { w: 4000, h: 2000 }, 'Bordet vid tre spelare'))
    expect(await within(panel).findByText('Bordet vid tre spelare')).toBeTruthy()
    expect(within(panel).queryByRole('img')).toBeNull()
  })

  // A picture is never enlarged past its own pixels at 300 DPI (the approved prototype): a 700 px
  // sketch stands in its own size instead of being pulled out to the column and turning to gruel.
  // The size is the one measurement in millimetres, said in the book's own type — a screen has no
  // millimetres, so what carries across is the picture's size beside the words.
  it('stands a small picture in its own size rather than pulling it out to the column', async () => {
    const small = await open(await withPicture('Skiss', { w: 700, h: 500 }))
    const sketch = await within(small).findByRole('img', { name: 'Skiss' })
    expect(sketch.style.width).toBe(`${ruleEm(imageBoxMm({ w: 700, h: 500 }).w)}em`)
    // And the column is the ceiling it never passes, whatever the file's pixels are.
    expect(ruleEm(imageBoxMm({ w: 700, h: 500 }).w)).toBeLessThan(RULE_IMAGE_FRAME.wEm)
  })

  it('passes a decorative picture over for a screen reader, and still draws it', async () => {
    const panel = await open(await withPicture(''))
    await within(panel).findByRole('heading', { name: 'Skogens herrar' })
    // `alt=""` is a picture with no role at all: nothing is announced, and nothing is missing.
    expect(within(panel).queryByRole('img')).toBeNull()
    expect(panel.querySelectorAll('img[alt=""]')).toHaveLength(1)
  })
})

describe('the rules at the table (B7)', () => {
  it('is not offered at all when the game has no rulebook', async () => {
    const id = await table(false)
    render(<RuleDrawer http={run.http} sessionId={id} placement="table" />)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Regler' })).toBeNull())
  })

  it('opens the whole book, with every reference standing as the name the reader sees', async () => {
    const panel = await open(await table())
    expect(await within(panel).findByRole('heading', { name: 'Skogens herrar' })).toBeTruthy()
    expect(within(panel).getByRole('heading', { name: 'Kasthögen' })).toBeTruthy()
    expect([...panel.querySelectorAll('[data-ref]')].map((r) => r.textContent)).toEqual(['Draghög', 'Kasthög'])
    fireEvent.click(within(panel).getByRole('button', { name: 'Stäng reglerna' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Regler' })).toBeNull())
  })

  it('answers a question with the passages that mention it, and gives the book back when the question is cleared', async () => {
    const panel = await open(await table())
    await within(panel).findByRole('heading', { name: 'Skogens herrar' })
    const ask = within(panel).getByLabelText('Vad undrar du?')

    fireEvent.change(ask, { target: { value: 'kasthög' } })
    const hits = await within(panel).findAllByRole('listitem')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.textContent).toContain('Kasthög ligger öppen')
    // While a question stands, the book is out of the way.
    expect(within(panel).queryByRole('heading', { name: 'Så spelar ni' })).toBeNull()

    fireEvent.change(ask, { target: { value: 'tärning' } })
    expect(await within(panel).findByText(/Ingen regel nämner det/)).toBeTruthy()

    fireEvent.change(ask, { target: { value: '' } })
    expect(await within(panel).findByRole('heading', { name: 'Så spelar ni' })).toBeTruthy()
  })

  it('reads the rules the table was started with, once, however often it is opened', async () => {
    const id = await table()
    const asked: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (href.endsWith('/rules')) asked.push(href)
      return real(input, init)
    }) as typeof fetch
    try {
      const panel = await open(id)
      await within(panel).findByRole('heading', { name: 'Skogens herrar' })
      fireEvent.click(within(panel).getByRole('button', { name: 'Stäng reglerna' }))
      fireEvent.click(screen.getByRole('button', { name: 'Regler' }))
      await screen.findByRole('dialog', { name: 'Regler' })
      expect(asked).toHaveLength(1)
    } finally {
      globalThis.fetch = real
    }
  })
})
