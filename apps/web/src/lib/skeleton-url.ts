/** Human-readable skeleton page on the public feedgen host (JSON API for Bluesky). */
export function skeletonUrlForBrowser(apiUrl: string): string {
  try {
    const url = new URL(apiUrl)
    url.searchParams.set('format', 'html')
    return url.toString()
  } catch {
    const join = apiUrl.includes('?') ? '&' : '?'
    return `${apiUrl}${join}format=html`
  }
}

/** Force JSON for API clients / raw inspection (overrides browser Accept: text/html). */
export function skeletonUrlForJson(apiUrl: string): string {
  try {
    const url = new URL(apiUrl)
    url.searchParams.set('format', 'json')
    return url.toString()
  } catch {
    const join = apiUrl.includes('?') ? '&' : '?'
    return `${apiUrl}${join}format=json`
  }
}
