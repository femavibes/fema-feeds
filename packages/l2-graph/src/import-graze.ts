import type {
  L2AuthorCondition,
  L2GrazeStubCondition,
  L2HashtagCondition,
  L2RegexCondition,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'
import type { PostSearchField } from '@cfb/core-types'
import { newId } from './ids.js'

type GrazeMeta = { title?: string; description?: string; isCustomNode?: boolean }

function grazeSearchField(field: string): PostSearchField | null {
  if (field === 'text') return 'text'
  return null
}

function grazeStub(
  grazeType: string,
  payload: unknown,
  title?: string,
): L2GrazeStubCondition {
  return {
    type: 'graze_stub',
    id: newId('graze'),
    grazeType,
    payload,
    title,
  }
}

function grazeLeafToNode(
  key: string,
  payload: unknown,
  meta?: GrazeMeta,
): L2RuleNode | null {
  const title = meta?.title

  if (key === 'regex_matches' && Array.isArray(payload) && payload.length >= 2) {
    const field = String(payload[0])
    const pattern = String(payload[1])
    const caseInsensitive = payload[2] !== false
    const mapped = grazeSearchField(field)
    if (mapped) {
      const node: L2RegexCondition = {
        type: 'regex',
        id: newId('regex'),
        op: 'matches',
        pattern,
        fields: [mapped],
        caseInsensitive,
      }
      return node
    }
    return grazeStub(key, payload, title ?? field)
  }

  if (key === 'social_graph' && Array.isArray(payload) && payload.length >= 3) {
    const hub = String(payload[0])
    const mode = String(payload[1])
    const rawDir = String(payload[2])
    const direction =
      rawDir === 'followers' ? 'followers' : rawDir === 'both' ? 'both' : 'follows'
    const node: import('@cfb/core-types').L2FollowRingCondition = {
      type: 'follow_ring',
      id: newId('ring'),
      op: mode === 'not_in' ? 'excludes' : 'includes',
      hub,
      direction,
    }
    return node
  }

  if (key === 'social_list' && Array.isArray(payload) && payload.length >= 2) {
    const dids = Array.isArray(payload[0]) ? payload[0].map(String) : []
    const mode = String(payload[1])
    const node: L2AuthorCondition = {
      type: 'author',
      id: newId('author'),
      op: mode === 'not_in' ? 'not_in_list' : 'in_list',
      dids,
    }
    return node
  }

  if (key === 'list_member' && Array.isArray(payload) && payload.length >= 2) {
    const node: L2AuthorCondition = {
      type: 'author',
      id: newId('author'),
      op: payload[1] === 'not_in' ? 'not_in_list' : 'in_list',
      listId: String(payload[0]),
    }
    return node
  }

  if (key === 'entity_matches' && Array.isArray(payload) && payload.length >= 2) {
    const entity = String(payload[0])
    const values = Array.isArray(payload[1]) ? payload[1].map(String) : []
    if (entity === 'hashtags') {
      const node: L2HashtagCondition = {
        type: 'hashtag',
        id: newId('tag'),
        op: 'includes',
        tags: values,
      }
      return node
    }
    return grazeStub(key, payload, title ?? entity)
  }

  if (key === 'entity_excludes' && Array.isArray(payload) && payload.length >= 2) {
    const entity = String(payload[0])
    const values = Array.isArray(payload[1]) ? payload[1].map(String) : []
    if (entity === 'hashtags') {
      const node: L2HashtagCondition = {
        type: 'hashtag',
        id: newId('tag'),
        op: 'excludes',
        tags: values,
      }
      return node
    }
    return grazeStub(key, payload, title ?? entity)
  }

  return grazeStub(key, payload, title)
}

function parseGrazeObject(obj: Record<string, unknown>): L2RuleNode | null {
  const meta = obj.metadata as GrazeMeta | undefined

  if (Array.isArray(obj.and)) {
    const children = obj.and
      .map((item) => parseGrazeItem(item))
      .filter((n): n is L2RuleNode => n !== null)
    return {
      type: 'group',
      id: newId('group'),
      logic: 'all',
      label: meta?.title,
      children,
    }
  }

  if (Array.isArray(obj.or)) {
    const children = obj.or
      .map((item) => parseGrazeItem(item))
      .filter((n): n is L2RuleNode => n !== null)
    return {
      type: 'group',
      id: newId('group'),
      logic: 'any',
      label: meta?.title,
      children,
    }
  }

  const keys = Object.keys(obj).filter((k) => k !== 'metadata')
  if (keys.length === 0) return null
  const key = keys[0]!
  return grazeLeafToNode(key, obj[key], meta)
}

function parseGrazeItem(item: unknown): L2RuleNode | null {
  if (!item || typeof item !== 'object') return null
  return parseGrazeObject(item as Record<string, unknown>)
}

export function extractGrazeFilter(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  if (Array.isArray(obj.and) || Array.isArray(obj.or)) {
    return obj
  }

  const manifest = obj.manifest
  if (manifest && typeof manifest === 'object') {
    const filter = (manifest as Record<string, unknown>).filter
    if (filter && typeof filter === 'object') {
      return filter as Record<string, unknown>
    }
  }

  return null
}

export function isGrazeRules(raw: unknown): boolean {
  return extractGrazeFilter(raw) !== null
}

/** Import Graze manifest.filter (or full manifest) into nested L2 groups. */
export function importGrazeFilter(raw: unknown): L2RuleGroup | null {
  const filter = extractGrazeFilter(raw)
  if (!filter) return null

  const root = parseGrazeObject(filter)
  if (!root || root.type !== 'group') {
    const single = parseGrazeItem(filter)
    if (!single) return null
    return {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [single],
    }
  }

  return {
    ...root,
    id: 'root',
  }
}
