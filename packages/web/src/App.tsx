import { TablePage } from './table/TablePage.js'
import { PlayerPage } from './player/PlayerPage.js'
import { JoinPage } from './join/JoinPage.js'
import { EditorPage } from './editor/EditorPage.js'
import { NewProjectPage } from './wizard/NewProjectPage.js'
import { SessionPrototype } from './prototype/session/index.js'

// Routing is a path check for now; a router arrives with the first real page.
export function App() {
  if (location.pathname.startsWith('/prototype/session')) return <SessionPrototype />
  if (location.pathname === '/table') return <TablePage />
  if (location.pathname === '/play') return <PlayerPage />
  if (location.pathname === '/join') return <JoinPage />
  if (location.pathname === '/editor') return <EditorPage />
  if (location.pathname === '/new') return <NewProjectPage />
  return (
    <main style={{ padding: 32 }}>
      <h1>build-your-deck</h1>
      <p>
        <a href="/new">Nytt spel</a> · Bordsvyn: <code>/table?session=…&amp;mode=table|tv&amp;code=…</code> · Anslut: <code>/join?session=…</code> · Editor: <code>/editor?project=…</code>
      </p>
    </main>
  )
}
