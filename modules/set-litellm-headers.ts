import {ZuploContext, ZuploRequest, environment} from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  // Create new request with modified headers
  const newRequest = new ZuploRequest(request);
  
  // Set the LiteLLM authorization header
  const litellmApiKey = environment.LITELLM_API_KEY;
  if (litellmApiKey) {
    newRequest.headers.set("Authorization", `Bearer ${litellmApiKey}`);
  }
  
  // Set the user ID header
  if (request.user?.sub) {
    newRequest.headers.set("x-zuplo-user-id", request.user.sub);
    context.log.info(`Set x-zuplo-user-id header to: ${request.user.sub}`);
  } else {
    context.log.warn("No user.sub found, x-zuplo-user-id header not set");
  }
  
  // Add the user email header
  if (request.user?.data?.email) {
    newRequest.headers.set("x-zuplo-user-email", request.user.data.email);
    context.log.info(`Set x-zuplo-user-email header to: ${request.user.data.email}`);
  } else {
    context.log.warn("No user email found, x-zuplo-user-email header not set");
  }
  
  return newRequest;
}