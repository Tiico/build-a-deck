// The parts of the project document that are pure functions over it: what changed between two
// versions (B4), and what the rulebook's references stand for (B7). The editor imports this path
// so it never pulls the server — its database, its sockets — into the browser.
export * from './diff.js'
export * from './names.js'
export * from './recipe.js'
export * from './edits.js'
export * from './setup.js'
// The roles a project is shared in (D3): the editor speaks them too, and they are pure data.
export * from './roles.js'
// What the profile page says about a designer's AI key (#999): the words only, never the vault.
export type { AiProvider, AiKeyDescription } from './ai-keys.js'
export type { AiFailure, AiModel } from './ai-providers.js'
// What the editor's AI panel says is sent before it is asked (#1001): the same reading of the game
// the context the model gets is built from, so the chips cannot promise something else.
export { aiContextParts, type AiContextParts } from './ai-context.js'
