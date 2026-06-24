import type {
  FeedConfig,
  L2ArithmeticOp,
  L2BoolField,
  L2CompareOp,
  L2Expr,
  L2GroupLogic,
  L2MediaStatMetric,
  L2MediaTypeValue,
  L2NumericField,
  L2RuleGroup,
  L2RuleNode,
  PostKind,
} from '@cfb/core-types'
import { DEFAULT_SEARCH_FIELDS } from './search-fields'

export const L2_GROUP_LOGIC: L2GroupLogic[] = ['any', 'all', 'n_of', 'none']

export const L2_NUMERIC_FIELDS: L2NumericField[] = [
  'like_count',
  'repost_count',
  'reply_count',
  'quote_count',
  'bookmark_count',
  'author_follower_count',
  'author_follows_count',
  'author_posts_count',
  'facet_tag_count',
  'hidden_facet_tag_count',
  'outline_tag_count',
  'text_length',
  'media_type',
  'post_age_hours',
  'image_count',
  'image_max_size_bytes',
  'image_min_size_bytes',
  'image_total_size_bytes',
  'image_max_aspect_w',
  'image_max_aspect_h',
  'video_size_bytes',
  'video_aspect_w',
  'video_aspect_h',
  'link_thumb_size_bytes',
  'facet_link_count',
  'facet_mention_count',
]

export const L2_MEDIA_STAT_METRICS: L2MediaStatMetric[] = [
  'image_count',
  'image_max_size_bytes',
  'image_min_size_bytes',
  'image_total_size_bytes',
  'image_max_aspect_w',
  'image_max_aspect_h',
  'video_size_bytes',
  'video_aspect_w',
  'video_aspect_h',
  'link_thumb_size_bytes',
  'facet_link_count',
  'facet_mention_count',
]

export function mediaStatLabel(metric: L2MediaStatMetric): string {
  return fieldLabel(metric)
}

export const L2_MEDIA_TYPE_VALUES: L2MediaTypeValue[] = [0, 1, 2, 3, 4, 5]

export function mediaTypeLabel(value: L2MediaTypeValue): string {
  switch (value) {
    case 0:
      return 'Text only'
    case 1:
      return 'Image'
    case 2:
      return 'Video'
    case 3:
      return 'GIF'
    case 4:
      return 'Link card'
    case 5:
      return 'Quote embed'
  }
}

export const L2_BOOL_FIELDS: L2BoolField[] = [
  'has_video',
  'has_image',
  'has_link_card',
  'has_quote',
  'has_record',
  'has_text_only',
]

export const L2_POST_KINDS: PostKind[] = ['root', 'reply', 'quote', 'repost']

export const L2_COMPARE_OPS: L2CompareOp[] = ['>=', '>', '<=', '<', '==', '!=']

export const L2_ARITH_OPS: L2ArithmeticOp[] = ['+', '-', '*', '/']

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}

export function emptyFeed(projectId: string, feedId: string, name: string): FeedConfig {
  return {
    feedId,
    projectId,
    name,
    enabled: false,
    published: false,
    poolScope: 'project_only',
    match: {
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [],
    },
  }
}

export function newGroup(logic: L2GroupLogic = 'all'): L2RuleGroup {
  return { type: 'group', id: newId('group'), logic, children: [] }
}

export function newAndGroup(): L2RuleGroup {
  return newGroup('all')
}

export function newOrGroup(): L2RuleGroup {
  return newGroup('any')
}

export function newNOfGroup(minPass = 2): L2RuleGroup {
  return { type: 'group', id: newId('group'), logic: 'n_of', minPass, children: [] }
}

export function newTextCondition(): L2RuleNode {
  return { type: 'text', id: newId('text'), field: 'text', op: 'contains', value: '' }
}

export function newKeywordCondition(): L2RuleNode {
  return {
    type: 'keyword',
    id: newId('kw'),
    op: 'includes',
    terms: [],
    fields: [...DEFAULT_SEARCH_FIELDS],
  }
}

export function newRegexCondition(): L2RuleNode {
  return {
    type: 'regex',
    id: newId('regex'),
    op: 'matches',
    pattern: '',
    fields: [...DEFAULT_SEARCH_FIELDS],
    caseInsensitive: true,
  }
}

