import { TablePrototype } from './prototype/table/index.js'

// Routing is a path check for now; a router arrives with the first real page.
export function App() {
  if (location.pathname.startsWith('/prototype/table')) return <TablePrototype />
  return (
    <main style={{ padding: 32 }}>
      <h1>build-your-deck</h1>
      <p>
        Inget här än. Prototyp: <a href="/prototype/table?variant=A">/prototype/table</a>
      </p>
    </main>
  )
}
