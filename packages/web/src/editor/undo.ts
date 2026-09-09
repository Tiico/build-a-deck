import type { EditIntent } from '@byd/server/doc'
import type { Key } from '../i18n/index.js'

// How far back a step can go. The stack lives in the tab and is not claimed to survive a reload;
// the history (B4) is what survives, and it is a different thing.
export const UNDO_STEPS = 50

// What a step back took back, in words a designer already uses. Not the intent's own verb —
// "setCell" is the tool talking to itself — but the part of the game it touched, which is what a
// person can recognise a second after pressing the key (#35).
export function whatOf(intent: EditIntent): Key {
  switch (intent.v) {
    case 'rename':
      return 'undo.what.name'
    case 'setCell':
    case 'addRow':
    case 'removeRow':
    case 'replaceRows':
      return 'undo.what.deck'
    case 'patchElement':
    case 'addElement':
    case 'removeElement':
    case 'moveElement':
    case 'resetElement':
    case 'setGroupColumn':
      return 'undo.what.template'
    case 'setRecipe':
    case 'addZone':
    case 'removeZone':
    case 'patchZone':
      return 'undo.what.table'
    case 'setIcon':
    case 'renameIcon':
    case 'removeIcon':
      return 'undo.what.symbols'
    case 'setRules':
      return 'undo.what.rules'
    case 'setFont':
    case 'removeFont':
      return 'undo.what.font'
    // Taking a version back is an edit like any other (B4), so it can be taken back too.
    case 'restore':
      return 'undo.what.version'
  }
}