export function newHashtagCondition(): L2RuleNode {
  return { type: 'hashtag', id: newId('tag'), op: 'includes', tags: [] }
}

export function newUrlCondition(): L2RuleNode {
  return {
    type: 'url',
    id: newId('url'),
    op: 'includes',
    patterns: [],
    sources: ['link_card', 'facet_link', 'bridgy_original'],
  }
}

export function newMentionCondition(): L2RuleNode {
  return { type: 'mention', id: newId('mention'), op: 'includes', accounts: [] }
}

export function followRingCacheListId(nodeId: string): string {
  return `follow_ring:${nodeId}`
}

export function newFollowRingCondition(): L2RuleNode {
  return {
    type: 'follow_ring',
    id: newId('ring'),
    op: 'includes',
    hubSource: 'account',
    hub: '',
    direction: 'followers',
    pollIntervalMinutes: 60,
  }
}

export function newBoolCondition(field: L2BoolField = 'has_video'): L2RuleNode {
  return { type: 'bool', id: newId('bool'), field, value: true }
}

export function newEmbedCondition(field: L2BoolField = 'has_video'): L2RuleNode {
  return newBoolCondition(field)
}

export function newLanguageCondition(): L2RuleNode {
  return { type: 'language', id: newId('lang'), allow: ['en'], unknown: 'exclude' }
}

export function newPostKindCondition(kind: PostKind = 'root'): L2RuleNode {
  return { type: 'post_kind', id: newId('kind'), kinds: [kind], op: 'is' }
}

export function newLabelsCondition(): L2RuleNode {
  return {
    type: 'labels',
    id: newId('labels'),
    op: 'includes',
    values: ['porn'],
    scope: 'all',
  }
}

export function newAuthorCondition(): L2RuleNode {
  return { type: 'author', id: newId('author'), op: 'in_list', dids: [] }
}

export function newCompareCondition(): L2RuleNode {
  return {
    type: 'compare',
    id: newId('math'),
    left: { type: 'field', field: 'like_count' },
    op: '>=',
    right: { type: 'literal', value: 10 },
  }
}

export function newMediaTypeCondition(): L2RuleNode {
  return { type: 'media_type', id: newId('media'), op: 'is', mediaTypes: [1] }
}

export function newAltTextCondition(): L2RuleNode {
  return { type: 'alt_text', id: newId('alt'), op: 'has' }
}

export function newPostAgeCondition(): L2RuleNode {
  return {
    type: 'post_age',
    id: newId('age'),
    op: 'newer_than',
    hours: 24,
    use: 'indexed_at',
  }
}

export function newMediaStatsCondition(): L2RuleNode {
  return {
    type: 'media_stats',
    id: newId('media-stat'),
    metric: 'image_count',
    op: '>=',
    value: 3,
  }
}

export function newMimeTypeCondition(): L2RuleNode {
  return {
    type: 'mime_type',
    id: newId('mime'),
    op: 'includes',
    pattern: 'image/jpeg',
  }
}

export function newLogicBlockRef(pkg: {
  id: string
  version: string
  name: string
}): L2RuleNode {
  return {
    type: 'logic_block_ref',
    id: newId('logic'),
    packageId: pkg.id,
    versionPin: pkg.version,
    label: pkg.name,
    updatePolicy: 'pinned',
  }
}

export function defaultRankExpr(): L2Expr {
  return {
    type: 'binary',
    op: '+',
    left: { type: 'field', field: 'like_count' },
    right: { type: 'field', field: 'repost_count' },
  }
}

export function parseTags(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^#+/, ''))
    .filter(Boolean)
}

export function formatTags(tags: string[] | undefined): string {
  return (tags ?? []).join(', ')
}

