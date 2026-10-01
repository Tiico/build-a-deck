// Att välja ett färdigt tema i Speltema så som formgivaren gör det: ett tryck på rutan (L57, #632).
//
// Trycket hämtar temats familjer ur katalogen, och den trafiken svaras av `watchFontNet` i stället
// för av Google. Det som väntas på är att rutan står vald och att inget tema längre är på väg, så
// vyn som läses efteråt är den formgivaren faktiskt ser när valet har landat (#665).
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { watchFontNet } from './font-net.js'

export async function chooseTheme(name: string): Promise<void> {
  const net = watchFontNet()
  try {
    fireEvent.click(screen.getByRole('button', { name: `Välj temat ${name}` }))
    await waitFor(
      () => {
        const tile = screen.getByRole('button', { name: `Välj temat ${name}` })
        if (tile.getAttribute('aria-pressed') !== 'true') throw new Error(`${name} never came out chosen: ${[...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent).join(' | ')}`)
        if (document.querySelector('.byd-theme-tile[aria-busy="true"]')) throw new Error(`${name} is still on its way`)
      },
      { timeout: 15_000 },
    )
  } finally {
    net.undo()
  }
}
