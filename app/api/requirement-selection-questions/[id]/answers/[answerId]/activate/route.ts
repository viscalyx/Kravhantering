import { answerStateRoute } from '../_state'

// Wrapped by secureMutationRoute inside answerStateRoute.
export const POST = answerStateRoute('activate')
