import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  // 0: Print out everything in the request
  context.log.info("=== Full ZuploRequest ===");
  context.log.info(JSON.stringify(request, null, 2));

  context.log.info("=== Full ZuploContext ===");
  context.log.info(JSON.stringify(context, null, 2));
  
  // 1: Get the "secret" query param in the request. Check that it equals to environment.OPENCOLLECTIVE_WEBHOOK_SECRET. Else return unauthorized.

  // 2. Parse the request body to get the users email

  // 3. GET the consumer ID from the Zuplo API. Authenticate with environment.ZP_DEVELOPER_API_KEY
  // https://dev.zuplo.com/v1/accounts/environment.ZP_ACCOUNT_NAME/key-buckets/environment.ZP_API_KEY_SERVICE_BUCKET_NAME/consumers?manager-email={user_email}

  // 4. PATCH request to Zuplo API.  
  // PATCH https://dev.zuplo.com/v1/accounts/{accountName}/key-buckets/{bucketName}/consumers/{consumerName}
  // {
//     "metadata": {
//         "plan": "free"
//     }
// }
  
  // 5. Return success 
  return "What zup?";
}