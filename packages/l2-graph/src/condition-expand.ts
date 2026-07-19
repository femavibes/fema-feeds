import type { L2Expr, L2RuleNode } from '@cfb/core-types'
import { formatFollowRingDirection } from '@cfb/core-types'
import {
  getLogicBlockPreviewBodyHeight,
  LOGIC_BLOCK_LOADING_BODY_H,
} from './logic-block-preview-size.js'

/** Line height for expanded body rows — keep in sync with `.l2-flow-condition-body-line`. */
export const COND_BODY_LINE_H = 17
/** Two-line resolved profile (name + handle) — keep in sync with `.l2-flow-profile-row`. */
export const COND_PROFILE_ROW_H = 40
export const COND_PROFILE_MAX = 15
export const COND_EXPAND_TITLE_H = 22
/** Reserved rename row — always rendered so expand doesn’t shift the title. */
export const COND_NAME_LINE_H = 16
export const COND_COLLAPSED_H = 56
/** Extra bottom inset so the last expand line isn’t flush with the border. */
export const COND_EXPAND_BOTTOM_H = 14
/** Collapsed teaser: show up to N list items / profiles, then “+N more”. */
export const COND_TEASER_MAX = 3
/** Expanded logic-block node width (mini frames need room). */
export const LOGIC_BLOCK_EXPANDED_W = 320
/** @deprecated Prefer cached estimate via getLogicBlockPreviewBodyHeight. */
export const LOGIC_BLOCK_EXPANDED_BODY_H = 280

/** ISO codes we show as "english (en)" on the canvas (mirrors web COMMON_LANGUAGES). */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'english',
  es: 'spanish',
  fr: 'french',
  de: 'german',
  pt: 'portuguese',
  ja: 'japanese',
  ko: 'korean',
  zh: 'chinese',
  ar: 'arabic',
  hi: 'hindi',
  it: 'italian',
  nl: 'dutch',
  pl: 'polish',
  ru: 'russian',
  sv: 'swedish',
  tr: 'turkish',
  uk: 'ukrainian',
  vi: 'vietnamese',
  id: 'indonesian',
  th: 'thai',
  ca: 'catalan',
  ro: 'romanian',
  cs: 'czech',
  da: 'danish',
  fi: 'finnish',
  hu: 'hungarian',
  nb: 'norwegian',
  af: 'afrikaans',
  el: 'greek',
  he: 'hebrew',
}

export function languageExpandLabel(code: string): string {
  const name = LANGUAGE_NAMES[code.toLowerCase()]
  return name ? `${name} (${code})` : code
}

function mediaTypeLabel(value: number): string {
  switch (value) {
    case 0:
      return 'text'
    case 1:
      return 'image'
    case 2:
      return 'video'
    case 3:
      return 'gif'
    case 4:
      return 'link card'
    case 5:
      return 'quote embed'
    default:
      return `type ${value}`
  }
}

function mediaKindLabel(kind: string): string {
  switch (kind) {
    case 'text_only':
      return 'text'
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'gif':
      return 'GIF'
    case 'link_card':
      return 'link card'
    case 'quote':
      return 'quote'
    case 'quote_with_media':
      return 'quote w/ media'
    default:
      return kind.replace(/_/g, ' ')
  }
}

/** Compact formula string for engagement-math nodes (no web formula-parser dep). */
export function formatExpandExpr(expr: L2Expr): string {
  switch (expr.type) {
    case 'literal':
      return expr.value % 1 === 0 ? String(expr.value) : String(expr.value)
    case 'field':
      return expr.field.replace(/_/g, ' ')
    case 'enrichment_field':
      return `enrich(${expr.enricherId}.${expr.field.replace(/_/g, ' ')})`
    case 'binary': {
      const l = formatExpandExpr(expr.left)
      const r = formatExpandExpr(expr.right)
      if (expr.op === 'min' || expr.op === 'max') return `${expr.op}(${l}, ${r})`
      if (expr.op === '**') return `pow(${l}, ${r})`
      return `${l} ${expr.op} ${r}`
    }
    case 'unary':
      if (expr.op === 'neg') return `-${formatExpandExpr(expr.operand)}`
      return `${expr.op}(${formatExpandExpr(expr.operand)})`
    case 'clamp':
      return `clamp(${formatExpandExpr(expr.value)}, ${formatExpandExpr(expr.min)}, ${formatExpandExpr(expr.max)})`
    case 'cond':
      return `if(${formatExpandExpr(expr.left)} ${expr.op} ${formatExpandExpr(expr.right)}, ${formatExpandExpr(expr.then)}, ${formatExpandExpr(expr.else)})`
    case 'ratio':
      return `${formatExpandExpr(expr.numerator)} / (${formatExpandExpr(expr.denominator)} + ${expr.guard ?? 1})`
    default:
      return '…'
  }
}

