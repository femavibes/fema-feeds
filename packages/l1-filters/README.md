# @cfb/l1-filters

One file per L1 filter step. See `docs/PLAN.md` §3.2 for the full registry.

## Adding a filter

1. Create `src/my-filter.ts` implementing `L1FilterStep`
2. Register in `src/index.ts`
3. Add tests

## Cost tiers

| Tier | Filters |
|------|---------|
| trivial | labels, post_kind |
| cheap | author_*, language*, has_* embed flags |
| medium | hashtag_* |
| expensive | keyword_* |
