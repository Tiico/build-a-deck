// Skriver variant­ernas skal till skal/<v>.html för rig.mts (#749). Varje fil har två delar:
// <!--head--> det som ställs i <head> före bygget egna skript, och <!--body--> det som står i #root
// tills React tömmer det vid sin första ritning.
//
//   node mk-skal.mjs
//
// Gemensamt för alla fyra:
//  - Ett skript i <head> läser språket som appen gör (A4, `detectLang`: ?lang=, sedan byd.lang i
//    localStorage, sedan webbläsarens språk) och vilken yta adressen är, och sätter html[lang],
//    html.js och html[data-yta]. Inga kataloger: orden står i skalet självt, så det beror inte på
//    hur #760 delar språkfilerna.
//  - Utan JavaScript står en <noscript>-rad i stället för «laddar», som annars skulle ljuga.
//  - Skalets grund ligger på skalet (position: fixed) och på html bara medan skalet finns
//    (html:has), så att inget av det dröjer kvar i appen efteråt.
//  - Skalets CSS är skriven med #byd-shell-id:n, så att det blockerande arket inte kan klä om
//    skalet när det kommer fram.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(HERE, 'skal'), { recursive: true })

const DETECT = `<script>!function(h,l){var p=l.pathname,g=new URLSearchParams(l.search).get('lang'),r;try{r=localStorage.getItem('byd.lang')}catch(e){}if(!/^(sv|en)$/.test(g))g=/^(sv|en)$/.test(r)?r:(navigator.languages||[navigator.language]).some(function(x){return/^sv/i.test(x)})?'sv':'en';h.lang=g;h.classList.add('js');h.setAttribute('data-yta',p=='/table'?(/[?&]mode=tv\\b/.test(l.search)?'tv':'bord'):p=='/observe'||p=='/online'?'bord':p=='/play'?'play':p=='/join'?'join':p=='/editor'?'editor':'app')}(document.documentElement,location)</script>`
const NOSCRIPT = `<noscript><p>build-your-deck behöver JavaScript. Slå på det och ladda om sidan.</p><p lang="en">build-your-deck needs JavaScript. Turn it on and reload the page.</p></noscript>`

// Orden, per röst (D5:s fyra röster; /join talar med appens, se NOTES) och språk: [laddar-rubrik,
// laddar-text, dröjer-rubrik, dröjer-text]. Rubrikerna är katalogens (status.loading.* och
// status.slow.*); dröjer-texten är ny, eftersom katalogens ber om «försök igen» och skalet inte har
// något att trycka på.
const WORDS = {
  sv: {
    m: 'Laddar',
    app: ['Hämtar…', 'Det brukar ta en sekund.', 'Det här tar längre tid än vanligt', 'Vi hämtar fortfarande sidan. Den kommer av sig själv.'],
    table: ['Dukar bordet…', 'Bordet hämtas.', 'Bordet dröjer', 'Vi hämtar fortfarande sidan. Ingen behöver göra något än.'],
    phone: ['Hämtar din hand…', 'Ett ögonblick.', 'Det tar längre tid än vanligt', 'Vi hämtar fortfarande sidan. Din plats står kvar.'],
    editor: ['Öppnar spelet…', 'Vi hämtar leken.', 'Spelet dröjer', 'Vi hämtar fortfarande sidan.'],
  },
  en: {
    m: 'Loading',
    app: ['Fetching…', 'This usually takes a second.', 'This is taking longer than usual', 'We are still fetching the page. It will appear by itself.'],
    table: ['Setting the table…', 'The table is on its way.', 'The table is taking its time', 'We are still fetching the page. Nobody has to do anything yet.'],
    phone: ['Fetching your hand…', 'One moment.', 'It is taking longer than usual', 'We are still fetching the page. Your seat is kept.'],
    editor: ['Opening the game…', 'We are fetching the deck.', 'The game is taking its time', 'We are still fetching the page.'],
  },
}
// Bara de delar en variant använder följer med, så att byten är variantens egna.
const words = (parts) => JSON.stringify(Object.fromEntries(Object.entries(WORDS).map(([lang, w]) => [lang, Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Array.isArray(v) ? parts.map((i) => v[i]) : v]))])))
// Fyller i orden för ytans röst, och byter till dröjer-orden 4 s efter navigeringens start
// (D5:s slowAfterMs). Klockan är dokumentets, inte skalets: performance.now() räknar från
// navigeringen, så raden står där vid samma tidpunkt hur sent skalet än målades.
const FILL = (parts, slow) => `<script>!function(h){var L=${words(parts)}[h.lang],T=L[{tv:'table',bord:'table',play:'phone',editor:'editor'}[h.getAttribute('data-yta')]||'app'],s=document.getElementById('byd-shell'),put=function(k,x){var e=s.querySelector('[data-k='+k+']');if(e)e.textContent=x};put('m',L.m);put('a',T[0]);put('b',T[1]);setTimeout(function(){${slow};s.setAttribute('data-slow','')},Math.max(0,4e3-performance.now()))}(document.documentElement)</script>`
const FONT = `system-ui,-apple-system,'Segoe UI',sans-serif`
// Gemensam ram: grunden, språkväxeln och noscript.
const BASE = (bg) => `#byd-shell{position:fixed;inset:0;box-sizing:border-box;background:${bg};font:14px/1.5 ${FONT}}html:has(#byd-shell){background:${bg}}#byd-shell *{box-sizing:border-box;margin:0}html:not(.js) #byd-shell>:not(noscript){display:none}#byd-shell noscript p{color:#dfe7f7;padding:24px;max-width:46ch}`

