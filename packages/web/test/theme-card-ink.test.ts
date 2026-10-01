// @vitest-environment jsdom
// A card drawn inside Speltema keeps its own ink (#632). The tab greys its own paragraphs, and the
// rule reached into the cards it draws: a card's prose is set in `<p>`, so the body text of every
// card on the tab — the theme previews and the deck under Spelets ikoner alike — came out in the
// panel's grey instead of the colour the template gave it. Seen at 1440 on the theme previews.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const sheet = readFileSync(join(import.meta.dirname, '..', 'src', 'editor', 'editor.css'), 'utf8')

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('a card on the Speltema tab', () => {
  it('sets its prose in the colour its template gives it, and the tab’s own text stays grey', () => {
    const style = document.createElement('style')
    style.textContent = sheet
    document.head.append(style)
    document.body.innerHTML = `<div class="byd-theme"><p id="own">the tab's own words</p><div class="byd-preview"><div data-element="body" style="color: rgb(43, 33, 24)"><p id="card">Välj två andra spelare.</p></div></div></div>`
    expect(getComputedStyle(document.getElementById('own') as HTMLElement).color).toBe('rgb(154, 163, 184)')
    expect(getComputedStyle(document.getElementById('card') as HTMLElement).color).toBe('rgb(43, 33, 24)')
  })
})
