import { ZuploRequest, ZuploContext } from "@zuplo/runtime";

interface CustomRateLimitDetails {
  key: string;
  requestsAllowed?: number;
  timeWindowMinutes?: number;
  rateLimitExceededMessage?: string;
}

export function getUserIdentifier(request: ZuploRequest, context: ZuploContext): CustomRateLimitDetails {
  const consumerSub = request.user?.sub;
  const plan = request.user?.data?.plan || "free"; // Default to "free" if no plan
  
  if (consumerSub) {
    // Define rate limits per plan
    const planLimits = {
      free: { requests: 20, windowMinutes: 1, message: "Free plan: 20 requests/minute limit exceeded" },
      plus: { requests: 40, windowMinutes: 1, message: "Plus plan: 40 requests/minute limit exceeded" },
      pro: { requests: 100, windowMinutes: 1, message: "Pro plan: 100 requests/minute limit exceeded" }
    };

    const limit = planLimits[plan] || planLimits.free;
    
    context.log.info(`Rate limiting consumer: ${consumerSub} on ${plan} plan`);
    
    return {
      key: `consumer:${consumerSub}:${plan}`,
      requestsAllowed: limit.requests,
      timeWindowMinutes: limit.windowMinutes,
      rateLimitExceededMessage: limit.message
    };
}