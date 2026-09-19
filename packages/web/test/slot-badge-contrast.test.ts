import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/player/contrast.js'

// Efterledet i platsrutan (#255) är verktygets ord inuti designerns rad, och det syns på att det är
// dämpat. Dämpat betyder mörkare än raden omkring, och mörkare har en botten: under 4,5:1 är ordet
// inte längre läsbart och dämpningen har ätit upp det den skulle säga.
//
// Regeln finns för att formen kopierades ordagrant ur zonlistan, där den är felfri, in i en ruta
// vars hover-botten är en helt annan färg (#281). En ordagrann kopia bär inte med sig bottnen den
// mättes mot, och rutan öppnas med musen — pekaren *ligger* i listan medan man väljer, så den
// hovrade raden är det normala läget här och inte ett undantag.
const css = readFileSync(join(import.meta.dirname, '..', 'src/editor/editor.css'), 'utf8')

// Färgen en regel sätter, läst ur arket självt. Regeln söks ordagrant, så att en omskrivning som
// flyttar färgen någon annanstans fäller provet i stället för att tyst sluta mäta något.
function declared(selector: string, property: string): string {
  const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  if (!rule) throw new Error(`editor.css har ingen regel för ${selector}`)
  const found = rule[1]!.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))
  if (!found) throw new Error(`${selector} sätter ingen ${property}`)
  return found[1]!.trim()
}

// Rutans egen botten, som raden är genomskinlig mot.
const RESTING = declared('.byd-slot-pop', 'background')
const HOVER = declared('.byd-slot-pop button:hover, .byd-slot-chips button:hover', 'background')
const ROW = declared('.byd-slot-pop button', 'color')

// Brickan i vila, och brickan när raden bär pekaren. Två färger, eftersom bottnen är två.
const BADGE: Record<string, { ink: string; ground: string }> = {
  'i vila': { ink: declared('.byd-slot-pop em', 'color'), ground: RESTING },
  'under pekaren': { ink: declared('.byd-slot-pop button:hover em', 'color'), ground: HOVER },
}

describe('efterledet i platsrutan (#255, #281)', () => {
  it.each(Object.entries(BADGE))('är läsbart %s', (_var, { ink, ground }) => {
    expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(4.5)
  })

  // Och det får inte lösas genom att brickan blir radens egen text. Då bär bara ramen skillnaden
  // mellan verktygets ord och designerns — och ramen mäter 1,5:1, alltså ingenting.
  it.each(Object.entries(BADGE))('är fortfarande dämpat mot radens egen text %s', (_var, { ink, ground }) => {
    expect(contrastRatio(ink, ground)).toBeLessThan(contrastRatio(ROW, ground))
  })
})
