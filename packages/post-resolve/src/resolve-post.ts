import type { NormalizedPost } from '@cfb/core-types'
import {
  normalizeJetstreamPost,
  type JetstreamPostEvent,
} from '@cfb/post-normalize'
import { parsePostUri } from './parse-post-uri.js'
import { extractPostInput } from './extract-post-input.js'

const PUBLIC_API =
  typeof process !== 'undefined'
    ? (process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app')
    : 'https://public.api.bsky.app'

export interface PostResolveOptions {
  publicApiBase?: string
  fetch?: typeof fetch
}

async function resolveActorToDid(
  actor: string,
  base: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const url = `${base}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Failed to resolve profile ${actor}: ${res.status}`)
  const data = (await res.json()) as { did?: string }
  if (!data.did) throw new Error(`No DID for profile ${actor}`)
  return data.did
}

async function resolveToAtUri(
  input: string,
  base: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const extracted = extractPostInput(input)
  if (!extracted.ok) throw new Error(extracted.error)

  const parsed = parsePostUri(extracted.value)
  if (!parsed) throw new Error('Invalid post URL or URI')

  if (parsed.atUri) return parsed.atUri

  const did = await resolveActorToDid(parsed.resolveActor!.actor, base, fetchFn)
  return `at://${did}/app.bsky.feed.post/${parsed.resolveActor!.rkey}`
}

interface FeedPostView {
  uri?: string
  cid?: string
  author?: { did?: string }
  record?: JetstreamPostEvent['record']
  indexedAt?: string
}

function viewToEvent(view: FeedPostView, atUri: string): JetstreamPostEvent {
  const author = view.author?.did
  if (!view.uri || !view.cid || !author) {
    throw new Error(`Post not found or incomplete: ${atUri}`)
  }
  return {
    uri: view.uri,
    cid: view.cid,
    author,
    record: view.record ?? {},
    time: view.indexedAt ?? new Date().toISOString(),
  }
}

/** Fetch a post by https URL or at:// URI and return NormalizedPost. */
export async function resolvePostInput(
  input: string,
  options: PostResolveOptions = {},
): Promise<NormalizedPost> {
  const fetchFn = options.fetch ?? fetch
  const base = options.publicApiBase ?? PUBLIC_API
  const atUri = await resolveToAtUri(input, base, fetchFn)

  const params = new URLSearchParams({ uris: atUri })
  const url = `${base}/xrpc/app.bsky.feed.getPosts?${params}`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`getPosts failed: ${res.status}`)

  const data = (await res.json()) as { posts?: FeedPostView[] }
  const view = data.posts?.[0]
  if (!view) throw new Error(`Post not found: ${atUri}`)

  return normalizeJetstreamPost(viewToEvent(view, atUri))
}

export { parsePostUri, isPostUri } from './parse-post-uri.js'
