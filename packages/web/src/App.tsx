import { TablePage } from './table/TablePage.js'

// Routing is a path check for now; a router arrives with the first real page.
export function App() {
  if (location.pathname === '/table') return <TablePage />
  return (
    <main style={{ padding: 32 }}>
      <h1>build-your-deck</h1>
      <p>
        Inget här än. Bordsvyn: <code>/table?session=…&amp;mode=table|tv&amp;code=…</code>
      </p>
    </main>
  )
}
