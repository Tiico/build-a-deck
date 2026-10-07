// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Language } from '../src/i18n/index.js'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The letter on a measure's grip is a tool word and follows the reader (#933): «B» is Bredd's
// initial and stood beside «Width (mm)» in English too.
function panel(lang: 'sv' | 'en') {
  render(
    <Language lang={lang}>
      <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="frame" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />
    </Language>,
  )
  const grip = (name: string) => screen.getByRole('slider', { name: new RegExp(`^${name} \\(mm\\),`) }).textContent
  const letters = lang === 'en' ? [grip('X'), grip('Y'), grip('Width'), grip('Height')] : [grip('X'), grip('Y'), grip('Bredd'), grip('Höjd')]
  cleanup()
  return letters
}

describe('the measure grips in the reader\'s language (#933)', () => {
  it('marks width W and height H in English', () => {
    expect(panel('en')).toEqual(['X', 'Y', 'W', 'H'])
  })

  it('marks width B and height H in Swedish', () => {
    expect(panel('sv')).toEqual(['X', 'Y', 'B', 'H'])
  })
})
