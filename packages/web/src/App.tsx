import { lazy, Suspense } from 'react'
import { TablePage } from './table/TablePage.js'
import { PlayerPage } from './player/PlayerPage.js'
import { JoinPage } from './join/JoinPage.js'
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
import { Language, detectLang, useT } from './i18n/index.js'
import { StatusNotice } from './status/StatusNotice.js'
import { noticeFor } from './status/notice.js'
import { statusLinks } from './status/links.js'

// The editor is the one route fetched rather than shipped. Its stylesheet is the biggest the app
// has, and while it travelled in the entry's sheet the browser blocked the felt's first painting
// on it — so the gate that guards the felt's face (#95) was really a ceiling on how much interface
// might exist, and it had been raised seven times in four days (#186). A dynamic import gives the
// editor a chunk and a sheet of its own, linked when the route opens. Nothing is lost by waiting:
// a designer reaching /editor has already loaded the app, and the seconds that follow are spent
// fetching her project anyway.
const EditorPage = lazy(() => import('./editor/EditorPage.js').then((m) => ({ default: m.EditorPage })))

// What stands there while the chunk is on its way. Not a blank, and not a spinner of its own
// invention: it is the very page the editor itself shows next while it reaches for the project
// (UX-07), drawn from the sheet that does block the first painting. So the wait reads as one
// state that lasts a moment longer rather than as two different screens in a row.
function EditorRoute() {
  const t = useT()
  const links = statusLinks({ server: new URLSearchParams(location.search).get('server') })
  return (
    <Suspense fallback={<StatusNotice notice={noticeFor('loading', 'editor', t)} surface="page" links={links} />}>
      <EditorPage />
    </Suspense>
  )
}

const SetupBookPrototype = import.meta.env.DEV ? lazy(() => import('./rules/prototype/SetupBookPrototype.js')) : null

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
  if (SetupBookPrototype && ['/play', '/online', '/table'].includes(location.pathname) && new URLSearchParams(location.search).has('setupPrototype')) {
    return <Suspense fallback={null}><SetupBookPrototype /></Suspense>
  }
  if (location.pathname === '/table') return <TablePage />
  if (location.pathname === '/play') return <PlayerPage />
  if (location.pathname === '/join') return <JoinPage />
  if (location.pathname === '/observe') return <ObserverPage />
  if (location.pathname === '/online') return <OnlinePage />
  if (location.pathname === '/editor') return <EditorRoute />
  if (location.pathname === '/new') return <NewProjectPage />
  if (location.pathname === '/login') return <LoginPage />
  if (location.pathname === '/claim') return <ClaimPage />
  if (location.pathname.startsWith('/invites/')) return <InvitePage />
  if (location.pathname === '/') return <HomePage />
  // Anything else is a page that does not exist, and says so.
  return <NotFoundPage />
}
