export const STATUS_DRAFT: 1
export const STATUS_REVIEW: 2
export const STATUS_PUBLISHED: 3
export const STATUS_ARCHIVED: 4

export type RequirementStatusId =
  | typeof STATUS_DRAFT
  | typeof STATUS_REVIEW
  | typeof STATUS_PUBLISHED
  | typeof STATUS_ARCHIVED
