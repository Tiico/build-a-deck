import type { Messages } from './sv.js'
import { enEditor } from './en.editor.js'
import { enPlay } from './en.play.js'
import { enAccount } from './en.account.js'
import { enStatus } from './en.status.js'

// English, written against the Swedish catalogue key by key (A4). The type is the promise: a key
// that is missing here does not compile, and one that is not in the catalogue does not either.
export const en: Messages = {
  ...enEditor,
  ...enPlay,
  ...enAccount,
  ...enStatus,
}
