import { TablePage } from './table/TablePage.js'
import { PlayerPage } from './player/PlayerPage.js'
import { JoinPage } from './join/JoinPage.js'
import { EditorPage } from './editor/EditorPage.js'
import { ObserverPage } from './observer/ObserverPage.js'
import { OnlinePage } from './online/OnlinePage.js'
import { NewProjectPage } from './wizard/NewProjectPage.js'
import { HomePage } from './account/HomePage.js'
import { LoginPage } from './account/LoginPage.js'
import { ClaimPage } from './account/ClaimPage.js'
import { InvitePage } from './account/InvitePage.js'
import { TextureFailures } from './table/TextureFailures.js'
import { NotFoundPage } from './status/NotFoundPage.js'
import { DocumentTitle } from './status/DocumentTitle.js'
import { StatusLive } from './status/StatusLive.js'
import { Language, detectLang } from './i18n/index.js'

// Routing is a path check for now; a router arrives with the first real page.
// The whole app is under one language (A4): the reader's own choice, then the address, then what
// their browser asks for. A surface mounted on its own — a preview, a test — speaks Swedish,
// which is the catalogue's own language.
export function App() {
  return (
    // Three things belong to the screen rather than to any route: the language the tool speaks
    // (A4), the tab's name (#12) and the pair of live regions every state is said in (#7). All
    // live here, the only place mounted exactly once whichever route is showing, for the same
    // reason `TextureFailures` does.
    <Language lang={detectLang()}>
      <DocumentTitle>
        <StatusLive>
          <TextureFailures>{route()}</TextureFailures>
        </StatusLive>
      </DocumentTitle>
    </Language>
  )
}

// Every screen that shows cards is under one live region for lost textures (#10); App is the
// only place that is mounted exactly once whichever route is showing.
function route() {
  if (location.pathname === '/table') return <TablePage />
  if (location.pathname === '/play') return <PlayerPage />
  if (location.pathname === '/join') return <JoinPage />
  if (location.pathname === '/observe') return <ObserverPage />
  if (location.pathname === '/online') return <OnlinePage />
  if (location.pathname === '/editor') return <EditorPage />
  if (location.pathname === '/new') return <NewProjectPage />
  if (location.pathname === '/login') return <LoginPage />
  if (location.pathname === '/claim') return <ClaimPage />
  if (location.pathname.startsWith('/invites/')) return <InvitePage />
  if (location.pathname === '/') return <HomePage />
  // Anything else is a page that does not exist, and says so.
  return <NotFoundPage />
}
