// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { NoticeBand } from '../src/editor/NoticeBand.js'

// Notisens band under huvudet (#1073). Det går när formgivaren stänger det, och av sig självt när
// det inte längre är sant (#996) — en sparning som gick igenom tar bort det. Stod fokus på ×-et när
// bandet gick hamnar det på arbetet, den öppna flikens panel, och aldrig på ingenting.
function Editor({ notice }: { notice: string | null }) {
  return (
    <div className="byd-editor">
      <header>
        <button type="button">Spara</button>
      </header>
      {notice !== null && <NoticeBand text={notice} onClose={() => undefined} />}
      <main>
        <div role="tabpanel" tabIndex={0} hidden aria-label="Mall" />
        <div role="tabpanel" tabIndex={0} aria-label="Kortvägg" />
      </main>
    </div>
  )
}

describe('notisens band', () => {
  afterEach(cleanup)

  it('säger meningen som en levande region, med ett × som har ett namn utanför den', () => {
    render(<Editor notice="Bordet kunde inte uppdateras. Försök igen." />)
    expect(screen.getByRole('alert').textContent).toBe('Bordet kunde inte uppdateras. Försök igen.')
    const close = screen.getByRole('button', { name: 'Stäng meddelandet' })
    expect(screen.getByRole('alert').contains(close)).toBe(false)
  })

  it('lämnar fokus åt den öppna flikens panel när det går av sig självt medan ×-et har det', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Editor notice="Bordet kunde inte uppdateras. Försök igen." />)
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stäng meddelandet' }))
    rerender(<Editor notice={null} />)
    expect(document.activeElement).toBe(screen.getByRole('tabpanel', { name: 'Kortvägg' }))
  })

  it('rör inte fokus när det går medan något annat har det', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Editor notice="Bordet kunde inte uppdateras. Försök igen." />)
    await user.tab()
    const save = screen.getByRole('button', { name: 'Spara' })
    expect(document.activeElement).toBe(save)
    rerender(<Editor notice={null} />)
    expect(document.activeElement).toBe(save)
  })
})
