import { describe, expect, it } from 'vitest'
import type { ZoneAction, ZoneBeside } from '@byd/protocol'
import type { Zone } from '@byd/server/doc'
import { besidePile, CARD_MM } from '../src/table/drop.js'
import { laidBeside, landingOf } from '../src/editor/landing.js'

// Var korten hamnar när en åtgärd lägger dem bredvid högen (L30, #316). Konturen på filten ritas
// för det åtgärden faktiskt lägger: `besidePile` anger en hög i sin mitt och ett ensamt kort i
// sitt hörn, ett halvt kort isär, så en kontur ritad för fel antal ljuger med 31 × 44 mm.
const floor = { x: 0, y: 0, w: 900, h: 600, rot: 0 }
const pile = (x: number, y: number, rot = 0, extra: Partial<Zone> = {}): Zone => ({ id: 'p', kind: 'pile', name: 'Krönikan', visibility: 'all', geometry: { x, y, w: 0, h: 0, rot }, ...extra })
const act = (id: string, steps: ZoneAction['steps']): ZoneAction => ({ id, label: id, steps })
const split = (n: number): ZoneAction['steps'][number] => ({ v: 'split', count: { of: 'number', n }, to: { at: 'beside' }, face: 'keep' })

describe('vad åtgärderna lägger bredvid högen (L30)', () => {
  it('ritar ett ensamt kort när varje åtgärd som lägger något bredvid högen lägger exakt ett', () => {
    expect(laidBeside([act('ta1', [split(1)]), act('vänd', [{ v: 'flipTop', face: 'toggle' }, split(1)])])).toBe(1)
  })
  it('ritar högens placering när åtgärderna lägger olika många, eller när antalet inte är ett tal', () => {
    expect(laidBeside([act('ta1', [split(1)]), act('ta3', [split(3)])])).toBe(2)
    expect(laidBeside([act('ta', [{ v: 'split', count: { of: 'ask' }, to: { at: 'beside' }, face: 'keep' }])])).toBe(2)
    // En sökning läggs som en hög, hur många kort den än hittar (actions.ts, #87).
    expect(laidBeside([act('sök', [{ v: 'take', which: [], to: { at: 'beside' }, face: 'keep' }])])).toBe(2)
  })
  it('ritar högens placering för en zon utan åtgärder, och för en vars åtgärder inte lägger något bredvid', () => {
    expect(laidBeside(undefined)).toBe(2)
    expect(laidBeside([])).toBe(2)
    expect(laidBeside([act('dela', [{ v: 'deal', each: { of: 'number', n: 1 }, to: { at: 'hands' }, face: 'keep' }])])).toBe(2)
  })
})

describe('konturen står där besidePile lägger korten (L30)', () => {
  it.each(['left', 'right', 'above', 'below'] as const)('för en hög i sin mitt, på sidan %s, i högens egen vridning', (side: ZoneBeside) => {
    const z = pile(450, 300, 30, { beside: side })
    const at = besidePile(z.geometry, 2, side)
    expect(landingOf(z, floor)).toEqual({ x: at.x - CARD_MM.w / 2, y: at.y - CARD_MM.h / 2, w: CARD_MM.w, h: CARD_MM.h, rot: 30, cards: 2, off: false })
  })
  it('för ett ensamt kort i sitt hörn, när åtgärderna lägger ett', () => {
    const z = pile(450, 300, 0, { actions: [act('ta1', [split(1)])] })
    const at = besidePile(z.geometry, 1, 'left')
    expect(landingOf(z, floor)).toMatchObject({ x: at.x, y: at.y, cards: 1, off: false })
    expect(at).toEqual({ x: 344, y: 256 })
  })
  it('utan sida är sidan vänster, som högen alltid har menat (#87)', () => {
    expect(landingOf(pile(450, 300), floor)).toMatchObject(landingOf(pile(450, 300, 0, { beside: 'left' }), floor))
  })
  // Krönikan på 838, 500 vid ett bord om 900 × 600 lägger korten utanför på två av fyra sidor.
  it.each([
    ['left', false],
    ['above', false],
    ['right', true],
    ['below', true],
  ] as const)('vid kanten: sidan %s hamnar utanför bordet = %s', (side, off) => {
    expect(landingOf(pile(838, 500, 0, { beside: side }), floor).off).toBe(off)
  })
  it('räknar med vridningen när den frågar om konturen ligger på bordet', () => {
    // Ett kort som står 35 mm från kanten ryms rakt (63 mm brett, mitt 31,5 mm från kanten når
    // 3,5 mm från kanten) men inte vridet ett kvarts varv (88 mm högt).
    const upright = pile(35 + 75, 300, 0, { beside: 'left' })
    expect(landingOf(upright, floor).off).toBe(false)
    const turned = pile(35 + 75, 300, 90, { beside: 'below' })
    expect(landingOf(turned, floor)).toMatchObject({ rot: 90, off: true })
  })
  it('mäter mot golvets egna hörn och inte mot origo', () => {
    const shifted = { x: -500, y: -300, w: 1000, h: 600, rot: 0 }
    expect(landingOf(pile(-390, 0, 0, { beside: 'left' }), shifted).off).toBe(false)
    expect(landingOf(pile(-470, 0, 0, { beside: 'left' }), shifted).off).toBe(true)
  })
})
