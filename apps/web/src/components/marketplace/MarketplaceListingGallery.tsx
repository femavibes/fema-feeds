import type { ListingPresentation } from '../../lib/marketplace-listing'

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/)
  return m?.[1] ?? null
}

interface Props {
  presentation: ListingPresentation
}

export function MarketplaceListingGallery({ presentation }: Props) {
  const { galleryUrls, youtubeUrl } = presentation
  const youtubeId = youtubeUrl ? extractYoutubeId(youtubeUrl) : null

  if (!galleryUrls.length && !youtubeId) return null

  return (
    <div className="marketplace-listing-gallery">
      {youtubeId && (
        <div className="marketplace-listing-gallery-video">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title="Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {galleryUrls.length > 0 && (
        <div className="marketplace-listing-gallery-grid">
          {galleryUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="marketplace-listing-gallery-img"
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  )
}
