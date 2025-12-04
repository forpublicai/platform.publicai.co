import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Check payment method handler called");

  // Check if user is authenticated via JWT
  if (!request.user?.sub) {
    context.log.warn("No user.sub found in request - authentication failed");
    return new Response(
      JSON.stringify({
        error: {
          message: "Authentication required",
          type: "unauthorized"
        }
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const authSub = request.user.sub;
  context.log.info(`Checking payment method for user sub: ${authSub}`);

  // Look up the Zuplo consumer by querying the tag.sub
  const checkConsumerResponse = await fetch(
    `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers?tag.sub=${encodeURIComponent(authSub)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
      },
    }
  );

  if (!checkConsumerResponse.ok) {
    context.log.error("Failed to look up consumer from Zuplo");
    return new Response(
      JSON.stringify({
        error: {
          message: "Failed to look up user account",
          type: "api_error"
        }
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const consumersData = await checkConsumerResponse.json();

  if (!consumersData.data || consumersData.data.length === 0) {
    context.log.warn(`No consumer found with tag.sub = ${authSub}`);
    return new Response(
      JSON.stringify({
        error: {
          message: "User account not found",
          type: "user_not_found"
        }
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const consumer = consumersData.data[0];
  const stripeCustomerId = consumer.name; // Consumer name is the Stripe customer ID
  context.log.info(`Found consumer: ${consumer.id}, Stripe customer ID: ${stripeCustomerId}`);

  // Check Stripe for payment methods
  const stripeResponse = await fetch(
    `https://api.stripe.com/v1/customers/${stripeCustomerId}/payment_methods?type=card`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${environment.STRIPE_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  if (!stripeResponse.ok) {
    const errorText = await stripeResponse.text();
    context.log.error(`Failed to fetch payment methods from Stripe: ${errorText}`);
    return new Response(
      JSON.stringify({
        hasPaymentMethod: false
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const stripeData = await stripeResponse.json();
  const hasPaymentMethod = stripeData.data && stripeData.data.length > 0;

  context.log.info(`Customer has ${stripeData.data?.length || 0} payment method(s)`);

  return new Response(
    JSON.stringify({
      hasPaymentMethod
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