export function fieldLabel(field: string): string {
  switch (field) {
    case 'like_count':
      return 'Likes'
    case 'repost_count':
      return 'Reposts'
    case 'reply_count':
      return 'Replies'
    case 'quote_count':
      return 'Quotes'
    case 'bookmark_count':
      return 'Bookmarks'
    case 'author_follower_count':
      return 'Author followers'
    case 'author_follows_count':
      return 'Author follows'
    case 'author_posts_count':
      return 'Author posts'
    case 'facet_tag_count':
      return 'Hashtag count'
    case 'hidden_facet_tag_count':
      return 'Hidden hashtag count'
    case 'outline_tag_count':
      return 'Outline tag count'
    case 'text_length':
      return 'Text length'
    case 'media_type':
      return 'Media type (0–5)'
    case 'post_age_hours':
      return 'Post age (hours, indexed)'
    case 'image_count':
      return 'Image count'
    case 'image_max_size_bytes':
      return 'Largest image (bytes)'
    case 'image_min_size_bytes':
      return 'Smallest image (bytes)'
    case 'image_total_size_bytes':
      return 'Total image size (bytes)'
    case 'image_max_aspect_w':
      return 'Largest image aspect width'
    case 'image_max_aspect_h':
      return 'Largest image aspect height'
    case 'video_size_bytes':
      return 'Video size (bytes)'
    case 'video_aspect_w':
      return 'Video aspect width'
    case 'video_aspect_h':
      return 'Video aspect height'
    case 'link_thumb_size_bytes':
      return 'Link card thumb size (bytes)'
    case 'facet_link_count':
      return 'Link facet count'
    case 'facet_mention_count':
      return 'Mention facet count'
    case 'has_video':
      return 'Has video'
    case 'has_image':
      return 'Has image'
    case 'has_link_card':
      return 'Link card'
    case 'has_quote':
      return 'Quote embed'
    case 'has_record':
      return 'Record / repost embed'
    case 'has_text_only':
      return 'Text only (no embed)'
    case 'root':
      return 'Top-level post'
    case 'reply':
      return 'Reply'
    case 'quote':
      return 'Quote post'
    case 'repost':
      return 'Repost'
    default:
      return field.replace(/_/g, ' ')
  }
}

export function updateGroup(
  root: L2RuleGroup,
  groupId: string,
  updater: (g: L2RuleGroup) => L2RuleGroup,
): L2RuleGroup {
  if (root.id === groupId) return updater(root)
  return {
    ...root,
    children: root.children.map((child) =>
      child.type === 'group' ? updateGroup(child, groupId, updater) : child,
    ),
  }
}

export function removeNode(root: L2RuleGroup, nodeId: string): L2RuleGroup {
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== nodeId)
      .map((c) => (c.type === 'group' ? removeNode(c, nodeId) : c)),
  }
}

export function findInMatch(
  root: L2RuleGroup,
  nodeId: string,
): L2RuleGroup | L2RuleNode | null {
  if (root.id === nodeId) return root
  for (const child of root.children) {
    if (child.id === nodeId) return child
    if (child.type === 'group') {
      const found = findInMatch(child, nodeId)
      if (found) return found
    }
  }
  return null
}

/** Author list IDs referenced by author conditions anywhere in the feed rule tree. */
export function collectAuthorListIdsFromMatch(root: L2RuleGroup): Set<string> {
  const ids = new Set<string>()
  const walk = (node: L2RuleNode) => {
    if (node.type === 'author' && node.listId) ids.add(node.listId)
    if (node.type === 'group') node.children.forEach(walk)
  }
  walk(root)
  return ids
}

export function updateInMatch(
  root: L2RuleGroup,
  nodeId: string,
  next: L2RuleNode,
): L2RuleGroup {
  if (root.id === nodeId && next.type === 'group') return next
  return {
    ...root,
    children: root.children.map((child) => {
      if (child.id === nodeId) return next
      if (child.type === 'group') return updateInMatch(child, nodeId, next)
      return child
    }),
  }
}

export function addToGroup(
  root: L2RuleGroup,
  groupId: string,
  child: L2RuleNode,
): L2RuleGroup {
  return updateGroup(root, groupId, (g) => ({
    ...g,
    children: [...g.children, child],
  }))
}

export function findParentId(root: L2RuleGroup, nodeId: string): string | null {
  if (root.id === nodeId) return null
  function walk(group: L2RuleGroup): string | null {
    for (const child of group.children) {
      if (child.id === nodeId) return group.id
      if (child.type === 'group') {
        const found = walk(child)
        if (found) return found
      }
    }
    return null
  }
  return walk(root)
}

function groupContains(root: L2RuleGroup, ancestorId: string, descendantId: string): boolean {
  const ancestor = findInMatch(root, ancestorId)
  if (!ancestor || ancestor.type !== 'group') return false
  return findInMatch(ancestor, descendantId) !== null
}

