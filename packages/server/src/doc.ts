// The parts of the project document that are pure functions over it: what changed between two
// versions (B4), and what the rulebook's references stand for (B7). The editor imports this path
// so it never pulls the server — its database, its sockets — into the browser.
export * from './diff.js'
export * from './names.js'
export * from './recipe.js'
export * from './edits.js'
// Spelets låda ur dokumentet (#1412): måtten, låsen och om leken ryms, för editorns Fysisk kontroll.
export * from './box.js'
// Personlig ångra (#1056): vad en redigering ändrade, och steget tillbaka från det.
export { cellColumn, changeOf, joined, revertOf, type Change, type Reverted, type Revert } from './undo.js'
export * from './setup.js'
// Where the game's material lies (#1292): the table is laid from it and the editor drags it.
export * from './material.js'
// The roles a project is shared in (D3): the editor speaks them too, and they are pure data.
export * from './roles.js'
// What the profile page says about a designer's AI key (#999): the words only, never the vault.
export type { AiProvider, AiKeyDescription } from './ai-keys.js'
export type { AiFailure, AiModel } from './ai-providers.js'
// What the editor's AI panel says is sent before it is asked (#1001): the same reading of the game
// the context the model gets is built from, so the chips cannot promise something else.
export { aiContextParts, type AiContextParts } from './ai-context.js'
// What the AI may propose and how a proposal becomes edits (#1002) is the editor's as much as the
// server's, but it is read with zod, and this path reaches the phone: it has a path of its own,
// `@byd/server/proposal`, so that only the editor's chunk carries the schema (`phone-bundle.spec.ts`).

// What the Resultat view reads (#1010): the shape of the playtest the server counts, types only.
export type { Distribution, Playtest, PlaytestAnswer, PlaytestCard, PlaytestFlag, PlaytestPerson, PlaytestQuestion, PlaytestTable, PlaytestVersion } from './playtest.js'
