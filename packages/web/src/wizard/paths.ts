// The two addresses a new game is begun at (L79, #1218): the crossroads, and the guide behind its
// first door. Kept apart from the page so the router, the tab's title and the login can know them
// without loading the guide.
export const CROSSROADS = '/new'
export const GUIDED = '/new/guided'
export const isNewGame = (path: string): boolean => path === CROSSROADS || path === GUIDED
