// The tabs a game opens in (#1217, L80), and the way back from a table to the game's editor.
//
// A table opens beside the editor, never over it (L5, L64): the designer edits in one tab and
// watches the table in another. Every way in used to open a tab of its own, so a table opened
// twice was two tabs, and no table had a way back to anything — the way back was the browser's
// tab strip. So the tabs are named instead. The editor's tab carries its game's name, each table's
// tab carries its table and its view, and a link that targets a name brings that tab out when it
// is there and opens it when it is not.
//
// A name is only found by a tab that shares a browsing context group with it, which is exactly
// what `noopener` takes away: these ways in open with an opener, or the way back opens a second
// editor. They are the app's own pages on its own origin, so nothing is reached that could not be.
//
// It sits at the root, beside `room.ts`, because both the editor and every table surface use it.

export type TableView = 'tv' | 'table' | 'online' | 'observe'

export const editorTab = (project: string): string => `byd-editor-${project}`
export const tableTab = (session: string, view: TableView): string => `byd-${view}-${session}`

// The editor's address as Mina spel opens it, so a tab that has the editor open is at this very
// address. The fragment makes following the link a jump within that page and not a load: the
// editor is brought out as it stands, its unsaved work and its open panels with it. A table's
// address carries a development server as WebSocket, which the editor speaks as HTTP.
export function editorWay(project: string, server: string | null): { href: string; target: string } {
  const q = new URLSearchParams({ project })
  if (server) q.set('server', server.replace(/^ws/, 'http'))
  return { href: `/editor?${q.toString()}#`, target: editorTab(project) }
}

