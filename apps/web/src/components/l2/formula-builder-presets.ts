export interface FormulaTemplate {
  name: string
  formula: string
}

export interface FormulaFieldGroup {
  label: string
  fields: string[]
}

export type FormulaSnippet = FormulaTemplate

/** Sorting — grouped raw field chips. */
export const SORT_FIELD_GROUPS: FormulaFieldGroup[] = [
  {
    label: 'Network engagement',
    fields: ['likes', 'reposts', 'replies', 'quotes', 'bookmarks'],
  },
  {
    label: 'Audience engagement (this feed\'s readers)',
    fields: ['audience_likes', 'audience_reposts'],
  },
  {
    label: 'Author',
    fields: ['followers', 'follows', 'posts'],
  },
  {
    label: 'Content',
    fields: ['text_len', 'images', 'video_size', 'hashtags', 'links', 'mentions', 'editor_score', 'post_age_hours', 'post_created_hours'],
  },
]

/** Sorting — full formulas (replaces editor contents). */
export const SORT_TEMPLATES: FormulaTemplate[] = [
  {
    name: 'Classic engagement',
    formula: 'likes + reposts * 2 + replies',
  },
  {
    name: 'Log-scaled engagement',
    formula: 'log(likes + 1) * 10 + log(reposts + 1) * 15 + log(replies + 1) * 5',
  },
  {
    name: 'Discussion-first',
    formula: 'replies * 3 + quotes * 2 + reposts + likes * 0.5',
  },
  {
    name: 'Audience-weighted',
    formula: 'likes + reposts * 2 + audience_likes * 3 + audience_reposts * 5',
  },
  {
    name: 'Fresh engagement',
    formula: '(likes + reposts * 2 + replies) / (post_created_hours / 24 + 1)',
  },
  {
    name: 'Small-account friendly',
    formula: '(likes + reposts * 2) / (sqrt(followers) + 1)',
  },
]

/** Sorting — composable pieces (appends a block). Use Fields for raw signals. */
export const SORT_SNIPPETS: FormulaSnippet[] = [
  { name: '2× repost weight', formula: 'reposts * 2' },
  { name: 'Log-scaled likes', formula: 'log(likes + 1) * 10' },
  { name: 'Log-scaled reposts', formula: 'log(reposts + 1) * 15' },
  { name: 'Reply emphasis', formula: 'replies * 3' },
  { name: 'Engagement rate term', formula: '(likes + reposts) / (followers + 1) * 100' },
  { name: 'Video bonus', formula: 'if(video_size > 0, 50, 0)' },
  { name: 'Image bonus', formula: 'if(images > 0, 20, 0)' },
  { name: 'Audience boost', formula: 'audience_likes * 3 + audience_reposts * 5' },
  { name: 'Editor boost', formula: 'editor_score * 100' },
]

/** Personalization — grouped raw field chips. */
export const PERSONALIZATION_FIELD_GROUPS: FormulaFieldGroup[] = [
  {
    label: 'Viewer signals',
    fields: ['base_score', 'is_followed', 'is_follower', 'is_mutual', 'hours_since_last_open', 'days_since_interaction'],
  },
  {
    label: 'Served (in skeleton response)',
    fields: ['times_served', 'hours_since_served'],
  },
  {
    label: 'Viewed (client reported)',
    fields: ['was_viewed', 'times_viewed', 'hours_since_viewed'],
  },
  {
    label: 'Feed affinity (interactions via this feed)',
    fields: ['feed_affinity', 'feed_affinity_likes', 'feed_affinity_reposts', 'feed_affinity_replies', 'feed_affinity_quotes'],
  },
]

/** Personalization — full formulas (replaces editor contents). */
export const PERSONALIZATION_TEMPLATES: FormulaTemplate[] = [
  {
    name: 'Social graph boost',
    formula: 'base_score * if(is_mutual > 0, 1.5, if(is_followed > 0, 1.2, 1))',
  },
  {
    name: 'Serve fatigue',
    formula: 'base_score / (times_served + 1)',
  },
  {
    name: 'Affinity blend',
    formula: 'base_score + feed_affinity * 10 + feed_affinity_likes * 3',
  },
  {
    name: 'View-aware rerank',
    formula: 'base_score / (was_viewed + 1) - times_served * 20',
  },
  {
    name: 'Return visit freshness',
    formula: 'base_score + if(hours_since_last_open > 24, 50, 0)',
  },
  {
    name: 'Balanced FYP',
    formula: 'base_score * if(is_followed > 0, 1.25, 1) + feed_affinity * 8 - times_served * 25',
  },
]

/** Personalization — composable pieces (appends a block). */
export const PERSONALIZATION_SNIPPETS: FormulaSnippet[] = [
  { name: 'Follow boost', formula: 'base_score * if(is_followed > 0, 0.25, 0)' },
  { name: 'Mutual boost', formula: 'base_score * if(is_mutual > 0, 0.5, 0)' },
  { name: 'Affinity bonus', formula: 'feed_affinity * 10' },
  { name: 'Like affinity', formula: 'feed_affinity_likes * 5' },
  { name: 'Serve penalty', formula: '- times_served * 30' },
  { name: 'View penalty', formula: '- was_viewed * base_score * 0.5' },
  { name: 'Fresh session bump', formula: 'if(hours_since_last_open > 24, 50, 0)' },
  { name: 'Recent interaction', formula: 'if(days_since_interaction < 7, base_score * 0.3, 0)' },
]
