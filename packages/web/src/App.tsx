import { TablePage } from './table/TablePage.js'
import { PlayerPage } from './player/PlayerPage.js'
import { JoinPage } from './join/JoinPage.js'

// Routing is a path check for now; a router arrives with the first real page.
export function App() {
  if (location.pathname === '/table') return <TablePage />
  if (location.pathname === '/play') return <PlayerPage />
  if (location.pathname === '/join') return <JoinPage />
  return (
    <main style={{ padding: 32 }}>
      <h1>build-your-deck</h1>
      <p>
        Inget här än. Bordsvyn: <code>/table?session=…&amp;mode=table|tv&amp;code=…</code> · Anslut: <code>/join?session=…</code>
      </p>
    </main>
  )
}
