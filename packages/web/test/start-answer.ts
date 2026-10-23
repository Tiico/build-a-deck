import { fireEvent, screen, within } from '@testing-library/react'
import { vi } from 'vitest'

// «Starta bord» asks how you sit before the table starts (L77, #1130). A test about what comes
// after the start answers the question the way the room around one screen answers it — today's
// behaviour — and stands in for the tab the answer opens, which jsdom has no window for. The tab
// is handed back so a test can read where it was sent.
export async function answerStart(lang: 'sv' | 'en' = 'sv'): Promise<{ location: { href: string } }> {
  const tab = {
    location: { href: 'about:blank' },
    opener: null as unknown,
    closed: false,
    close() {
      this.closed = true
    },
  }
  vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window)
  const dialog = await screen.findByRole('dialog', { name: lang === 'sv' ? 'Starta ett bord' : 'Start a table' })
  fireEvent.click(within(dialog).getByRole('radio', { name: lang === 'sv' ? 'Runt en skärm' : 'Around one screen' }))
  fireEvent.click(within(dialog).getByRole('button', { name: lang === 'sv' ? 'Starta' : 'Start' }))
  return tab
}
