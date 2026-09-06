import { describe, expect, it } from 'vitest'
import { fitScale } from '../src/table/fit.js'

describe('fitScale', () => {
  it('scales the table down to fit the container, never up past 1:1, keeping aspect', () => {
    expect(fitScale({ w: 1200, h: 800 }, { w: 600, h: 600 })).toBe(0.5)
    expect(fitScale({ w: 1200, h: 800 }, { w: 2400, h: 400 })).toBe(0.5)
    expect(fitScale({ w: 1200, h: 800 }, { w: 3000, h: 3000 })).toBe(1)
  })

  it('leaves room for the frame around the felt', () => {
    expect(fitScale({ w: 1200, h: 800 }, { w: 1200, h: 800 }, 60)).toBe(0.85)
  })
})
