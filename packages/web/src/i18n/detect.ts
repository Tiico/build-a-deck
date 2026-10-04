// The reader's own choice first, then the address they followed, then what their browser asks
// for. Nothing else: the tool never guesses from where someone is.
//
// One function with nothing outside it, on purpose. The built `index.html` runs this very function
// before the entry has arrived, to ask for the reader's words beside it (#760, `vite.config.ts`
// inlines its source), so it may not reach for a constant or a helper the page does not have yet.
// That is why the storage key is written out here rather than shared with `rememberLang`, and why
// `i18n.test.tsx` asks this function what a remembered choice gives.
export function detectLang(): 'sv' | 'en' {
  const known = ['sv', 'en']
  const asked = new URLSearchParams(location.search).get('lang')
  if (asked !== null && known.includes(asked)) return asked as 'sv' | 'en'
  let chosen: string | null = null
  try {
    chosen = localStorage.getItem('byd.lang')
  } catch {
    // A browser that refuses storage simply has no choice remembered, which is not an error.
  }
  if (chosen !== null && known.includes(chosen)) return chosen as 'sv' | 'en'
  return (navigator.languages ?? [navigator.language]).some((l) => l.toLowerCase().startsWith('sv')) ? 'sv' : 'en'
}
