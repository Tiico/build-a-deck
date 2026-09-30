import { describe, expect, it } from 'vitest'
import { Harness, registry } from './fixture.js'
import { project, type CardTexts } from '../src/index.js'

// What a card prints beside its title (#551, K27) is hidden information, like the title (#412): it
// follows exactly the same `canSeeFace` as `cardRef`, the title and the front's hash (B6).
const texts: CardTexts = { dragon: ['Monster', 'Spottar eld.'], knight: ['Hjälte', 'Rider fort.'] }
const titles = { dragon: 'Draken', knight: 'Riddaren' }

describe('the printed text in the projection (#551)', () => {
  it('reaches the view that may see the face, and no other', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const onTable = h.top('table')

    const a = project(h.state, registry, 'A', { titles, texts })
    expect(a.components.find((c) => c.zone === 'hand:A')).toMatchObject({ title: 'Draken', text: ['Monster', 'Spottar eld.'] })
    expect(a.components.find((c) => c.id === onTable)).not.toHaveProperty('text')

    for (const view of [project(h.state, registry, 'B', { titles, texts }), project(h.state, registry, null, { titles, texts })]) {
      expect(JSON.stringify(view)).not.toMatch(/Spottar|Rider|Monster|Hjälte/)
    }

    h.do(null, { v: 'flip', component: onTable, face: 'front' })
    expect(project(h.state, registry, 'B', { titles, texts }).components.find((c) => c.id === onTable)).toMatchObject({ text: ['Hjälte', 'Rider fort.'] })
  })

  it('reaches the observer for every card, the face-down ones included (C8)', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const eva = project(h.state, registry, null, { texts }, undefined, true)
    expect(eva.components.find((c) => c.zone === 'hand:A')).toMatchObject({ face: 'back', text: ['Monster', 'Spottar eld.'] })
  })

  it('says an empty list for a card that prints nothing beside its title, and nothing for a deck that was never read', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(project(h.state, registry, 'A', { texts: { dragon: [] } }).components[0]).toMatchObject({ text: [] })
    expect(project(h.state, registry, 'A', {}).components[0]).not.toHaveProperty('text')
  })
})