export type ConditionExpandMetrics = {
  /** Plain text rows (keywords, labels, …). */
  textLines: string[]
  /** Resolved profile rows (mention / author). */
  profileRows: number
  /** Render profiles via React instead of textLines. */
  profileMode?: 'actors' | 'list'
}

/**
 * What the expanded body needs for layout + rendering.
 * Mention/author use profile rows (avatars); everyone else uses textLines.
 */
export function conditionExpandMetrics(rule: L2RuleNode): ConditionExpandMetrics {
  switch (rule.type) {
    case 'group':
      return { textLines: [], profileRows: 0 }
    case 'keyword':
      return { textLines: [...(rule.terms ?? [])], profileRows: 0 }
    case 'text':
      return { textLines: rule.value.trim() ? [rule.value] : [], profileRows: 0 }
    case 'regex': {
      const lines: string[] = [
        rule.caseInsensitive === false ? 'case sensitive' : 'case insensitive',
      ]
      if (rule.pattern) lines.push(rule.pattern)
      return { textLines: lines, profileRows: 0 }
    }
    case 'hashtag':
      return {
        textLines: (rule.tags ?? []).map((t) => (t.startsWith('#') ? t : `#${t}`)),
        profileRows: 0,
      }
    case 'url':
      return { textLines: [...(rule.patterns ?? [])], profileRows: 0 }
    case 'mention': {
      const total = (rule.accounts ?? []).length
      const n = Math.min(COND_PROFILE_MAX, total)
      const textLines: string[] = []
      if (rule.listUri) textLines.push(`list: ${rule.listUri}`)
      if (total > COND_PROFILE_MAX) textLines.push('+N more')
      return { textLines, profileRows: n, profileMode: 'actors' }
    }
    case 'language':
      return {
        textLines: [
          ...(rule.allow ?? []).map(languageExpandLabel),
          `unknown: ${rule.unknown}`,
        ],
        profileRows: 0,
      }
    case 'labels':
      return { textLines: [...(rule.values ?? [])], profileRows: 0 }
    case 'post_kind':
      return { textLines: [...(rule.kinds ?? [])], profileRows: 0 }
    case 'media_type':
      return { textLines: (rule.mediaTypes ?? []).map(mediaTypeLabel), profileRows: 0 }
    case 'media':
      return { textLines: (rule.kinds ?? []).map(mediaKindLabel), profileRows: 0 }
    case 'mime_type':
      return { textLines: rule.pattern ? [rule.pattern] : [], profileRows: 0 }
    case 'alt_text':
      return {
        textLines: [rule.op === 'has' ? 'has alt text' : 'missing alt text'],
        profileRows: 0,
      }
    case 'post_age':
      return {
        textLines: [
          rule.op === 'newer_than' ? `within ${rule.hours}h` : `older than ${rule.hours}h`,
          rule.use === 'indexed_at' ? 'by indexed time' : 'by created time',
        ],
        profileRows: 0,
      }
    case 'media_stats':
      return {
        textLines: [`${rule.metric.replace(/_/g, ' ')} ${rule.op} ${rule.value}`],
        profileRows: 0,
      }
    case 'bool':
      return {
        textLines: [
          `${rule.field.replace(/_/g, ' ')} · ${rule.value ? 'required' : 'excluded'}`,
        ],
        profileRows: 0,
      }
    case 'author': {
      const mode = rule.role ?? 'discover'
      if (rule.listId) {
        // Members load async — reserve visible cap + list meta + “+N more” line.
        return {
          textLines: [`mode: ${mode}`, '+N more'],
          profileRows: COND_PROFILE_MAX,
          profileMode: 'list',
        }
      }
      const total = (rule.dids ?? []).length
      const n = Math.min(COND_PROFILE_MAX, total)
      return {
        textLines: [
          `mode: ${mode}`,
          ...(total > COND_PROFILE_MAX ? ['+N more'] : []),
        ],
        profileRows: n,
        profileMode: 'actors',
      }
    }
    case 'follow_ring': {
      const isViewer = (rule.hubSource ?? 'account') === 'viewer'
      const hub = rule.hub?.trim()
      const textLines = [
        ...(isViewer || !hub ? [`hub: ${isViewer ? 'viewer' : '…'}`] : []),
        formatFollowRingDirection(rule.direction),
        `mode: ${rule.role ?? 'filter'}`,
      ]
      return {
        textLines,
        profileRows: !isViewer && hub ? 1 : 0,
        profileMode: !isViewer && hub ? 'actors' : undefined,
      }
    }
    case 'compare':
      return {
        textLines: [`${formatExpandExpr(rule.left)} ${rule.op} ${formatExpandExpr(rule.right)}`],
        profileRows: 0,
      }
    case 'score':
      return { textLines: [`+${rule.points} score`], profileRows: 0 }
    case 'substitute':
      return {
        textLines: [
          rule.direction === 'reply_to_root'
            ? 'reply → root'
            : rule.direction === 'reply_to_parent'
              ? 'reply → parent'
              : 'quote → quoted',
          `threshold: ${rule.threshold}`,
          `window: ${rule.timeWindowHours ?? 0}h`,
        ],
        profileRows: 0,
      }
    case 'scout':
      return {
        textLines: [
          `min: ${rule.threshold.min}`,
          `max: ${rule.threshold.max}`,
          `max post age: ${rule.maxPostAgeHours ?? 48}`,
        ],
        profileRows: 0,
      }
    case 'logic_block_ref': {
      // Version lives on the node head (collapsed + expanded).
      return { textLines: [], profileRows: 0 }
    }
    case 'graze_stub':
      return {
        textLines: [rule.title?.trim() || rule.grazeType || 'graze stub'],
        profileRows: 0,
      }
    default:
      return { textLines: [], profileRows: 0 }
  }
}

