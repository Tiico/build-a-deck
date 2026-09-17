// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { deckIssues, fixesFor } from '../src/editor/checks.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'
import type { Element } from '@byd/template'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The wall offers the remedy, and the remedy mends the deck (#233).
//
// `remedy.test.ts` in `@byd/template` holds the arithmetic: every remedy there is applied and the
// check run again. What is held here is the other half — that the wall offers one where there is
// one, that pressing it hands over one edit per element rather than one per card, and that the
// deck really comes out clean afterwards.

// A deck whose template draws its body text at three points: an error on every row, which is the
// shape a physical fault nearly always has.
const tooSmall = (): ProjectDoc => {
  const doc = projectDoc()
  const base = doc.template.faces['front']!.base
  doc.template.faces['front']!.base = base.map((el) => (el.id === 'body' && el.kind === 'text' ? { ...el, font: { ...el.font, sizePt: 3 } } : el)) as Element[]
  return doc
}

const openChecks = (doc: ProjectDoc, which: RegExp, onFixChecks?: (fixes: readonly { face: string; element: string; patch: object }[]) => void) => {
  render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} {...(onFixChecks ? { onFixChecks } : {})} />)
  fireEvent.click(screen.getByRole('button', { name: /^Fysisk kontroll/ }))
  const remarks = [...document.querySelectorAll<HTMLElement>('.byd-wall-checks li > button')]
  const remark = remarks.find((b) => which.test(b.textContent ?? ''))
  if (!remark) throw new Error(`no remark matching ${which}; the wall says: ${remarks.map((b) => b.textContent).join(' | ')}`)
  fireEvent.click(remark)
}

describe('a check that offers its own remedy on the wall (#233)', () => {
  it('offers one, and hands over a single edit for a deck of three cards', async () => {
    const doc = tooSmall()
    expect(deckIssues(doc).filter((i) => i.code === 'text-too-small').length).toBe(doc.rows.length)
    const onFixChecks = vi.fn()
    openChecks(doc, /för liten text/, onFixChecks)

    fireEvent.click(await screen.findByRole('button', { name: 'Rätta i mallen' }))
    // One edit, not one per card: the fault is the template's, which is the whole reason the wall
    // gathers these by kind instead of badging every card.
    expect(onFixChecks).toHaveBeenCalledTimes(1)
    const [fixes] = onFixChecks.mock.calls[0] as [{ face: string; element: string }[]]
    expect(fixes).toHaveLength(1)
    expect(fixes[0]).toMatchObject({ face: 'front', element: 'body' })
  })

  it('leaves the deck with nothing left to say about that check', () => {
    const doc = tooSmall()
    const fixes = fixesFor(doc, { code: 'text-too-small' }, deckIssues(doc))
    // Applied the way the editor applies it, and then the whole deck measured again — which is the
    // only claim worth making: a remedy that leaves the fault standing is not a remedy.
    for (const fix of fixes) {
      const base = doc.template.faces[fix.face]!.base
      doc.template.faces[fix.face]!.base = base.map((el) => (el.id === fix.element ? ({ ...el, ...fix.patch } as Element) : el))
    }
    expect(deckIssues(doc).filter((i) => i.code === 'text-too-small')).toEqual([])
  })

  it('says why, rather than leaving a hole, where the answer is a choice somebody has to make', async () => {
    // A font nothing pins: the remedy is a font *file*, which is not in the template at all.
    const doc = projectDoc()
    doc.fonts = undefined
    openChecks(doc, /typsnitt/, () => undefined)
    await waitFor(() => expect(screen.getByText(/kan inte rättas åt dig/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Rätta i mallen' })).toBeNull()
  })
})
