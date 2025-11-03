import {ZuploContext, ZuploRequest, environment} from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
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
  
  return newRequest;
}