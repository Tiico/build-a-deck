import { isLang, rememberLang } from '../i18n/index.js'

// The table is the host's screen and speaks the host's language (#756, beställarens beslut, A4).
// The editor's links carry it as `?lang=`, and the table keeps it, so that a reload, an ended
// table's status page or the next table on the same screen speak it too. There is no picker on
// the felt: the language is chosen where the host works, and travels with the link.
export function rememberTableLang(): void {
  const asked = new URLSearchParams(location.search).get('lang')
  if (isLang(asked)) rememberLang(asked)
}
