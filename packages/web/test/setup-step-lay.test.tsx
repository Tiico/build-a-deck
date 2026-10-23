// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import type { ActionStep, ZoneAction } from '@byd/protocol'
import type { Zone } from '@byd/server/doc'
import { ZoneActions } from '../src/editor/ZoneActions.js'
import { Language, type Lang } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

// Ett steg som lägger kort bredvid högen säger själv vilken sida och hur de läggs (#1203,
// beställarens beslut A): två ord till i meningen, så att meningen fortfarande är specifikationen
// ordagrant (K21). Ett steg utan egen sida följer högens, som förut.
function panel(step: ActionStep, lang: Lang = 'sv') {
  const doc = projectDoc()
  const draw = doc.setup.zones.find((z) => z.id === 'draw')!
  const action: ZoneAction = { id: 'a1', label: 'Lägg ut marknaden', steps: [step] }
  const zone: Zone = { ...draw, beside: 'left', actions: [action] }
  const onPatch = vi.fn()
  const view = render(
    <Language lang={lang}>
      <ZoneActions doc={doc} zone={zone} onPatch={onPatch} onClose={() => undefined} />
    </Language>,
  )
  const li = view.container.querySelector('ol li') as HTMLElement
  const text = () => (li.querySelector('.byd-sentence') as HTMLElement).textContent
  const patched = (): ActionStep => (onPatch.mock.lastCall?.[0] as { actions: ZoneAction[] }).actions[0]!.steps[0]!
  return { li, text, patched }
}

const market: ActionStep = { v: 'split', count: { of: 'seats' }, to: { at: 'beside', side: 'right', lay: 'row' }, face: 'front' }

describe('var och hur ett steg lägger korten (#1203)', () => {
  it('läser sidan och läggsättet som en del av meningen', () => {
    expect(panel(market).text()).toBe('Ta ett per spelare från högen och lägg dem uppvända bredvid varandra till höger om högen')
    expect(panel(market, 'en').text()).toBe("Take one per player off the pile and lay them face up side by side to the pile's right")
  })

  it('säger «på varandra» när steget inte valt något, för det är vad som händer', () => {
    const { text } = panel({ v: 'split', count: { of: 'number', n: 3 }, to: { at: 'beside' }, face: 'keep' })
    expect(text()).toBe('Ta 3 från högen och lägg dem som de ligger på varandra till vänster om högen')
  })

  it('har inget läggsätt för ett ensamt kort, och inget när korten inte läggs bredvid högen', () => {
    expect(panel({ v: 'split', count: { of: 'number', n: 1 }, to: { at: 'beside' }, face: 'front' }).text()).toBe('Ta 1 från högen och lägg det uppvänt till vänster om högen')
    expect(panel({ v: 'split', count: { of: 'number', n: 2 }, to: { at: 'hands' }, face: 'front' }).text()).toBe('Ta 2 från högen och lägg dem uppvända i varje hand')
  })

  it('byter läggsätt inne i meningen och behåller sidan', () => {
    const { li, patched } = panel(market)
    fireEvent.click(within(li).getByRole('button', { name: 'bredvid varandra' }))
    fireEvent.click(within(li).getByRole('button', { name: 'omlott' }))
    expect(patched()).toEqual({ ...market, to: { at: 'beside', side: 'right', lay: 'overlap' } })
  })

  it('väljer sida bland de fyra, och behåller läggsättet', () => {
    const { li, patched } = panel(market)
    fireEvent.click(within(li).getByRole('button', { name: 'till höger om högen' }))
    fireEvent.click(within(li).getByRole('button', { name: 'ovanför högen' }))
    expect(patched()).toEqual({ ...market, to: { at: 'beside', side: 'above', lay: 'row' } })
  })

  it('leta fram har samma två ord', () => {
    const which = [{ field: 'rarity', is: ['Diamant'] }]
    expect(panel({ v: 'take', which, to: { at: 'beside', side: 'below', lay: 'overlap' }, face: 'front' }).text()).toBe('Leta fram varje kort där rarity är Diamant och lägg dem uppvända omlott under högen')
  })
})