function teaserFromList(items: string[]): string[] {
  if (items.length === 0) return []
  const shown = items.slice(0, COND_TEASER_MAX)
  const rest = items.length - shown.length
  if (rest > 0) return [...shown, `+${rest} more`]
  return shown
}

/**
 * Collapsed teaser body — proper info under the rename slot (never fills rename).
 * List-like rules show up to {@link COND_TEASER_MAX} items + “+N more”.
 * Author/mention/follow-ring reserve profile rows (resolved in the UI).
 */
export function conditionCollapseMetrics(rule: L2RuleNode): ConditionExpandMetrics {
  switch (rule.type) {
    case 'group':
      return { textLines: [], profileRows: 0 }
    case 'keyword':
      return { textLines: teaserFromList(rule.terms ?? []), profileRows: 0 }
    case 'text':
      return { textLines: rule.value.trim() ? [rule.value] : [], profileRows: 0 }
    case 'regex': {
      const lines: string[] = [
        rule.caseInsensitive === false ? 'case sensitive' : 'case insensitive',
      ]
      if (rule.pattern) lines.push(rule.pattern)
      return { textLines: lines.slice(0, COND_TEASER_MAX), profileRows: 0 }
    }
    case 'hashtag':
      return {
        textLines: teaserFromList(
          (rule.tags ?? []).map((t) => (t.startsWith('#') ? t : `#${t}`)),
        ),
        profileRows: 0,
      }
    case 'url':
      return { textLines: teaserFromList(rule.patterns ?? []), profileRows: 0 }
    case 'mention': {
      const total = (rule.accounts ?? []).length
      const n = Math.min(COND_TEASER_MAX, total)
      const textLines: string[] = []
      if (rule.listUri) textLines.push(`list: ${rule.listUri}`)
      if (total > COND_TEASER_MAX) textLines.push(`+${total - COND_TEASER_MAX} more`)
      return { textLines, profileRows: n, profileMode: 'actors' }
    }
    case 'language':
      return {
        textLines: teaserFromList((rule.allow ?? []).map(languageExpandLabel)),
        profileRows: 0,
      }
    case 'labels':
      return { textLines: teaserFromList(rule.values ?? []), profileRows: 0 }
    case 'post_kind': {
      const kinds = rule.kinds ?? []
      const allKinds = ['root', 'reply', 'quote', 'repost'] as const
      if (
        kinds.length >= allKinds.length &&
        allKinds.every((k) => kinds.includes(k))
      ) {
        return { textLines: ['all'], profileRows: 0 }
      }
      // Only four options — list them; no “+1 more”.
      return { textLines: [...kinds], profileRows: 0 }
    }
    case 'media_type':
      return {
        textLines: teaserFromList((rule.mediaTypes ?? []).map(mediaTypeLabel)),
        profileRows: 0,
      }
    case 'media':
      return {
        textLines: teaserFromList((rule.kinds ?? []).map(mediaKindLabel)),
        profileRows: 0,
      }
    case 'mime_type':
      return { textLines: rule.pattern ? [rule.pattern] : [], profileRows: 0 }
    case 'alt_text':
      return {
        textLines: [rule.op === 'has' ? 'has alt text' : 'missing alt text'],
        profileRows: 0,
      }
    case 'post_age':
      return {
        textLines: [
          rule.op === 'newer_than' ? `within ${rule.hours}h` : `older than ${rule.hours}h`,
        ],
        profileRows: 0,
      }
    case 'media_stats':
      return {
        textLines: [`${rule.metric.replace(/_/g, ' ')} ${rule.op} ${rule.value}`],
        profileRows: 0,
      }
    case 'bool':
      return {
        textLines: [
          `${rule.field.replace(/_/g, ' ')} · ${rule.value ? 'required' : 'excluded'}`,
        ],
        profileRows: 0,
      }
    case 'author': {
      const mode = rule.role ?? 'discover'
      if (rule.listId) {
        // Reserve list meta + “+N more” (profiles render the real count after resolve).
        return {
          textLines: [`mode: ${mode}`, '+N more'],
          profileRows: COND_TEASER_MAX,
          profileMode: 'list',
        }
      }
      const total = (rule.dids ?? []).length
      const n = Math.min(COND_TEASER_MAX, total)
      const textLines = [
        `mode: ${mode}`,
        ...(total > COND_TEASER_MAX ? [`+${total - COND_TEASER_MAX} more`] : []),
      ]
      return { textLines, profileRows: n, profileMode: 'actors' }
    }
    case 'follow_ring': {
      const isViewer = (rule.hubSource ?? 'account') === 'viewer'
      const hub = rule.hub?.trim()
      const textLines = [
        ...(isViewer || !hub ? [`hub: ${isViewer ? 'viewer' : '…'}`] : []),
        formatFollowRingDirection(rule.direction),
        `mode: ${rule.role ?? 'filter'}`,
      ]
      return {
        textLines,
        profileRows: !isViewer && hub ? 1 : 0,
        profileMode: !isViewer && hub ? 'actors' : undefined,
      }
    }
    case 'compare':
      return {
        textLines: [`${formatExpandExpr(rule.left)} ${rule.op} ${formatExpandExpr(rule.right)}`],
        profileRows: 0,
      }
    case 'score':
      return { textLines: [`+${rule.points} score`], profileRows: 0 }
    case 'substitute':
      return {
        textLines: [
          rule.direction === 'reply_to_root'
            ? 'reply → root'
            : rule.direction === 'reply_to_parent'
              ? 'reply → parent'
              : 'quote → quoted',
          `threshold: ${rule.threshold}`,
        ],
        profileRows: 0,
      }
    case 'scout':
      return {
        textLines: [
          `min: ${rule.threshold.min}`,
          `max: ${rule.threshold.max}`,
          `max post age: ${rule.maxPostAgeHours ?? 48}`,
        ],
        profileRows: 0,
      }
    case 'logic_block_ref': {
      return { textLines: [], profileRows: 0 }
    }
    case 'graze_stub':
      return {
        textLines: [rule.title?.trim() || rule.grazeType || 'graze stub'],
        profileRows: 0,
      }
    default:
      return { textLines: [], profileRows: 0 }
  }
}

