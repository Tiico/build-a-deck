// @vitest-environment jsdom
// A state that is the whole page, as a reader meets it (#555 A-13). D5 moves the focus to its
// heading and says an answer that did not come assertively; both at once read the heading twice,
// once for the focus and once in the live region. The live region now says what the heading does
// not, and the heading, which the focus lands on without anyone pressing a key, draws no ring.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { StatusLive } from '../src/status/StatusLive.js'
import { StatusNotice } from '../src/status/StatusNotice.js'
import { noticeFor } from '../src/status/notice.js'
import { ClaimPage } from '../src/account/ClaimPage.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = read('src/status/status.css')
const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser?.close()
}, 60_000)

describe('a state that is the whole page (#555)', () => {
  it('says the heading once: the focus reads it, and the live region says the rest', async () => {
    const notice = noticeFor('missing', 'phone')
    render(
      <StatusLive>
        <StatusNotice notice={notice} surface="page" />
      </StatusLive>,
    )
    const heading = screen.getByRole('heading', { level: 1 })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    const assertive = document.querySelector('[data-status-live="assertive"]')!
    await waitFor(() => expect(assertive.textContent).toBe(notice.text))
    expect(assertive.textContent).not.toContain(notice.heading)
  }, 60_000)

  it('still says the whole of a state that lies over a view and takes no focus', async () => {
    const notice = noticeFor('dropped', 'phone')
    render(
      <StatusLive>
        <StatusNotice notice={notice} surface="sheet" />
      </StatusLive>,
    )
    await waitFor(() => expect(document.querySelector('[data-status-live="assertive"]')!.textContent).toBe(`${notice.heading}. ${notice.text}`))
  }, 60_000)

  it('draws no ring round the heading the focus was moved to', async () => {
    const { container, unmount } = render(<StatusNotice notice={noticeFor('missing', 'phone')} surface="page" />)
    const html = container.innerHTML
    unmount()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await page.setContent(document_(html), { waitUntil: 'load' })
      const ring = await page.evaluate(() => {
        const h1 = document.querySelector('h1')!
        h1.focus()
        return { focused: document.activeElement === h1, visible: h1.matches(':focus-visible'), outline: getComputedStyle(h1).outlineStyle }
      })
      // Chromium counts a focus moved at load as one to show; that is the ring the audit saw.
      expect(ring).toEqual({ focused: true, visible: true, outline: 'none' })
    } finally {
      await page.close()
    }
  }, 60_000)
})

// A link that leads nowhere is not something missing (#555 A-13 c): the word over the heading says
// the link no longer holds.
describe('the word over a link that no longer holds (#555)', () => {
  it('says "Gäller inte", not "Finns inte"', () => {
    history.replaceState(null, '', '/claim')
    render(<ClaimPage />)
    const mark = document.querySelector('.byd-status-mark')!
    expect(mark.textContent).toBe('Gäller inte')
  }, 60_000)
})
