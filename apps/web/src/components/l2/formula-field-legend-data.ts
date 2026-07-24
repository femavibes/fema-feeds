export interface FormulaFieldLegendEntry {
  name: string
  description: string
}

export const SORT_FORMULA_FIELD_LEGEND: FormulaFieldLegendEntry[] = [
  { name: 'likes', description: 'Like count on the post.' },
  { name: 'reposts', description: 'Repost count.' },
  { name: 'replies', description: 'Reply count.' },
  { name: 'quotes', description: 'Quote count.' },
  { name: 'bookmarks', description: 'Bookmark count.' },
  { name: 'audience_likes', description: 'Likes from viewers who opened this feed (feed-scoped).' },
  { name: 'audience_reposts', description: 'Reposts from viewers who opened this feed.' },
  { name: 'followers', description: 'Author follower count at index time.' },
  { name: 'follows', description: 'Number of accounts the author follows.' },
  { name: 'posts', description: 'Author total post count.' },
  { name: 'text_len', description: 'Character length of post text.' },
  { name: 'images', description: 'Number of image embeds.' },
  { name: 'video_size', description: 'Video size in bytes (0 if none).' },
  { name: 'hashtags', description: 'Hashtag facet count.' },
  { name: 'links', description: 'Link facet count.' },
  { name: 'mentions', description: 'Mention facet count.' },
  { name: 'editor_score', description: 'Sum of Score node values from Matches (0 if none).' },
  { name: 'post_age_hours', description: 'Hours since we indexed the post into this project.' },
  { name: 'post_created_hours', description: 'Hours since the post\'s record.createdAt timestamp (author publish time, UTC).' },
]

export const PERSONALIZATION_FORMULA_FIELD_LEGEND: FormulaFieldLegendEntry[] = [
  { name: 'base_score', description: 'Raw sort_key from the Sorting tab. Use log(base_score + 1) if you want compressed scaling.' },
  { name: 'is_followed', description: '1 if viewer follows post author, 0 if not.' },
  { name: 'is_follower', description: '1 if post author follows the viewer, 0 if not.' },
  { name: 'is_mutual', description: '1 if mutual follow (both follow each other), 0 if not.' },
  { name: 'times_served', description: 'Times this post was returned in getFeedSkeleton.' },
  { name: 'hours_since_served', description: 'Hours since last skeleton serve (0 if never).' },
  { name: 'was_viewed', description: '1 if client reported interactionSeen, else 0 (requires acceptsInteractions on Bluesky publish).' },
  { name: 'times_viewed', description: '1 if viewed (0/1 until repeat views are tracked).' },
  { name: 'hours_since_viewed', description: 'Hours since client-reported view (0 if never).' },
  { name: 'hours_since_last_open', description: 'Hours since viewer last opened this feed.' },
  { name: 'days_since_interaction', description: 'Days since last interaction with this author.' },
  { name: 'feed_affinity', description: 'Total interactions with author via this feed.' },
  { name: 'feed_affinity_likes', description: 'Likes on author\'s posts via this feed.' },
  { name: 'feed_affinity_reposts', description: 'Reposts of author via this feed.' },
  { name: 'feed_affinity_replies', description: 'Replies to author via this feed.' },
  { name: 'feed_affinity_quotes', description: 'Quotes of author via this feed.' },
]