const V = {}

// A — Ett skal för alla: grunden och en rad, likadant på varje route. Bara språket skiljer.
// Raden «det tar längre» är ren CSS (en animation med 4 s fördröjning), så den behöver inget skript.
V.a = {
  head: `<style>${BASE('#14161c')}#byd-shell{display:grid;place-content:center;justify-items:center;gap:6px;padding:24px;text-align:center;color:#c9d1e3;font-size:clamp(16px,1.4vw,28px)}html:not([lang=en]) #byd-shell [lang=en],html[lang=en] #byd-shell [lang=sv]{display:none}#byd-shell .s{visibility:hidden;color:#9aa3b8;font-size:.85em;animation:byd-shell 0s 4s forwards}@keyframes byd-shell{to{visibility:visible}}</style>${DETECT}`,
  body: `<div id="byd-shell" data-byd-shell role="status"><p><span lang="sv">Laddar …</span><span lang="en">Loading …</span></p><p class="s"><span lang="sv">Det tar längre tid än vanligt.</span><span lang="en">This is taking longer than usual.</span></p>${NOSCRIPT}</div>`,
}

// B — Ruttens eget besked: D5:s laddar-läge i sidformen, byggt med samma mått som StatusNotice
// (status.css: page-ytan, väntans ton) och med ruttens egna ord. Appens första ram är samma
// form — editorns Suspense-reserv är ordagrant den, bordet och telefonen visar «Ansluter» — så
// övertagandet byter ord, inte bild. Efter 4 s: dröjer-orden.
V.b = {
  head: `<style>${BASE('#1f2637')}#byd-shell{display:grid;place-content:center;justify-items:start;gap:14px;padding:28px;color:#dfe7f7}#byd-shell .m{font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase}#byd-shell h1{font-size:26px;line-height:1.25;display:flex;gap:10px;align-items:center}#byd-shell p{max-width:46ch}#byd-shell .r{width:22px;height:22px;flex:none;border-radius:50%;border:3px solid currentcolor;border-top-color:transparent;animation:byd-shell 900ms linear infinite}@keyframes byd-shell{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){#byd-shell .r{animation:none;border-style:dashed;border-top-color:currentcolor;opacity:.75}}@media (max-width:700px){#byd-shell{padding:20px}#byd-shell h1{font-size:22px}}</style>${DETECT}`,
  body: `<div id="byd-shell" data-byd-shell role="status"><span class="m" data-k="m">Laddar</span><h1><span class="r"></span><span data-k="a">Hämtar…</span></h1><p data-k="b">Det brukar ta en sekund.</p>${NOSCRIPT}</div>${FILL([0, 1, 2, 3], "put('a',T[2]);put('b',T[3])")}`,
}

