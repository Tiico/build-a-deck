import { TablePage } from './table/TablePage.js'
import { PlayerPage } from './player/PlayerPage.js'
import { JoinPage } from './join/JoinPage.js'
import { EditorPage } from './editor/EditorPage.js'
import { ObserverPage } from './observer/ObserverPage.js'
import { OnlinePage } from './online/OnlinePage.js'
import { NewProjectPage } from './wizard/NewProjectPage.js'
import { HomePage } from './account/HomePage.js'
import { LoginPage } from './account/LoginPage.js'
import { GroupsPrototype } from './prototype/groups/index.js'
import { ResponsivePrototype } from './prototype/responsive/index.js'
import { TextureFailures } from './table/TextureFailures.js'
import { NotFoundPage } from './status/NotFoundPage.js'
import { DocumentTitle } from './status/DocumentTitle.js'
import { StatusLive } from './status/StatusLive.js'

// Routing is a path check for now; a router arrives with the first real page.
export function App() {
  return (
    // Two things belong to the screen rather than to any route: the tab's name (#12) and the
    // pair of live regions every state is said in (#7). Both live here, the only place mounted
    // exactly once whichever route is showing, for the same reason `TextureFailures` does.
    <DocumentTitle>
      <StatusLive>
        <TextureFailures>{route()}</TextureFailures>
      </StatusLive>
    </DocumentTitle>
  )
}

// Every screen that shows cards is under one live region for lost textures (#10); App is the
// only place that is mounted exactly once whichever route is showing.
function route() {
  if (location.pathname.startsWith('/prototype/groups')) return <GroupsPrototype />
  if (location.pathname.startsWith('/prototype/responsive')) return <ResponsivePrototype />
  if (location.pathname === '/table') return <TablePage />
  if (location.pathname === '/play') return <PlayerPage />
  if (location.pathname === '/join') return <JoinPage />
  if (location.pathname === '/observe') return <ObserverPage />
  if (location.pathname === '/online') return <OnlinePage />
  if (location.pathname === '/editor') return <EditorPage />
  if (location.pathname === '/new') return <NewProjectPage />
  if (location.pathname === '/login') return <LoginPage />
  if (location.pathname === '/') return <HomePage />
  // Anything else is a page that does not exist, and says so.
  return <NotFoundPage />
}
