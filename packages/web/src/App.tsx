import { TablePage } from './table/TablePage.js'
import { PlayerPage } from './player/PlayerPage.js'
import { JoinPage } from './join/JoinPage.js'
import { EditorPage } from './editor/EditorPage.js'
import { ObserverPage } from './observer/ObserverPage.js'
import { OnlinePage } from './online/OnlinePage.js'
import { NewProjectPage } from './wizard/NewProjectPage.js'
import { HomePage } from './account/HomePage.js'
import { LoginPage } from './account/LoginPage.js'
import { TablePrototype } from './prototype/table-ref/index.js'
import { EditorNavPrototype } from './prototype/editor-nav/index.js'
import { GroupsPrototype } from './prototype/groups/index.js'
import { TextureFailures } from './table/TextureFailures.js'

// Routing is a path check for now; a router arrives with the first real page.
export function App() {
  return <TextureFailures>{route()}</TextureFailures>
}

// Every screen that shows cards is under one live region for lost textures (#10); App is the
// only place that is mounted exactly once whichever route is showing.
function route() {
  if (location.pathname.startsWith('/prototype/table-ref')) return <TablePrototype />
  if (location.pathname.startsWith('/prototype/editor-nav')) return <EditorNavPrototype />
  if (location.pathname.startsWith('/prototype/groups')) return <GroupsPrototype />
  if (location.pathname === '/table') return <TablePage />
  if (location.pathname === '/play') return <PlayerPage />
  if (location.pathname === '/join') return <JoinPage />
  if (location.pathname === '/observe') return <ObserverPage />
  if (location.pathname === '/online') return <OnlinePage />
  if (location.pathname === '/editor') return <EditorPage />
  if (location.pathname === '/new') return <NewProjectPage />
  if (location.pathname === '/login') return <LoginPage />
  return <HomePage />
}
