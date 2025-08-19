import { ZuploRequest, ZuploContext, environment } from "@zuplo/runtime";

interface CustomRateLimitDetails {
  key: string;
  requestsAllowed?: number;
  timeWindowMinutes?: number;
  rateLimitExceededMessage?: string;
}

export function getUserIdentifier(request: ZuploRequest, context: ZuploContext): CustomRateLimitDetails {
  // Get the API key from the request (should be available from the api-key-inbound policy)
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "") || 
                 request.headers.get("x-api-key");
  
  const masterApiKey = environment.OPENWEBUI_MASTER_API_KEY;
  
  // Check if this is the master API key from OpenWebUI
  const isMasterKey = apiKey === masterApiKey;
  
  context.log.info(`API Key check: isMasterKey=${isMasterKey}, hasApiKey=${!!apiKey}`);

  if (isMasterKey) {
    // This is OpenWebUI - use user-based rate limiting
    context.log.info("Using OpenWebUI master key - applying user-based rate limiting");
    
    // Log the actual OpenWebUI headers for debugging
    context.log.info("OpenWebUI headers:", {
      userHeaders: {
        "x-openwebui-user-id": request.headers.get("x-openwebui-user-id"),
        "x-openwebui-user-email": request.headers.get("x-openwebui-user-email"),
        "x-openwebui-user-name": request.headers.get("x-openwebui-user-name"),
        "x-openwebui-user-role": request.headers.get("x-openwebui-user-role")
      }
    });

    // Check for OpenWebUI user headers
    const userId = request.headers.get("x-openwebui-user-id");
    const userEmail = request.headers.get("x-openwebui-user-email");
    const userRole = request.headers.get("x-openwebui-user-role");

    if (userId) {
      context.log.info(`Rate limiting by OpenWebUI user ID: ${userId}`);
      
      return {
        key: `owui-user:${userId}`,
        requestsAllowed: 20,
        timeWindowMinutes: 1,
        rateLimitExceededMessage: `Rate limit exceeded for user ${userId}. You can make 20 requests per minute. Please wait before trying again.`
      };
    }

    // No OpenWebUI user found with master key - very restrictive
    context.log.error("Master API key used but no OpenWebUI user headers found - applying restrictive rate limit");
    return {
      key: "owui-no-user-found",
      requestsAllowed: 1,
      timeWindowMinutes: 60,
      rateLimitExceededMessage: "OpenWebUI master key detected but no user information found. Contact support."
    };
  } 
  
  // This is a self-issued API key from an external developer
  if (apiKey) {
    context.log.info(`Rate limiting by individual API key: ${apiKey.substring(0, 8)}...`);
    
    return {
      key: `api-key:${apiKey}`,
      requestsAllowed: 100,
      timeWindowMinutes: 60, // 100 requests per hour
      rateLimitExceededMessage: "API key rate limit exceeded. You can make 100 requests per hour."
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