import type { L2ParamTargetBinding, L2RuleNode, PostSearchField } from '@cfb/core-types'

export type ParamBindValueKind = 'boolean' | 'enum' | 'member' | 'number' | 'string' | 'stringList'

export type ParamBindableField = {
  /** Stable picker id (may be synthetic, e.g. fields:text). */
  key: string
  label: string
  valueKind: ParamBindValueKind
  /** Real node property written at compile time (defaults to `key`). */
  property?: string
  /** For valueKind === 'enum'. */
  enumValues?: { value: string; label: string }[]
  /** Placeholder / hint for free-typed member tokens (e.g. language code). */
  memberPlaceholder?: string
  /** Fixed member for array properties (keyword fields / media kinds / …). */
  member?: string
}

/** Keys that remain non-bindable (complex / identity / package metadata). */
export const PARAM_UNSUPPORTED_INPUT_KEYS = [
  'accounts',
  'dids',
  'labelerDids',
  'scouts',
  'payload',
  'hub',
  'listId',
  'listUri',
  'packageId',
  'versionPin',
  'controls',
  'paramValues',
  'title',
  'label',
  'description',
] as const

const SKIP_META_KEYS = new Set([
  'id',
  'type',
  'updatePolicy',
  'role',
  'hubSource',
  'direction',
  'scope',
  'pollIntervalMinutes',
  'minPass',
  'children',
  'logic',
  'points',
  'threshold',
  'timeWindowHours',
  'maxPostAgeHours',
  'autoDerive',
  'grazeType',
  ...PARAM_UNSUPPORTED_INPUT_KEYS,
])

const KEYWORD_SEARCH_FIELDS: { field: PostSearchField; label: string }[] = [
  { field: 'text', label: 'Post text' },
  { field: 'image_alt', label: 'Image alt text' },
  { field: 'video_alt', label: 'Video alt text' },
  { field: 'link_title', label: 'Link title' },
  { field: 'link_description', label: 'Link description' },
  { field: 'link_uri', label: 'Link URL' },
  { field: 'facet_link', label: 'Facet URLs' },
  { field: 'facet_mention', label: 'Facet mentions' },
  { field: 'bridgy_original_text', label: 'Bridgy original text' },
  { field: 'bridgy_original_url', label: 'Bridgy original URL' },
]

const MEDIA_KINDS: { value: string; label: string }[] = [
  { value: 'text_only', label: 'Text only' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'gif', label: 'GIF' },
  { value: 'link_card', label: 'Link card' },
  { value: 'quote', label: 'Quote' },
  { value: 'quote_with_media', label: 'Quote with media' },
]

const POST_KINDS: { value: string; label: string }[] = [
  { value: 'root', label: 'Root' },
  { value: 'reply', label: 'Reply' },
  { value: 'quote', label: 'Quote' },
  { value: 'repost', label: 'Repost' },
]

const URL_SOURCES: { value: string; label: string }[] = [
  { value: 'link_card', label: 'Link card URL' },
  { value: 'facet_link', label: 'Facet URL' },
  { value: 'bridgy_original', label: 'Bridgy original URL' },
]

function searchFieldBindables(): ParamBindableField[] {
  return KEYWORD_SEARCH_FIELDS.map(({ field, label }) => ({
    key: `fields:${field}`,
    label,
    valueKind: 'member' as const,
    property: 'fields',
    member: field,
  }))
}

function kindBindables(
  property: string,
  options: { value: string; label: string }[],
): ParamBindableField[] {
  return options.map(({ value, label }) => ({
    key: `${property}:${value}`,
    label,
    valueKind: 'boolean' as const,
    property,
    member: value,
  }))
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+/, '')
    .replace(/^./, (c) => c.toUpperCase())
}

/**
 * Declared toggle/enum/member binds per node type.
 * Runtime discovery merges any extra boolean keys present on the live node
 * so newly added toggles show up without editing this list (once set on the node).
 * Optional toggles that are often undefined still need an entry here.
 */
export const PARAM_BINDABLE_FIELDS: Partial<
  Record<L2RuleNode['type'], readonly ParamBindableField[]>
