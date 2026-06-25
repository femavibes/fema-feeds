interface Props {
  average?: number
  count?: number
  compact?: boolean
}

function Star({ filled, half }: { filled?: boolean; half?: boolean }) {
  return (
    <span
      className={`marketplace-rating-star${filled ? ' is-filled' : ''}${half ? ' is-half' : ''}`}
      aria-hidden
    >
      ★
    </span>
  )
}

export function MarketplaceListingRating({ average, count, compact }: Props) {
  const hasRatings = count != null && count > 0 && average != null

  if (!hasRatings) {
    return (
      <div className={`marketplace-rating${compact ? ' is-compact' : ''}`}>
        <span className="marketplace-rating-stars" aria-hidden>
          <Star />
          <Star />
          <Star />
          <Star />
          <Star />
        </span>
        <span className="marketplace-rating-label">No ratings yet</span>
      </div>
    )
  }

  const rounded = Math.round(average * 2) / 2
  const stars = [1, 2, 3, 4, 5].map((n) => {
    if (rounded >= n) return <Star key={n} filled />
    if (rounded >= n - 0.5) return <Star key={n} half />
    return <Star key={n} />
  })

  return (
    <div
      className={`marketplace-rating${compact ? ' is-compact' : ''}`}
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} ratings`}
    >
      <span className="marketplace-rating-stars">{stars}</span>
      <span className="marketplace-rating-label">
        {average.toFixed(1)} · {count}
      </span>
    </div>
  )
}
