// The answer to «Hur sitter ni?» (L75, #1130), and the memory of it. Apart from the question's
// window so the editor can remember an answer without loading that window and its stylesheet
// before anyone has pressed «Starta».
export type Seating = 'screen' | 'computer'
export type StartAnswer = { seating: Seating; name: string }

// The answer and the name are the host's, not the game's: the next table of any game asks with
// them chosen. Remembered in this browser only; a browser that refuses storage simply forgets.
const KEY = 'byd.start'

export function rememberedStart(): StartAnswer {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<StartAnswer> | null
    return { seating: kept?.seating === 'computer' ? 'computer' : 'screen', name: typeof kept?.name === 'string' ? kept.name : '' }
  } catch {
    return { seating: 'screen', name: '' }
  }
}

export function rememberStart(answer: StartAnswer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(answer))
  } catch {
    // Forgotten, as a browser without storage forgets everything else the tool remembers.
  }
}
