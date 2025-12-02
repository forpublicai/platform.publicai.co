import {ZuploContext, ZuploRequest, environment} from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  const body = await request.json();
  
  context.log.info(`User data: ${JSON.stringify(request.user?.data)}`);
  
  if (!request.user?.sub) {
    context.log.warn("No user.sub found, user field not added to body");
    return new ZuploRequest(request, { body: JSON.stringify(body) });
  }

  const userId = request.user.sub;
  body.user = userId;
  context.log.info(`Added user: ${userId} to request body`);

  // Check if subscription exists FIRST 
  const checkSubscriptionResponse = await fetch(
    `${environment.LAGO_API_BASE}/api/v1/subscriptions?external_customer_id=${userId}&status=active`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  let hasActiveSubscription = false;
  if (checkSubscriptionResponse.ok) {
    const subscriptions = await checkSubscriptionResponse.json();
    hasActiveSubscription = subscriptions.subscriptions && subscriptions.subscriptions.length > 0;
    context.log.info(`Active subscription exists: ${hasActiveSubscription}`);
  }

  // Only get consumer details if we need to create customer/subscription
  if (!hasActiveSubscription) {
    const getConsumerResponse = await fetch(
      `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers/${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
        },
      }
    );

    if (!getConsumerResponse.ok) {
      context.log.error("Failed to get consumer from Zuplo");
    } else {
      const consumerResponse = await getConsumerResponse.json();
      const userEmail = consumerResponse.tags?.email;
      const userName = consumerResponse.name || userId;
      
      context.log.info(`Consumer email: ${userEmail}, name: ${userName}`);

      // Create customer
      const createCustomerResponse = await fetch(
        `${environment.LAGO_API_BASE}/api/v1/customers`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            customer: {
              external_id: userId,
              name: userName,
              email: userEmail || `${userId}@placeholder.com`
            }
          })
        }
      );

      if (!createCustomerResponse.ok) {
        const error = await createCustomerResponse.text();
        context.log.error(`Failed to create Lago customer: ${error}`);
      } else {
        context.log.info(`Created Lago customer: ${userId}`);

        // Create subscription
        const createSubscriptionResponse = await fetch(
          `${environment.LAGO_API_BASE}/api/v1/subscriptions`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              subscription: {
                external_customer_id: userId,
                external_id: userId,
                plan_code: "pay_as_you_go"
              }
            })
          }
        );

        if (createSubscriptionResponse.ok) {
          const subscription = await createSubscriptionResponse.json();
          context.log.info(`Created Lago subscription: ${subscription.subscription?.lago_id}`);
        } else {
          const error = await createSubscriptionResponse.text();
          context.log.error(`Failed to create Lago subscription: ${error}`);
        }
      }
    }
  }
  
  // Create new request with modified body and LiteLLM auth
  const newRequest = new ZuploRequest(request, {
    body: JSON.stringify(body)
  });
  
  if (environment.LITELLM_DEVELOPER_API_KEY) {
    newRequest.headers.set("Authorization", `Bearer ${environment.LITELLM_DEVELOPER_API_KEY}`);
  }
  
  return newRequest;
}