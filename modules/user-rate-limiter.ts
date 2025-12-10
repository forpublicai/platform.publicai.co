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
      free: { requests: 100, windowMinutes: 1, message: "Free plan: 100 requests/minute limit exceeded" },
      plus: { requests: 200, windowMinutes: 1, message: "Plus plan: 200 requests/minute limit exceeded" },
      pro: { requests: 300, windowMinutes: 1, message: "Pro plan: 300 requests/minute limit exceeded" }
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

    // Final fallback: No consumer key found
  context.log.error("No consumer key found - applying emergency rate limit");
  return {
    key: "no-auth",
    requestsAllowed: 1,
    timeWindowMinutes: 60,
    rateLimitExceededMessage: "No valid authentication provided. Please include your API key in the Authorization header."
  };
}