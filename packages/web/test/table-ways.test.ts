import { describe, expect, it } from 'vitest'
import { editorTab, editorWay, tableTab } from '../src/ways.js'

// Vägen tillbaka (#1217, L80): the editor's tab and every table's tabs are named, so a way in that
// already has a tab opens in it, and a table's way back finds the editor's tab instead of opening
// another.
describe('the tabs a game opens in (#1217)', () => {
  it('names one tab per game for the editor, and one per table and view', () => {
    expect(editorTab('p-1')).toBe('byd-editor-p-1')
    expect(tableTab('s-1', 'tv')).toBe('byd-tv-s-1')
    expect(tableTab('s-1', 'online')).not.toBe(tableTab('s-1', 'tv'))
    expect(tableTab('s-1', 'online')).not.toBe(tableTab('s-2', 'online'))
  })

  it('leads back to the editor at the address it opened at, so the tab that has it is not loaded again', () => {
    // The address Mina spel opens the editor at, with the fragment that makes the way back a jump
    // within the page rather than a load.
    expect(editorWay('p 1', null)).toEqual({ href: '/editor?project=p+1#', target: 'byd-editor-p 1' })
  })

  it('carries a development server as the editor speaks it, not as the table does', () => {
    // A table's address holds its server as `ws://`; the editor's holds `http://`.
    expect(editorWay('p', 'ws://localhost:8191').href).toBe('/editor?project=p&server=http%3A%2F%2Flocalhost%3A8191#')
    expect(editorWay('p', 'wss://api.example').href).toBe('/editor?project=p&server=https%3A%2F%2Fapi.example#')
    expect(editorWay('p', 'http://localhost:8191').href).toBe('/editor?project=p&server=http%3A%2F%2Flocalhost%3A8191#')
  })
})
