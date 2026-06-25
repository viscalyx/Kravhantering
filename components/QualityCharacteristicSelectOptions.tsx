export interface QualityCharacteristicSelectOption {
  id: number
  nameEn: string
  nameSv: string
  parentId?: number | null
}

interface QualityCharacteristicSelectOptionsProps {
  locale: string
  options: QualityCharacteristicSelectOption[]
}

export function getQualityCharacteristicOptionName(
  option: QualityCharacteristicSelectOption,
  locale: string,
) {
  return locale === 'sv' ? option.nameSv : option.nameEn
}

export default function QualityCharacteristicSelectOptions({
  locale,
  options,
}: QualityCharacteristicSelectOptionsProps) {
  const topLevelCategories = options.filter(option => !option.parentId)
  const childCategories = options.filter(option => option.parentId)

  return (
    <>
      {topLevelCategories.map(parent => (
        <optgroup
          key={parent.id}
          label={getQualityCharacteristicOptionName(parent, locale)}
        >
          {childCategories
            .filter(child => child.parentId === parent.id)
            .map(child => (
              <option key={child.id} value={child.id}>
                {getQualityCharacteristicOptionName(child, locale)}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  )
}
