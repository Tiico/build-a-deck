import type { Messages } from './sv.js'
import { enEditor } from './en.editor.js'

// English, written against the Swedish catalogue key by key (A4). The type is the promise: a key
// that is missing here does not compile, and one that is not in the catalogue does not either.
export const en: Messages = {
  ...enEditor,
}
