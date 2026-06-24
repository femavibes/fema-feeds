import type {
  AuthorListConfig,
  EmbedFlagRequirement,
  L1StepId,
  PostKind,
  ProjectL1Config,
} from '@cfb/core-types'
import { L1_NEVER_BYPASS } from '@cfb/core-types'
import { L1_STEP_ORDER } from '@cfb/l1-registry'
import { emptyPrefilter } from '@cfb/l1-compile'

export const POST_KINDS: PostKind[] = ['root', 'reply', 'quote', 'repost']

export const EMBED_FLAGS: Array<{
  key: keyof Pick<
    ProjectL1Config,
    'hasVideo' | 'hasImage' | 'hasLinkCard' | 'hasQuote' | 'hasRecord' | 'hasTextOnly'
  >
  label: string
}> = [
  { key: 'hasVideo', label: 'Video' },
  { key: 'hasImage', label: 'Image' },
  { key: 'hasLinkCard', label: 'Link card' },
  { key: 'hasQuote', label: 'Quote' },
  { key: 'hasRecord', label: 'Record embed' },
  { key: 'hasTextOnly', label: 'Text only' },
]

export const EMBED_OPTIONS: Array<EmbedFlagRequirement | 'unset'> = [
  'unset',
  'require',
  'exclude',
  'ignore',
]

export const BYPASSABLE_STEPS: L1StepId[] = L1_STEP_ORDER.filter(
  (s) => !L1_NEVER_BYPASS.includes(s) && s !== 'author_allowlist',
)

/** Grouped strict-filter toggles for listed authors. */
export const LISTED_AUTHOR_FILTER_GROUPS: Array<{ title: string; hint?: string; steps: L1StepId[] }> = [
  {
    title: 'Language',
    hint: 'Require language allowlist and unknown-language policy.',
    steps: ['language', 'language_unknown'],
  },
  {
    title: 'Media & embeds',
    hint: 'Require video/image/link/quote/record/text-only rules.',
    steps: ['has_video', 'has_image', 'has_link_card', 'has_quote', 'has_record', 'has_text_only'],
  },
  {
    title: 'Keywords & hashtags',
    hint: 'Require keyword/hashtag include rules and apply exclude rules.',
    steps: ['hashtag_include', 'hashtag_exclude', 'keyword_include', 'keyword_exclude'],
  },
]

/** @deprecated Use LISTED_AUTHOR_FILTER_GROUPS */
export const FAST_PATH_GROUPS = LISTED_AUTHOR_FILTER_GROUPS

const STEP_LABELS: Partial<Record<L1StepId, string>> = {
  author_allowlist: 'Author list membership',
  language: 'Language allowlist',
  language_unknown: 'Posts with no language tag',
  has_video: 'Video posts',
  has_image: 'Image posts',
  has_link_card: 'Link card posts',
  has_quote: 'Quote posts',
  has_record: 'Record embed posts',
  has_text_only: 'Text-only posts',
  hashtag_include: 'Required hashtags',
  hashtag_exclude: 'Blocked hashtags',
  keyword_include: 'Required keywords',
  keyword_exclude: 'Blocked keywords',
  author_blocklist: 'Author blocklist',
  follow_ring: 'Follow ring',
  labels: 'Moderation labels',
  post_kind: 'Post kind',
}

export function emptyProject(projectId: string, name: string): ProjectL1Config {
  return {
    projectId,
    name,
    enabled: true,
    postKinds: ['root', 'quote', 'reply'],
    prefilter: emptyPrefilter(),
  }
}

export function parseCsv(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function formatCsv(values: string[] | undefined): string {
  return values?.join(', ') ?? ''
}

export function newAuthorList(existingCount = 0): AuthorListConfig {
  return {
    listId: `list-${existingCount + 1}`,
    sources: [{ type: 'bluesky_list', uri: '', pollIntervalMinutes: 60 }],
    pollIntervalMinutes: 60,
    fastPath: { enabled: true, bypassSteps: [...BYPASSABLE_STEPS] },
  }
}

/** Listed authors must pass this L1 step (inverse of bypass). */
export function listedAuthorRequiresStep(list: AuthorListConfig, step: L1StepId): boolean {
  if (!list.fastPath.enabled) return true
  return !list.fastPath.bypassSteps.includes(step)
}

export function setListedAuthorRequiresStep(
  list: AuthorListConfig,
  step: L1StepId,
  required: boolean,
): AuthorListConfig {
  const bypass = new Set(list.fastPath.bypassSteps)
  if (required) bypass.delete(step)
  else bypass.add(step)

  const noneBypassed = bypass.size === 0
  return {
    ...list,
    fastPath: {
      enabled: !noneBypassed,
      bypassSteps: noneBypassed ? [] : [...bypass],
    },
  }
}

export function listedAuthorPolicySummary(list: AuthorListConfig): string {
  if (!list.fastPath.enabled) {
    return 'Listed authors must pass every project L1 filter (same rules as the open firehose).'
  }
  const required = BYPASSABLE_STEPS.filter((s) => !list.fastPath.bypassSteps.includes(s))
  if (required.length === 0) {
    return 'All posts by these authors will be saved into the pool.'
  }
  return `Listed authors auto-save, but must still pass: ${required.map(stepLabel).join(', ')}.`
}

export function stepLabel(stepId: L1StepId): string {
  return STEP_LABELS[stepId] ?? stepId.replace(/_/g, ' ')
}