/** Move a node up one level — out of its immediate parent group. */
export function extractNodeFromGroup(root: L2RuleGroup, nodeId: string): L2RuleGroup {
  if (nodeId === root.id) return root
  const parentId = findParentId(root, nodeId)
  if (!parentId || parentId === root.id) return root
  const node = findInMatch(root, nodeId)
  if (!node) return root
  const lifted = removeNode(root, nodeId)
  const grandparentId = findParentId(root, parentId)
  if (!grandparentId || grandparentId === root.id) {
    return { ...lifted, children: [...lifted.children, node] }
  }
  return addToGroup(lifted, grandparentId, node)
}

/** Whether a node is a direct child of the feed root group. */
export function isTopLevelMatchNode(root: L2RuleGroup, nodeId: string): boolean {
  return root.children.some((c) => c.id === nodeId)
}

/** Move a node into a different group (no-op if that would create a cycle). */
export function reparentNode(
  root: L2RuleGroup,
  nodeId: string,
  newParentId: string,
): L2RuleGroup {
  if (nodeId === newParentId || nodeId === root.id) return root
  const node = findInMatch(root, nodeId)
  const parent = findInMatch(root, newParentId)
  if (!node || !parent || parent.type !== 'group') return root
  if (node.type === 'group' && groupContains(root, nodeId, newParentId)) return root
  const lifted = removeNode(root, nodeId)
  return addToGroup(lifted, newParentId, node)
}

/** Whether a dragged node can be dropped into a target group. */
export function canDropIntoGroup(
  root: L2RuleGroup,
  nodeId: string,
  targetGroupId: string,
): boolean {
  if (nodeId === targetGroupId || targetGroupId === root.id) return false
  if (findParentId(root, nodeId) === targetGroupId) return false
  const node = findInMatch(root, nodeId)
  const target = findInMatch(root, targetGroupId)
  if (!node || !target || target.type !== 'group') return false
  if (node.type === 'group' && groupContains(root, nodeId, targetGroupId)) return false
  return true
}

export function collectSubtreeIds(group: L2RuleGroup): string[] {
  const ids = [group.id]
  for (const child of group.children) {
    ids.push(child.id)
    if (child.type === 'group') ids.push(...collectSubtreeIds(child))
  }
  return ids
}

export function clearPositionsForSubtree(
  positions: Record<string, { x: number; y: number }>,
  root: L2RuleGroup,
  nodeId: string,
): Record<string, { x: number; y: number }> {
  const node = findInMatch(root, nodeId)
  if (!node) return positions
  const ids = node.type === 'group' ? collectSubtreeIds(node) : [nodeId]
  const next = { ...positions }
  for (const id of ids) delete next[id]
  return next
}

export function reorderGroupChildren(
  root: L2RuleGroup,
  groupId: string,
  orderedChildIds: string[],
): L2RuleGroup {
  return updateGroup(root, groupId, (g) => {
    const byId = new Map(g.children.map((c) => [c.id, c]))
    const ordered: L2RuleNode[] = []
    for (const id of orderedChildIds) {
      const node = byId.get(id)
      if (node) ordered.push(node)
    }
    for (const child of g.children) {
      if (!orderedChildIds.includes(child.id)) ordered.push(child)
    }
    return { ...g, children: ordered }
  })
}

/** Reorder siblings from canvas drag positions (y for stacks, x for AND rows). */
export function reorderMatchFromLayout(
  root: L2RuleGroup,
  layoutNodes: Array<{
    id: string
    parentId?: string
    type?: string
    position: { x: number; y: number }
  }>,
): L2RuleGroup {
  let next = root
  const byParent = new Map<string, typeof layoutNodes>()

  for (const n of layoutNodes) {
    if (!n.parentId || n.id === 'start' || n.id === 'end') continue
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }

  for (const [parentId, children] of byParent) {
    const parent = findInMatch(next, parentId)
    if (!parent || parent.type !== 'group') continue
    const allGroups = children.every((c) => c.type === 'groupFrame')
    const horizontal = parent.logic === 'all' && allGroups
    const sorted = [...children].sort((a, b) =>
      horizontal ? a.position.x - b.position.x : a.position.y - b.position.y,
    )
    next = reorderGroupChildren(
      next,
      parentId,
      sorted.map((n) => n.id),
    )
  }

  const topLevel = topLevelFlowNodeIds(next)
  const topNodes = layoutNodes.filter((n) => topLevel.includes(n.id) && !n.parentId)
  if (topNodes.length > 1) {
    const sorted = [...topNodes].sort((a, b) => a.position.x - b.position.x)
    next = reorderGroupChildren(
      next,
      next.id,
      sorted.map((n) => n.id),
    )
  }

  return next
}

