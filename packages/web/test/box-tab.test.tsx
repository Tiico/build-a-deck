// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TUCKBOX, boxFaceSize, tuckNet, type BoxFace } from '@byd/engine'
import { boxOf } from '@byd/server/doc'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { MODES, modesFor } from '../src/editor/EditorTabs.js'
import { STAGES, stagesFor } from '../src/editor/EditorStages.js'
import { PX_PER_MM } from '../src/editor/canvas.js'
import { Language } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { layerPick, layerIds } from './layers.js'

// Fliken «Låda» (#1413, L91, #1406 runda 2): nätet där lådans ytor redigeras, med ett lås per mått och
// luften. Prövad genom den riktiga editorn mot en riktig server, som designern möter den.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// 108 kort på 63 × 88 × 0,3 mm, prototypens lek: en tuckbox på 65 × 90 × 34,5 mm.
const deck = (): ProjectDoc => {
  const doc = projectDoc()
  doc.rows[0]!.fields['antal'] = 100
  doc.rows[1]!.fields['antal'] = 4
  doc.rows[2]!.fields['antal'] = 4
  return doc
}

async function open(doc: ProjectDoc = deck(), lang: 'sv' | 'en' = 'sv') {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang={lang}>
      <StatusLive>
        <EditorPage />
      </StatusLive>
    </Language>,
  )
  await screen.findByText('Skogens herrar')
}
const tabs = () => within(screen.getByRole('tablist', { name: /editorlägen|editor modes/i })).getAllByRole('tab').map((tab) => tab.textContent)
const openBox = async () => {
  fireEvent.click(screen.getByRole('tab', { name: 'Låda' }))
  await waitFor(() => expect(document.querySelector('.byd-box-net')).not.toBeNull())
}
const panel = (face: BoxFace) => document.querySelector<HTMLElement>(`.byd-box-panel[data-face="${face}"]`)!
const stored = async () => (await run.projects.load(run.projectId))!
const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^spara$/i }))
  await waitFor(async () => expect((await stored()).rev).toBeGreaterThan(1))
}


// The print package's «Rita lådan ›» (#1418) opens the editor on the Låda tab, read once and taken out
// of the address, as «Väntar på dig» opens Resultat (#1225).
describe('the way to the box from the print package', () => {
  it('opens on the Låda tab with open=box, and leaves the address the game\'s own', async () => {
    await run.projects.create(run.projectId, deck())
    history.replaceState(null, '', `/editor?project=${run.projectId}&open=box&server=${encodeURIComponent(run.http)}`)
    render(
      <Language lang="sv">
        <StatusLive>
          <EditorPage />
        </StatusLive>
      </Language>,
    )
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Låda' }).getAttribute('aria-selected')).toBe('true'))
    expect(document.querySelector('.byd-box-net')).not.toBeNull()
    expect(new URLSearchParams(location.search).has('open')).toBe(false)
    expect(new URLSearchParams(location.search).get('project')).toBe(run.projectId)
  })
})

describe('fliken «Låda» syns när «Starta bord» går att använda (#1413, #1406 beslut 3)', () => {
  it('står efter Mall när bordet går att starta, och den växande lådan har ingen egen regel', async () => {
    await open()
    expect(screen.getByRole('button', { name: /starta bord/i })).toBeTruthy()
    expect(tabs()).toEqual(['Kortvägg', 'Mall', 'Låda', 'Tabell', 'Speltema', 'Media', 'Regler', 'Bord'])
  })

  it('finns inte förrän då, varken bland flikarna eller bland stegen under skrivbordet', () => {
    expect(modesFor(false)).toEqual(MODES)
    expect(modesFor(true).map(([m]) => m)).toEqual(['wall', 'template', 'box', 'table', 'theme', 'media', 'rules', 'tables'])
    expect(stagesFor('tablet', false)).toEqual(STAGES.tablet)
    expect(stagesFor('tablet', true).map(([s]) => s)).toContain('box')
    // En telefon lägger inget i millimeter, lådans ytor inte heller (L10).
    expect(stagesFor('phone', true)).toEqual(STAGES.phone)
  })
})

