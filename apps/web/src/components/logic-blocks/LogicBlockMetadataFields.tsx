interface Props {
  name: string
  slug: string
  description: string
  disabled?: boolean
  showDescription?: boolean
  onNameChange: (value: string) => void
  onSlugChange: (value: string) => void
  onDescriptionChange: (value: string) => void
}

export function LogicBlockMetadataFields({
  name,
  slug,
  description,
  disabled = false,
  showDescription = true,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
}: Props) {
  return (
    <div className="logic-block-metadata-fields">
      <label className="l2-inspector-field">
        Name
        <input
          value={name}
          disabled={disabled}
          placeholder="e.g. Boosted engagement filter"
          onChange={(e) => onNameChange(e.target.value)}
        />
      </label>
      <label className="l2-inspector-field">
        Slug
        <input
          value={slug}
          disabled={disabled}
          placeholder="auto from name"
          onChange={(e) => onSlugChange(e.target.value)}
        />
      </label>
      {showDescription ? (
      <label className="l2-inspector-field">
        Description
        <input
          value={description}
          disabled={disabled}
          placeholder="Optional — shown in marketplace listings"
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </label>
      ) : null}
    </div>
  )
}
