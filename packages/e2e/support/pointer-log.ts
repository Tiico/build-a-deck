import { writeFile } from 'node:fs/promises'
import type { Page, TestInfo } from '@playwright/test'

/**
 * What the pointer did, as the page heard it, kept for a test that fails (#1325).
 *
 * A lift on `/online` once stayed up after the mouse had left the hand, in CI and never on a Mac:
 * CSS's `:hover` had let go, React's state had not. Whether React was told is a question of which
 * boundary events reached the document, on which node, with which `relatedTarget`, and whether that
 * node was still in the document when they did. A trace's screencast cannot say that; this can.
 *
 * Every pointer boundary event and move is written down at the window, in the capture phase, with
 * its target and related target and whether each is still connected; so is every time a lift
 * (`[data-lift]`) appears or goes, and every time a card's face is swapped under the pointer, in the
 * hand (`data-hand-card`) and on the felt (`data-component`, #1450). Each line also goes to the
 * page's console, which is in the trace. When the test fails the whole log is written beside the
 * trace as `pointer-events.txt` and attached to the result; `keepIfFailed` is for an `afterEach`,
 * which runs while the test's page is still open.
 */
export async function pointerLog(page: Page): Promise<{ keepIfFailed: (info: TestInfo) => Promise<void> }> {
  // Installed into the page as it stands: the journeys that use it have opened theirs already, and
  // nothing before the first hover is worth a line.
  await page.evaluate(() => {
    const began = performance.now()
    const log: string[] = []
    ;(window as unknown as { __bydPointerLog: string[] }).__bydPointerLog = log
    const name = (node: EventTarget | null): string => {
      if (!(node instanceof Element)) return node === null ? 'null' : String(node)
      const held = node.closest('[data-hand-card], [data-component]')
      const card = held?.getAttribute('data-hand-card') ?? held?.getAttribute('data-component')
      const own = `${node.localName}${node.id ? `#${node.id}` : ''}${node.classList.length > 0 ? `.${[...node.classList].join('.')}` : ''}`
      return `${own}${card ? `@${card}` : ''}${node.isConnected ? '' : ' (detached)'}`
    }
    const say = (line: string) => {
      const at = `${(performance.now() - began).toFixed(1)}ms ${line}`
      log.push(at)
      console.log(`[pointer] ${at}`)
    }
    let lastMove = 0
    for (const type of ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'click', 'pointermove'])
      window.addEventListener(
        type,
        (e) => {
          const p = e as PointerEvent
          // A move is said once per 50 ms: enough to see where the pointer was, not a line per pixel.
          if (type === 'pointermove') {
            if (p.timeStamp - lastMove < 50) return
            lastMove = p.timeStamp
          }
          say(`${type} ${p.pointerType ?? ''} (${Math.round(p.clientX)}, ${Math.round(p.clientY)}) on ${name(p.target)} from ${name(p.relatedTarget)}`)
        },
        { capture: true },
      )
    let lifted: string | null = null
    new MutationObserver((records) => {
      const now = document.querySelector('[data-lift]')?.getAttribute('data-lift') ?? null
      if (now !== lifted) say(`lift ${lifted ?? 'none'} → ${now ?? 'none'}`)
      lifted = now
      for (const record of records) {
        if (record.type !== 'childList' || !(record.target instanceof Element) || !record.target.closest('[data-hand-card], [data-component]')) continue
        if (record.removedNodes.length === 0 && record.addedNodes.length === 0) continue
        say(`card face swapped in ${name(record.target)}: -${[...record.removedNodes].map((n) => (n instanceof Element ? n.localName : '#text')).join(',')} +${[...record.addedNodes].map((n) => (n instanceof Element ? n.localName : '#text')).join(',')}`)
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lift', 'data-turned'] })
  })
  return {
    keepIfFailed: async (info) => {
      if (info.status === info.expectedStatus) return
      const log = await page.evaluate(() => (window as unknown as { __bydPointerLog?: string[] }).__bydPointerLog ?? []).catch((err: Error) => [`the log could not be read: ${err.message}`])
      const path = info.outputPath('pointer-events.txt')
      await writeFile(path, `${log.join('\n')}\n`)
      await info.attach('pointer-events', { path, contentType: 'text/plain' })
    },
  }
}