// Heron i Mina spel visar lådan först när designern själv har öppnat den (#1416, L91). Att fliken
// öppnas är ingen ändring av spelet: ingen redigering i loggen, ingen version och inget steg tillbaka.
describe('att öppna fliken lägger lådan i heron (#1416)', () => {
  it('säger till servern när fliken öppnas, och inte förr', async () => {
    await open()
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(await run.projects.boxOpened(run.projectId)).toBe(false)
    await openBox()
    await waitFor(async () => expect(await run.projects.boxOpened(run.projectId)).toBe(true))
    expect((await stored()).rev).toBe(1)
    expect(await run.projects.readEdits(run.projectId, 0)).toEqual([])
    expect(screen.getByRole('button', { name: /^Ångra/ }).getAttribute('aria-disabled')).toBe('true')
  })
})

describe('nätet (#1413)', () => {
  it('ritar sex ytor, flikar och linjer i lådans uträknade mått, och mäter som typen', async () => {
    await open()
    await openBox()
    const size = boxOf(deck()).size
    expect(size).toEqual({ width: 65, height: 90, depth: 34.5 })
    const net = tuckNet(TUCKBOX, size)
    const sheet = document.querySelector<HTMLElement>('.byd-box-net')!
    // En millimeter är lika många pixlar överallt på arket: nätets bredd och varje yta.
    const px = parseFloat(sheet.style.width) / net.width
    expect(parseFloat(sheet.style.height) / net.height).toBeCloseTo(px, 6)
    for (const p of net.panels) {
      const drawn = panel(p.face)
      expect(parseFloat(drawn.style.left) / px).toBeCloseTo(p.x, 6)
      expect(parseFloat(drawn.style.top) / px).toBeCloseTo(p.y, 6)
      expect(parseFloat(drawn.style.width) / px).toBeCloseTo(p.width, 6)
      expect(parseFloat(drawn.style.height) / px).toBeCloseTo(p.height, 6)
      // Ytan ritas av den enda renderaren (E2), i ytans eget mått och i samma skala som arket.
      const { widthMm, heightMm } = boxFaceSize(p.face, size)
      const css = [...drawn.querySelectorAll('style')].map((s) => s.textContent).join('')
      expect(css).toContain(`[data-card]{position:relative;width:${widthMm}mm;height:${heightMm}mm;`)
      const zoom = Number((drawn.querySelector('.byd-preview') as HTMLElement).style.zoom)
      expect(zoom * PX_PER_MM).toBeCloseTo(px, 6)
    }
    // Locket står upp och ner som på arket.
    expect(panel('lid').hasAttribute('data-turned')).toBe(true)
    expect(document.querySelectorAll('.byd-box-lines .byd-box-fold')).toHaveLength(net.folds.length)
    expect(document.querySelectorAll('.byd-box-lines .byd-box-flap')).toHaveLength(net.flaps.length)
  })

  it('väljer en yta i listan och i nätet, och visar dess lager', async () => {
    await open()
    await openBox()
    const front = screen.getByRole('button', { name: /^Framsida/ })
    expect(front.getAttribute('aria-pressed')).toBe('true')
    expect(panel('front').hasAttribute('data-chosen')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^Lock/ }))
    expect(panel('lid').hasAttribute('data-chosen')).toBe(true)
    expect(screen.getByRole('heading', { name: 'Lager · lock' })).toBeTruthy()
    fireEvent.click(panel('back'))
    expect(screen.getByRole('button', { name: /^Baksida/ }).getAttribute('aria-pressed')).toBe('true')
    expect(panel('back').hasAttribute('data-chosen')).toBe(true)
  })

  it('visar en låda som inte är ritad neutral, med spelets namn och lekens färg', async () => {
    await open()
    await openBox()
    expect(layerIds()).toEqual(['title', 'ground'])
    expect(panel('front').innerHTML).toContain('#2f4068')
    expect(panel('front').textContent).toContain('Skogens herrar')
  })
})