// C — Ruttens silhuett: ytans form i grått — filten och TV:ns sidokolumn, telefonens remsa,
// editorns krom och kortvägg, startsidans rader — med en rad text i mitten. Alla silhuetter står i
// skalet och CSS väljer ytans; det är vad det kostar att veta formen före skriptet.
const card = '<i class="k"></i>'
V.c = {
  head: `<style>${BASE('#14161c')}#byd-shell{color:#c9d1e3}#byd-shell>div{display:none;position:absolute;inset:0}#byd-shell .x{position:absolute;border-radius:14px;background:#1a1d25;border:1px solid #262a35}#byd-shell .k{display:inline-block;width:56px;height:80px;margin:0 -10px;border-radius:6px;background:#232838;border:1px solid #30364a}#byd-shell .t{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;padding:0 24px;font-size:clamp(16px,1.6vw,30px);font-weight:600}#byd-shell .t small{display:block;font-size:max(14px,.6em);font-weight:400;color:#9aa3b8;visibility:hidden}#byd-shell[data-slow] .t small{visibility:visible}html[data-yta=tv] #byd-shell .tv,html[data-yta=bord] #byd-shell .bord,html[data-yta=play] #byd-shell .play,html[data-yta=join] #byd-shell .join,html[data-yta=editor] #byd-shell .ed,html[data-yta=app] #byd-shell .app,html:not(.js) #byd-shell .app{display:block}#byd-shell .tv .f{inset:24px 384px 24px 24px}#byd-shell .tv .c{top:24px;right:24px;width:330px;height:150px}html[data-yta=tv] #byd-shell .t{right:384px}#byd-shell .bord .f{inset:16px}#byd-shell .play .h{left:0;right:0;top:0;height:56px;border-radius:0}#byd-shell .play .p{left:16px;right:16px;top:166px;height:78px}#byd-shell .play .w{left:16px;right:0;top:264px;height:188px;background:none;border:0;white-space:nowrap;overflow:hidden}#byd-shell .play .w .k{width:132px;height:186px;margin:0 10px 0 0;border-radius:14px}#byd-shell .play .o{left:0;right:0;bottom:0;height:64px;border-radius:0}#byd-shell .join .f{left:50%;top:230px;width:240px;height:170px;margin-left:-120px;border-radius:22px}#byd-shell .join .o{left:20px;right:20px;bottom:40px;height:240px}#byd-shell .ed .h{left:0;right:0;top:0;height:52px;border-radius:0}#byd-shell .ed .r{left:0;top:52px;bottom:0;width:260px;border-radius:0}#byd-shell .ed .g{left:300px;top:92px;right:40px;bottom:40px;background:none;border:0;display:flex;flex-wrap:wrap;gap:24px;align-content:start}#byd-shell .ed .g .k{margin:0;width:120px;height:168px}html[data-yta=editor] #byd-shell .t{left:260px}#byd-shell .app .f{left:50%;top:40px;width:min(920px,calc(100% - 40px));height:64px;transform:translateX(-50%)}#byd-shell .app .g{left:50%;top:140px;width:min(920px,calc(100% - 40px));height:200px;transform:translateX(-50%);background:none;border:0;display:flex;gap:16px}#byd-shell .app .g i{flex:1;border-radius:14px;background:#1a1d25;border:1px solid #262a35}</style>${DETECT}`,
  body: `<div id="byd-shell" data-byd-shell role="status"><div class="tv"><span class="x f"></span><span class="x c"></span></div><div class="bord"><span class="x f"></span></div><div class="play"><span class="x h"></span><span class="x p"></span><span class="x w">${card.repeat(3)}</span><span class="x o"></span></div><div class="join"><span class="x f"></span><span class="x o"></span></div><div class="ed"><span class="x h"></span><span class="x r"></span><span class="x g">${card.repeat(6)}</span></div><div class="app"><span class="x f"></span><span class="x g"><i></i><i></i><i></i></span></div><p class="t"><span data-k="a">Hämtar…</span><small data-k="b">Det här tar längre tid än vanligt</small></p>${NOSCRIPT}</div>${FILL([0, 2], '')}`,
}

// D — Märket och en rad: produktens ansikte (de två korten ur favicon, #729) mitt på
// grunden, och under det ruttens rad. Samma bild på varje route, större på en stor skärm.
const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(32 40)"><rect x="-13" y="-30" width="22" height="31" rx="3.5" fill="#3a4d7a" transform="rotate(-16)"/><rect x="-11" y="-30" width="22" height="31" rx="3.5" fill="#f4ead8" stroke="#14161c" stroke-width="1.5" transform="rotate(10)"/><circle cx="2.2" cy="-14.5" r="3.6" fill="#7dd3a0" transform="rotate(10)"/></g></svg>`
V.d = {
  head: `<style>${BASE('#14161c')}#byd-shell{display:grid;place-content:center;justify-items:center;gap:10px;padding:24px;text-align:center;color:#c9d1e3;font-size:clamp(15px,1.3vw,26px)}#byd-shell svg{width:clamp(72px,7vw,140px);height:auto}#byd-shell .w{font-weight:700;letter-spacing:.02em;color:#eef1f8;font-size:1.15em}#byd-shell .s{color:#9aa3b8;visibility:hidden}#byd-shell[data-slow] .s{visibility:visible}</style>${DETECT}`,
  body: `<div id="byd-shell" data-byd-shell role="status">${MARK}<p class="w">build-your-deck</p><p data-k="a">Hämtar…</p><p class="s" data-k="b">Det här tar längre tid än vanligt</p>${NOSCRIPT}</div>${FILL([0, 2], '')}`,
}

for (const [v, { head, body }] of Object.entries(V)) writeFileSync(join(HERE, 'skal', `${v}.html`), `<!--head-->\n${head}\n<!--body-->\n${body}\n`)
console.log('skrev', Object.keys(V).join(', '))
