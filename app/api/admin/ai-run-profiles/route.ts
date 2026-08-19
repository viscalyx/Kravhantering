import { adminAiRead } from '@/lib/ai/admin-http'
import { withRestResponsePolicy } from '@/lib/http/response-policy'

export const GET = withRestResponsePolicy(request =>
  adminAiRead(request, service => service.listRunProfiles()),
)
