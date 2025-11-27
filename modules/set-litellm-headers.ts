import {ZuploContext, ZuploRequest, environment} from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  // Get the incoming body as JSON
  const body = await request.json();
  
  // Add the user ID to the body
  if (request.user?.sub) {
    body.user = request.user.sub;
    context.log.info(`Added user: ${request.user.sub} to request body`);
  } else {
    context.log.warn("No user.sub found, user field not added to body");
  }
  
  // Create new request with modified body and headers
  const newRequest = new ZuploRequest(request, {
    body: JSON.stringify(body)
  });
  
  // Set the LiteLLM authorization header
  const litellmApiKey = environment.LITELLM_DEVELOPER_API_KEY;
  if (litellmApiKey) {
    newRequest.headers.set("Authorization", `Bearer ${litellmApiKey}`);
  }
    
  // Add the user email header
  if (request.user?.data?.email) {
    newRequest.headers.set("x-zuplo-user-email", request.user.data.email);
    context.log.info(`Set x-zuplo-user-email header to: ${request.user.data.email}`);
  } else {
    context.log.warn("No user email found, x-zuplo-user-email header not set");
  }

  // DEBUG: Log the user.data object properly
  context.log.info(`User data: ${JSON.stringify(request.user?.data)}`);
  
  return newRequest;
}