function reorderTopLevelAfter(
  root: L2RuleGroup,
  moveId: string,
  afterId: string | 'start',
): L2RuleGroup {
  if (findParentId(root, moveId) !== root.id) return root
  const ids = root.children.map((c) => c.id).filter((id) => id !== moveId)
  const insertAt = afterId === 'start' ? 0 : Math.max(0, ids.indexOf(afterId) + 1)
  ids.splice(insertAt, 0, moveId)
  return reorderGroupChildren(root, root.id, ids)
}

/** Update rule tree when the user draws a connection on the canvas. */
export function applyCanvasEdge(
  root: L2RuleGroup,
  source: string,
  target: string,
): L2RuleGroup {
  if (source === target) return root

  if (source === 'start' && target !== 'end') {
    return reorderTopLevelAfter(root, target, 'start')
  }
  if (target === 'end' && source !== 'start') {
    const parentId = findParentId(root, source)
    if (parentId === root.id) {
      const ids = root.children.map((c) => c.id).filter((id) => id !== source)
      ids.push(source)
      return reorderGroupChildren(root, root.id, ids)
    }
    return root
  }
  if (source === 'start' || target === 'end') return root

  const src = findInMatch(root, source)
  const tgt = findInMatch(root, target)
  if (!src || !tgt) return root

  if (
    src.type === 'group' &&
    tgt.type === 'group' &&
    findParentId(root, source) === root.id &&
    findParentId(root, target) === root.id
  ) {
    return reorderTopLevelAfter(root, target, source)
  }

  if (src.type === 'group' && tgt.type !== 'group') {
    return reparentNode(root, target, source)
  }
  if (src.type !== 'group' && tgt.type === 'group') {
    return reparentNode(root, source, target)
  }
  if (src.type === 'group' && tgt.type === 'group' && tgt.id !== root.id) {
    return reparentNode(root, target, source)
  }
  return root
}

/** IDs of groups that are direct children of the feed root (top-level flow boxes). */
export function topLevelGroupIds(root: L2RuleGroup): string[] {
  return root.children.filter((c) => c.type === 'group').map((c) => c.id)
}

/** IDs of all direct children on the top-level flow (groups and filters). */
export function topLevelFlowNodeIds(root: L2RuleGroup): string[] {
  return root.children.map((c) => c.id)
}

/** Group that should receive a newly added palette node. */
export function resolveAddTargetGroupId(
  root: L2RuleGroup,
  nodeId: string | null,
  kind: 'group' | 'condition',
): string {
  if (kind === 'group') {
    if (!nodeId || nodeId === 'start' || nodeId === 'end' || nodeId === root.id) {
      return root.id
    }
    const node = findInMatch(root, nodeId)
    if (node?.type === 'group') return node.id
    return resolveTargetGroupId(root, nodeId) ?? root.id
  }
  return resolveTargetGroupId(root, nodeId) ?? root.id
}

/** Group that owns a condition node, or the group itself if selected. */
export function resolveTargetGroupId(root: L2RuleGroup, nodeId: string | null): string | null {
  if (!nodeId || nodeId === 'start' || nodeId === 'end') return null
  if (nodeId.startsWith('jn:') || nodeId.startsWith('out:')) return nodeId.slice(3)
  const node = findInMatch(root, nodeId)
  if (!node) return null
  if (node.type === 'group') return node.id

  function parentOf(group: L2RuleGroup, targetId: string): string | null {
    for (const child of group.children) {
      if (child.id === targetId) return group.id
      if (child.type === 'group') {
        const p = parentOf(child, targetId)
        if (p) return p
      }
    }
    return null
  }

  return parentOf(root, nodeId)
}
