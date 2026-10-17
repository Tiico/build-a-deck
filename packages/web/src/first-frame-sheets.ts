// The stylesheets of every surface the first painting draws, on the entry and not on the chunk
// each surface's script is fetched in (#760, L20).
//
// Since #760 the script of every route is fetched when its address is opened, and a sheet a chunk
// imports becomes a sheet of that chunk's own. That is right for the editor, whose wait has a page
// of its own (#186), and wrong for the felt and the phone: what they draw first has to be in the
// document before the first pixel, in the sheet the browser already blocks on. So their sheets
// are named here, and the chunks find them already loaded.
//
// The order is the cascade's, and it is the order the sheet had while the routes were imported
// statically — the order a plain `import` walk from `App.tsx` met them in. Nothing about the
// blocking sheet changed with #760 but its neighbours.
//
// Only the felt's and the phone's (#984). The designer's pages — `/`, `/login`, `/new` and the rest —
// wait for their chunk all the same, and their sheets travel with it as the editor's does, rather
// than every phone's first painting blocking on the guide's.
//
// `felt-font.spec.ts` holds this list to the code: a surface a route reaches by a plain `import`
// whose sheet is missing here is named there, and so is a sheet here that neither the felt nor the
// phone draws first.
import './table/table.css'
import './table/texture.css'
import './help.css'
import './rules/rules-open.css'
import './table/keyboard.css'
import './status/status.css'
import './player/player.css'
import './join/join.css'
import './online/online.css'
