// Typsnittstrafiken en svit står i vägen för (#420, #329).
//
// Den guidade starten hämtar startramens ansikte ur katalogen när spelet skapas (L27), och den
// trafiken får inte gå ut på riktigt i ett prov: en svit som beror på Google är en svit som går
// röd när nätet hostar. Katalogens två adresser svaras här och allt annat lämnas i fred — det som
// går till sviten egen server går dit på riktigt.
//
// Samma form som `project-client.test.ts` redan använder för katalogväljaren i editorn, i en fil,
// eftersom tre sviter nu behöver den.

// `wOF2`, som en woff2 börjar — servern läser bytesen och inte namnet, så en fil som inte är ett
// typsnitt aldrig blir en asset. Sista byten skiljer två familjer åt, så de blir två assets.
const woff2 = (mark: number): Uint8Array<ArrayBuffer> => new Uint8Array(new Uint8Array([119, 79, 70, 50, 0, 1, 0, mark % 251]).buffer)

export type FontNet = {
  /** Varje adress som bads om, i ordning, så en svit kan säga vad trafiken faktiskt var. */
  asked: string[]
  undo(): void
}

export function watchFontNet(): FontNet {
  const asked: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) {
      // En typsnittsfil som hämtas någon annanstans ifrån än katalogen skrivs upp och besvaras
      // inte: bygget skeppar ingen sådan fil (K20, `felt-font.spec.ts`), och en svit som tyst
      // svarade på en hade dolt att någon börjat be om en.
      if (/\.(woff2?|ttf|otf)(\?|$)/.test(url)) {
        asked.push(url)
        return new Response('no font file ships with the build', { status: 404 })
      }
      return real(input as RequestInfo, init)
    }
    asked.push(url)
    if (url.startsWith('https://fonts.googleapis.com/')) {
      const family = new URL(url).searchParams.get('family')?.split(':')[0] ?? ''
      const slug = family.toLowerCase().replace(/ /g, '-')
      return new Response(`/* latin */\n@font-face { font-family: '${family}'; src: url(https://fonts.gstatic.com/s/${slug}/latin.woff2) format('woff2'); }\n`, { headers: { 'content-type': 'text/css' } })
    }
    return new Response(woff2(url.length), { headers: { 'content-type': 'font/woff2' } })
  }) as typeof fetch
  return { asked, undo: () => (globalThis.fetch = real) }
}
