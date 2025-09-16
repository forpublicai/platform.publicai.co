import { ZuploRequest, ZuploContext } from "@zuplo/runtime";

interface CustomRateLimitDetails {
  key: string;
  requestsAllowed?: number;
  timeWindowMinutes?: number;
  rateLimitExceededMessage?: string;
}

export function getUserIdentifier(request: ZuploRequest, context: ZuploContext): CustomRateLimitDetails {
  // Debug logging
  context.log.info("=== Full ZuploRequest ===");
  context.log.info(JSON.stringify(request, null, 2));
  
  context.log.info("=== Full ZuploContext ===");
  context.log.info(JSON.stringify(context, null, 2));
  
  // Get the API key from the request (should be available from the api-key-inbound policy)
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "") || 
                 request.headers.get("x-api-key");
  
  // Developer API key rate limiting
  if (apiKey) {
    context.log.info(`Rate limiting by the API key: ${apiKey.substring(0, 8)}...`);
    
    return {
      key: `api-key:${apiKey}`,
      requestsAllowed: 20,
      timeWindowMinutes: 1,
      rateLimitExceededMessage: "API key rate limit exceeded. You can make 20 requests per minute."
    };
  }

  // No API key found - this should be caught by api-key-inbound policy, but just in case
  context.log.error("No API key found - applying emergency rate limit");
  return {
    key: "no-api-key",
    requestsAllowed: 1,
    timeWindowMinutes: 60,
    rateLimitExceededMessage: "No valid API key provided. Please include your API key in the Authorization header."
  };
}