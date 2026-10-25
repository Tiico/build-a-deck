// Att öppna exemplen i Speltema så som formgivaren gör det (L84, #1287): «Titta i exemplen», och
// sedan «Kopiera … till spelets tema…» på ett av dem, så att frågan om vad kopian byter ut står
// öppen med sina knappar. Ingenting kopieras, och ingenting hämtas från katalogen.
import { fireEvent, screen, within } from '@testing-library/react'

export function openExample(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Titta i exemplen' }))
  const sheet = screen.getByRole('region', { name: 'Exempel att utgå ifrån' })
  fireEvent.click(within(sheet).getByRole('button', { name: `Kopiera ${name} till spelets tema…` }))
  within(sheet).getByRole('group', { name: `Det här byts ut om du kopierar ${name}` })
}
