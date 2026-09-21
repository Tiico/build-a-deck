// @vitest-environment jsdom
// Vad första bildrutan visar av kameran (#325, #346:s väg).
//
// Klungan och kantmarkeringen låg i det ark den första målningen blockerar på, för kontroller
// ingen kan se: kameran ramar in själv tills någon tar över, så på första bildrutan finns
// varken klunga eller markering. Sedan flytten reser deras regler i `camera-hand.css`, som
// hämtas med `CameraControls.js` när vyn blir egen.
//
// Priset flytten inte får kosta är en oklädd blink: en klunga som dyker upp i DOM:en innan dess
// ark är framme vore en hög nakna knappar mitt över bordet. Att det inte kan hända är en fråga
// om React och inte om CSS — finns klungan i DOM:en innan dess modul är hämtad? — så den ställs
// här, i jsdom, med hämtningen hållen i handen. Bygget lägger chunkens ark bredvid dess kod, så
// `import()` blir klar först när båda är framme; det som mäts här är att ingenting ritas dessför-
// innan.
//
// Att arket faktiskt ligger utanför den blockerande stilmallen är den andra halvan, och den mäts
// på det byggda arket i `felt-font.spec.ts`.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { Language } from '../src/i18n/index.js'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { feltOf, sceneOf } from './felt-labels.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Klungans modul hålls i handen, så att «medan den hämtas» blir ett tillstånd provet kan mäta i
// stället för ett ögonblick det får hoppas på. Grinden öppnas först när påståendet om den tomma
// reserven är ställt.
const gate = vi.hoisted(() => {
  let open!: () => void
  const held = new Promise<void>((resolve) => {
    open = resolve
  })
  return { held, open }
})

vi.mock('../src/table/CameraControls.js', async (importOriginal) => {
  await gate.held
  return await importOriginal<typeof import('../src/table/CameraControls.js')>()
})

const scene = sceneOf(feltOf(4))
const SIZE = { w: 1280, h: 720 }

describe('kamerans hörn kommer klätt (#325)', () => {
  it('ritar ingenting av klungan eller markeringen medan deras modul hämtas', async () => {
    render(
      <Language lang="sv">
        <TableRenderer view={scene} mode="tv" camera="follow" size={SIZE} glideMs={0} onAct={() => undefined} />
      </Language>,
    )
    const frame = document.querySelector('.byd-table-frame')!
    // På första bildrutan är vyn automatisk, och då finns kameran inte i handen alls.
    expect(document.querySelectorAll('.byd-camera-controls, .byd-camera-edge')).toHaveLength(0)

    // Hjulet tar över vyn. Modulen är efterfrågad men hålls kvar, och reserven är tom med flit:
    // en platshållare här vore precis den oklädda blink flytten inte får kosta.
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.wheel(frame, { deltaY: -900, clientX: SIZE.w / 2, clientY: SIZE.h / 2 })
    await Promise.resolve()
    expect(document.querySelectorAll('.byd-camera-controls, .byd-camera-edge')).toHaveLength(0)
    // Och provet är inte tomt: släpps modulen fram kommer klungan, klädd i sitt eget ark.
    gate.open()
    expect(await screen.findByRole('button', { name: 'Visa hela bordet' })).toBeTruthy()
    expect(document.querySelectorAll('.byd-camera-controls')).toHaveLength(1)
  })
})