describe('en yta redigeras med kortets lager och egenskaper (#1413)', () => {
  it('skriver texten på ytan, och den neutrala ytan blir designerns i samma steg', async () => {
    await open()
    await openBox()
    fireEvent.click(layerPick('title'))
    const words = screen.getByRole('textbox', { name: 'Text' })
    fireEvent.focus(words)
    fireEvent.change(words, { target: { value: 'Skogens herrar: Andra upplagan' } })
    await waitFor(() => expect(panel('front').textContent).toContain('Andra upplagan'))
    await save()
    const box = (await stored()).box
    expect(box?.faces?.front?.base.map((e) => e.id)).toEqual(['ground', 'title'])
    expect(box?.faces?.front?.base[1]).toMatchObject({ bind: { literal: 'Skogens herrar: Andra upplagan' } })
    // Korten rördes inte.
    expect((await stored()).template).toEqual(deck().template)
  })

  it('lägger till ett lager med kortets verktyg, mitt på ytan i ytans eget mått', async () => {
    await open()
    await openBox()
    fireEvent.click(screen.getByRole('button', { name: /^Lock/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Form/ }))
    await save()
    const lid = (await stored()).box?.faces?.lid?.base ?? []
    const added = lid.find((e) => e.kind === 'shape' && e.id !== 'ground')
    expect(added).toBeDefined()
    const { widthMm, heightMm } = boxFaceSize('lid', boxOf(deck()).size)
    if (!added || !('w' in added)) throw new Error('no shape')
    expect(added.x + added.w / 2).toBeCloseTo(widthMm / 2, 0)
    expect(added.y + added.h / 2).toBeCloseTo(heightMm / 2, 0)
  })

  it('tar tillbaka en ändring av ytan med ett steg, och lådan är neutral igen', async () => {
    await open()
    await openBox()
    fireEvent.click(layerPick('title'))
    const words = screen.getByRole('textbox', { name: 'Text' })
    fireEvent.focus(words)
    fireEvent.change(words, { target: { value: 'Ny titel' } })
    fireEvent.change(words, { target: { value: 'Ny titel två' } })
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.click(screen.getByRole('button', { name: 'Ångra en ändring av lådan' }))
    await waitFor(() => expect(panel('front').textContent).toContain('Skogens herrar'))
    expect(panel('front').textContent).not.toContain('Ny titel')
    expect(screen.getByRole('button', { name: /^Ångra/ }).getAttribute('aria-disabled')).toBe('true')
  })
})

describe('måtten och luften (#1406 beslut 4)', () => {
  it('låser ett mått på värdet det har, och tar tillbaka låset med ett steg', async () => {
    await open()
    await openBox()
    const lock = screen.getByRole('button', { name: 'Lås djupet' })
    expect(lock.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(lock)
    expect(screen.getByRole('button', { name: 'Lås djupet' }).getAttribute('aria-pressed')).toBe('true')
    await save()
    expect((await stored()).box?.locked).toEqual({ depth: 34.5 })
    fireEvent.click(screen.getByRole('button', { name: 'Ångra en ändring av lådan' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lås djupet' }).getAttribute('aria-pressed')).toBe('false'))
  })

  it('säger hur många kort ett låst djup inte rymmer, och följer leken igen på ett tryck', async () => {
    const doc = deck()
    doc.box = { type: { id: 'box.tuck', version: 1 }, locked: { depth: 30 } }
    await open(doc)
    await openBox()
    const over = document.querySelector('.byd-box-over')!
    expect(over.textContent).toContain('15 kort får inte plats.')
    expect(over.textContent).toContain('Leken är 32,4 mm, och det låsta djupet rymmer 28 mm.')
    fireEvent.click(within(over as HTMLElement).getByRole('button', { name: 'Följ leken igen' }))
    await waitFor(() => expect(document.querySelector('.byd-box-over')).toBeNull())
    await save()
    expect((await stored()).box).toBeUndefined()
  })

  it('ändrar luften, och nätet följer den', async () => {
    await open()
    await openBox()
    const before = parseFloat(panel('left').style.width)
    const depth = screen.getByRole('spinbutton', { name: 'I djupet' })
    fireEvent.focus(depth)
    fireEvent.change(depth, { target: { value: '5' } })
    fireEvent.blur(depth)
    await waitFor(() => expect(parseFloat(panel('left').style.width)).toBeGreaterThan(before))
    await save()
    expect((await stored()).box?.clearance).toEqual({ depth: 5 })
    expect(boxOf(await stored()).size.depth).toBe(37.5)
  })

  it('står på engelska för en engelsk läsare', async () => {
    await open(deck(), 'en')
    fireEvent.click(screen.getByRole('tab', { name: 'Box' }))
    await waitFor(() => expect(document.querySelector('.byd-box-net')).not.toBeNull())
    expect(screen.getByRole('heading', { name: 'Box size' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lock the depth' })).toBeTruthy()
    expect(document.querySelector('.byd-box-formula')?.textContent).toBe('108 × 0.3 = 32.4 mm deck · holds 108 cards')
  })
})
