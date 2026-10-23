import { fireEvent, screen } from '@testing-library/react'

// The guide stands behind the first door of the crossroads (L79, #1218): a name, then «Guidad
// start». Everything a test of the guide itself asks of it is on the other side.
export function throughTheDoor(name = 'Skogens herrar', { label = 'Spelets namn', door = 'Guidad start' } = {}): void {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: door }))
}

// The guide's own address with a draft that has a name (L79): where a reload of the guide lands,
// for a test that has to mount the guide as it stands rather than walk to it.
export function atTheGuide(name = 'Skogens herrar', server: string | null = null): void {
  const fields = [
    { key: 'title', label: 'Titel', kind: 'text' },
    { key: 'cost', label: 'Kostnad', kind: 'number' },
    { key: 'body', label: 'Regeltext', kind: 'text' },
    { key: 'art', label: 'Illustration', kind: 'image' },
  ]
  const rows = [1, 2, 3].map((n) => ({ title: `Kort ${n}`, cost: String(n), body: 'Dra ett kort.', art: '', antal: '2' }))
  sessionStorage.setItem('byd.pending-wizard', JSON.stringify({ state: { name, players: 2, fields, frame: 'classic', theme: 'skogssaga', themePressed: false, rows }, server }))
  history.replaceState(null, '', `/new/guided${server ? `?server=${encodeURIComponent(server)}` : ''}`)
}
