import { lazy, Suspense, type ComponentType } from 'react'
import { codeOfAddress } from '@byd/protocol'
import { TextureFailures } from './table/TextureFailures.js'
import { NotFoundPage } from './status/NotFoundPage.js'
import { DocumentTitle } from './status/DocumentTitle.js'
import { StatusLive } from './status/StatusLive.js'
import { Language, detectLang, useT } from './i18n/index.js'
import { StatusNotice } from './status/StatusNotice.js'
import { noticeFor, type Voice } from './status/notice.js'
import { statusLinks } from './status/links.js'

// The editor is fetched behind its own loading page. Its stylesheet is the biggest the app has,
// and while it travelled in the entry's sheet the browser blocked the felt's first painting on it
// — so the gate that guards the felt's face (#95) was really a ceiling on how much interface might
// exist, and it had been raised seven times in four days (#186). A dynamic import gives the editor
// a chunk and a sheet of its own, linked when the route opens. Nothing is lost by waiting: a
// designer reaching /editor has already loaded the app, and the seconds that follow are spent
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

// Every other surface is fetched when its address is opened, and only that one (#760). Until then
// the entry carried all of them: a phone opening `/play` paid for the wizard, the account pages,
// the felt's renderer and the observer — 822 kB of script for a strip of cards — and on a slow
// line every one of those kilobytes is a moment longer of white page (#749).
//
// Unlike the editor's, these are waited for *before* React draws anything (`main.tsx`), so the
// first thing on the screen is the surface itself: no fallback, no shell that blinks away — the
// same white page as before the split, only shorter. Nor is the fetch held up behind the entry:
// the built `index.html` names each route's chunks and asks for them beside the entry
// (`vite.config.ts`), so splitting the script costs the first painting no extra round trip.
//
// Only the script travels apart. Each surface's stylesheet still rides in the sheet the first
// painting blocks on, imported from `first-frame-sheets.ts`, so what the felt and the phone draw
// first is in the document before the first pixel whichever chunk the code arrives in (L20).
//
// Routing is a path check for now; a router arrives with the first real page.
export function loadPage(path: string = location.pathname): Promise<ComponentType> {
  return fetchPage(path).catch(() => unreached(path))
}

function fetchPage(path: string): Promise<ComponentType> {
  if (path === '/table') return import('./table/TablePage.js').then((m) => m.TablePage)
  if (path === '/play') return import('./player/PlayerPage.js').then((m) => m.PlayerPage)
  if (path === '/join') return import('./join/JoinPage.js').then((m) => m.JoinPage)
  if (path === '/observe') return import('./observer/ObserverPage.js').then((m) => m.ObserverPage)
  if (path === '/online') return import('./online/OnlinePage.js').then((m) => m.OnlinePage)
  if (path === '/editor') return Promise.resolve(EditorRoute)
  if (path === '/new') return import('./wizard/NewProjectPage.js').then((m) => m.NewProjectPage)
  if (path === '/login') return import('./account/LoginPage.js').then((m) => m.LoginPage)
  if (path === '/claim') return import('./account/ClaimPage.js').then((m) => m.ClaimPage)
  if (path.startsWith('/invites/')) return import('./account/InvitePage.js').then((m) => m.InvitePage)
  if (path === '/') return import('./account/HomePage.js').then((m) => m.HomePage)
  // A room's own address (#675): the code is what the television says after the host, and the
  // phone that opens it is in the seat picker. Last, so no word of the app's can be read as one —
  // and the server never mints a code that is one (`ROUTE_WORDS`).
  if (codeOfAddress(path)) return import('./join/JoinPage.js').then((m) => m.JoinPage)
  // Anything else is a page that does not exist, and says so.
  return Promise.resolve(NotFoundPage)
}

// Which words a surface's own failure is said in: a phone that could not fetch its hand is told
// what a phone is told when it cannot reach the table.
const voiceOf = (path: string): Voice =>
  path === '/play' || path === '/join' || codeOfAddress(path) ? 'phone' : path === '/table' || path === '/observe' || path === '/online' ? 'table' : 'app'

// A surface whose script did not arrive. Not a white page: the state the line is in, said the way
// every route says it (#12).
//
// Its retry is the one place a retry is a reload, and on purpose. A reload is refused everywhere
// else because it throws away the state the reader is trying to keep (`notice.ts`), but here there
// is none yet — the page never drew. And asking for the script again in place does not work:
// Chromium remembers a module that failed to load and answers every later `import()` of it with
// the same failure, so only a fresh document fetches it anew.
function unreached(path: string): ComponentType {
  return function Unreached() {
    const t = useT()
    const links = statusLinks({ server: new URLSearchParams(location.search).get('server') })
    return <StatusNotice notice={noticeFor('offline', voiceOf(path), t)} surface="page" links={links} onRetry={() => location.reload()} />
  }
}

// The whole app is under one language (A4): the reader's own choice, then the address, then what
// their browser asks for. A surface mounted on its own — a preview, a test — speaks Swedish,
// which is the catalogue's own language.
export function App({ Page }: { Page: ComponentType }) {
  return (
    // Three things belong to the screen rather than to any route: the language the tool speaks
    // (A4), the tab's name (#12) and the pair of live regions every state is said in (#7). All
    // live here, the only place mounted exactly once whichever route is showing, for the same
    // reason `TextureFailures` does: every screen that shows cards is under one live region for
    // lost textures (#10).
    <Language lang={detectLang()}>
      <DocumentTitle>
        <StatusLive>
          <TextureFailures>
            <Page />
          </TextureFailures>
        </StatusLive>
      </DocumentTitle>
    </Language>
  )
}