/** @deprecated Prefer conditionExpandMetrics — kept for simple text-only callers. */
export function conditionExpandLines(rule: L2RuleNode): string[] {
  return conditionExpandMetrics(rule).textLines
}

function bodyHeight(metrics: ConditionExpandMetrics): number {
  return (
    metrics.textLines.length * COND_BODY_LINE_H + metrics.profileRows * COND_PROFILE_ROW_H
  )
}

export function conditionNodeHeight(rule: L2RuleNode, expanded: boolean): number {
  if (rule.type === 'logic_block_ref' && expanded) {
    const bodyH =
      getLogicBlockPreviewBodyHeight(rule.packageId, rule.versionPin) ??
      LOGIC_BLOCK_LOADING_BODY_H
    return COND_EXPAND_TITLE_H + COND_NAME_LINE_H + bodyH + COND_EXPAND_BOTTOM_H
  }
  const metrics = expanded ? conditionExpandMetrics(rule) : conditionCollapseMetrics(rule)
  if (metrics.textLines.length === 0 && metrics.profileRows === 0) {
    return COND_COLLAPSED_H
  }
  // Title + rename slot always reserved; teaser/expand body grows underneath.
  return Math.max(
    COND_COLLAPSED_H,
    COND_EXPAND_TITLE_H + COND_NAME_LINE_H + bodyHeight(metrics) + COND_EXPAND_BOTTOM_H,
  )
}

export function conditionNodeWidth(rule: L2RuleNode, expanded: boolean, defaultWidth: number): number {
  if (rule.type === 'logic_block_ref' && expanded) return LOGIC_BLOCK_EXPANDED_W
  return defaultWidth
}
