import type { FormulaFieldGroup, FormulaTemplate } from './SortFormulaBuilder'

export const PERSONALIZATION_TEMPLATES: FormulaTemplate[] = [
  { name: 'Follow boost', formula: 'base_score * if(is_followed > 0, 1.3, 1)' },
  { name: 'Follower boost', formula: 'base_score * if(is_follower > 0, 1.2, 1)' },
  { name: 'Mutual priority', formula: 'base_score * if(is_mutual > 0, 1.5, if(is_followed > 0, 1.2, 1))' },
  { name: 'Serve fatigue', formula: 'base_score / (times_served + 1)' },
  { name: 'View fatigue', formula: 'base_score / (was_viewed * 2 + times_served + 1)' },
  { name: 'Affinity blend', formula: 'base_score + feed_affinity * 10' },
  { name: 'Full personalization', formula: 'base_score * if(is_followed > 0, 1.3, 1) + feed_affinity * 10 - times_served * 30' },
  { name: 'Freshness recovery', formula: 'base_score + if(hours_since_last_open > 24, 100, 0)' },
  { name: 'Social proximity', formula: 'base_score * (1 + is_followed * 0.3 + is_mutual * 0.5) + feed_affinity * 5' },
  { name: 'Interaction recency', formula: 'base_score * if(days_since_interaction < 7, 1.4, if(days_since_interaction < 30, 1.1, 1))' },
]

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
