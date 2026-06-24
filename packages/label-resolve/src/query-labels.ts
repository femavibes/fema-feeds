import type { LabelerLabel, NormalizedPost } from '@cfb/core-types'
import { allLabelValues } from '@cfb/core-types'

const PUBLIC_API = process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app'

export interface AtprotoLabel {
  val: string
  src: string
  uri?: string
  cid?: string
  cts?: string
  /** When true, this event removes the label. */
  neg?: boolean
}

export interface QueryLabelsOptions {
  publicApiBase?: string
  fetch?: typeof fetch
}

/** Fetch labels from specific labeler DIDs for post + author subjects. */
export async function queryLabels(
  uriPatterns: string[],
  sources: string[],
  options: QueryLabelsOptions = {},
): Promise<AtprotoLabel[]> {
  if (uriPatterns.length === 0 || sources.length === 0) return []

  const base = options.publicApiBase ?? PUBLIC_API
  const fetchFn = options.fetch ?? fetch
  const params = new URLSearchParams()
  for (const uri of uriPatterns) params.append('uriPatterns', uri)
  for (const src of sources) params.append('sources', src)

  const url = `${base}/xrpc/com.atproto.label.queryLabels?${params}`
  const res = await fetchFn(url)
  if (!res.ok) {
    throw new Error(`queryLabels failed: ${res.status}`)
  }
  const data = (await res.json()) as { labels?: AtprotoLabel[] }
  return (data.labels ?? []).filter((l) => l.val && l.src)
}

const authorProfileUri = (did: string): string =>
  `at://${did}/app.bsky.actor.profile/self`

/** Keep labels that apply to this post or the author's account. */
export function filterLabelsForPost(
  labels: AtprotoLabel[],
  postUri: string,
  authorDid: string,
): AtprotoLabel[] {
  return labels.filter((l) => {
    const subject = l.uri ?? ''
    if (!subject) return true
    if (subject === postUri) return true
    if (subject === authorDid) return true
    if (subject === authorProfileUri(authorDid)) return true
    if (subject.startsWith(`at://${authorDid}/`)) return true
    return false
  })
}

/** Map API labels to labeler labels, dropping self-label duplicates. */
export function toLabelerLabels(
  labels: AtprotoLabel[],
  post: Pick<NormalizedPost, 'authorDid' | 'selfLabels'>,
): LabelerLabel[] {
  const self = new Set(post.selfLabels.map((v) => v.toLowerCase()))
  const seen = new Set<string>()
  const out: LabelerLabel[] = []

  for (const l of labels) {
    if (l.src === post.authorDid && self.has(l.val.toLowerCase())) continue
    const key = `${l.src}\0${l.val}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ val: l.val, src: l.src })
  }
  return out
}

export interface ResolvePostLabelsOptions extends QueryLabelsOptions {
  labelerDids: string[]
}

/** Query labelers and merge into a normalized post. */
export async function resolveLabelerLabelsForPost(
  post: NormalizedPost,
  options: ResolvePostLabelsOptions,
): Promise<NormalizedPost> {
  const { labelerDids, ...queryOpts } = options
  if (labelerDids.length === 0) return post

  const raw = await queryLabels([post.uri, post.authorDid], labelerDids, queryOpts)
  const filtered = filterLabelsForPost(raw, post.uri, post.authorDid)
  const labelerLabels = toLabelerLabels(filtered, post)

  return {
    ...post,
    labelerLabels,
    allLabelVals: allLabelValues({ selfLabels: post.selfLabels, labelerLabels }),
  }
}
