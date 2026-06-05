import { questionStateRoute } from '../_state'

// Wrapped by secureMutationRoute inside questionStateRoute.
export const POST = questionStateRoute('reactivate')
