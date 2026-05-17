import { z } from 'zod'
import { isStatusIconName } from '@/lib/icons/status-icon-allowlist'

export const statusIconNameSchema = z
  .string()
  .refine(isStatusIconName, 'Invalid status icon name')

export const nullableOptionalStatusIconNameSchema = statusIconNameSchema
  .nullable()
  .optional()
