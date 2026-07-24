import type { ContentSignals, EngagementWeights, MediaBonus, RatioSignals } from '@cfb/core-types'

export const ENGAGEMENT_SIGNALS: { key: keyof EngagementWeights; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'replies', label: 'Replies' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'audienceLikes', label: 'Audience likes' },
  { key: 'audienceReposts', label: 'Audience reposts' },
]

export const MEDIA_SIGNALS: { key: keyof MediaBonus; label: string }[] = [
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
  { key: 'linkCard', label: 'Link card' },
]

export const CONTENT_SIGNALS: { key: keyof ContentSignals; label: string; hint: string }[] = [
  { key: 'authorFollowers', label: 'Author followers', hint: 'Positive = boost reach, negative = demote big accounts' },
  { key: 'authorPosts', label: 'Author posts', hint: 'Positive = boost prolific posters, negative = prefer casual' },
  { key: 'textLength', label: 'Text length', hint: 'Positive = boost long posts, negative = prefer short' },
  { key: 'hashtagCount', label: 'Hashtag count', hint: 'Negative = penalize hashtag spam' },
  { key: 'mentionCount', label: 'Mention count', hint: 'Positive = boost conversational posts' },
  { key: 'linkCount', label: 'Link count', hint: 'Positive = boost link-heavy, negative = demote' },
  { key: 'altTextBonus', label: 'Alt text (images)', hint: 'Positive = reward accessibility' },
]

export const RATIO_SIGNALS: { key: keyof RatioSignals; label: string; hint: string }[] = [
  { key: 'engagementRate', label: 'Engagement rate', hint: '(likes+reposts)/(followers+1) — reach-normalized' },
  { key: 'replyRatio', label: 'Reply ratio', hint: 'replies/(likes+1) — discussion detector' },
  { key: 'quoteRatio', label: 'Quote ratio', hint: 'quotes/(likes+1) — quotability signal' },
]
