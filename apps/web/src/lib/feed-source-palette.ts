import type { FeedSourcesConfig, NativeFeedSource } from '@cfb/core-types'
import type { PaletteSourceEntry } from '../components/l2/visual/palette'
import { scoutSourceEnabled, substituteSourceEnabled } from './feed-source-defaults'

export function buildPaletteSourceEntries(sources?: FeedSourcesConfig): PaletteSourceEntry[] {
  const entries: PaletteSourceEntry[] = []

  if (scoutSourceEnabled(sources) && sources?.scout) {
    const scoutCount = sources.scout.scouts?.length ?? 0
    const derive = sources.scout.autoDerive
    entries.push({
      kind: 'source',
      sourceId: 'scout',
      sourceType: 'scout',
      label: 'Scout',
      description: derive
        ? `Auto scouts + ${scoutCount} manual`
        : `${scoutCount} scout account${scoutCount === 1 ? '' : 's'}`,
    })
  }

  if (substituteSourceEnabled(sources) && sources?.substitute) {
    const n = sources.substitute.pathways.length
    entries.push({
      kind: 'source',
      sourceId: 'substitute',
      sourceType: 'substitute',
      label: 'Substitute',
      description: `${n} promotion pathway${n === 1 ? '' : 's'}`,
    })
  }

  for (const [i, src] of (sources?.native ?? []).entries()) {
    entries.push(nativeSourceToPaletteEntry(src, i))
  }

  return entries
}

function nativeSourceToPaletteEntry(src: NativeFeedSource, index: number): PaletteSourceEntry {
  const sourceId = `source-${index}`
  if (src.type === 'feed') {
    return {
      kind: 'source',
      sourceId,
      sourceType: 'feed',
      label: src.feedId,
      description: 'Feed candidates',
    }
  }
  if (src.type === 'project_pool') {
    return {
      kind: 'source',
      sourceId,
      sourceType: 'project_pool',
      label: src.projectId,
      description: 'Project pool',
    }
  }
  return {
    kind: 'source',
    sourceId,
    sourceType: 'static_uri_list',
    label: `${src.uris.length} URIs`,
    description: 'Static URI list',
  }
}

export function ingressSourceLabel(sourceId: string): string {
  if (sourceId === 'scout') return 'Scout'
  if (sourceId === 'substitute') return 'Substitute'
  if (sourceId === 'start') return 'START'
  if (sourceId === 'end') return 'FEED'
  if (/^source-\d+$/.test(sourceId)) return sourceId.replace('source-', 'Source ')
  return sourceId
}

export function isIngressSourceNodeId(nodeId: string): boolean {
  return nodeId === 'scout' || nodeId === 'substitute' || /^source-\d+$/.test(nodeId)
}
