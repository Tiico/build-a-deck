import type { Lang } from '../i18n/index.js'

// A game's words in the designer's language, and what the icon libraries call them (#1087, L71).
// Both libraries name their icons in English, so a designer building in Swedish (A4) would find
// nothing under «svärd». The list is short on purpose and is a game's vocabulary — what a card
// type, a resource or an effect is called — rather than a dictionary; a word not in it is still
// searched as written, so an English word always works. A key is matched from its start, so
// «sköl» finds what «sköld» finds while it is being typed.
export const ICON_WORDS: Partial<Record<Lang, Readonly<Record<string, readonly string[]>>>> = {
  sv: {
    anfall: ['sword', 'attack'], attack: ['sword', 'attack'], försvar: ['shield'], skada: ['damage', 'blood'], läka: ['heal', 'health'], liv: ['heart', 'health', 'life'],
    svärd: ['sword'], sköld: ['shield'], hjärta: ['heart'], dolk: ['dagger'], yxa: ['axe'], spjut: ['spear'], båge: ['bow'], pil: ['arrow'], hammare: ['hammer'], klubba: ['club', 'mace'],
    hjälm: ['helmet'], rustning: ['armor'], kanon: ['cannon'], bomb: ['bomb'], krut: ['powder'],
    mynt: ['coin'], guld: ['gold', 'coin'], pengar: ['coin', 'money'], silver: ['silver'], skatt: ['treasure', 'chest'], kista: ['chest'], ädelsten: ['gem'], juvel: ['gem', 'jewel'], diamant: ['diamond', 'gem'], kristall: ['crystal'],
    trä: ['wood', 'log'], sten: ['stone', 'rock'], järn: ['iron', 'ore'], malm: ['ore'], vete: ['wheat'], säd: ['wheat', 'grain'], mat: ['food', 'meat', 'bread'], bröd: ['bread'], kött: ['meat'], äpple: ['apple'], fisk: ['fish'], öl: ['beer'], vin: ['wine'],
    magi: ['magic', 'spell'], trollstav: ['wand'], besvärjelse: ['spell'], runa: ['rune'], dryck: ['potion', 'drink'], elixir: ['potion'], gift: ['poison'], kittel: ['cauldron'], bok: ['book'], skriftrulle: ['scroll'], kort: ['card'], tärning: ['dice', 'die'],
    eld: ['fire', 'flame'], låga: ['flame'], vatten: ['water', 'drop'], droppe: ['drop'], is: ['ice'], snö: ['snow'], blixt: ['lightning', 'bolt'], vind: ['wind'], moln: ['cloud'], sol: ['sun'], måne: ['moon'], stjärna: ['star'], jord: ['earth'], berg: ['mountain'], skog: ['forest', 'tree'], träd: ['tree'], löv: ['leaf'], blomma: ['flower'], ros: ['rose'], svamp: ['mushroom'],
    drake: ['dragon'], varg: ['wolf'], häst: ['horse'], katt: ['cat'], hund: ['dog'], fågel: ['bird'], uggla: ['owl'], orm: ['snake'], spindel: ['spider'], björn: ['bear'], lejon: ['lion'], fjäder: ['feather'], tass: ['paw'], klo: ['claw'], ben: ['bone'], dödskalle: ['skull'], spöke: ['ghost'], zombie: ['zombie'], vampyr: ['vampire'], demon: ['demon'], ängel: ['angel'],
    kung: ['king', 'crown'], drottning: ['queen'], krona: ['crown'], riddare: ['knight'], bonde: ['pawn', 'farmer'], präst: ['priest'], trollkarl: ['wizard'], häxa: ['witch'], tjuv: ['thief'], mask: ['mask'], slott: ['castle'], torn: ['tower'], hus: ['house'], by: ['village'], stad: ['city'], tält: ['tent'], skepp: ['ship'], båt: ['boat'], ankare: ['anchor'], karta: ['map'], kompass: ['compass'], flagga: ['flag'], vägg: ['wall'], dörr: ['door'], nyckel: ['key'], lås: ['lock'],
    öga: ['eye'], hand: ['hand'], näve: ['fist'], fot: ['foot'], stövel: ['boot'], hjärna: ['brain'], tand: ['tooth'],
    klocka: ['clock'], timglas: ['hourglass'], tid: ['time', 'hourglass'], fackla: ['torch'], ljus: ['candle', 'light'], lykta: ['lantern'], lägereld: ['campfire'],
    pokal: ['trophy'], medalj: ['medal'], seger: ['trophy', 'victory'], poäng: ['score', 'star'], energi: ['energy', 'battery'], kraft: ['power', 'strength'], fart: ['speed'], skydd: ['shield', 'protect'],
    spader: ['spade'], hjärter: ['heart'], ruter: ['diamond'], klöver: ['club'], schack: ['chess'], pjäs: ['pawn'],
    plus: ['plus'], minus: ['minus'], upp: ['up'], ner: ['down'], vänster: ['left'], höger: ['right'], kryss: ['cross'], bock: ['check'],
  },
}
