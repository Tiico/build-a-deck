import { svEditor } from './sv.editor.js'
import { svPlay } from './sv.play.js'
import { svAccount } from './sv.account.js'
import { svStatus } from './sv.status.js'

// Svenska är katalogen (A4): varje meddelande skrivs här först, och varje annat språk skrivs mot
// den nyckel för nyckel. En text som saknas i ett språk är ett typfel, inte en tom ruta.
//
// Nyckeln säger var texten hör hemma, inte vad den råkar heta just nu: `editor.tab.wall`, inte
// `kortvagg`. En text som en designer själv skrivit — korttext, regler, zonnamn — översätts
// aldrig; den är spelets språk, inte verktygets.
//
// `{namn}` i en text byts mot det anropet skickar med. Räkneord har `.one` och `.other`, och
// anropet väljer vilken; det är billigare att välja på plats än att bygga en plural-motor.
//
// Katalogen är delad per yta, så att två personer kan skriva i den samtidigt utan att mötas.
export const sv = {
  ...svEditor,
  ...svPlay,
  ...svAccount,
  ...svStatus,
} as const

export type Key = keyof typeof sv
export type Messages = Record<Key, string>
