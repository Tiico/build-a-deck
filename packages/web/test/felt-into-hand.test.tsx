// @vitest-environment jsdom
// Vad filten säger medan ett kort är på väg in i en hand (#444, K24).
//
// Två saker, och de svarar på var sin fråga. Kortet vänder ryggen till redan medan det bärs —
// vad som ska hända: ansiktet lämnar bordet. Platsens egna millimeter av kanten tänds och dess
// antal räknar upp — vem som får det. Prototypen visade att ingen av dem räcker ensam: ett
// nedvänt kort över en fläkt av baksidor försvinner in i den, och ett band ensamt säger inte att
// kortet blir dolt.
//
// Mätt på den riktiga renderaren och det riktiga draget: pekaren går ner på kortet och flyttar
// sig till en punkt på handens fläkt, och det som prövas är vad filten då har ritat. Läget är
// TV:ns och skalan är given, så `flatToTable` avbildar en klientpixel på en bordsmillimeter och
// jsdoms utelämnade layout inte kan flytta punkten.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { Intent, Snapshot } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { buildScene } from './scene.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })
afterEach(cleanup)

const FRAME = { w: 1200, h: 900 }
// Bordet i `buildScene`: golvet på (-500, -300), `hand:A` på (-300, 320) 600 × 100 med två kort.
// Med `scale={1}` i TV-läge är en klientpixel en bordsmillimeter med golvets hörn som origo.
const client = (p: { x: number; y: number }) => ({ clientX: p.x + 500, clientY: p.y + 300, pointerId: 1, isPrimary: true, button: 0 })
const ON_FAN = { x: -10, y: 370 }
const ON_FELT = { x: -450, y: -250 }

function felt(view: Snapshot, fold: string | null = null) {
  const sent: Intent[][] = []
  // `seatNames`: sändningsläget ritar platsbrickorna när det ombeds, och brickan är en av de tre
  // saker som tänds.
  const r = render(<TableRenderer view={view} mode="tv" scale={1} size={FRAME} seatNames foldHand={fold} onAct={(intents) => sent.push(intents)} />)
  return { ...r, sent }
}

const band = () => document.querySelector('.byd-seat-band')
const hand = () => document.querySelector('.byd-hand[data-zone="hand:A"]')
const count = () => hand()?.querySelector('.byd-hand-count')?.textContent
const seatName = () => document.querySelector('[data-seat-name="A"]')

// Tar tag i kortet och bär det till en punkt. Pekaren släpps inte: det som ska mätas är vad
// filten ritar *medan* kortet bärs.
function carry(id: string, to: { x: number; y: number }) {
  const card = document.querySelector(`[data-component="${id}"]`)!
  fireEvent.pointerDown(card, client({ x: 100, y: 50 }))
  fireEvent.pointerMove(card, client(to))
  return card
}

describe('ett kort på väg in i en hand (#444)', () => {
  it('vänder kortets rygg till och tänder platsens kant, medan kortet fortfarande bärs', () => {
    const { view, faceUp } = buildScene()
    felt(view(null))
    const card = carry(faceUp, ON_FAN)
    expect(card.getAttribute('data-face')).toBe('back')
    expect(card.hasAttribute('data-hiding')).toBe(true)
    expect(band()?.getAttribute('data-seat')).toBe('A')
    expect(hand()?.getAttribute('data-taking')).toBe('1')
    expect(count()).toBe('2 → 3')
    expect(seatName()?.hasAttribute('data-taking')).toBe(true)
  })

  it('säger ingenting alls om kortet är på väg någon annanstans', () => {
    const { view, faceUp } = buildScene()
    felt(view(null))
    const card = carry(faceUp, ON_FELT)
    expect(card.getAttribute('data-face')).toBe('front')
    expect(card.hasAttribute('data-hiding')).toBe(false)
    expect(band()).toBeNull()
    expect(count()).toBe('2')
    expect(seatName()?.hasAttribute('data-taking')).toBe(false)
  })

  it('tar tillbaka allt när kortet bärs vidare ut ur fläkten igen', () => {
    const { view, faceUp } = buildScene()
    felt(view(null))
    const card = carry(faceUp, ON_FAN)
    fireEvent.pointerMove(card, client(ON_FELT))
    expect(card.getAttribute('data-face')).toBe('front')
    expect(band()).toBeNull()
    expect(count()).toBe('2')
  })

  it('tar tillbaka allt när kortet släpps, och när pekaren avbryts', () => {
    const { view, faceUp } = buildScene()
    const { sent } = felt(view(null))
    const card = carry(faceUp, ON_FAN)
    fireEvent.pointerUp(card, client(ON_FAN))
    expect(band()).toBeNull()
    expect(document.querySelector('[data-hiding]')).toBeNull()
    // Och det som gick till loggen är det markeringen lovade.
    expect(sent.at(-1)).toEqual([expect.objectContaining({ v: 'move', to: 'hand:A' })])

    const again = carry(faceUp, ON_FAN)
    expect(band()).not.toBeNull()
    fireEvent.pointerCancel(again, client(ON_FAN))
    expect(band()).toBeNull()
    expect(document.querySelector('[data-hiding]')).toBeNull()
  })

  it('räknar upp med så många kort som bärs', () => {
    const { view, faceUp, faceDown } = buildScene()
    const v = view(null)
    felt(v)
    // Två kort i ett grepp: filten lyfter båda och handen tar emot båda.
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client({ x: 100, y: 50 }))
    fireEvent.pointerMove(card, client(ON_FAN))
    expect(count()).toBe('2 → 3')
    expect(document.querySelector(`[data-component="${faceDown}"]`)?.hasAttribute('data-hiding')).toBe(false)
  })

  // Distansvyns spaltläge fäller den egna handen till sitt antal och ritar ingen fläkt (#77),
  // medan `dropAt` fortsätter pröva fläktens utsträckning. Där tar alltså en osynlig yta emot,
  // och det är just den som behöver säga ifrån: bandet vid kanten och det uppräknade antalet är
  // det enda som finns att se.
  it('säger det också för en hand som är fälld till sitt antal, där ingen fläkt ritas', () => {
    const { view, faceUp } = buildScene()
    felt(view(null), 'A')
    expect(hand()?.querySelectorAll('.byd-hand-fan > i').length).toBe(0)
    const card = carry(faceUp, ON_FAN)
    expect(card.getAttribute('data-face')).toBe('back')
    expect(band()?.getAttribute('data-seat')).toBe('A')
    expect(count()).toBe('2 → 3')
  })
})
