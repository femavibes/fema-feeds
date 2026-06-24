import type { FeedConfig } from '@cfb/core-types'
import { isFeedPubliclyServed } from '@cfb/core-types'
import { buildPublishedFeedUri } from './uri.js'

function feedHasRules(feed: FeedConfig): boolean {
  const edges = feed.visualLayout?.edges
  if (edges?.length) {
    const adj = new Map<string, string[]>()
    for (const e of edges) {
      const list = adj.get(e.source) ?? []
      list.push(e.target)
      adj.set(e.source, list)
    }
    const paths: string[][] = []
    const walk = (node: string, acc: string[]) => {
      if (node === 'end') {
        paths.push(acc)
        return
      }
      for (const next of adj.get(node) ?? []) {
        if (next === 'end') paths.push(acc)
        else if (next !== 'start') walk(next, [...acc, next])
      }
    }
    walk('start', [])
    return paths.some((p) => p.length > 0)
  }
  return feed.match.children.length > 0
}

export interface PublishChecklistItem {
  id: string
  label: string
  ok: boolean
  hint?: string
}

export interface FeedPublishInfo {
  feedId: string
  name: string
  enabled: boolean
  published: boolean
  feedUri: string | null
  generatorDid: string | null
  publicBaseUrl: string | null
  describeUrl: string | null
  skeletonUrl: string | null
  candidateCount: number | null
  checklist: PublishChecklistItem[]
  /** Pre-publish prerequisites met (Update live, rules, candidates, feedgen URL). */
  readyToPublish: boolean
  ready: boolean
  feedgenReady: boolean
  blueskyLive: boolean
}

export function buildFeedPublishInfo(
  feed: FeedConfig,
  options: {
    serviceDid: string
    publisherDid: string
    publicBaseUrl: string
    candidateCount?: number | null
    blueskyRecordPublished?: boolean
    blueskyRecordNeedsRepublish?: boolean
  },
): FeedPublishInfo {
  const {
    serviceDid,
    publisherDid,
    publicBaseUrl,
    candidateCount,
    blueskyRecordPublished = false,
    blueskyRecordNeedsRepublish = false,
  } = options
  const base = publicBaseUrl.replace(/\/$/, '')
  const hasServiceDid = Boolean(serviceDid.trim())
  const hasPublisherDid = Boolean(publisherDid.trim())
  const feedUri = hasPublisherDid ? buildPublishedFeedUri(publisherDid, feed) : null
  const hasRules = feedHasRules(feed)
  const hasCandidates = (candidateCount ?? 0) > 0
  const isPublished = Boolean(feed.published)
  const checklist: PublishChecklistItem[] = [
    {
      id: 'generator_did',
      label: 'Feedgen service DID (did:web)',
      ok: hasServiceDid && serviceDid.startsWith('did:web:'),
      hint: hasServiceDid
        ? serviceDid.startsWith('did:web:')
          ? undefined
          : 'Use your public HTTPS URL — service DID must be did:web:your-host, not your account DID'
        : 'Set public feedgen URL in Settings → Feed publishing',
    },
    {
      id: 'public_url',
      label: 'Public feedgen URL reachable',
      ok: Boolean(publicBaseUrl && !publicBaseUrl.includes('localhost')),
      hint: 'Set Settings → Feed publishing (Cloudflare tunnel for home, DuckDNS for VPS)',
    },
    {
      id: 'feed_enabled',
      label: 'Live rules deployed (Update)',
      ok: feed.enabled,
      hint: 'Click Update to make draft rules live and rebuild the candidate list',
    },
    {
      id: 'match_rules',
      label: 'L2 rules wired on canvas',
      ok: hasRules,
      hint: 'Open the visual editor and connect at least one path from START to FEED',
    },
    {
      id: 'candidates',
      label: 'Candidate list built for skeleton',
      ok: hasCandidates,
      hint: 'Update rebuilds from the L1 pool. Ingest adds new matches automatically.',
    },
    {
      id: 'published',
      label: 'Marked public in feedgen',
      ok: isPublished,
      hint: 'Publish turns on describeFeedGenerator + getFeedSkeleton for this feed',
    },
    {
      id: 'bluesky_record',
      label: 'Generator record on Bluesky (your PDS)',
      ok: blueskyRecordPublished,
      hint: blueskyRecordPublished
        ? undefined
        : blueskyRecordNeedsRepublish
          ? 'Bluesky record points at the wrong service DID — click Publish to Bluesky again after the feedgen fix'
          : 'Publish creates the generator record on your account so bsky.app can find your feedgen',
    },
    {
      id: 'skeleton',
      label: 'getFeedSkeleton returns posts',
      ok: isPublished && hasCandidates,
    },
  ]

  const prePublishIds = new Set([
    'generator_did',
    'public_url',
    'feed_enabled',
    'match_rules',
    'candidates',
  ])

  const readyToPublish = checklist.filter((c) => prePublishIds.has(c.id)).every((c) => c.ok)

  const feedgenReady =
    isFeedPubliclyServed(feed) && readyToPublish && isPublished && hasCandidates

  const blueskyLive = feedgenReady && blueskyRecordPublished

  return {
    feedId: feed.feedId,
    name: feed.name,
    enabled: feed.enabled,
    published: isPublished,
    feedUri,
    generatorDid: hasServiceDid ? serviceDid : null,
    publicBaseUrl: base,
    describeUrl: hasServiceDid ? `${base}/xrpc/app.bsky.feed.describeFeedGenerator` : null,
    skeletonUrl: feedUri
      ? `${base}/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(feedUri)}&limit=50`
      : null,
    candidateCount: candidateCount ?? null,
    checklist,
    readyToPublish,
    ready: blueskyLive,
    feedgenReady,
    blueskyLive,
  }
}