> = {
  keyword: [
    { key: 'terms', label: 'Terms', valueKind: 'stringList' },
    { key: 'caseSensitive', label: 'Case sensitive', valueKind: 'boolean' },
    { key: 'wholeWord', label: 'Whole words only', valueKind: 'boolean' },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'includes', label: 'Includes' },
        { value: 'excludes', label: 'Excludes' },
      ],
    },
    ...searchFieldBindables(),
  ],
  regex: [
    { key: 'pattern', label: 'Pattern', valueKind: 'string' },
    { key: 'caseInsensitive', label: 'Case insensitive', valueKind: 'boolean' },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'matches', label: 'Matches' },
        { value: 'not_matches', label: 'Not matches' },
      ],
    },
    ...searchFieldBindables(),
  ],
  text: [
    { key: 'value', label: 'Text / pattern', valueKind: 'string' },
    { key: 'caseInsensitive', label: 'Case insensitive', valueKind: 'boolean' },
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'contains', label: 'Contains' },
        { value: 'not_contains', label: 'Not contains' },
        { value: 'equals', label: 'Equals' },
        { value: 'regex', label: 'Regex' },
      ],
    },
  ],
  language: [
    {
      key: 'allow',
      label: 'Language code in allow-list',
      valueKind: 'member',
      memberPlaceholder: 'en',
    },
    {
      key: 'unknown',
      label: 'Unknown language',
      valueKind: 'enum',
      enumValues: [
        { value: 'include', label: 'Include' },
        { value: 'exclude', label: 'Exclude' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
  ],
  hashtag: [
    { key: 'tags', label: 'Tags', valueKind: 'stringList' },
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'includes', label: 'Includes' },
        { value: 'excludes', label: 'Excludes' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
  ],
  url: [
    { key: 'patterns', label: 'URL patterns', valueKind: 'stringList' },
    { key: 'caseSensitive', label: 'Case sensitive', valueKind: 'boolean' },
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'includes', label: 'Includes' },
        { value: 'excludes', label: 'Excludes' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
    ...kindBindables('sources', URL_SOURCES),
  ],
  mention: [
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'includes', label: 'Includes' },
        { value: 'excludes', label: 'Excludes' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
  ],
  labels: [
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'includes', label: 'Includes' },
        { value: 'excludes', label: 'Excludes' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
  ],
  media: [
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'is', label: 'Is' },
        { value: 'is_not', label: 'Is not' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
    ...kindBindables('kinds', MEDIA_KINDS),
  ],
  post_kind: [
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'is', label: 'Is' },
        { value: 'is_not', label: 'Is not' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
    ...kindBindables('kinds', POST_KINDS),
  ],
  alt_text: [
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'has', label: 'Has alt text' },
        { value: 'missing', label: 'Missing alt text' },
      ],
    },
  ],
  post_age: [
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'newer_than', label: 'Newer than' },
        { value: 'older_than', label: 'Older than' },
      ],
    },
  ],
  bool: [
    { key: 'value', label: 'Required (on) / excluded (off)', valueKind: 'boolean' },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
  ],
  follow_ring: [
    {
      key: 'op',
      label: 'Match mode',
      valueKind: 'enum',
      enumValues: [
        { value: 'includes', label: 'Includes' },
        { value: 'excludes', label: 'Excludes' },
      ],
    },
    { key: 'runAtIngest', label: 'Discover (pull into pool)', valueKind: 'boolean' },
  ],
}

export function bindableFieldsForNodeType(
  type: L2RuleNode['type'] | string | undefined,
): readonly ParamBindableField[] {
  if (!type) return []
  return PARAM_BINDABLE_FIELDS[type as L2RuleNode['type']] ?? []
}

/**
 * All toggle-like binds for a concrete node: declared schema for its type, plus
 * any extra boolean keys already present on the instance (auto-pickup).
 */
export function discoverBindableFields(node: L2RuleNode | undefined): ParamBindableField[] {
  if (!node || node.type === 'parameters' || node.type === 'group') return []
  const declared = [...bindableFieldsForNodeType(node.type)]
  const seen = new Set(declared.map((f) => f.key))
  const rec = node as unknown as Record<string, unknown>

  for (const [key, val] of Object.entries(rec)) {
    if (SKIP_META_KEYS.has(key)) continue
    if (seen.has(key)) continue
    if (typeof val === 'boolean') {
      declared.push({ key, label: humanizeKey(key), valueKind: 'boolean' })
      seen.add(key)
    }
  }
  return declared
}

