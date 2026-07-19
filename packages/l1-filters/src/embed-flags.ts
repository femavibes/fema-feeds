import type { L1FilterStep } from '@cfb/l1-registry'
import { applyEmbedRequirement } from './helpers.js'

export const hasVideoStep: L1FilterStep = {
  id: 'has_video',
  evaluate: (ctx) => applyEmbedRequirement(ctx, 'has_video', ctx.config.hasVideo, ctx.post.embed.hasVideo),
}

export const hasGifStep: L1FilterStep = {
  id: 'has_gif',
  evaluate: (ctx) =>
    applyEmbedRequirement(ctx, 'has_gif', ctx.config.hasGif, ctx.post.embed.hasGif ?? false),
}

export const hasImageStep: L1FilterStep = {
  id: 'has_image',
  evaluate: (ctx) => applyEmbedRequirement(ctx, 'has_image', ctx.config.hasImage, ctx.post.embed.hasImage),
}

export const hasLinkCardStep: L1FilterStep = {
  id: 'has_link_card',
  evaluate: (ctx) =>
    applyEmbedRequirement(ctx, 'has_link_card', ctx.config.hasLinkCard, ctx.post.embed.hasLinkCard),
}

export const hasQuoteStep: L1FilterStep = {
  id: 'has_quote',
  evaluate: (ctx) => applyEmbedRequirement(ctx, 'has_quote', ctx.config.hasQuote, ctx.post.embed.hasQuote),
}

export const hasQuoteWithMediaStep: L1FilterStep = {
  id: 'has_quote_with_media',
  evaluate: (ctx) =>
    applyEmbedRequirement(
      ctx,
      'has_quote_with_media',
      ctx.config.hasQuoteWithMedia ?? ctx.config.hasRecord,
      ctx.post.embed.hasQuoteWithMedia ?? ctx.post.embed.hasRecord ?? false,
    ),
}

export const hasRecordStep: L1FilterStep = {
  id: 'has_record',
  evaluate: (ctx) =>
    applyEmbedRequirement(
      ctx,
      'has_record',
      ctx.config.hasRecord ?? ctx.config.hasQuoteWithMedia,
      ctx.post.embed.hasQuoteWithMedia ?? ctx.post.embed.hasRecord ?? false,
    ),
}

export const hasTextOnlyStep: L1FilterStep = {
  id: 'has_text_only',
  evaluate: (ctx) =>
    applyEmbedRequirement(ctx, 'has_text_only', ctx.config.hasTextOnly, ctx.post.embed.hasTextOnly),
}
