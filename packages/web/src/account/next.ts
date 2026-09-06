// Only a path on this site may be the landing after login: never an open redirect.
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