export function findBindableField(
  type: L2RuleNode['type'] | string | undefined,
  pickerKey: string | undefined,
): ParamBindableField | undefined {
  if (!pickerKey) return undefined
  return bindableFieldsForNodeType(type).find((f) => f.key === pickerKey)
}

export function findDiscoveredField(
  node: L2RuleNode | undefined,
  pickerKey: string | undefined,
): ParamBindableField | undefined {
  if (!pickerKey) return undefined
  return discoverBindableFields(node).find((f) => f.key === pickerKey)
}

/** Match a stored binding back to a discovered/whitelist entry. */
export function resolveBindableField(
  nodeOrType: L2RuleNode | string | undefined,
  binding: Pick<L2ParamTargetBinding, 'property' | 'member'>,
): ParamBindableField | undefined {
  if (!binding.property) return undefined
  const fields =
    typeof nodeOrType === 'object' && nodeOrType
      ? discoverBindableFields(nodeOrType)
      : bindableFieldsForNodeType(typeof nodeOrType === 'string' ? nodeOrType : undefined)

  if (binding.member) {
    const fixed = fields.find(
      (f) => (f.property ?? f.key) === binding.property && f.member === binding.member,
    )
    if (fixed) return fixed
    return fields.find(
      (f) => (f.property ?? f.key) === binding.property && f.valueKind === 'member' && !f.member,
    )
  }
  return fields.find((f) => f.key === binding.property && !f.member)
}

export function bindingFromBindableField(
  nodeId: string,
  field: ParamBindableField,
  extras?: Partial<L2ParamTargetBinding>,
): L2ParamTargetBinding {
  return {
    nodeId,
    kind: 'property',
    property: field.property ?? field.key,
    member: field.member ?? extras?.member,
    value: extras?.value,
    listValue: extras?.listValue,
    listWhenOff: extras?.listWhenOff,
    listMode: extras?.listMode,
  }
}

/**
 * Two-option enums can be driven by a boolean Parameter like Discover:
 * control on → first value (includes / matches / is), off → second (excludes / …).
 */
export function binaryEnumPolarity(
  field: Pick<ParamBindableField, 'valueKind' | 'enumValues'>,
): { onValue: string; offValue: string; onLabel: string; offLabel: string } | null {
  if (field.valueKind !== 'enum') return null
  const vals = field.enumValues ?? []
  if (vals.length !== 2) return null
  return {
    onValue: vals[0]!.value,
    offValue: vals[1]!.value,
    onLabel: vals[0]!.label,
    offLabel: vals[1]!.label,
  }
}

export function bindingMatchesField(
  binding: L2ParamTargetBinding,
  field: ParamBindableField,
): boolean {
  if (binding.kind !== 'property') return false
  const prop = field.property ?? field.key
  if (binding.property !== prop) return false
  if (field.member) return binding.member === field.member
  if (field.valueKind === 'member') return Boolean(binding.member)
  return !binding.member
}

/** Index nodes by id for bind resolution (groups included; params skipped as targets). */
export function indexRuleNodesById(root: L2RuleNode): Map<string, L2RuleNode> {
  const map = new Map<string, L2RuleNode>()
  const walk = (node: L2RuleNode) => {
    if (node.type !== 'parameters') map.set(node.id, node)
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return map
}

export function isValidPropertyBinding(
  target: L2RuleNode | undefined,
  binding: Pick<L2ParamTargetBinding, 'kind' | 'property' | 'member'>,
): boolean {
  if (binding.kind !== 'property') return true
  if (!target || !binding.property) return false
  const field = resolveBindableField(target, binding)
  if (!field) return false
  if (field.valueKind === 'member' || field.member) return Boolean(binding.member?.trim())
  return true
}

/** Human-readable list of input keys this node type has that params cannot bind yet. */
export function unsupportedInputKeysForNode(node: L2RuleNode | undefined): string[] {
  if (!node) return []
  const rec = node as unknown as Record<string, unknown>
  const out: string[] = []
  for (const key of PARAM_UNSUPPORTED_INPUT_KEYS) {
    const v = rec[key]
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    if (typeof v === 'boolean') continue
    if (typeof v === 'string' || Array.isArray(v)) out.push(key)
  }
  return out
}
