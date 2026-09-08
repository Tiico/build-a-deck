// The parts of the project document that are pure functions over it: what changed between two
// versions (B4), and what the rulebook's references stand for (B7). The editor imports this path
// so it never pulls the server — its database, its sockets — into the browser.
export * from './diff.js'
export * from './names.js'
export * from './recipe.js'
export * from './edits.js'
