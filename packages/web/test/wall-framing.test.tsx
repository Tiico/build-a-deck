// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { JSDOM_TEST_BUDGET } from './budget.js'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import { DeckWall } from '../src/editor/DeckWall.js'
import { projectDoc } from './project-doc.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The deck's measure on the wall (E1, variant C): the measure itself, the deck as it becomes, and
// the list of files that cannot answer. The wall is where the whole deck is visible at once, so it
// is the only place uniformity can actually be judged — and the checks report (E5) already lives
// here, which is the same kind of news.
// A real content hash: `isAssetRef` is what decides whether a cell holds a picture at all.
const HASH = 'a'.repeat(64)
const ART = `http://test.local/assets/${HASH}`
const roomy: Motif = { w: 200, h: 100, trim: { left: 60, top: 10, right: 60, bottom: 10 } }
const cropped: Motif = { w: 160, h: 120, trim: { left: 0, top: 0, right: 0, bottom: 0 } }

const deck = (frame?: { fill: number; anchor: 'centre' | 'foot' }): ProjectDoc => {
  const base = projectDoc()
  return {
    ...base,
    template: {
      faces: {
        ...base.template.faces,
        front: {
          base: [...base.template.faces['front']!.base, { kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' }, ...(frame ? { frame } : {}) }],
          variants: {},
        },
      },
    },
    rows: base.rows.map((r) => ({ ...r, fields: { ...r.fields, art: `asset:${HASH}` } })),
  }
}

const mount = (doc: ProjectDoc, motifs: Record<string, Motif> = { [ART]: roomy }) => {
  const onMeasure = vi.fn()
  const onFraming = vi.fn()
  render(
    <DeckWall
      doc={doc}
      face="front"
      selectedRow={null}
      onSelectRow={() => undefined}
      onSelectElement={() => undefined}
      assetBase="http://test.local"
      motifs={motifs}
      onMeasure={onMeasure}
      onFraming={onFraming}
    />,
  )
  return { onMeasure, onFraming }
}

describe('the deck’s measure on the wall', () => {
  it('offers a measure for each picture area the template draws', () => {
    const { onMeasure } = mount(deck({ fill: 0.8, anchor: 'centre' }))
    const panel = screen.getByRole('group', { name: 'Bildernas mått' })

    fireEvent.change(within(panel).getByLabelText(/Motivets höjd/), { target: { value: '0.6' } })
    expect(onMeasure).toHaveBeenCalledWith('front', 'art', { fill: 0.6, anchor: 'centre' })

    fireEvent.click(within(panel).getByRole('button', { name: 'På en gemensam marklinje' }))
    expect(onMeasure).toHaveBeenCalledWith('front', 'art', { fill: 0.8, anchor: 'foot' })
  })

  it('says nothing about a measure the template has not asked for, but offers to give one', () => {
    const { onMeasure } = mount(deck())
    const panel = screen.getByRole('group', { name: 'Bildernas mått' })

    fireEvent.click(within(panel).getByRole('button', { name: 'Jämna ut bilderna' }))
    expect(onMeasure).toHaveBeenCalledWith('front', 'art', { fill: 0.8, anchor: 'centre' })
  })

  it('lists the files that cannot answer, and puts one right in a single press', () => {
    const { onFraming } = mount(deck({ fill: 0.8, anchor: 'centre' }), { [ART]: cropped })
    const list = screen.getByRole('list', { name: 'Bilder som inte kan svara' })

    // Every card in the deck uses the one cropped file, so every card objects.
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(within(list).getAllByRole('button', { name: /Rita motivet/ })[0]!)
    expect(onFraming).toHaveBeenCalledWith('dragon', 'art', { zoom: 1.25 })
  })

  it('says the deck is uniform when every file can answer', () => {
    mount(deck({ fill: 0.8, anchor: 'centre' }))

    expect(screen.queryByRole('list', { name: 'Bilder som inte kan svara' })).toBeNull()
    expect(screen.getByText(/3 av 3/)).toBeTruthy()
  })
})

// "Källan öppnas som en låda under leken" (E1): the rule stays on screen while one file is looked
// at, because the fix is nearly always to the rule and not to the single picture.
describe('the source, opened', () => {
  it('opens under the deck and shows the file whole with the window lit on it', () => {
    mount(deck({ fill: 0.8, anchor: 'centre' }))

    fireEvent.click(within(screen.getByRole('group', { name: 'Bildernas mått' })).getAllByRole('button', { name: /Öppna källan/ })[0]!)
    const drawer = screen.getByRole('group', { name: /Källan/ })

    // The rule it is being judged against has not gone anywhere.
    expect(screen.getByRole('group', { name: 'Bildernas mått' })).toBeTruthy()
    expect(within(drawer).getByRole('img').getAttribute('src')).toBe(ART)
    expect(within(drawer).getByTestId('byd-window')).toBeTruthy()
  })

  it('writes this card’s own departure, and gives the way back to the measure', () => {
    const { onFraming } = mount(deck({ fill: 0.8, anchor: 'centre' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Bildernas mått' })).getAllByRole('button', { name: /Öppna källan/ })[0]!)
    const drawer = screen.getByRole('group', { name: /Källan/ })

    fireEvent.change(within(drawer).getByLabelText('Storlek'), { target: { value: '1.4' } })
    expect(onFraming).toHaveBeenCalledWith('dragon', 'art', { zoom: 1.4, dx: 0, dy: 0 })

    fireEvent.change(within(drawer).getByLabelText('I sidled'), { target: { value: '0.1' } })
    expect(onFraming).toHaveBeenCalledWith('dragon', 'art', { zoom: 1, dx: 0.1, dy: 0 })

    fireEvent.click(within(drawer).getByRole('button', { name: 'Tillbaka till måttet' }))
    expect(onFraming).toHaveBeenCalledWith('dragon', 'art', null)
  })
})
