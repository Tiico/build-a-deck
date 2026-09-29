import { describe, expect, it } from 'vitest'
import { nextInDirection, type Spot } from '../src/table/spatial.js'

// Filtens pilar följer skärmen (K16, #572, beställarens beslut D): närmast inom ±45° av pilens
// riktning, och finns inget där, närmast framåt med sidled vid dubbel vikt. Koordinaterna är
// skärmens, med y nedåt, så en vriden filt har redan vridits när frågan ställs.
const at = (key: string, x: number, y: number): Spot => ({ key, x, y })

describe('the next thing in an arrow’s direction (K16, #572)', () => {
  const felt = [at('mitt', 0, 0), at('höger', 100, 10), at('långt-höger', 300, 0), at('under', 5, 120), at('snett', 150, 140), at('vänster', -90, -5)]

  it('goes to the nearest thing within 45° of the arrow', () => {
    expect(nextInDirection(felt, 'mitt', 'ArrowRight')).toBe('höger')
    expect(nextInDirection(felt, 'mitt', 'ArrowDown')).toBe('under')
    expect(nextInDirection(felt, 'mitt', 'ArrowLeft')).toBe('vänster')
  })

  it('never goes against the arrow, and says so when there is nothing that way', () => {
    expect(nextInDirection(felt, 'långt-höger', 'ArrowRight')).toBeNull()
    expect(nextInDirection(felt, 'vänster', 'ArrowLeft')).toBeNull()
  })

  it('falls back to the nearest thing ahead, sideways counted twice, when the cone is empty', () => {
    // Nothing above `under` within 45° except `mitt`; above and far to the side is `höger`.
    const lone = [at('a', 0, 0), at('b', 200, -60), at('c', -300, -80)]
    // From a, upward: no thing within 45° (b is 200 across for 60 up); the half-plane's nearest by
    // up + 2 × side is b (60 + 400) before c (80 + 600).
    expect(nextInDirection(lone, 'a', 'ArrowUp')).toBe('b')
  })

  it('does not stop on a thing standing exactly where it already is', () => {
    const stacked = [at('här', 0, 0), at('också-här', 0, 0), at('där', 0, 80)]
    expect(nextInDirection(stacked, 'här', 'ArrowDown')).toBe('där')
    expect(nextInDirection(stacked, 'här', 'ArrowUp')).toBeNull()
  })

  // Seen on the television (#572): the discard and the draw pile lie side by side, a couple of
  // pixels apart in height. That is level, not below: ArrowDown must not cross to the other pile.
  it('does not count a thing standing level with it as ahead', () => {
    const piles = [at('kasthög', 800, 400), at('draghög', 900, 402)]
    expect(nextInDirection(piles, 'kasthög', 'ArrowDown')).toBeNull()
    expect(nextInDirection([...piles, at('under', 780, 600)], 'kasthög', 'ArrowDown')).toBe('under')
  })

  it('answers nothing for a key it does not know', () => {
    expect(nextInDirection(felt, 'saknas', 'ArrowRight')).toBeNull()
  })
})
